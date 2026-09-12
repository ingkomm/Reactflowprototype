/**
 * Internal workspace persistence (v0.2).
 *
 * Desktop: AppData/storage-v02/{current,backup}.json + assets/
 * Browser: localStorage fallback (size-capped)
 *
 * Structured workspace data ≠ asset bytes.
 * Portable GraphDocument remains self-contained (markup inline).
 */
import type { GraphDocumentV01 } from '../graphDocument'
import {
  parseGraphDocumentJson,
  serializeGraphDocument,
  validateGraphDocument,
} from '../graphDocument'
import { MAX_BROWSER_AUTOSAVE_BYTES, utf8ByteLength } from '../limits'
import { isDesktopGraphExportSupported } from '../platform/graphExport'
import type { AssetStore } from './assetStore'
import { createFileAssetStore, createLocalStorageAssetStore } from './fileAssetStore'
import {
  createMemoryFsBackend,
  createTauriAppDataFsBackend,
  type FsBackend,
} from './fsBackend'
import {
  buildManifestFromDocument,
  collectAssetIdsFromManifest,
  hydrateManifest,
  parseWorkspaceManifestJson,
  symbolIdToAssetIdMap,
} from './symbolAssets'
import type {
  WorkspaceLoadResult,
  WorkspaceManifestV02,
  WorkspaceSaveResult,
} from './workspaceTypes'
import { WORKSPACE_STORAGE_VERSION } from './workspaceTypes'

export const STORAGE_ROOT = 'storage-v02'
export const CURRENT_MANIFEST_PATH = `${STORAGE_ROOT}/current.json`
export const BACKUP_MANIFEST_PATH = `${STORAGE_ROOT}/backup.json`
export const ASSETS_DIR = `${STORAGE_ROOT}/assets`

/** Legacy localStorage keys (v0.1). Kept for migration / browser. */
export const LEGACY_STORAGE_KEY = 'pob-graph-document-v01'
export const LEGACY_BACKUP_KEY = 'pob-graph-document-backup'
export const MIGRATION_MARKER_KEY = 'pob-workspace-migrated-v02'

export type WorkspaceStore = {
  readonly kind: 'desktop' | 'browser' | 'memory'
  assets: AssetStore
  hasCurrent(): Promise<boolean>
  hasBackup(): Promise<boolean>
  loadCurrent(): Promise<WorkspaceLoadResult>
  loadBackup(): Promise<WorkspaceLoadResult>
  saveCurrent(document: GraphDocumentV01): Promise<WorkspaceSaveResult>
  saveBackup(document: GraphDocumentV01): Promise<WorkspaceSaveResult>
  clearCurrent(): Promise<WorkspaceSaveResult>
}

function serializeManifest(manifest: WorkspaceManifestV02): string {
  return `${JSON.stringify(manifest)}\n`
}

/** Serializes all storage mutations (saveCurrent / saveBackup / clearCurrent / GC). */
function createSerialQueue() {
  let chain: Promise<unknown> = Promise.resolve()
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const run = chain.then(() => task())
      chain = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
  }
}

async function garbageCollectAssets(assets: AssetStore, keep: Set<string>): Promise<void> {
  const listed = await assets.list()
  for (const entry of listed) {
    if (!keep.has(entry.assetId)) {
      await assets.delete(entry.assetId)
    }
  }
}

async function readManifestRaw(
  fs: FsBackend,
  path: string,
): Promise<{ ok: true; text: string } | { ok: false; reason: 'missing' | 'io'; message: string }> {
  try {
    if (!(await fs.exists(path))) return { ok: false, reason: 'missing', message: 'missing' }
    const text = await fs.readTextFile(path)
    return { ok: true, text }
  } catch (err) {
    return {
      ok: false,
      reason: 'io',
      message: err instanceof Error ? err.message : 'read failed',
    }
  }
}

async function atomicWriteText(fs: FsBackend, path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`
  await fs.writeTextFile(tmp, contents)
  if (!(await fs.exists(tmp))) {
    throw new Error('temp write missing after write')
  }
  await fs.rename(tmp, path)
}


async function finalizeHydratedLoad(
  hydrated: Awaited<ReturnType<typeof hydrateManifest>>,
): Promise<WorkspaceLoadResult> {
  const blocking = hydrated.issues.filter(
    (i) => i.code === 'missing_asset' || i.code === 'corrupt_asset',
  )
  if (blocking.length > 0) {
    return {
      ok: false,
      reason: 'missing_asset',
      message: `missing or corrupt asset (${blocking[0]!.assetId})`,
      issues: hydrated.issues,
    }
  }

  const validated = validateGraphDocument(hydrated.document)
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'corrupt',
      message: validated.message,
      issues: [{ code: 'corrupt_manifest', message: validated.message }],
    }
  }

  return { ok: true, document: validated.document, issues: hydrated.issues }
}

async function loadSlotFromFs(
  fs: FsBackend,
  assets: AssetStore,
  path: string,
): Promise<WorkspaceLoadResult> {
  const raw = await readManifestRaw(fs, path)
  if (!raw.ok) {
    return {
      ok: false,
      reason: raw.reason === 'missing' ? 'missing' : 'io',
      message: raw.message,
    }
  }

  const manifest = parseWorkspaceManifestJson(raw.text)
  if (!manifest) {
    const legacy = parseGraphDocumentJson(raw.text)
    if (legacy.ok) {
      return { ok: true, document: legacy.document, issues: [] }
    }
    return {
      ok: false,
      reason: 'corrupt',
      message: 'workspace manifest corrupt',
      issues: [{ code: 'corrupt_manifest', message: 'invalid storageVersion or shape' }],
    }
  }

  const hydrated = await hydrateManifest(manifest, assets)
  return finalizeHydratedLoad(hydrated)
}

async function readPreviousAssetMap(
  fs: FsBackend,
  path: string,
): Promise<Map<string, string> | undefined> {
  const raw = await readManifestRaw(fs, path)
  if (!raw.ok) return undefined
  const manifest = parseWorkspaceManifestJson(raw.text)
  if (!manifest) return undefined
  return symbolIdToAssetIdMap(manifest)
}

async function referencedAssetIds(fs: FsBackend): Promise<Set<string>> {
  const keep = new Set<string>()
  for (const path of [CURRENT_MANIFEST_PATH, BACKUP_MANIFEST_PATH]) {
    const raw = await readManifestRaw(fs, path)
    if (!raw.ok) continue
    const manifest = parseWorkspaceManifestJson(raw.text)
    if (!manifest) continue
    for (const id of collectAssetIdsFromManifest(manifest)) keep.add(id)
  }
  return keep
}

function createFsWorkspaceStore(fs: FsBackend, kind: 'desktop' | 'memory'): WorkspaceStore {
  const assets = createFileAssetStore(fs, ASSETS_DIR)
  const mutationQueue = createSerialQueue()
  let currentGeneration = 0
  let backupGeneration = 0

  const ensureRoot = async () => {
    await fs.mkdir(STORAGE_ROOT, { recursive: true })
    await fs.mkdir(ASSETS_DIR, { recursive: true })
  }

  const saveSlot = async (
    slot: 'current' | 'backup',
    document: GraphDocumentV01,
    generation: number,
  ): Promise<WorkspaceSaveResult> => {
    const latest = slot === 'current' ? currentGeneration : backupGeneration
    if (generation !== latest) return { ok: true }

    try {
      await ensureRoot()
      const path = slot === 'current' ? CURRENT_MANIFEST_PATH : BACKUP_MANIFEST_PATH
      const reuse = await readPreviousAssetMap(fs, path)
      const committed = await referencedAssetIds(fs)
      const manifest = await buildManifestFromDocument(document, assets, {
        previousAssetIdsBySymbolId: reuse,
        committedAssetIds: committed,
      })

      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }

      const text = serializeManifest(manifest)
      await atomicWriteText(fs, path, text)

      const keep = await referencedAssetIds(fs)
      await garbageCollectAssets(assets, keep)
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        reason: 'io',
        message: err instanceof Error ? err.message : 'workspace save failed',
      }
    }
  }

  return {
    kind,
    assets,
    async hasCurrent() {
      try {
        return await fs.exists(CURRENT_MANIFEST_PATH)
      } catch {
        return false
      }
    },
    async hasBackup() {
      try {
        return await fs.exists(BACKUP_MANIFEST_PATH)
      } catch {
        return false
      }
    },
    loadCurrent: () => loadSlotFromFs(fs, assets, CURRENT_MANIFEST_PATH),
    loadBackup: () => loadSlotFromFs(fs, assets, BACKUP_MANIFEST_PATH),
    saveCurrent: (document) => {
      const gen = ++currentGeneration
      return mutationQueue.enqueue(() => saveSlot('current', document, gen))
    },
    saveBackup: (document) => {
      const gen = ++backupGeneration
      return mutationQueue.enqueue(() => saveSlot('backup', document, gen))
    },
    clearCurrent: () =>
      mutationQueue.enqueue(async () => {
        try {
          await ensureRoot()
          if (await fs.exists(CURRENT_MANIFEST_PATH)) {
            await fs.remove(CURRENT_MANIFEST_PATH)
          }
          const keep = await referencedAssetIds(fs)
          await garbageCollectAssets(assets, keep)
          return { ok: true }
        } catch (err) {
          return {
            ok: false,
            reason: 'io',
            message: err instanceof Error ? err.message : 'clear failed',
          }
        }
      }),
  }
}

function createBrowserWorkspaceStore(): WorkspaceStore {
  const assets = createLocalStorageAssetStore()
  const mutationQueue = createSerialQueue()
  let currentGeneration = 0
  let backupGeneration = 0
  const CURRENT_KEY = LEGACY_STORAGE_KEY
  const BACKUP_KEY = LEGACY_BACKUP_KEY

  const readKey = (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const writeKey = (key: string, value: string): WorkspaceSaveResult => {
    if (utf8ByteLength(value) > MAX_BROWSER_AUTOSAVE_BYTES) {
      return { ok: false, reason: 'too_large', message: 'browser autosave limit exceeded' }
    }
    try {
      localStorage.setItem(key, value)
      return { ok: true }
    } catch {
      return { ok: false, reason: 'quota' }
    }
  }

  const loadKey = async (key: string): Promise<WorkspaceLoadResult> => {
    const raw = readKey(key)
    if (raw == null) return { ok: false, reason: 'missing', message: 'missing' }

    const manifest = parseWorkspaceManifestJson(raw)
    if (manifest) {
      const hydrated = await hydrateManifest(manifest, assets)
      return finalizeHydratedLoad(hydrated)
    }

    const legacy = parseGraphDocumentJson(raw)
    if (legacy.ok) return { ok: true, document: legacy.document, issues: [] }
    return { ok: false, reason: 'corrupt', message: 'corrupt localStorage payload' }
  }

  const previousMap = async (key: string): Promise<Map<string, string> | undefined> => {
    const raw = readKey(key)
    if (!raw) return undefined
    const manifest = parseWorkspaceManifestJson(raw)
    if (!manifest) return undefined
    return symbolIdToAssetIdMap(manifest)
  }

  const browserRefs = async (): Promise<Set<string>> => {
    const keep = new Set<string>()
    for (const key of [CURRENT_KEY, BACKUP_KEY]) {
      const raw = readKey(key)
      if (!raw) continue
      const manifest = parseWorkspaceManifestJson(raw)
      if (!manifest) continue
      for (const id of collectAssetIdsFromManifest(manifest)) keep.add(id)
    }
    return keep
  }

  const saveKey = async (
    key: string,
    document: GraphDocumentV01,
    generation: number,
    slot: 'current' | 'backup',
  ): Promise<WorkspaceSaveResult> => {
    const latest = slot === 'current' ? currentGeneration : backupGeneration
    if (generation !== latest) return { ok: true }
    try {
      const reuse = await previousMap(key)
      const committed = await browserRefs()
      const manifest = await buildManifestFromDocument(document, assets, {
        previousAssetIdsBySymbolId: reuse,
        committedAssetIds: committed,
      })
      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }
      const text = serializeManifest(manifest)
      const written = writeKey(key, text)
      if (!written.ok) return written
      const keep = await browserRefs()
      await garbageCollectAssets(assets, keep)
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        reason: 'io',
        message: err instanceof Error ? err.message : 'browser save failed',
      }
    }
  }

  return {
    kind: 'browser',
    assets,
    async hasCurrent() {
      return readKey(CURRENT_KEY) != null
    },
    async hasBackup() {
      return readKey(BACKUP_KEY) != null
    },
    loadCurrent: () => loadKey(CURRENT_KEY),
    loadBackup: () => loadKey(BACKUP_KEY),
    saveCurrent: (document) => {
      const gen = ++currentGeneration
      return mutationQueue.enqueue(() => saveKey(CURRENT_KEY, document, gen, 'current'))
    },
    saveBackup: (document) => {
      const gen = ++backupGeneration
      return mutationQueue.enqueue(() => saveKey(BACKUP_KEY, document, gen, 'backup'))
    },
    clearCurrent: () =>
      mutationQueue.enqueue(async () => {
        try {
          localStorage.removeItem(CURRENT_KEY)
          const keep = await browserRefs()
          await garbageCollectAssets(assets, keep)
          return { ok: true }
        } catch {
          return { ok: false, reason: 'quota' }
        }
      }),
  }
}

/** Result of attempting legacy localStorage → v0.2 workspace migration. */
export type LegacyMigrationResult =
  | { status: 'no_legacy' }
  | { status: 'already_migrated' }
  | { status: 'migrated' }
  | { status: 'failed'; message: string }

/** Migrate legacy localStorage GraphDocument → workspace store by slot. Never deletes legacy keys. */
export async function migrateLegacyLocalStorageIfNeeded(
  store: WorkspaceStore,
): Promise<LegacyMigrationResult> {
  let primaryRaw: string | null = null
  let backupRaw: string | null = null
  try {
    primaryRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
    backupRaw = localStorage.getItem(LEGACY_BACKUP_KEY)
  } catch {
    // Cannot read legacy keys — treat as nothing to migrate (do not fail init).
    return { status: 'no_legacy' }
  }

  const legacyPrimaryExists = primaryRaw != null
  const legacyBackupExists = backupRaw != null
  if (!legacyPrimaryExists && !legacyBackupExists) {
    return { status: 'no_legacy' }
  }

  // Read slot presence once; do not treat current alone as full migration complete.
  const currentExists = await store.hasCurrent()
  const backupExists = await store.hasBackup()

  const primaryNeeded = legacyPrimaryExists && !currentExists
  const backupNeeded = legacyBackupExists && !backupExists

  if (!primaryNeeded && !backupNeeded) {
    return { status: 'already_migrated' }
  }

  let didMigrate = false

  if (primaryNeeded) {
    const parsed = parseGraphDocumentJson(primaryRaw!)
    if (!parsed.ok) {
      return {
        status: 'failed',
        message: `legacy primary is not a valid GraphDocument (${parsed.message})`,
      }
    }
    const saved = await store.saveCurrent(parsed.document)
    if (!saved.ok) {
      return {
        status: 'failed',
        message: saved.message ?? `primary migration failed (${saved.reason})`,
      }
    }
    const verify = await store.loadCurrent()
    if (!verify.ok) {
      return {
        status: 'failed',
        message: `primary migration verify failed (${verify.reason})`,
      }
    }
    didMigrate = true
    try {
      localStorage.setItem(MIGRATION_MARKER_KEY, 'ok')
    } catch {
      /* ignore */
    }
  }

  if (backupNeeded) {
    const parsed = parseGraphDocumentJson(backupRaw!)
    if (!parsed.ok) {
      return {
        status: 'failed',
        message: `legacy backup is not a valid GraphDocument (${parsed.message})`,
      }
    }
    const saved = await store.saveBackup(parsed.document)
    if (!saved.ok) {
      return {
        status: 'failed',
        message: saved.message ?? `backup migration failed (${saved.reason})`,
      }
    }
    const verify = await store.loadBackup()
    if (!verify.ok) {
      return {
        status: 'failed',
        message: `backup migration verify failed (${verify.reason})`,
      }
    }
    didMigrate = true
  }

  return didMigrate ? { status: 'migrated' } : { status: 'already_migrated' }
}

export class WorkspaceStoreInitError extends Error {
  readonly code = 'workspace_store_init_failed' as const
  readonly reason: 'desktop_fs' | 'legacy_migration'
  constructor(
    message: string,
    options?: { cause?: unknown; reason?: 'desktop_fs' | 'legacy_migration' },
  ) {
    super(message, options)
    this.name = 'WorkspaceStoreInitError'
    this.reason = options?.reason ?? 'desktop_fs'
  }
}

type WorkspaceStoreTestHooks = {
  /** When set, overrides Tauri desktop detection for tests. */
  isDesktop?: boolean | null
  /** When set, replaces Tauri AppData FS factory for tests. */
  createDesktopFs?: (() => Promise<FsBackend>) | null
}

let testHooks: WorkspaceStoreTestHooks = {}

/** Test-only hooks for desktop init / fallback behavior. Cleared by resetWorkspaceStoreSingleton. */
export function setWorkspaceStoreTestHooks(hooks: WorkspaceStoreTestHooks): void {
  testHooks = { ...hooks }
}

let singleton: WorkspaceStore | null = null
let singletonPromise: Promise<WorkspaceStore> | null = null
let initFailure: WorkspaceStoreInitError | null = null

/** Test helper: inject a memory-backed store (resets singleton). */
export function installMemoryWorkspaceStore(fs?: FsBackend): WorkspaceStore {
  const store = createFsWorkspaceStore(fs ?? createMemoryFsBackend(), 'memory')
  singleton = store
  singletonPromise = Promise.resolve(store)
  initFailure = null
  return store
}

export function resetWorkspaceStoreSingleton(): void {
  singleton = null
  singletonPromise = null
  initFailure = null
  testHooks = {}
}

export async function getWorkspaceStore(): Promise<WorkspaceStore> {
  if (initFailure) throw initFailure
  if (singleton) return singleton
  if (singletonPromise) return singletonPromise

  const isDesktop =
    testHooks.isDesktop != null ? testHooks.isDesktop : isDesktopGraphExportSupported()

  singletonPromise = (async () => {
    if (isDesktop) {
      try {
        const fs = testHooks.createDesktopFs
          ? await testHooks.createDesktopFs()
          : await createTauriAppDataFsBackend()
        const store = createFsWorkspaceStore(fs, 'desktop')
        const migration = await migrateLegacyLocalStorageIfNeeded(store)
        if (migration.status === 'failed') {
          initFailure = new WorkspaceStoreInitError(
            `Legacy workspace migration failed: ${migration.message}`,
            { reason: 'legacy_migration' },
          )
          singleton = null
          throw initFailure
        }
        singleton = store
        return store
      } catch (err) {
        if (err instanceof WorkspaceStoreInitError) {
          initFailure = err
          singleton = null
          throw err
        }
        initFailure = new WorkspaceStoreInitError(
          err instanceof Error
            ? err.message
            : 'Desktop AppData workspace store failed to initialize',
          { cause: err, reason: 'desktop_fs' },
        )
        singleton = null
        throw initFailure
      }
    }
    const store = createBrowserWorkspaceStore()
    singleton = store
    return store
  })()

  try {
    return await singletonPromise
  } catch (err) {
    singletonPromise = null
    throw err
  }
}

export function workspaceStorageVersion(): typeof WORKSPACE_STORAGE_VERSION {
  return WORKSPACE_STORAGE_VERSION
}

/** Serialize portable GraphDocument (self-contained) — used by Save / Save As. */
export function serializePortableDocument(document: GraphDocumentV01): string {
  return serializeGraphDocument(document)
}

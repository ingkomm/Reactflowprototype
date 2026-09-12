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
import { readBrowserStorageKey } from './browserStorage'
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

type PreviousAssetMapResult =
  | { ok: true; map: Map<string, string> | undefined }
  | { ok: false; reason: 'io'; message: string }

type AssetRefScan =
  | { ok: true; ids: Set<string> }
  | { ok: false; reason: 'uncertain'; message: string }

async function readPreviousAssetMap(
  fs: FsBackend,
  path: string,
): Promise<PreviousAssetMapResult> {
  const raw = await readManifestRaw(fs, path)
  if (!raw.ok) {
    if (raw.reason === 'missing') return { ok: true, map: undefined }
    return { ok: false, reason: 'io', message: raw.message }
  }
  const manifest = parseWorkspaceManifestJson(raw.text)
  // Corrupt slot being overwritten: no reuse map.
  if (!manifest) return { ok: true, map: undefined }
  return { ok: true, map: symbolIdToAssetIdMap(manifest) }
}

/** Missing slots contribute nothing; I/O or corrupt → uncertain (never pretend empty). */
async function referencedAssetIds(fs: FsBackend): Promise<AssetRefScan> {
  const keep = new Set<string>()
  for (const path of [CURRENT_MANIFEST_PATH, BACKUP_MANIFEST_PATH]) {
    const raw = await readManifestRaw(fs, path)
    if (!raw.ok) {
      if (raw.reason === 'missing') continue
      return { ok: false, reason: 'uncertain', message: raw.message }
    }
    const manifest = parseWorkspaceManifestJson(raw.text)
    if (!manifest) {
      return {
        ok: false,
        reason: 'uncertain',
        message: `unreadable workspace manifest at ${path}`,
      }
    }
    for (const id of collectAssetIdsFromManifest(manifest)) keep.add(id)
  }
  return { ok: true, ids: keep }
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
      const previous = await readPreviousAssetMap(fs, path)
      if (!previous.ok) {
        return { ok: false, reason: 'io', message: previous.message }
      }
      const committedScan = await referencedAssetIds(fs)
      const committed = committedScan.ok
        ? committedScan.ids
        : new Set((await assets.list()).map((a) => a.assetId))
      const manifest = await buildManifestFromDocument(document, assets, {
        previousAssetIdsBySymbolId: previous.map,
        committedAssetIds: committed,
      })

      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }

      const text = serializeManifest(manifest)
      await atomicWriteText(fs, path, text)

      const keepScan = await referencedAssetIds(fs)
      if (keepScan.ok) {
        await garbageCollectAssets(assets, keepScan.ids)
      }
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
      return await fs.exists(CURRENT_MANIFEST_PATH)
    },
    async hasBackup() {
      return await fs.exists(BACKUP_MANIFEST_PATH)
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
          const keepScan = await referencedAssetIds(fs)
          if (keepScan.ok) {
            await garbageCollectAssets(assets, keepScan.ids)
          }
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
    const read = readBrowserStorageKey(key)
    if (!read.ok) {
      return { ok: false, reason: 'io', message: read.message }
    }
    if (read.value == null) return { ok: false, reason: 'missing', message: 'missing' }

    const manifest = parseWorkspaceManifestJson(read.value)
    if (manifest) {
      const hydrated = await hydrateManifest(manifest, assets)
      return finalizeHydratedLoad(hydrated)
    }

    const legacy = parseGraphDocumentJson(read.value)
    if (legacy.ok) return { ok: true, document: legacy.document, issues: [] }
    return { ok: false, reason: 'corrupt', message: 'corrupt localStorage payload' }
  }

  const previousMap = async (key: string): Promise<Map<string, string> | undefined> => {
    const read = readBrowserStorageKey(key)
    if (!read.ok) {
      throw new Error(read.message)
    }
    if (!read.value) return undefined
    const manifest = parseWorkspaceManifestJson(read.value)
    if (!manifest) return undefined
    return symbolIdToAssetIdMap(manifest)
  }

  const browserRefs = async (): Promise<Set<string>> => {
    const keep = new Set<string>()
    for (const key of [CURRENT_KEY, BACKUP_KEY]) {
      const read = readBrowserStorageKey(key)
      if (!read.ok) {
        throw new Error(read.message)
      }
      if (!read.value) continue
      const manifest = parseWorkspaceManifestJson(read.value)
      if (!manifest) {
        throw new Error(`unreadable workspace localStorage manifest for ${key}`)
      }
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
      const read = readBrowserStorageKey(CURRENT_KEY)
      if (!read.ok) {
        throw new Error(read.message)
      }
      return read.value != null
    },
    async hasBackup() {
      const read = readBrowserStorageKey(BACKUP_KEY)
      if (!read.ok) {
        throw new Error(read.message)
      }
      return read.value != null
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
  if (typeof globalThis.localStorage === 'undefined') {
    return { status: 'no_legacy' }
  }
  let didMigrate = false
  let anyLegacySeen = false
  let anyMissingDest = false
  let anyValidDest = false

  for (const slot of ['current', 'backup'] as const) {
    const dest = slot === 'current' ? await store.loadCurrent() : await store.loadBackup()
    if (dest.ok) {
      anyValidDest = true
      continue
    }
    if (dest.reason !== 'missing') {
      return {
        status: 'failed',
        message: `v0.2 ${slot} is ${dest.reason}; refusing to overwrite with legacy source`,
      }
    }

    anyMissingDest = true
    const key = slot === 'current' ? LEGACY_STORAGE_KEY : LEGACY_BACKUP_KEY
    const read = readBrowserStorageKey(key)
    if (!read.ok) {
      return {
        status: 'failed',
        message: `legacy ${slot} localStorage read failed (${read.message})`,
      }
    }
    if (read.value == null) {
      continue
    }
    anyLegacySeen = true

    const parsed = parseGraphDocumentJson(read.value)
    if (!parsed.ok) {
      return {
        status: 'failed',
        message: `legacy ${slot} is not a valid GraphDocument (${parsed.message})`,
      }
    }
    const saved =
      slot === 'current'
        ? await store.saveCurrent(parsed.document)
        : await store.saveBackup(parsed.document)
    if (!saved.ok) {
      return {
        status: 'failed',
        message: saved.message ?? `${slot} migration failed (${saved.reason})`,
      }
    }
    const verify = slot === 'current' ? await store.loadCurrent() : await store.loadBackup()
    if (!verify.ok) {
      return {
        status: 'failed',
        message: `${slot} migration verify failed (${verify.reason})`,
      }
    }
    didMigrate = true
    if (slot === 'current') {
      try {
        localStorage.setItem(MIGRATION_MARKER_KEY, 'ok')
      } catch {
        /* ignore */
      }
    }
  }

  if (didMigrate) return { status: 'migrated' }
  if (!anyMissingDest) return { status: 'already_migrated' }
  if (!anyLegacySeen) {
    // Missing destination(s) but no legacy for those slots.
    return anyValidDest ? { status: 'already_migrated' } : { status: 'no_legacy' }
  }
  return { status: 'already_migrated' }
}

/** Destination-first migration of a single legacy slot into v0.2. */
export async function migrateLegacySlotIfNeeded(
  store: WorkspaceStore,
  slot: 'current' | 'backup',
): Promise<LegacyMigrationResult> {
  if (typeof globalThis.localStorage === 'undefined') {
    return { status: 'no_legacy' }
  }
  const dest = slot === 'current' ? await store.loadCurrent() : await store.loadBackup()
  if (dest.ok) return { status: 'already_migrated' }
  if (dest.reason !== 'missing') {
    return {
      status: 'failed',
      message: `v0.2 ${slot} is ${dest.reason}; refusing to overwrite with legacy source`,
    }
  }
  const key = slot === 'current' ? LEGACY_STORAGE_KEY : LEGACY_BACKUP_KEY
  const read = readBrowserStorageKey(key)
  if (!read.ok) {
    return {
      status: 'failed',
      message: `legacy ${slot} localStorage read failed (${read.message})`,
    }
  }
  if (read.value == null) return { status: 'no_legacy' }

  const parsed = parseGraphDocumentJson(read.value)
  if (!parsed.ok) {
    return {
      status: 'failed',
      message: `legacy ${slot} is not a valid GraphDocument (${parsed.message})`,
    }
  }
  const saved =
    slot === 'current'
      ? await store.saveCurrent(parsed.document)
      : await store.saveBackup(parsed.document)
  if (!saved.ok) {
    return {
      status: 'failed',
      message: saved.message ?? `${slot} migration failed (${saved.reason})`,
    }
  }
  const verify = slot === 'current' ? await store.loadCurrent() : await store.loadBackup()
  if (!verify.ok) {
    return {
      status: 'failed',
      message: `${slot} migration verify failed (${verify.reason})`,
    }
  }
  return { status: 'migrated' }
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
  /** Test-only: invoked when getWorkspaceStore begins a real init (not cached singleton). */
  onInit?: (() => void) | null
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

/**
 * Open v0.2 Workspace backend without running all-slot legacy migration.
 * Used as a migration source by WorldStore; legacy is resolved per missing slot.
 */
export async function openWorkspaceStoreBackend(): Promise<WorkspaceStore> {
  if (initFailure) throw initFailure
  if (singleton) return singleton
  if (singletonPromise) return singletonPromise

  testHooks.onInit?.()

  const isDesktop =
    testHooks.isDesktop != null ? testHooks.isDesktop : isDesktopGraphExportSupported()

  singletonPromise = (async () => {
    if (isDesktop) {
      try {
        const fs = testHooks.createDesktopFs
          ? await testHooks.createDesktopFs()
          : await createTauriAppDataFsBackend()
        const store = createFsWorkspaceStore(fs, 'desktop')
        singleton = store
        return store
      } catch (err) {
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

export async function getWorkspaceStore(): Promise<WorkspaceStore> {
  if (initFailure) throw initFailure

  const isDesktop =
    testHooks.isDesktop != null ? testHooks.isDesktop : isDesktopGraphExportSupported()

  const store = await openWorkspaceStoreBackend()

  if (isDesktop) {
    const migration = await migrateLegacyLocalStorageIfNeeded(store)
    if (migration.status === 'failed') {
      initFailure = new WorkspaceStoreInitError(
        `Legacy workspace migration failed: ${migration.message}`,
        { reason: 'legacy_migration' },
      )
      singleton = null
      singletonPromise = null
      throw initFailure
    }
  }

  return store
}

export function workspaceStorageVersion(): typeof WORKSPACE_STORAGE_VERSION {
  return WORKSPACE_STORAGE_VERSION
}

/** Serialize portable GraphDocument (self-contained) — used by Save / Save As. */
export function serializePortableDocument(document: GraphDocumentV01): string {
  return serializeGraphDocument(document)
}

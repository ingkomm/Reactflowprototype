/**
 * Internal World persistence (v0.3).
 *
 * Desktop: AppData/storage-v03/{current,backup}.json + assets/
 * Browser: separate localStorage keys (size-capped)
 *
 * v0.2 WorkspaceStore (storage-v02) remains the migration source and is never deleted.
 * Structured world data ≠ asset bytes.
 * Portable GraphDocument remains self-contained (markup inline) at Galaxy graph scope.
 */
import { graphDocumentsEqual, type GraphDocumentV01 } from '../graphDocument'
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
  buildWorldManifestFromDocument,
  collectAssetIdsFromWorldManifest,
  galaxySymbolAssetIdMap,
  hydrateWorldManifest,
  parseWorldManifestJson,
} from './worldAssets'
import {
  clearActiveWorldContext,
  getActiveWorldContext,
  setActiveWorldContext,
  updateActiveWorldDocument,
} from './worldContext'
import {
  getActiveGalaxyGraph,
  replaceGalaxyGraph,
  validateWorldDocument,
  wrapGraphAsDefaultWorld,
} from './worldDocument'
import {
  DEFAULT_GALAXY_ID,
  WORLD_STORAGE_VERSION,
  type WorldDocumentV03,
  type WorldLoadResult,
  type WorldManifestV03,
  type WorldSaveResult,
} from './worldTypes'
import {
  getWorkspaceStore,
  installMemoryWorkspaceStore,
  WorkspaceStoreInitError,
  type WorkspaceStore,
} from './workspaceStore'

export const WORLD_STORAGE_ROOT = 'storage-v03'
export const WORLD_CURRENT_MANIFEST_PATH = `${WORLD_STORAGE_ROOT}/current.json`
export const WORLD_BACKUP_MANIFEST_PATH = `${WORLD_STORAGE_ROOT}/backup.json`
export const WORLD_ASSETS_DIR = `${WORLD_STORAGE_ROOT}/assets`

/** Browser localStorage keys for v0.3 World manifests (v0.2 keys stay migration source). */
export const WORLD_STORAGE_KEY = 'pob-world-document-v03'
export const WORLD_BACKUP_KEY = 'pob-world-document-backup-v03'
export const WORLD_ASSET_PREFIX = 'pob-asset-v03:'

export type WorldStore = {
  readonly kind: 'desktop' | 'browser' | 'memory'
  assets: AssetStore
  hasCurrent(): Promise<boolean>
  hasBackup(): Promise<boolean>
  loadCurrent(): Promise<WorldLoadResult>
  loadBackup(): Promise<WorldLoadResult>
  saveCurrent(world: WorldDocumentV03): Promise<WorldSaveResult>
  saveBackup(world: WorldDocumentV03): Promise<WorldSaveResult>
  clearCurrent(): Promise<WorldSaveResult>
}

function serializeWorldManifest(manifest: WorldManifestV03): string {
  return `${JSON.stringify(manifest)}\n`
}

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

async function finalizeHydratedWorldLoad(
  hydrated: Awaited<ReturnType<typeof hydrateWorldManifest>>,
): Promise<WorldLoadResult> {
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

  const validated = validateWorldDocument(hydrated.world)
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'corrupt',
      message: validated.message,
      issues: [{ code: 'corrupt_manifest', message: validated.message }],
    }
  }

  return { ok: true, world: validated.world, issues: hydrated.issues }
}

async function loadSlotFromFs(
  fs: FsBackend,
  assets: AssetStore,
  path: string,
): Promise<WorldLoadResult> {
  const raw = await readManifestRaw(fs, path)
  if (!raw.ok) {
    return {
      ok: false,
      reason: raw.reason === 'missing' ? 'missing' : 'io',
      message: raw.message,
    }
  }

  const manifest = parseWorldManifestJson(raw.text)
  if (!manifest) {
    return {
      ok: false,
      reason: 'corrupt',
      message: 'world manifest corrupt',
      issues: [{ code: 'corrupt_manifest', message: 'invalid storageVersion or shape' }],
    }
  }

  const hydrated = await hydrateWorldManifest(manifest, assets)
  return finalizeHydratedWorldLoad(hydrated)
}

async function readPreviousGalaxyAssetMap(
  fs: FsBackend,
  path: string,
): Promise<Map<string, string> | undefined> {
  const raw = await readManifestRaw(fs, path)
  if (!raw.ok) return undefined
  const manifest = parseWorldManifestJson(raw.text)
  if (!manifest) return undefined
  return galaxySymbolAssetIdMap(manifest)
}

async function referencedWorldAssetIds(fs: FsBackend): Promise<Set<string>> {
  const keep = new Set<string>()
  for (const path of [WORLD_CURRENT_MANIFEST_PATH, WORLD_BACKUP_MANIFEST_PATH]) {
    const raw = await readManifestRaw(fs, path)
    if (!raw.ok) continue
    const manifest = parseWorldManifestJson(raw.text)
    if (!manifest) continue
    for (const id of collectAssetIdsFromWorldManifest(manifest)) keep.add(id)
  }
  return keep
}

function createFsWorldStore(fs: FsBackend, kind: 'desktop' | 'memory'): WorldStore {
  const assets = createFileAssetStore(fs, WORLD_ASSETS_DIR)
  const mutationQueue = createSerialQueue()
  let currentGeneration = 0
  let backupGeneration = 0

  const ensureRoot = async () => {
    await fs.mkdir(WORLD_STORAGE_ROOT, { recursive: true })
    await fs.mkdir(WORLD_ASSETS_DIR, { recursive: true })
  }

  const saveSlot = async (
    slot: 'current' | 'backup',
    world: WorldDocumentV03,
    generation: number,
  ): Promise<WorldSaveResult> => {
    const latest = slot === 'current' ? currentGeneration : backupGeneration
    if (generation !== latest) return { ok: true }

    try {
      await ensureRoot()
      const path =
        slot === 'current' ? WORLD_CURRENT_MANIFEST_PATH : WORLD_BACKUP_MANIFEST_PATH
      const reuse = await readPreviousGalaxyAssetMap(fs, path)
      const committed = await referencedWorldAssetIds(fs)
      const manifest = await buildWorldManifestFromDocument(world, assets, {
        previousAssetIdsByGalaxySymbol: reuse,
        committedAssetIds: committed,
      })

      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }

      const text = serializeWorldManifest(manifest)
      await atomicWriteText(fs, path, text)

      const keep = await referencedWorldAssetIds(fs)
      await garbageCollectAssets(assets, keep)
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        reason: 'io',
        message: err instanceof Error ? err.message : 'world save failed',
      }
    }
  }

  return {
    kind,
    assets,
    async hasCurrent() {
      try {
        return await fs.exists(WORLD_CURRENT_MANIFEST_PATH)
      } catch {
        return false
      }
    },
    async hasBackup() {
      try {
        return await fs.exists(WORLD_BACKUP_MANIFEST_PATH)
      } catch {
        return false
      }
    },
    loadCurrent: () => loadSlotFromFs(fs, assets, WORLD_CURRENT_MANIFEST_PATH),
    loadBackup: () => loadSlotFromFs(fs, assets, WORLD_BACKUP_MANIFEST_PATH),
    saveCurrent: (world) => {
      const gen = ++currentGeneration
      return mutationQueue.enqueue(() => saveSlot('current', world, gen))
    },
    saveBackup: (world) => {
      const gen = ++backupGeneration
      return mutationQueue.enqueue(() => saveSlot('backup', world, gen))
    },
    clearCurrent: () =>
      mutationQueue.enqueue(async () => {
        try {
          await ensureRoot()
          if (await fs.exists(WORLD_CURRENT_MANIFEST_PATH)) {
            await fs.remove(WORLD_CURRENT_MANIFEST_PATH)
          }
          const keep = await referencedWorldAssetIds(fs)
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

function createBrowserWorldStore(): WorldStore {
  const assets = createLocalStorageAssetStore(WORLD_ASSET_PREFIX)
  const mutationQueue = createSerialQueue()
  let currentGeneration = 0
  let backupGeneration = 0
  const CURRENT_KEY = WORLD_STORAGE_KEY
  const BACKUP_KEY = WORLD_BACKUP_KEY

  const readKey = (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const writeKey = (key: string, value: string): WorldSaveResult => {
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

  const loadKey = async (key: string): Promise<WorldLoadResult> => {
    const raw = readKey(key)
    if (raw == null) return { ok: false, reason: 'missing', message: 'missing' }

    const manifest = parseWorldManifestJson(raw)
    if (!manifest) {
      return { ok: false, reason: 'corrupt', message: 'corrupt world localStorage payload' }
    }
    const hydrated = await hydrateWorldManifest(manifest, assets)
    return finalizeHydratedWorldLoad(hydrated)
  }

  const previousMap = async (key: string): Promise<Map<string, string> | undefined> => {
    const raw = readKey(key)
    if (!raw) return undefined
    const manifest = parseWorldManifestJson(raw)
    if (!manifest) return undefined
    return galaxySymbolAssetIdMap(manifest)
  }

  const browserRefs = async (): Promise<Set<string>> => {
    const keep = new Set<string>()
    for (const key of [CURRENT_KEY, BACKUP_KEY]) {
      const raw = readKey(key)
      if (!raw) continue
      const manifest = parseWorldManifestJson(raw)
      if (!manifest) continue
      for (const id of collectAssetIdsFromWorldManifest(manifest)) keep.add(id)
    }
    return keep
  }

  const saveKey = async (
    key: string,
    world: WorldDocumentV03,
    generation: number,
    slot: 'current' | 'backup',
  ): Promise<WorldSaveResult> => {
    const latest = slot === 'current' ? currentGeneration : backupGeneration
    if (generation !== latest) return { ok: true }
    try {
      const reuse = await previousMap(key)
      const committed = await browserRefs()
      const manifest = await buildWorldManifestFromDocument(world, assets, {
        previousAssetIdsByGalaxySymbol: reuse,
        committedAssetIds: committed,
      })
      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }
      const text = serializeWorldManifest(manifest)
      const written = writeKey(key, text)
      if (!written.ok) return written
      const keep = await browserRefs()
      await garbageCollectAssets(assets, keep)
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        reason: 'io',
        message: err instanceof Error ? err.message : 'browser world save failed',
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
    saveCurrent: (world) => {
      const gen = ++currentGeneration
      return mutationQueue.enqueue(() => saveKey(CURRENT_KEY, world, gen, 'current'))
    },
    saveBackup: (world) => {
      const gen = ++backupGeneration
      return mutationQueue.enqueue(() => saveKey(BACKUP_KEY, world, gen, 'backup'))
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

/** Result of attempting v0.2 Workspace → v0.3 World migration. */
export type WorldMigrationResult =
  | { status: 'no_source' }
  | { status: 'already_migrated' }
  | { status: 'migrated' }
  | { status: 'failed'; message: string }

async function migrateOneWorkspaceSlot(
  workspace: WorkspaceStore,
  worldStore: WorldStore,
  slot: 'current' | 'backup',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const loaded =
    slot === 'current' ? await workspace.loadCurrent() : await workspace.loadBackup()
  if (!loaded.ok) {
    return {
      ok: false,
      message: `v0.2 ${slot} unreadable (${loaded.reason}: ${loaded.message})`,
    }
  }

  const world = wrapGraphAsDefaultWorld(loaded.document)
  const saved =
    slot === 'current'
      ? await worldStore.saveCurrent(world)
      : await worldStore.saveBackup(world)
  if (!saved.ok) {
    return {
      ok: false,
      message: saved.message ?? `v0.3 ${slot} save failed (${saved.reason})`,
    }
  }

  const verify =
    slot === 'current' ? await worldStore.loadCurrent() : await worldStore.loadBackup()
  if (!verify.ok) {
    return {
      ok: false,
      message: `v0.3 ${slot} verify load failed (${verify.reason}: ${verify.message})`,
    }
  }

  const validated = validateWorldDocument(verify.world)
  if (!validated.ok) {
    return { ok: false, message: `v0.3 ${slot} world validation failed: ${validated.message}` }
  }

  const galaxyGraph = getActiveGalaxyGraph(validated.world, DEFAULT_GALAXY_ID)
  if (!galaxyGraph) {
    return { ok: false, message: `v0.3 ${slot} missing default galaxy ${DEFAULT_GALAXY_ID}` }
  }
  if (!graphDocumentsEqual(loaded.document, galaxyGraph)) {
    return {
      ok: false,
      message: `v0.3 ${slot} semantic preservation check failed`,
    }
  }

  return { ok: true }
}

/**
 * Migrate v0.2 Workspace current/backup slots into v0.3 World slots independently.
 * Never deletes or overwrites v0.2 source. Never overwrites an existing v0.3 slot.
 */
export async function migrateWorkspaceToWorldIfNeeded(
  workspace: WorkspaceStore,
  worldStore: WorldStore,
): Promise<WorldMigrationResult> {
  const v02Current = await workspace.hasCurrent()
  const v02Backup = await workspace.hasBackup()
  if (!v02Current && !v02Backup) {
    return { status: 'no_source' }
  }

  const v03Current = await worldStore.hasCurrent()
  const v03Backup = await worldStore.hasBackup()

  const currentNeeded = v02Current && !v03Current
  const backupNeeded = v02Backup && !v03Backup

  if (!currentNeeded && !backupNeeded) {
    return { status: 'already_migrated' }
  }

  let didMigrate = false

  if (currentNeeded) {
    const result = await migrateOneWorkspaceSlot(workspace, worldStore, 'current')
    if (!result.ok) return { status: 'failed', message: result.message }
    didMigrate = true
  }

  if (backupNeeded) {
    const result = await migrateOneWorkspaceSlot(workspace, worldStore, 'backup')
    if (!result.ok) return { status: 'failed', message: result.message }
    didMigrate = true
  }

  return didMigrate ? { status: 'migrated' } : { status: 'already_migrated' }
}

export class WorldStoreInitError extends Error {
  readonly code = 'world_store_init_failed' as const
  readonly reason: 'desktop_fs' | 'world_migration' | 'workspace_init'
  constructor(
    message: string,
    options?: {
      cause?: unknown
      reason?: 'desktop_fs' | 'world_migration' | 'workspace_init'
    },
  ) {
    super(message, options)
    this.name = 'WorldStoreInitError'
    this.reason = options?.reason ?? 'desktop_fs'
  }
}

type WorldStoreTestHooks = {
  isDesktop?: boolean | null
  createDesktopFs?: (() => Promise<FsBackend>) | null
}

let testHooks: WorldStoreTestHooks = {}

export function setWorldStoreTestHooks(hooks: WorldStoreTestHooks): void {
  testHooks = { ...hooks }
}

let singleton: WorldStore | null = null
let singletonPromise: Promise<WorldStore> | null = null
let initFailure: WorldStoreInitError | null = null

/** Test helper: inject a memory-backed world store (resets world singleton). */
export function installMemoryWorldStore(fs?: FsBackend): WorldStore {
  const backend = fs ?? createMemoryFsBackend()
  const store = createFsWorldStore(backend, 'memory')
  singleton = store
  singletonPromise = Promise.resolve(store)
  initFailure = null
  return store
}

/** Install shared memory FS with both v0.2 workspace + v0.3 world stores. */
export function installMemoryPersistencePair(fs?: FsBackend): {
  fs: FsBackend
  workspace: WorkspaceStore
  world: WorldStore
} {
  const backend = fs ?? createMemoryFsBackend()
  const workspace = installMemoryWorkspaceStore(backend)
  const world = installMemoryWorldStore(backend)
  return { fs: backend, workspace, world }
}

export function resetWorldStoreSingleton(): void {
  singleton = null
  singletonPromise = null
  initFailure = null
  testHooks = {}
  clearActiveWorldContext()
}

export async function getWorldStore(): Promise<WorldStore> {
  if (initFailure) throw initFailure
  if (singleton) return singleton
  if (singletonPromise) return singletonPromise

  const isDesktop =
    testHooks.isDesktop != null ? testHooks.isDesktop : isDesktopGraphExportSupported()

  singletonPromise = (async () => {
    try {
      let workspace: WorkspaceStore
      try {
        workspace = await getWorkspaceStore()
      } catch (err) {
        if (err instanceof WorkspaceStoreInitError) {
          initFailure = new WorldStoreInitError(err.message, {
            cause: err,
            reason: 'workspace_init',
          })
          singleton = null
          throw initFailure
        }
        throw err
      }

      let store: WorldStore
      if (isDesktop) {
        try {
          const fs = testHooks.createDesktopFs
            ? await testHooks.createDesktopFs()
            : await createTauriAppDataFsBackend()
          store = createFsWorldStore(fs, 'desktop')
        } catch (err) {
          initFailure = new WorldStoreInitError(
            err instanceof Error
              ? err.message
              : 'Desktop AppData world store failed to initialize',
            { cause: err, reason: 'desktop_fs' },
          )
          singleton = null
          throw initFailure
        }
      } else if (workspace.kind === 'memory') {
        store = createFsWorldStore(createMemoryFsBackend(), 'memory')
      } else {
        store = createBrowserWorldStore()
      }

      const migration = await migrateWorkspaceToWorldIfNeeded(workspace, store)
      if (migration.status === 'failed') {
        initFailure = new WorldStoreInitError(`World migration failed: ${migration.message}`, {
          reason: 'world_migration',
        })
        singleton = null
        throw initFailure
      }

      singleton = store
      return store
    } catch (err) {
      if (err instanceof WorldStoreInitError) throw err
      initFailure = new WorldStoreInitError(
        err instanceof Error ? err.message : 'World store failed to initialize',
        { cause: err, reason: 'desktop_fs' },
      )
      singleton = null
      throw initFailure
    }
  })()

  try {
    return await singletonPromise
  } catch (err) {
    singletonPromise = null
    throw err
  }
}

export function worldStorageVersion(): typeof WORLD_STORAGE_VERSION {
  return WORLD_STORAGE_VERSION
}

/**
 * Build the WorldDocument to persist for a Graph autosave / New Sheet / import.
 * Replaces the active Galaxy graph inside the existing World when context exists.
 */
export function buildWorldForGraphSave(graph: GraphDocumentV01): WorldDocumentV03 {
  const active = getActiveWorldContext()
  if (active) {
    return replaceGalaxyGraph(active.world, active.activeGalaxyId, graph)
  }
  return wrapGraphAsDefaultWorld(graph)
}

export function rememberLoadedWorld(
  world: WorldDocumentV03,
  activeGalaxyId: string = DEFAULT_GALAXY_ID,
): void {
  setActiveWorldContext({ world, activeGalaxyId })
}

export function rememberSavedWorld(world: WorldDocumentV03): void {
  updateActiveWorldDocument(world)
}

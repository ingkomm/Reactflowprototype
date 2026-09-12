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
  worldStateFromLoadedWorld,
  worldStateWithReplacedActiveGraph,
} from './worldContext'
import {
  getActiveGalaxyGraph,
  validateWorldDocument,
  wrapGraphAsDefaultWorld,
} from './worldDocument'
import {
  DEFAULT_GALAXY_ID,
  WORLD_STORAGE_VERSION,
  type GraphAppWorldState,
  type WorldDocumentV03,
  type WorldLoadResult,
  type WorldManifestV03,
  type WorldSaveResult,
} from './worldTypes'
import { readBrowserStorageKey } from './browserStorage'
import {
  installMemoryWorkspaceStore,
  migrateLegacySlotIfNeeded,
  openWorkspaceStoreBackend,
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

type PreviousGalaxyAssetMapResult =
  | { ok: true; map: Map<string, string> | undefined }
  | { ok: false; reason: 'io'; message: string }

type WorldAssetRefScan =
  | { ok: true; ids: Set<string> }
  | { ok: false; reason: 'uncertain'; message: string }

async function readPreviousGalaxyAssetMap(
  fs: FsBackend,
  path: string,
): Promise<PreviousGalaxyAssetMapResult> {
  const raw = await readManifestRaw(fs, path)
  if (!raw.ok) {
    if (raw.reason === 'missing') return { ok: true, map: undefined }
    return { ok: false, reason: 'io', message: raw.message }
  }
  const manifest = parseWorldManifestJson(raw.text)
  if (!manifest) return { ok: true, map: undefined }
  return { ok: true, map: galaxySymbolAssetIdMap(manifest) }
}

/** Missing slots contribute nothing; I/O or corrupt → uncertain (never pretend empty). */
async function referencedWorldAssetIds(fs: FsBackend): Promise<WorldAssetRefScan> {
  const keep = new Set<string>()
  for (const path of [WORLD_CURRENT_MANIFEST_PATH, WORLD_BACKUP_MANIFEST_PATH]) {
    const raw = await readManifestRaw(fs, path)
    if (!raw.ok) {
      if (raw.reason === 'missing') continue
      return { ok: false, reason: 'uncertain', message: raw.message }
    }
    const manifest = parseWorldManifestJson(raw.text)
    if (!manifest) {
      return {
        ok: false,
        reason: 'uncertain',
        message: `unreadable world manifest at ${path}`,
      }
    }
    for (const id of collectAssetIdsFromWorldManifest(manifest)) keep.add(id)
  }
  return { ok: true, ids: keep }
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

    const validated = validateWorldDocument(world)
    if (!validated.ok) {
      return { ok: false, reason: 'invalid', message: validated.message }
    }

    try {
      await ensureRoot()
      const path =
        slot === 'current' ? WORLD_CURRENT_MANIFEST_PATH : WORLD_BACKUP_MANIFEST_PATH
      const previous = await readPreviousGalaxyAssetMap(fs, path)
      if (!previous.ok) {
        return { ok: false, reason: 'io', message: previous.message }
      }
      const committedScan = await referencedWorldAssetIds(fs)
      const committed = committedScan.ok
        ? committedScan.ids
        : new Set((await assets.list()).map((a) => a.assetId))
      const manifest = await buildWorldManifestFromDocument(validated.world, assets, {
        previousAssetIdsByGalaxySymbol: previous.map,
        committedAssetIds: committed,
      })

      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }

      const text = serializeWorldManifest(manifest)
      await atomicWriteText(fs, path, text)

      const keepScan = await referencedWorldAssetIds(fs)
      if (keepScan.ok) {
        await garbageCollectAssets(assets, keepScan.ids)
      }
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
      return await fs.exists(WORLD_CURRENT_MANIFEST_PATH)
    },
    async hasBackup() {
      return await fs.exists(WORLD_BACKUP_MANIFEST_PATH)
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
          const keepScan = await referencedWorldAssetIds(fs)
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

function createBrowserWorldStore(): WorldStore {
  const assets = createLocalStorageAssetStore(WORLD_ASSET_PREFIX)
  const mutationQueue = createSerialQueue()
  let currentGeneration = 0
  let backupGeneration = 0
  const CURRENT_KEY = WORLD_STORAGE_KEY
  const BACKUP_KEY = WORLD_BACKUP_KEY

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
    const read = readBrowserStorageKey(key)
    if (!read.ok) {
      return { ok: false, reason: 'io', message: read.message }
    }
    if (read.value == null) return { ok: false, reason: 'missing', message: 'missing' }

    const manifest = parseWorldManifestJson(read.value)
    if (!manifest) {
      return { ok: false, reason: 'corrupt', message: 'corrupt world localStorage payload' }
    }
    const hydrated = await hydrateWorldManifest(manifest, assets)
    return finalizeHydratedWorldLoad(hydrated)
  }

  /**
   * Target previous map: missing/corrupt → no reuse (overwrite allowed).
   * localStorage I/O failure → throw (fail-closed; distinct from corrupt).
   */
  const previousMap = async (key: string): Promise<Map<string, string> | undefined> => {
    const read = readBrowserStorageKey(key)
    if (!read.ok) {
      throw new Error(read.message)
    }
    if (!read.value) return undefined
    const manifest = parseWorldManifestJson(read.value)
    if (!manifest) return undefined
    return galaxySymbolAssetIdMap(manifest)
  }

  type BrowserAssetRefScan =
    | { ok: true; ids: Set<string> }
    | { ok: false; reason: 'uncertain'; message: string }
    | { ok: false; reason: 'io'; message: string }

  /**
   * Missing → empty refs for that slot.
   * Valid → collect refs.
   * Corrupt/unparseable → uncertain (never empty; never throw).
   * getItem throw / I/O → io (fail-closed for pre-save).
   */
  const browserRefs = async (): Promise<BrowserAssetRefScan> => {
    const keep = new Set<string>()
    for (const key of [CURRENT_KEY, BACKUP_KEY]) {
      const read = readBrowserStorageKey(key)
      if (!read.ok) {
        return { ok: false, reason: 'io', message: read.message }
      }
      if (!read.value) continue
      const manifest = parseWorldManifestJson(read.value)
      if (!manifest) {
        return {
          ok: false,
          reason: 'uncertain',
          message: `unreadable world localStorage manifest for ${key}`,
        }
      }
      for (const id of collectAssetIdsFromWorldManifest(manifest)) keep.add(id)
    }
    return { ok: true, ids: keep }
  }

  const saveKey = async (
    key: string,
    world: WorldDocumentV03,
    generation: number,
    slot: 'current' | 'backup',
  ): Promise<WorldSaveResult> => {
    const latest = slot === 'current' ? currentGeneration : backupGeneration
    if (generation !== latest) return { ok: true }

    const validated = validateWorldDocument(world)
    if (!validated.ok) {
      return { ok: false, reason: 'invalid', message: validated.message }
    }

    try {
      const reuse = await previousMap(key)
      const scan = await browserRefs()
      if (!scan.ok && scan.reason === 'io') {
        return { ok: false, reason: 'io', message: scan.message }
      }
      const committed = scan.ok
        ? scan.ids
        : new Set((await assets.list()).map((a) => a.assetId))
      const manifest = await buildWorldManifestFromDocument(validated.world, assets, {
        previousAssetIdsByGalaxySymbol: reuse,
        committedAssetIds: committed,
      })
      const stillLatest = slot === 'current' ? currentGeneration : backupGeneration
      if (generation !== stillLatest) return { ok: true }
      const text = serializeWorldManifest(manifest)
      const written = writeKey(key, text)
      if (!written.ok) return written
      const keepScan = await browserRefs()
      // Valid → GC. Uncertain or I/O → skip GC (never delete from unreadable sibling).
      if (keepScan.ok) {
        await garbageCollectAssets(assets, keepScan.ids)
      }
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
          const keepScan = await browserRefs()
          if (keepScan.ok) {
            await garbageCollectAssets(assets, keepScan.ids)
          }
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
 * Fail-closed slot probe: never treat I/O / corrupt as missing.
 * Uses load* results — not boolean has*() exists checks.
 */
export type SlotProbe<T> =
  | { state: 'missing' }
  | { state: 'valid'; value: T }
  | { state: 'failed'; reason: string }


function probeFromLoadResult<T>(
  loaded: { ok: true; value: T } | { ok: false; reason: string; message: string },
): SlotProbe<T> {
  if (loaded.ok) return { state: 'valid', value: loaded.value }
  if (loaded.reason === 'missing') return { state: 'missing' }
  return { state: 'failed', reason: `${loaded.reason}: ${loaded.message}` }
}

export async function probeWorkspaceSlot(
  workspace: WorkspaceStore,
  slot: 'current' | 'backup',
): Promise<SlotProbe<GraphDocumentV01>> {
  const loaded =
    slot === 'current' ? await workspace.loadCurrent() : await workspace.loadBackup()
  if (loaded.ok) return { state: 'valid', value: loaded.document }
  return probeFromLoadResult({
    ok: false,
    reason: loaded.reason,
    message: loaded.message,
  })
}

export async function probeWorldSlot(
  worldStore: WorldStore,
  slot: 'current' | 'backup',
): Promise<SlotProbe<WorldDocumentV03>> {
  const loaded =
    slot === 'current' ? await worldStore.loadCurrent() : await worldStore.loadBackup()
  if (loaded.ok) return { state: 'valid', value: loaded.world }
  return probeFromLoadResult({
    ok: false,
    reason: loaded.reason,
    message: loaded.message,
  })
}

export type StorageSlot = 'current' | 'backup'

export type WorldMigrationPlan = {
  current: SlotProbe<WorldDocumentV03>
  backup: SlotProbe<WorldDocumentV03>
  targets: StorageSlot[]
}

/**
 * Slot-by-slot destination-first target selection.
 * Never uses anyValid / bothExist shortcuts.
 *
 * W1 valid+valid → []
 * W2 valid+missing → [backup]
 * W3 valid+failed → []
 * W4 missing+valid → [] (backup recovery preferred over older current)
 * W5 failed+valid → []
 * W6 missing+missing → [current, backup]
 * W7 failed+missing → [backup]
 * W8 missing+failed → [current]
 * W9 failed+failed → []
 */
export function planWorldMigrationTargets(
  current: SlotProbe<WorldDocumentV03>,
  backup: SlotProbe<WorldDocumentV03>,
): StorageSlot[] {
  const targets: StorageSlot[] = []
  if (current.state === 'missing' && backup.state !== 'valid') {
    targets.push('current')
  }
  if (backup.state === 'missing') {
    targets.push('backup')
  }
  return targets
}

export async function planWorldMigration(worldStore: WorldStore): Promise<WorldMigrationPlan> {
  const current = await probeWorldSlot(worldStore, 'current')
  const backup = await probeWorldSlot(worldStore, 'backup')
  return {
    current,
    backup,
    targets: planWorldMigrationTargets(current, backup),
  }
}

type SlotPlan =
  | { action: 'already' }
  | { action: 'nothing' }
  | { action: 'migrate' }
  | { action: 'blocked' }
  | { action: 'fail'; message: string }

/**
 * Destination-first plan for one *missing* migration target slot.
 * Failed destinations are never targets (overwrite forbidden); callers must not pass them.
 */
async function planSlotMigration(
  workspace: WorkspaceStore,
  worldStore: WorldStore,
  slot: StorageSlot,
): Promise<SlotPlan> {
  const dest = await probeWorldSlot(worldStore, slot)
  if (dest.state === 'valid') {
    return { action: 'already' }
  }
  if (dest.state === 'failed') {
    // Fail-closed: never overwrite failed destination with older source.
    return { action: 'blocked' }
  }

  // Ensure v0.2 source for this slot only (may pull same-slot legacy if v0.2 missing).
  const ensured = await ensureWorkspaceSourceSlot(workspace, slot)
  if (ensured.status === 'failed') {
    return { action: 'fail', message: ensured.message }
  }

  const source = await probeWorkspaceSlot(workspace, slot)
  if (source.state === 'valid') {
    return { action: 'migrate' }
  }
  if (source.state === 'missing') {
    return { action: 'nothing' }
  }
  return {
    action: 'fail',
    message: `v0.2 ${slot} probe failed (${source.reason})`,
  }
}

/**
 * Resolve one workspace slot as a World migration source.
 * v0.2 valid → use it (no legacy). v0.2 failed → fail closed.
 * v0.2 missing → only then attempt same-slot legacy migration.
 */
async function ensureWorkspaceSourceSlot(
  workspace: WorkspaceStore,
  slot: StorageSlot,
): Promise<{ status: 'ok' } | { status: 'failed'; message: string }> {
  const probe = await probeWorkspaceSlot(workspace, slot)
  if (probe.state === 'valid') return { status: 'ok' }
  if (probe.state === 'failed') {
    return {
      status: 'failed',
      message: `v0.2 ${slot} is unreadable (${probe.reason}); refusing legacy overwrite`,
    }
  }
  const legacy = await migrateLegacySlotIfNeeded(workspace, slot)
  if (legacy.status === 'failed') {
    return { status: 'failed', message: legacy.message }
  }
  return { status: 'ok' }
}

/**
 * Migrate selected v0.2 → v0.3 slots (default: planWorldMigration targets).
 * Destination-first / slot-independent; never overwrites failed or valid destinations.
 */
export async function migrateWorkspaceToWorldIfNeeded(
  workspace: WorkspaceStore,
  worldStore: WorldStore,
  targets?: StorageSlot[],
): Promise<WorldMigrationResult> {
  const plan = await planWorldMigration(worldStore)
  const selected = targets ?? plan.targets

  if (selected.length === 0) {
    if (plan.current.state === 'valid' || plan.backup.state === 'valid') {
      return { status: 'already_migrated' }
    }
    return { status: 'no_source' }
  }

  let didMigrate = false
  for (const slot of selected) {
    const slotPlan = await planSlotMigration(workspace, worldStore, slot)
    if (slotPlan.action === 'fail') {
      return { status: 'failed', message: slotPlan.message }
    }
    if (slotPlan.action === 'migrate') {
      const result = await migrateOneWorkspaceSlot(workspace, worldStore, slot)
      if (!result.ok) return { status: 'failed', message: result.message }
      didMigrate = true
    }
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
}

export async function getWorldStore(): Promise<WorldStore> {
  if (initFailure) throw initFailure
  if (singleton) return singleton
  if (singletonPromise) return singletonPromise

  const isDesktop =
    testHooks.isDesktop != null ? testHooks.isDesktop : isDesktopGraphExportSupported()

  singletonPromise = (async () => {
    try {
      // Create v0.3 WorldStore first — do not open v0.2 Workspace until destination probes say we need it.
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
      } else {
        store = createBrowserWorldStore()
      }

      const migrationPlan = await planWorldMigration(store)
      if (migrationPlan.targets.length > 0) {
        let workspace: WorkspaceStore
        try {
          // Raw v0.2 backend only — do not run all-slot legacy migration as a side effect.
          workspace = await openWorkspaceStoreBackend()
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

        const migration = await migrateWorkspaceToWorldIfNeeded(
          workspace,
          store,
          migrationPlan.targets,
        )
        if (migration.status === 'failed') {
          initFailure = new WorldStoreInitError(`World migration failed: ${migration.message}`, {
            reason: 'world_migration',
          })
          singleton = null
          throw initFailure
        }
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
 * Replaces the active Galaxy graph inside the caller-held World when provided.
 */
export function buildWorldForGraphSave(
  graph: GraphDocumentV01,
  worldState: GraphAppWorldState | null = null,
): WorldDocumentV03 {
  return worldStateWithReplacedActiveGraph(graph, worldState).world
}

export function nextWorldStateForGraphSave(
  graph: GraphDocumentV01,
  worldState: GraphAppWorldState | null = null,
): GraphAppWorldState {
  return worldStateWithReplacedActiveGraph(graph, worldState)
}

export { worldStateFromLoadedWorld, worldStateWithReplacedActiveGraph }

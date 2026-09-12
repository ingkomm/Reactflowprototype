/**
 * 0.3-A1 FINAL MIGRATION STATE-MACHINE HARDENING regressions.
 * Slot-by-slot / destination-first / fail-closed.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildMaskedImageMarkup } from '../customSymbol'
import {
  buildGraphDocument,
  graphDocumentsEqual,
  serializeGraphDocument,
} from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import { resolveInitialGraphState } from '../useGraphApp'
import { backupDocumentToStorage, saveDocumentToStorage } from './autosave'
import { createMemoryFsBackend } from './fsBackend'
import {
  CURRENT_MANIFEST_PATH,
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  installMemoryWorkspaceStore,
  migrateLegacyLocalStorageIfNeeded,
  migrateLegacySlotIfNeeded,
  openWorkspaceStoreBackend,
  resetWorkspaceStoreSingleton,
  setWorkspaceStoreTestHooks,
} from './workspaceStore'
import {
  getActiveGalaxyGraph,
  wrapGraphAsDefaultWorld,
} from './worldDocument'
import type { WorldDocumentV03 } from './worldTypes'
import {
  WORLD_BACKUP_MANIFEST_PATH,
  WORLD_CURRENT_MANIFEST_PATH,
  WORLD_STORAGE_KEY,
  getWorldStore,
  installMemoryPersistencePair,
  migrateWorkspaceToWorldIfNeeded,
  planWorldMigration,
  planWorldMigrationTargets,
  resetWorldStoreSingleton,
  setWorldStoreTestHooks,
  type SlotProbe,
} from './worldStore'

const DEMO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const MARKUP = buildMaskedImageMarkup(DEMO_PNG, 24, 24)
const RASTER_MARKUP = buildMaskedImageMarkup(DEMO_PNG, 32, 32)

function docWithSymbols(markups: string[], settings: Record<string, unknown> = {}) {
  return buildGraphDocument({
    nodes: EMPTY_GRAPH_NODES,
    edges: EMPTY_GRAPH_EDGES,
    customSymbols: markups.map((markup, i) => ({
      id: `sym-${i}`,
      name: `Symbol ${i}`,
      viewBox: markup.includes('width="32"') ? '0 0 32 32' : '0 0 24 24',
      width: markup.includes('width="32"') ? 32 : 24,
      height: markup.includes('width="32"') ? 32 : 24,
      markup,
    })),
    settings,
  })
}

function installBrowserLocalStorage(memory: Map<string, string>) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v)
      },
      removeItem: (k: string) => {
        memory.delete(k)
      },
      clear: () => memory.clear(),
      key: (i: number) => [...memory.keys()][i] ?? null,
      get length() {
        return memory.size
      },
    },
  })
}

function probe(state: 'missing' | 'valid' | 'failed'): SlotProbe<WorldDocumentV03> {
  if (state === 'missing') return { state: 'missing' }
  if (state === 'failed') return { state: 'failed', reason: 'corrupt: x' }
  return { state: 'valid', value: wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])) }
}

describe('0.3-A1 migration state machine — planWorldMigrationTargets', () => {
  it('W1–W9 target table', () => {
    expect(planWorldMigrationTargets(probe('valid'), probe('valid'))).toEqual([])
    expect(planWorldMigrationTargets(probe('valid'), probe('missing'))).toEqual(['backup'])
    expect(planWorldMigrationTargets(probe('valid'), probe('failed'))).toEqual([])
    expect(planWorldMigrationTargets(probe('missing'), probe('valid'))).toEqual([])
    expect(planWorldMigrationTargets(probe('failed'), probe('valid'))).toEqual([])
    expect(planWorldMigrationTargets(probe('missing'), probe('missing'))).toEqual([
      'current',
      'backup',
    ])
    expect(planWorldMigrationTargets(probe('failed'), probe('missing'))).toEqual(['backup'])
    expect(planWorldMigrationTargets(probe('missing'), probe('failed'))).toEqual(['current'])
    expect(planWorldMigrationTargets(probe('failed'), probe('failed'))).toEqual([])
  })
})

describe('0.3-A1 migration state machine — World top-level matrix', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('T1 W1: both v0.3 valid → Workspace init count 0', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorldStoreTestHooks({ isDesktop: false })
    const doc = docWithSymbols([MARKUP])
    expect((await saveDocumentToStorage(doc)).ok).toBe(true)
    expect((await backupDocumentToStorage(doc)).ok).toBe(true)

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()

    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: false,
      onInit: () => {
        workspaceInits += 1
        throw new Error('Workspace must not open when both v0.3 slots are valid')
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const store = await getWorldStore()
    expect(workspaceInits).toBe(0)
    expect((await store.loadCurrent()).ok).toBe(true)
    expect((await store.loadBackup()).ok).toBe(true)
  })

  it('T2 W2: valid current + missing backup + v0.2 backup → backup only; v0.2 current load = 0', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const currentGraph = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    const backupGraph = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(currentGraph))).ok).toBe(true)
    expect((await workspace.saveBackup(backupGraph)).ok).toBe(true)

    const before = JSON.stringify(
      (await world.loadCurrent() as { ok: true; world: unknown }).world,
    )

    let v02CurrentLoads = 0
    const original = workspace.loadCurrent.bind(workspace)
    workspace.loadCurrent = async () => {
      v02CurrentLoads += 1
      return original()
    }

    const plan = await planWorldMigration(world)
    expect(plan.targets).toEqual(['backup'])

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world, plan.targets)
    expect(result.status).toBe('migrated')
    expect(v02CurrentLoads).toBe(0)

    expect(
      JSON.stringify((await world.loadCurrent() as { ok: true; world: unknown }).world),
    ).toBe(before)
    const bak = await world.loadBackup()
    expect(bak.ok).toBe(true)
    if (!bak.ok) return
    expect(graphDocumentsEqual(backupGraph, getActiveGalaxyGraph(bak.world)!)).toBe(true)
  })

  it('T2 top-level getWorldStore opens Workspace when backup target exists', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )
    expect((await workspace.saveBackup(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()

    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
      onInit: () => {
        workspaceInits += 1
      },
    })
    setWorldStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
    })

    const store = await getWorldStore()
    expect(workspaceInits).toBe(1)
    expect((await store.loadCurrent()).ok).toBe(true)
    expect((await store.loadBackup()).ok).toBe(true)
  })

  it('T3: valid current + missing backup + no v0.2 backup → start ok, no synthetic backup', async () => {
    const fs = createMemoryFsBackend()
    const { world } = installMemoryPersistencePair(fs)
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()
    setWorkspaceStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
    })
    setWorldStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
    })

    const store = await getWorldStore()
    expect((await store.loadCurrent()).ok).toBe(true)
    const bak = await store.loadBackup()
    expect(bak.ok).toBe(false)
    if (!bak.ok) expect(bak.reason).toBe('missing')
  })

  it('T4 W4: missing current + valid backup → no Workspace; backup recovery', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorldStoreTestHooks({ isDesktop: false })
    expect((await backupDocumentToStorage(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()

    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: false,
      onInit: () => {
        workspaceInits += 1
        throw new Error('Workspace must not open for W4 backup recovery')
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const initial = await resolveInitialGraphState()
    expect(workspaceInits).toBe(0)
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).not.toBeNull()
  })

  it('T5 W5: corrupt current + valid backup → recovery without older source', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorldStoreTestHooks({ isDesktop: false })
    const doc = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await saveDocumentToStorage(doc)).ok).toBe(true)
    expect((await backupDocumentToStorage(doc)).ok).toBe(true)
    memory.set(WORLD_STORAGE_KEY, '{corrupt-v03-current')

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()
    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: false,
      onInit: () => {
        workspaceInits += 1
        throw new Error('must not open Workspace for W5')
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const initial = await resolveInitialGraphState()
    expect(workspaceInits).toBe(0)
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.snapshot).not.toBeNull()
  })

  it('T6 W7: corrupt current + missing backup + v0.2 backup → migrate backup only', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    expect((await workspace.saveBackup(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)

    const corrupt = '{corrupt-v03-current'
    await fs.writeTextFile(WORLD_CURRENT_MANIFEST_PATH, corrupt)

    let v02CurrentLoads = 0
    const original = workspace.loadCurrent.bind(workspace)
    workspace.loadCurrent = async () => {
      v02CurrentLoads += 1
      return original()
    }

    const plan = await planWorldMigration(world)
    expect(plan.targets).toEqual(['backup'])
    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world, plan.targets)
    expect(result.status).toBe('migrated')
    expect(v02CurrentLoads).toBe(0)
    expect(await fs.readTextFile(WORLD_CURRENT_MANIFEST_PATH)).toBe(corrupt)
    expect((await world.loadBackup()).ok).toBe(true)
  })

  it('T7 W8: missing current + corrupt backup + v0.2 current → migrate current only', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const source = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await workspace.saveCurrent(source)).ok).toBe(true)

    const corrupt = '{corrupt-v03-backup'
    await fs.writeTextFile(WORLD_BACKUP_MANIFEST_PATH, corrupt)

    let v02BackupLoads = 0
    const original = workspace.loadBackup.bind(workspace)
    workspace.loadBackup = async () => {
      v02BackupLoads += 1
      return original()
    }

    const plan = await planWorldMigration(world)
    expect(plan.targets).toEqual(['current'])
    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world, plan.targets)
    expect(result.status).toBe('migrated')
    expect(v02BackupLoads).toBe(0)
    expect(await fs.readTextFile(WORLD_BACKUP_MANIFEST_PATH)).toBe(corrupt)

    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(graphDocumentsEqual(source, getActiveGalaxyGraph(loaded.world)!)).toBe(true)
  })

  it('T8 W9: both v0.3 corrupt → no Workspace; storageCorrupt', async () => {
    const fs = createMemoryFsBackend()
    installMemoryPersistencePair(fs)
    await fs.writeTextFile(WORLD_CURRENT_MANIFEST_PATH, '{corrupt-current')
    await fs.writeTextFile(WORLD_BACKUP_MANIFEST_PATH, '{corrupt-backup')

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()
    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
      onInit: () => {
        workspaceInits += 1
      },
    })
    setWorldStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
    })

    const store = await getWorldStore()
    expect(workspaceInits).toBe(0)
    expect((await store.loadCurrent()).ok).toBe(false)
    expect((await store.loadBackup()).ok).toBe(false)

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
  })

  it('T9 W6: both missing + both v0.2 valid → migrate both', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    expect((await workspace.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)
    expect((await workspace.saveBackup(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)

    const plan = await planWorldMigration(world)
    expect(plan.targets).toEqual(['current', 'backup'])
    expect((await migrateWorkspaceToWorldIfNeeded(workspace, world)).status).toBe('migrated')
    expect((await world.loadCurrent()).ok).toBe(true)
    expect((await world.loadBackup()).ok).toBe(true)
  })

  it('T10 partial retry: valid current + missing backup → backup only; current unchanged', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const current = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    const backup = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await workspace.saveCurrent(current)).ok).toBe(true)
    expect((await workspace.saveBackup(backup)).ok).toBe(true)
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(current))).ok).toBe(true)
    expect(await fs.exists(WORLD_BACKUP_MANIFEST_PATH)).toBe(false)

    const before = JSON.stringify(
      (await world.loadCurrent() as { ok: true; world: unknown }).world,
    )
    let v02CurrentLoads = 0
    const original = workspace.loadCurrent.bind(workspace)
    workspace.loadCurrent = async () => {
      v02CurrentLoads += 1
      return original()
    }

    const plan = await planWorldMigration(world)
    expect(plan.targets).toEqual(['backup'])
    expect((await migrateWorkspaceToWorldIfNeeded(workspace, world, plan.targets)).status).toBe(
      'migrated',
    )
    expect(v02CurrentLoads).toBe(0)
    expect(
      JSON.stringify((await world.loadCurrent() as { ok: true; world: unknown }).world),
    ).toBe(before)
    expect((await world.loadBackup()).ok).toBe(true)
  })
})

describe('0.3-A1 migration state machine — v0.1→v0.2 destination-first', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
  })

  it('L1: both v0.2 valid → legacy getItem never called', async () => {
    const memory = new Map<string, string>()
    let legacyReads = 0
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => {
          if (k === LEGACY_STORAGE_KEY || k === LEGACY_BACKUP_KEY) {
            legacyReads += 1
            throw new Error('legacy must not be read when v0.2 destinations are valid')
          }
          return memory.get(k) ?? null
        },
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
        clear: () => memory.clear(),
        key: (i: number) => [...memory.keys()][i] ?? null,
        get length() {
          return memory.size
        },
      },
    })

    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    expect((await store.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)
    expect((await store.saveBackup(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)

    const result = await migrateLegacyLocalStorageIfNeeded(store)
    expect(result.status).toBe('already_migrated')
    expect(legacyReads).toBe(0)
  })

  it('L2: valid current + missing backup → only legacy backup read', async () => {
    const memory = new Map<string, string>()
    let legacyCurrentReads = 0
    let legacyBackupReads = 0
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => {
          if (k === LEGACY_STORAGE_KEY) {
            legacyCurrentReads += 1
            throw new Error('legacy current must not be read')
          }
          if (k === LEGACY_BACKUP_KEY) {
            legacyBackupReads += 1
            return memory.get(k) ?? null
          }
          return memory.get(k) ?? null
        },
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
        clear: () => memory.clear(),
        key: (i: number) => [...memory.keys()][i] ?? null,
        get length() {
          return memory.size
        },
      },
    })

    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const current = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await store.saveCurrent(current)).ok).toBe(true)
    memory.set(LEGACY_BACKUP_KEY, serializeGraphDocument(docWithSymbols([RASTER_MARKUP])))

    const before = JSON.stringify(
      (await store.loadCurrent() as { ok: true; document: unknown }).document,
    )
    const result = await migrateLegacyLocalStorageIfNeeded(store)
    expect(result.status).toBe('migrated')
    expect(legacyCurrentReads).toBe(0)
    expect(legacyBackupReads).toBe(1)
    expect(
      JSON.stringify((await store.loadCurrent() as { ok: true; document: unknown }).document),
    ).toBe(before)
    expect((await store.loadBackup()).ok).toBe(true)
  })

  it('L3: failed v0.2 current + valid legacy → failed; no overwrite', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    memory.set(LEGACY_STORAGE_KEY, serializeGraphDocument(docWithSymbols([MARKUP])))

    const fs = createMemoryFsBackend()
    const store = installMemoryWorkspaceStore(fs)
    await fs.mkdir('storage-v02', { recursive: true })
    await fs.writeTextFile(CURRENT_MANIFEST_PATH, '{corrupt-v02-current')

    const result = await migrateLegacyLocalStorageIfNeeded(store)
    expect(result.status).toBe('failed')
    expect(await fs.readTextFile(CURRENT_MANIFEST_PATH)).toBe('{corrupt-v02-current')
  })

  it('L4: missing v0.2 + legacy getItem throws → failed (not no_legacy)', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new DOMException('blocked', 'SecurityError')
        },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        get length() {
          return 0
        },
      },
    })
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const result = await migrateLegacySlotIfNeeded(store, 'current')
    expect(result.status).toBe('failed')
    expect(result.status).not.toBe('no_legacy')
  })

  it('L5: valid current + missing backup + legacy backup → backup only', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    memory.set(LEGACY_BACKUP_KEY, serializeGraphDocument(docWithSymbols([RASTER_MARKUP])))

    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    expect((await store.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)

    const result = await migrateLegacyLocalStorageIfNeeded(store)
    expect(result.status).toBe('migrated')
    expect((await store.loadBackup()).ok).toBe(true)
  })

  it('L6: both v0.2 valid + unavailable legacy → still usable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('legacy unavailable')
        },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        get length() {
          return 0
        },
      },
    })
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    expect((await store.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)
    expect((await store.saveBackup(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)
    const result = await migrateLegacyLocalStorageIfNeeded(store)
    expect(result.status).toBe('already_migrated')
    expect((await store.loadCurrent()).ok).toBe(true)
  })
})

describe('0.3-A1 migration state machine — has* I/O + asset GC', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('hasCurrent surfaces fs.exists throw (not false)', async () => {
    const fs = createMemoryFsBackend()
    const { world } = installMemoryPersistencePair(fs)
    const original = fs.exists.bind(fs)
    fs.exists = async (path) => {
      if (String(path).includes('current.json')) {
        throw new Error('forced exists I/O failure')
      }
      return original(path)
    }
    await expect(world.hasCurrent()).rejects.toThrow(/forced exists I\/O failure/)
  })

  it('G1: unreadable world backup manifest must not GC backup-only assets', async () => {
    const fs = createMemoryFsBackend()
    const { world } = installMemoryPersistencePair(fs)
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )
    expect(
      (await world.saveBackup(wrapGraphAsDefaultWorld(docWithSymbols([RASTER_MARKUP])))).ok,
    ).toBe(true)

    const before = await world.assets.list()
    expect(before.length).toBeGreaterThan(1)

    const originalRead = fs.readTextFile.bind(fs)
    fs.readTextFile = async (path) => {
      if (String(path).includes('backup.json')) {
        throw new Error('forced backup manifest I/O failure')
      }
      return originalRead(path)
    }

    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )
    const after = await world.assets.list()
    expect(new Set(after.map((a) => a.assetId))).toEqual(new Set(before.map((a) => a.assetId)))
  })

  it('G2: unreadable workspace backup manifest must not GC backup-only assets', async () => {
    const fs = createMemoryFsBackend()
    const workspace = installMemoryWorkspaceStore(fs)
    expect((await workspace.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)
    expect((await workspace.saveBackup(docWithSymbols([RASTER_MARKUP]))).ok).toBe(true)
    const before = await workspace.assets.list()
    expect(before.length).toBeGreaterThan(1)

    const originalRead = fs.readTextFile.bind(fs)
    fs.readTextFile = async (path) => {
      if (String(path).includes('backup.json')) {
        throw new Error('forced workspace backup I/O failure')
      }
      return originalRead(path)
    }

    expect((await workspace.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)
    const after = await workspace.assets.list()
    expect(new Set(after.map((a) => a.assetId))).toEqual(new Set(before.map((a) => a.assetId)))
  })

  it('G3: readable slots still GC true orphans', async () => {
    const fs = createMemoryFsBackend()
    const { world } = installMemoryPersistencePair(fs)
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )
    expect((await world.saveBackup(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )

    const orphan = await world.assets.put({
      kind: 'custom-symbol-markup',
      mimeType: 'image/svg+xml',
      bytes: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      label: 'orphan',
    })
    const listed = await world.assets.list()
    expect(listed.some((a) => a.assetId === orphan.assetId)).toBe(true)

    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(
      true,
    )
    const after = await world.assets.list()
    expect(after.some((a) => a.assetId === orphan.assetId)).toBe(false)
  })

  it('openWorkspaceStoreBackend does not run all-slot legacy migration', async () => {
    const memory = new Map<string, string>()
    let legacyReads = 0
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => {
          if (k === LEGACY_STORAGE_KEY || k === LEGACY_BACKUP_KEY) {
            legacyReads += 1
          }
          return memory.get(k) ?? null
        },
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
        clear: () => memory.clear(),
        key: (i: number) => [...memory.keys()][i] ?? null,
        get length() {
          return memory.size
        },
      },
    })
    memory.set(LEGACY_STORAGE_KEY, serializeGraphDocument(docWithSymbols([MARKUP])))

    setWorkspaceStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => createMemoryFsBackend(),
    })
    const store = await openWorkspaceStoreBackend()
    expect(legacyReads).toBe(0)
    expect((await store.loadCurrent()).ok).toBe(false)
  })
})

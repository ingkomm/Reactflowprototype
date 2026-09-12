import { beforeEach, describe, expect, it } from 'vitest'
import { buildMaskedImageMarkup } from '../customSymbol'
import {
  buildGraphDocument,
  graphDocumentsEqual,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import { createMemoryFsBackend } from './fsBackend'
import {
  BACKUP_MANIFEST_PATH,
  CURRENT_MANIFEST_PATH,
  LEGACY_STORAGE_KEY,
  getWorkspaceStore,
  installMemoryWorkspaceStore,
  resetWorkspaceStoreSingleton,
  setWorkspaceStoreTestHooks,
} from './workspaceStore'
import {
  createNewSheet,
  importGraphJsonText,
  resolveInitialGraphState,
  snapshotToDocument,
  commitBootstrapChoice,
} from '../useGraphApp'
import {
  BOOTSTRAP_KEY,
  backupDocumentToStorage,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  writeBootstrapChoice,
} from './autosave'
import {
  getActiveGalaxyGraph,
  validateWorldDocument,
  wrapGraphAsDefaultWorld,
} from './worldDocument'
import { worldStateWithReplacedActiveGraph } from './worldContext'
import {
  DEFAULT_GALAXY_ID,
  DEFAULT_GALAXY_NAME,
  DEFAULT_UNIVERSE_HEIGHT,
  DEFAULT_UNIVERSE_WIDTH,
} from './worldTypes'
import {
  WORLD_BACKUP_KEY,
  WORLD_BACKUP_MANIFEST_PATH,
  WORLD_CURRENT_MANIFEST_PATH,
  WORLD_STORAGE_KEY,
  getWorldStore,
  installMemoryPersistencePair,
  migrateWorkspaceToWorldIfNeeded,
  probeWorkspaceSlot,
  resetWorldStoreSingleton,
  setWorldStoreTestHooks,
  WorldStoreInitError,
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

describe('0.3-A1 World foundation', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('A: basic v0.2 → v0.3 current migration preserves graph semantics', async () => {
    const { workspace, world } = installMemoryPersistencePair(createMemoryFsBackend())
    const source = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await workspace.saveCurrent(source)).ok).toBe(true)

    const migrated = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(migrated.status).toBe('migrated')

    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.world.galaxies).toHaveLength(1)
    expect(loaded.world.galaxies[0]!.id).toBe(DEFAULT_GALAXY_ID)
    expect(loaded.world.galaxies[0]!.name).toBe(DEFAULT_GALAXY_NAME)
    expect(loaded.world.universe).toEqual({
      width: DEFAULT_UNIVERSE_WIDTH,
      height: DEFAULT_UNIVERSE_HEIGHT,
    })
    const graph = getActiveGalaxyGraph(loaded.world, DEFAULT_GALAXY_ID)!
    expect(graphDocumentsEqual(source, graph)).toBe(true)
    expect(graph.customSymbols[0]?.markup).toBe(MARKUP)
    expect(graph.settings?.gridSnapEnabled).toBe(true)
    expect(graph.nodes.map((n) => n.id)).toEqual(source.nodes.map((n) => n.id))
    expect(graph.edges.map((e) => e.id)).toEqual(source.edges.map((e) => e.id))
  })

  it('B: current + backup migrate independently to matching Worlds', async () => {
    const { workspace, world } = installMemoryPersistencePair(createMemoryFsBackend())
    const current = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    const backup = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await workspace.saveCurrent(current)).ok).toBe(true)
    expect((await workspace.saveBackup(backup)).ok).toBe(true)

    expect((await migrateWorkspaceToWorldIfNeeded(workspace, world)).status).toBe('migrated')

    const cur = await world.loadCurrent()
    const bak = await world.loadBackup()
    expect(cur.ok && bak.ok).toBe(true)
    if (!cur.ok || !bak.ok) return
    expect(graphDocumentsEqual(current, getActiveGalaxyGraph(cur.world)!)).toBe(true)
    expect(graphDocumentsEqual(backup, getActiveGalaxyGraph(bak.world)!)).toBe(true)
    expect(cur.world.galaxies[0]!.id).toBe(DEFAULT_GALAXY_ID)
    expect(bak.world.galaxies[0]!.id).toBe(DEFAULT_GALAXY_ID)
  })

  it('C: partial migration retry does not overwrite existing v0.3 current', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const current = docWithSymbols([MARKUP])
    const backup = docWithSymbols([RASTER_MARKUP])
    expect((await workspace.saveCurrent(current)).ok).toBe(true)
    expect((await workspace.saveBackup(backup)).ok).toBe(true)

    // First pass: migrate current only, then force backup save failure.
    expect((await migrateWorkspaceToWorldIfNeeded(workspace, world)).status).toBe('migrated')
    // Remove v03 backup if somehow present; then force next backup save to fail.
    if (await fs.exists(WORLD_BACKUP_MANIFEST_PATH)) {
      await fs.remove(WORLD_BACKUP_MANIFEST_PATH)
    }
    // Destroy backup slot by removing after a successful current-only state:
    // Re-install pair on same fs with current already present.
    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()
    const pair2 = installMemoryPersistencePair(fs)
    // Ensure v03 current exists, v03 backup missing, v02 both exist.
    expect(await pair2.world.hasCurrent()).toBe(true)
    expect(await pair2.world.hasBackup()).toBe(false)

    const originalWrite = fs.writeTextFile.bind(fs)
    let failBackupTmp = true
    fs.writeTextFile = async (path, contents) => {
      if (failBackupTmp && String(path).includes('backup.json') && String(path).endsWith('.tmp')) {
        failBackupTmp = false
        throw new Error('forced backup save failure')
      }
      return originalWrite(path, contents)
    }

    const failed = await migrateWorkspaceToWorldIfNeeded(pair2.workspace, pair2.world)
    expect(failed.status).toBe('failed')

    const currentBefore = await pair2.world.loadCurrent()
    expect(currentBefore.ok).toBe(true)
    if (!currentBefore.ok) return
    const currentJsonBefore = JSON.stringify(currentBefore.world)

    // Retry with failure removed — must not overwrite existing current.
    fs.writeTextFile = originalWrite
    const retried = await migrateWorkspaceToWorldIfNeeded(pair2.workspace, pair2.world)
    expect(retried.status).toBe('migrated')

    const currentAfter = await pair2.world.loadCurrent()
    expect(currentAfter.ok).toBe(true)
    if (!currentAfter.ok) return
    expect(JSON.stringify(currentAfter.world)).toBe(currentJsonBefore)

    const bak = await pair2.world.loadBackup()
    expect(bak.ok).toBe(true)
    if (!bak.ok) return
    expect(graphDocumentsEqual(backup, getActiveGalaxyGraph(bak.world)!)).toBe(true)
  })

  it('D: corrupt v0.2 source fails closed (no empty bootstrap)', async () => {
    const fs = createMemoryFsBackend()
    installMemoryWorkspaceStore(fs)
    await fs.mkdir('storage-v02', { recursive: true })
    await fs.writeTextFile(CURRENT_MANIFEST_PATH, '{not-a-manifest')

    setWorldStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => fs,
    })
    // Workspace memory already installed; getWorldStore with isDesktop creates desktop world on same? 
    // Use shared pair pattern: world on same fs, workspace already has corrupt current.
    resetWorldStoreSingleton()
    const { world } = installMemoryPersistencePair(fs)
    // Re-corrupt after pair install may have empty dirs
    await fs.writeTextFile(CURRENT_MANIFEST_PATH, '{not-a-manifest')

    const result = await migrateWorkspaceToWorldIfNeeded(
      await import('./workspaceStore').then((m) => m.getWorkspaceStore()),
      world,
    )
    expect(result.status).toBe('failed')
    expect(await world.hasCurrent()).toBe(false)
    expect(await fs.readTextFile(CURRENT_MANIFEST_PATH)).toBe('{not-a-manifest')
  })

  it('E: custom symbol asset hydration survives migration', async () => {
    const { workspace, world } = installMemoryPersistencePair(createMemoryFsBackend())
    const source = docWithSymbols([MARKUP, RASTER_MARKUP])
    expect((await workspace.saveCurrent(source)).ok).toBe(true)
    expect((await migrateWorkspaceToWorldIfNeeded(workspace, world)).status).toBe('migrated')
    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const graph = getActiveGalaxyGraph(loaded.world)!
    expect(graph.customSymbols[0]?.markup).toBe(MARKUP)
    expect(graph.customSymbols[1]?.markup).toBe(RASTER_MARKUP)
  })

  it('F: committed world + assets survive manifest write failure', async () => {
    const fs = createMemoryFsBackend()
    const { world } = installMemoryPersistencePair(fs)
    const good = wrapGraphAsDefaultWorld(docWithSymbols([MARKUP]))
    expect((await world.saveCurrent(good)).ok).toBe(true)

    const originalWrite = fs.writeTextFile.bind(fs)
    let failOnce = true
    fs.writeTextFile = async (path, contents) => {
      if (failOnce && String(path).endsWith('.tmp')) {
        failOnce = false
        throw new Error('disk full')
      }
      return originalWrite(path, contents)
    }

    const badGraph = docWithSymbols([RASTER_MARKUP])
    badGraph.nodes = structuredClone(EMPTY_GRAPH_NODES)
    badGraph.nodes[0] = {
      ...badGraph.nodes[0]!,
      data: { ...badGraph.nodes[0]!.data, markdown: 'should-not-persist' },
    }
    const failed = await world.saveCurrent(wrapGraphAsDefaultWorld(badGraph))
    expect(failed.ok).toBe(false)

    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(getActiveGalaxyGraph(loaded.world)!.customSymbols[0]?.markup).toBe(MARKUP)
    expect(getActiveGalaxyGraph(loaded.world)!.nodes[0]?.data.markdown).not.toBe(
      'should-not-persist',
    )
  })

  it('G: GC keeps assets referenced by current or backup world galaxies', async () => {
    const { world } = installMemoryPersistencePair(createMemoryFsBackend())
    const current = wrapGraphAsDefaultWorld(docWithSymbols([MARKUP]))
    const backup = wrapGraphAsDefaultWorld(docWithSymbols([RASTER_MARKUP]))
    expect((await world.saveCurrent(current)).ok).toBe(true)
    expect((await world.saveBackup(backup)).ok).toBe(true)

    const empty = wrapGraphAsDefaultWorld(
      buildGraphDocument({
        nodes: EMPTY_GRAPH_NODES,
        edges: EMPTY_GRAPH_EDGES,
        customSymbols: [],
        settings: {},
      }),
    )
    expect((await world.saveCurrent(empty)).ok).toBe(true)

    const bak = await world.loadBackup()
    expect(bak.ok).toBe(true)
    if (!bak.ok) return
    expect(getActiveGalaxyGraph(bak.world)!.customSymbols[0]?.markup).toBe(RASTER_MARKUP)

    expect((await world.saveBackup(empty)).ok).toBe(true)
    const listed = await world.assets.list()
    expect(listed).toHaveLength(0)
  })

  it('H: World validation rejects corrupt worlds', () => {
    const base = wrapGraphAsDefaultWorld(docWithSymbols([]))

    const dup = structuredClone(base)
    dup.galaxies.push({ ...dup.galaxies[0]!, id: DEFAULT_GALAXY_ID })
    expect(validateWorldDocument(dup).ok).toBe(false)

    const badBounds = structuredClone(base)
    badBounds.universe = { width: -1, height: 1000 }
    expect(validateWorldDocument(badBounds).ok).toBe(false)

    const badPos = structuredClone(base)
    badPos.galaxies[0]!.universePosition = { x: Number.NaN, y: 10 }
    expect(validateWorldDocument(badPos).ok).toBe(false)

    const badGraph = structuredClone(base)
    ;(badGraph.galaxies[0] as { graph: unknown }).graph = { schemaVersion: '999' }
    expect(validateWorldDocument(badGraph).ok).toBe(false)
  })

  it('I: bootstrap with no v0.3/v0.2/legacy creates WorldDocument', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    writeBootstrapChoice('empty')
    // Ensure no leftover keys
    expect(memory.get(BOOTSTRAP_KEY)).toBe('empty')

    const committed = await commitBootstrapChoice('empty')
    expect(committed.ok).toBe(true)
    if (!committed.ok) return

    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)

    const store = await getWorldStore()
    const world = await store.loadCurrent()
    expect(world.ok).toBe(true)
    if (!world.ok) return
    expect(world.world.galaxies[0]!.id).toBe(DEFAULT_GALAXY_ID)
    expect(graphDocumentsEqual(loaded.document, getActiveGalaxyGraph(world.world)!)).toBe(true)
  })

  it('J: portable GraphDocument Save As / New Sheet / Load still GraphDocumentV01', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)

    const original = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await saveDocumentToStorage(original)).ok).toBe(true)

    const portable = serializeGraphDocument(original)
    expect(portable).not.toMatch(/storage-v0/)
    expect(portable).not.toMatch(/asset_/)
    expect(portable).toMatch(/"schemaVersion":\s*"0\.1"/)
    expect(portable).not.toMatch(/"schemaVersion":\s*"0\.3"/)
    const parsed = parseGraphDocumentJson(portable)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.customSymbols[0]?.markup).toBe(MARKUP)

    const snapshot = {
      nodes: original.nodes as never,
      edges: original.edges as never,
      customSymbols: original.customSymbols,
      settings: original.settings ?? {},
    }
    const newSheet = await createNewSheet(snapshot)
    expect(newSheet.ok).toBe(true)
    if (!newSheet.ok) return

    const imported = await importGraphJsonText(portable, {
      nodes: newSheet.snapshot.nodes,
      edges: newSheet.snapshot.edges,
      customSymbols: newSheet.snapshot.customSymbols,
      settings: newSheet.snapshot.settings,
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(
      graphDocumentsEqual(original, snapshotToDocument(imported.snapshot)),
    ).toBe(true)
  })
})

describe('0.3-A1 World init fail-closed', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('getWorldStore rejects when v0.2→v0.3 migration cannot complete', async () => {
    const fs = createMemoryFsBackend()
    const workspace = installMemoryWorkspaceStore(fs)
    const source = docWithSymbols([MARKUP])
    expect((await workspace.saveCurrent(source)).ok).toBe(true)

    setWorldStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => {
        const failing = createMemoryFsBackend()
        // Copy v02 source into failing fs so migration is attempted
        for (const [path, data] of fs._files) {
          await failing.writeFile(path, data)
        }
        const original = failing.writeTextFile.bind(failing)
        failing.writeTextFile = async (path, contents) => {
          if (String(path).includes('storage-v03') && String(path).endsWith('.tmp')) {
            throw new Error('v03 write blocked')
          }
          return original(path, contents)
        }
        return failing
      },
    })

    await expect(getWorldStore()).rejects.toBeInstanceOf(WorldStoreInitError)
    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).toBeNull()
  })
})

describe('0.3-A1 hardening regressions', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('exact partial migration: current ok + backup save fail, then retry only migrates backup', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const current = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    const backup = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await workspace.saveCurrent(current)).ok).toBe(true)
    expect((await workspace.saveBackup(backup)).ok).toBe(true)

    const originalWrite = fs.writeTextFile.bind(fs)
    fs.writeTextFile = async (path, contents) => {
      if (String(path).includes('backup.json') && String(path).endsWith('.tmp')) {
        throw new Error('forced backup save failure on first migration')
      }
      return originalWrite(path, contents)
    }

    const failed = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(failed.status).toBe('failed')

    const currentAfterFail = await world.loadCurrent()
    expect(currentAfterFail.ok).toBe(true)
    if (!currentAfterFail.ok) return
    expect(graphDocumentsEqual(current, getActiveGalaxyGraph(currentAfterFail.world)!)).toBe(true)
    const currentJson = JSON.stringify(currentAfterFail.world)

    expect(await world.hasBackup()).toBe(false)
    expect(await fs.exists(WORLD_BACKUP_MANIFEST_PATH)).toBe(false)

    // v0.2 sources preserved
    const v02Current = await workspace.loadCurrent()
    const v02Backup = await workspace.loadBackup()
    expect(v02Current.ok).toBe(true)
    expect(v02Backup.ok).toBe(true)

    fs.writeTextFile = originalWrite
    const retried = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(retried.status).toBe('migrated')

    const currentAfterRetry = await world.loadCurrent()
    expect(currentAfterRetry.ok).toBe(true)
    if (!currentAfterRetry.ok) return
    expect(JSON.stringify(currentAfterRetry.world)).toBe(currentJson)

    const bak = await world.loadBackup()
    expect(bak.ok).toBe(true)
    if (!bak.ok) return
    expect(graphDocumentsEqual(backup, getActiveGalaxyGraph(bak.world)!)).toBe(true)
  })

  it('source probe I/O failure is not treated as no_source / missing', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const source = docWithSymbols([MARKUP])
    expect((await workspace.saveCurrent(source)).ok).toBe(true)

    const originalRead = fs.readTextFile.bind(fs)
    fs.readTextFile = async (path) => {
      if (String(path).includes('storage-v02') && String(path).includes('current.json')) {
        throw new Error('forced v0.2 current read I/O failure')
      }
      return originalRead(path)
    }

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.message.toLowerCase()).not.toMatch(/no_source/)
    }

    expect(await world.hasCurrent()).toBe(false)
    expect(await fs.exists(WORLD_CURRENT_MANIFEST_PATH)).toBe(false)

    fs.readTextFile = originalRead
    const stillThere = await workspace.loadCurrent()
    expect(stillThere.ok).toBe(true)
    if (!stillThere.ok) return
    expect(graphDocumentsEqual(source, stillThere.document)).toBe(true)
  })

  it('destination corrupt current is not treated as missing and is not overwritten', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const source = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await workspace.saveCurrent(source)).ok).toBe(true)

    await fs.mkdir('storage-v03', { recursive: true })
    const corrupt = '{not-a-valid-world-manifest'
    await fs.writeTextFile(WORLD_CURRENT_MANIFEST_PATH, corrupt)

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    // Failed destinations are not migration targets — never overwritten (W7/W9).
    expect(result.status).not.toBe('failed')
    expect(await fs.readTextFile(WORLD_CURRENT_MANIFEST_PATH)).toBe(corrupt)
    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(false)
    if (!loaded.ok) expect(loaded.reason).toBe('corrupt')

    const v02 = await workspace.loadCurrent()
    expect(v02.ok).toBe(true)
  })

  it('saveCurrent rejects invalid World before commit (prior current + assets intact)', async () => {
    const { world } = installMemoryPersistencePair(createMemoryFsBackend())
    const good = wrapGraphAsDefaultWorld(docWithSymbols([MARKUP]))
    expect((await world.saveCurrent(good)).ok).toBe(true)
    const assetsBefore = await world.assets.list()
    expect(assetsBefore.length).toBeGreaterThan(0)
    const assetIdsBefore = new Set(assetsBefore.map((a) => a.assetId))

    const invalid = structuredClone(good)
    invalid.galaxies.push({ ...invalid.galaxies[0]!, id: DEFAULT_GALAXY_ID })
    const failed = await world.saveCurrent(invalid)
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.reason).toBe('invalid')

    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(graphDocumentsEqual(getActiveGalaxyGraph(good)!, getActiveGalaxyGraph(loaded.world)!)).toBe(
      true,
    )

    const assetsAfter = await world.assets.list()
    expect(new Set(assetsAfter.map((a) => a.assetId))).toEqual(assetIdsBefore)

    const nanWorld = structuredClone(good)
    nanWorld.galaxies[0]!.universePosition = { x: Number.NaN, y: 10 }
    const failedNan = await world.saveCurrent(nanWorld)
    expect(failedNan.ok).toBe(false)
    if (!failedNan.ok) expect(failedNan.reason).toBe('invalid')

    const loaded2 = await world.loadCurrent()
    expect(loaded2.ok).toBe(true)
  })

  it('runtime helper replaces only active Galaxy graph (preserves inactive + universe)', () => {
    const graphA = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    const graphB = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    let world = wrapGraphAsDefaultWorld(graphA)
    world = {
      ...world,
      galaxies: [
        world.galaxies[0]!,
        {
          id: 'galaxy-b',
          name: 'Galaxy B',
          universePosition: { x: 200, y: 200 },
          graph: graphB,
        },
      ],
    }

    const nextGraphA = docWithSymbols([MARKUP, RASTER_MARKUP], { gridSnapEnabled: false })
    const state = worldStateWithReplacedActiveGraph(nextGraphA, {
      world,
      activeGalaxyId: DEFAULT_GALAXY_ID,
    })

    expect(state.activeGalaxyId).toBe(DEFAULT_GALAXY_ID)
    expect(state.world.universe).toEqual(world.universe)
    expect(graphDocumentsEqual(getActiveGalaxyGraph(state.world, DEFAULT_GALAXY_ID)!, nextGraphA)).toBe(
      true,
    )
    expect(graphDocumentsEqual(getActiveGalaxyGraph(state.world, 'galaxy-b')!, graphB)).toBe(true)
    expect(state.world.galaxies[1]!.name).toBe('Galaxy B')
    expect(state.world.galaxies[1]!.universePosition).toEqual({ x: 200, y: 200 })
  })
})

describe('0.3-A1 destination-first migration', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('v0.3 current valid + v0.2 current corrupt → succeeds without reading/overwriting v0.3', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const good = wrapGraphAsDefaultWorld(docWithSymbols([MARKUP], { gridSnapEnabled: true }))
    expect((await world.saveCurrent(good)).ok).toBe(true)
    const before = JSON.stringify((await world.loadCurrent() as { ok: true; world: unknown }).world)

    await fs.mkdir('storage-v02', { recursive: true })
    await fs.writeTextFile(CURRENT_MANIFEST_PATH, '{corrupt-v02-current')

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(result.status).toBe('already_migrated')

    const after = await world.loadCurrent()
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(JSON.stringify(after.world)).toBe(before)
    expect(await fs.readTextFile(CURRENT_MANIFEST_PATH)).toBe('{corrupt-v02-current')
  })

  it('v0.3 current valid → corresponding v0.2 current load is never called', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const good = wrapGraphAsDefaultWorld(docWithSymbols([MARKUP]))
    expect((await world.saveCurrent(good)).ok).toBe(true)

    let v02CurrentLoads = 0
    const originalLoad = workspace.loadCurrent.bind(workspace)
    workspace.loadCurrent = async () => {
      v02CurrentLoads += 1
      throw new Error('v0.2 current must not be probed when v0.3 current is valid')
    }

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(result.status).toBe('already_migrated')
    expect(v02CurrentLoads).toBe(0)

    workspace.loadCurrent = originalLoad
    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(true)
  })

  it('v0.3 backup valid + v0.2 backup corrupt → succeeds', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const bak = wrapGraphAsDefaultWorld(docWithSymbols([RASTER_MARKUP]))
    expect((await world.saveBackup(bak)).ok).toBe(true)
    // Also put a valid current so overall isn't no_source-only edge
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(docWithSymbols([MARKUP])))).ok).toBe(true)

    await fs.mkdir('storage-v02', { recursive: true })
    await fs.writeTextFile(
      BACKUP_MANIFEST_PATH,
      '{corrupt-v02-backup',
    )

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(result.status).toBe('already_migrated')
    const loaded = await world.loadBackup()
    expect(loaded.ok).toBe(true)
  })

  it('v0.3 current missing + v0.2 current corrupt → migration failed', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    await fs.mkdir('storage-v02', { recursive: true })
    await fs.writeTextFile(CURRENT_MANIFEST_PATH, '{corrupt-v02-current')

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(result.status).toBe('failed')
    expect(await world.hasCurrent()).toBe(false)
  })

  it('v0.3 current corrupt + v0.2 current valid → fail closed, destination unchanged', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const source = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await workspace.saveCurrent(source)).ok).toBe(true)

    const corrupt = '{corrupt-v03-current'
    await fs.writeTextFile(WORLD_CURRENT_MANIFEST_PATH, corrupt)

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    // Corrupt destination is not a target; older source must not overwrite it.
    expect(result.status).not.toBe('failed')
    expect(await fs.readTextFile(WORLD_CURRENT_MANIFEST_PATH)).toBe(corrupt)
    const loaded = await world.loadCurrent()
    expect(loaded.ok).toBe(false)
  })

  it('v0.3 current valid + backup missing + v0.2 backup valid → only backup migrates', async () => {
    const fs = createMemoryFsBackend()
    const { workspace, world } = installMemoryPersistencePair(fs)
    const currentGraph = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    const backupGraph = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await world.saveCurrent(wrapGraphAsDefaultWorld(currentGraph))).ok).toBe(true)
    expect((await workspace.saveBackup(backupGraph)).ok).toBe(true)

    const currentJsonBefore = JSON.stringify(
      (await world.loadCurrent() as { ok: true; world: unknown }).world,
    )

    let v02CurrentLoads = 0
    const originalLoad = workspace.loadCurrent.bind(workspace)
    workspace.loadCurrent = async () => {
      v02CurrentLoads += 1
      return originalLoad()
    }

    const result = await migrateWorkspaceToWorldIfNeeded(workspace, world)
    expect(result.status).toBe('migrated')
    expect(v02CurrentLoads).toBe(0)

    const currentAfter = await world.loadCurrent()
    expect(currentAfter.ok).toBe(true)
    if (!currentAfter.ok) return
    expect(JSON.stringify(currentAfter.world)).toBe(currentJsonBefore)

    const bak = await world.loadBackup()
    expect(bak.ok).toBe(true)
    if (!bak.ok) return
    expect(graphDocumentsEqual(backupGraph, getActiveGalaxyGraph(bak.world)!)).toBe(true)

    workspace.loadCurrent = originalLoad
  })
})

describe('0.3-A1 startup fail-closed recovery', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('A: current I/O failure + backup missing → storageCorrupt, no bootstrap', async () => {
    const fs = createMemoryFsBackend()
    installMemoryPersistencePair(fs)
    await fs.mkdir('storage-v03', { recursive: true })
    await fs.writeTextFile(WORLD_CURRENT_MANIFEST_PATH, '{"storageVersion":"0.3"}')

    const originalRead = fs.readTextFile.bind(fs)
    fs.readTextFile = async (path) => {
      if (String(path).includes('storage-v03') && String(path).includes('current.json')) {
        throw new Error('forced current I/O failure')
      }
      return originalRead(path)
    }

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).toBeNull()
  })

  it('B: current corrupt + backup valid → recover from backup', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    const doc = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await saveDocumentToStorage(doc)).ok).toBe(true)
    expect((await backupDocumentToStorage(doc)).ok).toBe(true)

    // Corrupt current while leaving backup intact.
    const { WORLD_CURRENT_KEY } = await import('./autosave')
    memory.set(WORLD_CURRENT_KEY, '{not-json')

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()
    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).not.toBeNull()
    if (!initial.snapshot) return
    expect(initial.snapshot.settings.gridSnapEnabled).toBe(true)
  })

  it('C: current missing + backup valid → recover from backup', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    const backupDoc = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await backupDocumentToStorage(backupDoc)).ok).toBe(true)

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).not.toBeNull()
    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
  })

  it('D: current missing + backup I/O/corrupt → storageCorrupt, no bootstrap', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    const { WORLD_BACKUP_STORAGE_KEY } = await import('./autosave')
    memory.set(WORLD_BACKUP_STORAGE_KEY, '{corrupt-backup')

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).toBeNull()
  })

  it('E: current missing + backup missing → bootstrap path allowed', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(true)
    expect(initial.snapshot).toBeNull()
  })
})


describe('0.3-A1 final hardening: browser MISSING vs I/O', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  function installThrowingLocalStorage(
    memory: Map<string, string>,
    throwOnKeys: Set<string>,
  ) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => {
          if (throwOnKeys.has(k)) {
            throw new DOMException(`blocked read for ${k}`, 'SecurityError')
          }
          return memory.get(k) ?? null
        },
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

  it('A: Browser WorldStore loadCurrent returns io when getItem throws (not missing)', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorldStoreTestHooks({ isDesktop: false })
    const store = await getWorldStore()

    installThrowingLocalStorage(memory, new Set([WORLD_STORAGE_KEY]))
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(false)
    if (!loaded.ok) {
      expect(loaded.reason).toBe('io')
      expect(loaded.reason).not.toBe('missing')
    }
  })

  it('B: current getItem throws + backup missing → storageCorrupt, no bootstrap', async () => {
    const memory = new Map<string, string>()
    installThrowingLocalStorage(memory, new Set([WORLD_STORAGE_KEY]))
    setWorldStoreTestHooks({ isDesktop: false })

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).toBeNull()
  })

  it('C: current missing + backup getItem throws → storageCorrupt, no bootstrap', async () => {
    const memory = new Map<string, string>()
    installThrowingLocalStorage(memory, new Set([WORLD_BACKUP_KEY]))
    setWorldStoreTestHooks({ isDesktop: false })

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).toBeNull()
  })

  it('D: Browser WorkspaceStore v0.2 source getItem throw → probe failed (not missing)', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorkspaceStoreTestHooks({ isDesktop: false })
    const workspace = await getWorkspaceStore()

    installThrowingLocalStorage(memory, new Set([LEGACY_STORAGE_KEY]))
    const probed = await probeWorkspaceSlot(workspace, 'current')
    expect(probed.state).toBe('failed')
    if (probed.state === 'failed') {
      expect(probed.reason.toLowerCase()).toMatch(/io/)
    }
    expect(probed.state).not.toBe('missing')
  })
})

describe('0.3-A1 final hardening: WorldStore init skips v0.2 when not needed', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
  })

  it('CASE A/B: valid v0.3 current+backup never calls getWorkspaceStore (trap count 0)', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorldStoreTestHooks({ isDesktop: false })
    const doc = docWithSymbols([MARKUP], { gridSnapEnabled: true })
    expect((await saveDocumentToStorage(doc)).ok).toBe(true)
    expect((await backupDocumentToStorage(doc)).ok).toBe(true)

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()

    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: false,
      onInit: () => {
        workspaceInits += 1
        throw new Error('v0.2 WorkspaceStore must not initialize when v0.3 is complete')
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const store = await getWorldStore()
    expect(workspaceInits).toBe(0)
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    const bak = await store.loadBackup()
    expect(bak.ok).toBe(true)
  })

  it('CASE E: corrupt v0.3 current + valid backup recovers without opening Workspace', async () => {
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
        throw new Error('legacy/v0.2 must not gate v0.3 backup recovery')
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const initial = await resolveInitialGraphState()
    expect(workspaceInits).toBe(0)
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).not.toBeNull()
  })

  it('CASE F: missing v0.3 current + valid backup recovers without opening Workspace', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    setWorldStoreTestHooks({ isDesktop: false })
    const backupDoc = docWithSymbols([RASTER_MARKUP], { gridSnapEnabled: false })
    expect((await backupDocumentToStorage(backupDoc)).ok).toBe(true)

    resetWorldStoreSingleton()
    resetWorkspaceStoreSingleton()

    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: false,
      onInit: () => {
        workspaceInits += 1
        throw new Error('legacy/v0.2 must not gate v0.3 backup recovery')
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const initial = await resolveInitialGraphState()
    expect(workspaceInits).toBe(0)
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).not.toBeNull()
  })

  it('CASE C: missing v0.3 slots that need migration still open Workspace source', async () => {
    const memory = new Map<string, string>()
    installBrowserLocalStorage(memory)
    memory.set(LEGACY_STORAGE_KEY, serializeGraphDocument(docWithSymbols([MARKUP])))

    let workspaceInits = 0
    setWorkspaceStoreTestHooks({
      isDesktop: false,
      onInit: () => {
        workspaceInits += 1
      },
    })
    setWorldStoreTestHooks({ isDesktop: false })

    const store = await getWorldStore()
    expect(workspaceInits).toBe(1)
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
  })
})

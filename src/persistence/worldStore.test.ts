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
  CURRENT_MANIFEST_PATH,
  installMemoryWorkspaceStore,
  resetWorkspaceStoreSingleton,
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
  loadDocumentFromStorage,
  saveDocumentToStorage,
  writeBootstrapChoice,
} from './autosave'
import {
  getActiveGalaxyGraph,
  validateWorldDocument,
  wrapGraphAsDefaultWorld,
} from './worldDocument'
import {
  DEFAULT_GALAXY_ID,
  DEFAULT_GALAXY_NAME,
  DEFAULT_UNIVERSE_HEIGHT,
  DEFAULT_UNIVERSE_WIDTH,
} from './worldTypes'
import {
  WORLD_BACKUP_MANIFEST_PATH,
  getWorldStore,
  installMemoryPersistencePair,
  migrateWorkspaceToWorldIfNeeded,
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

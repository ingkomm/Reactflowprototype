import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  documentToFlowState,
  stripWorldReferenceLinksForPortableExport,
  type GraphDocumentV01,
} from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import { createPassiveData } from '../graphFactory'
import { INITIAL_NODE_ID } from '../types'
import { saveWorldStateToStorage } from './autosave'
import {
  mergeAutosavedGalaxyGraph,
  worldStateFromLoadedWorld,
} from './worldContext'
import {
  replaceGalaxyGraph,
  validateWorldDocument,
  wrapGraphAsDefaultWorld,
} from './worldDocument'
import {
  chooseInitialGalaxyId,
  createGalaxy,
  deleteGalaxy,
  moveGalaxy,
  renameGalaxy,
} from './worldGalaxies'
import {
  addReference,
  collectReferenceUsages,
  countReferenceUsages,
  removeReference,
  updateReference,
} from './worldReferences'
import {
  installMemoryWorldStore,
  resetWorldStoreSingleton,
} from './worldStore'
import { DEFAULT_GALAXY_ID, type WorldDocumentV03 } from './worldTypes'

function blankWorld(): WorldDocumentV03 {
  return wrapGraphAsDefaultWorld(
    buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    }),
  )
}

function withShard(
  graph: GraphDocumentV01,
  id: string,
  label: string,
  referenceId?: string,
): GraphDocumentV01 {
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id,
        type: 'passive' as const,
        position: { x: 40, y: 40 },
        data: {
          ...createPassiveData('shard', label),
          ...(referenceId ? { referenceId } : {}),
        },
      },
    ],
  }
}

describe('0.3 Multi-Galaxy helpers', () => {
  it('G-A create Galaxy adds independent blank graph', () => {
    const world = blankWorld()
    const before = structuredClone(world.galaxies[0]!.graph)
    const { world: next, galaxy } = createGalaxy(world)
    expect(next.galaxies).toHaveLength(2)
    expect(galaxy.id).not.toBe(DEFAULT_GALAXY_ID)
    expect(galaxy.name).toMatch(/^Galaxy \d+$/)
    expect(galaxy.graph.nodes.some((n) => n.id === INITIAL_NODE_ID)).toBe(true)
    expect(next.galaxies[0]!.graph).toEqual(before)
  })

  it('G-B rename changes only name', () => {
    const created = createGalaxy(blankWorld())
    let world = created.world
    const graphBefore = structuredClone(created.galaxy.graph)
    const posBefore = { ...created.galaxy.universePosition }
    world = renameGalaxy(world, created.galaxy.id, '  Work  ')
    const g = world.galaxies.find((x) => x.id === created.galaxy.id)!
    expect(g.name).toBe('Work')
    expect(g.id).toBe(created.galaxy.id)
    expect(g.graph).toEqual(graphBefore)
    expect(g.universePosition).toEqual(posBefore)
  })

  it('G-C move changes only position', () => {
    const created = createGalaxy(blankWorld())
    let world = created.world
    const graphBefore = structuredClone(created.galaxy.graph)
    world = moveGalaxy(world, created.galaxy.id, { x: 120, y: 80 })
    const g = world.galaxies.find((x) => x.id === created.galaxy.id)!
    expect(g.universePosition).toEqual({ x: 120, y: 80 })
    expect(g.graph).toEqual(graphBefore)
  })

  it('G-D delete removes only target Galaxy', () => {
    const a = createGalaxy(blankWorld())
    const b = createGalaxy(a.world)
    const keptGraph = structuredClone(
      b.world.galaxies.find((g) => g.id === a.galaxy.id)!.graph,
    )
    const world = deleteGalaxy(b.world, b.galaxy.id)
    expect(world.galaxies.map((g) => g.id).sort()).toEqual(
      [DEFAULT_GALAXY_ID, a.galaxy.id].sort(),
    )
    expect(world.galaxies.find((g) => g.id === a.galaxy.id)!.graph).toEqual(keptGraph)
  })

  it('G-E last Galaxy delete blocked', () => {
    expect(() => deleteGalaxy(blankWorld(), DEFAULT_GALAXY_ID)).toThrow(/last Galaxy/i)
  })

  it('G-F galaxy-main deleted → chooseInitialGalaxyId returns remaining', () => {
    const created = createGalaxy(blankWorld())
    const world = deleteGalaxy(created.world, DEFAULT_GALAXY_ID)
    expect(world.galaxies.some((g) => g.id === DEFAULT_GALAXY_ID)).toBe(false)
    expect(chooseInitialGalaxyId(world)).toBe(created.galaxy.id)
    expect(validateWorldDocument(world).ok).toBe(true)
  })
})

describe('0.3 Reference model', () => {
  it('R-A create Reference', () => {
    const world = addReference(blankWorld(), {
      title: 'ASME B31.3',
      ddc: '621.8',
      creator: 'ASME',
      locator: 'B31.3',
    })
    expect(world.references).toHaveLength(1)
    expect(world.references[0]!.title).toBe('ASME B31.3')
    expect(world.references[0]!.id.startsWith('ref_')).toBe(true)
  })

  it('R-B update keeps id', () => {
    let world = addReference(blankWorld(), { title: 'Old' })
    const id = world.references[0]!.id
    world = updateReference(world, id, { title: 'New Title', ddc: '100' })
    expect(world.references[0]!.id).toBe(id)
    expect(world.references[0]!.title).toBe('New Title')
  })

  it('R-C unused Reference delete succeeds', () => {
    let world = addReference(blankWorld(), { title: 'Temp' })
    world = removeReference(world, world.references[0]!.id)
    expect(world.references).toHaveLength(0)
  })

  it('R-D used Reference delete blocked', () => {
    let world = addReference(blankWorld(), { title: 'Used' })
    const refId = world.references[0]!.id
    world = replaceGalaxyGraph(
      world,
      DEFAULT_GALAXY_ID,
      withShard(world.galaxies[0]!.graph, 'shard-1', 'Shard A', refId),
    )
    expect(countReferenceUsages(world, refId)).toBe(1)
    expect(() => removeReference(world, refId)).toThrow(/used/i)
  })

  it('R-E same Reference shared across Galaxies', () => {
    let world = addReference(blankWorld(), { title: 'Shared Spec' })
    const refId = world.references[0]!.id
    const g2 = createGalaxy(world)
    world = g2.world
    world = replaceGalaxyGraph(
      world,
      DEFAULT_GALAXY_ID,
      withShard(world.galaxies.find((g) => g.id === DEFAULT_GALAXY_ID)!.graph, 'shard-a', 'A', refId),
    )
    world = replaceGalaxyGraph(
      world,
      g2.galaxy.id,
      withShard(world.galaxies.find((g) => g.id === g2.galaxy.id)!.graph, 'shard-b', 'B', refId),
    )
    const usages = collectReferenceUsages(world, refId)
    expect(usages).toHaveLength(2)
  })
})

describe('0.3 Reference integrity + BC', () => {
  it('R-F valid link keeps World valid', () => {
    let world = addReference(blankWorld(), { title: 'OK' })
    const refId = world.references[0]!.id
    world = replaceGalaxyGraph(
      world,
      DEFAULT_GALAXY_ID,
      withShard(world.galaxies[0]!.graph, 'shard-1', 'S', refId),
    )
    expect(validateWorldDocument(world).ok).toBe(true)
  })

  it('R-G dangling referenceId invalidates World', () => {
    let world = blankWorld()
    world = replaceGalaxyGraph(
      world,
      DEFAULT_GALAXY_ID,
      withShard(world.galaxies[0]!.graph, 'shard-1', 'S', 'ref_missing'),
    )
    expect(validateWorldDocument(world).ok).toBe(false)
  })

  it('R-H missing references field normalizes to []', () => {
    const legacy = blankWorld() as unknown as Record<string, unknown>
    delete legacy.references
    const parsed = validateWorldDocument(legacy)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.world.references).toEqual([])
  })
})

describe('0.3 portable Graph reference strip', () => {
  it('P1 portable export strips referenceId', () => {
    const graph = withShard(
      blankWorld().galaxies[0]!.graph,
      'shard-1',
      'S',
      'ref_abc',
    )
    const portable = stripWorldReferenceLinksForPortableExport(graph)
    const shard = portable.nodes.find((n) => n.id === 'shard-1')!
    expect((shard.data as { referenceId?: string }).referenceId).toBeUndefined()
  })

  it('P2 portable import path does not keep dangling referenceId', () => {
    const graph = withShard(
      blankWorld().galaxies[0]!.graph,
      'shard-1',
      'S',
      'ref_external',
    )
    const portable = stripWorldReferenceLinksForPortableExport(graph)
    const imported = documentToFlowState(portable)
    const shard = imported.nodes.find((n) => n.id === 'shard-1')!
    expect(shard?.data.referenceId ?? null).toBeNull()
  })
})

describe('0.3 autosave merge does not roll back metadata', () => {
  it('stale autosave result keeps newer Galaxy position', () => {
    const currentWorld = moveGalaxy(blankWorld(), DEFAULT_GALAXY_ID, { x: 100, y: 100 })
    const current = worldStateFromLoadedWorld(currentWorld, DEFAULT_GALAXY_ID)

    let staleWorld = moveGalaxy(blankWorld(), DEFAULT_GALAXY_ID, { x: 10, y: 10 })
    const staleGraph = {
      ...staleWorld.galaxies[0]!.graph,
      nodes: staleWorld.galaxies[0]!.graph.nodes.map((n, i) =>
        i === 0
          ? { ...n, data: { ...n.data, label: 'Edited Root' } }
          : n,
      ),
    }
    staleWorld = replaceGalaxyGraph(staleWorld, DEFAULT_GALAXY_ID, staleGraph)
    const staleSaved = worldStateFromLoadedWorld(staleWorld, DEFAULT_GALAXY_ID)

    const merged = mergeAutosavedGalaxyGraph(current, staleSaved)
    expect(merged.world.galaxies[0]!.universePosition).toEqual({ x: 100, y: 100 })
    expect(merged.world.galaxies[0]!.graph.nodes[0]!.data.label).toBe('Edited Root')
  })
})

describe('0.3 Multi-Galaxy + Reference persistence', () => {
  beforeEach(() => {
    resetWorldStoreSingleton()
    installMemoryWorldStore()
  })

  it('round-trips galaxies, references, and shard links', async () => {
    let world = blankWorld()
    const g2 = createGalaxy(world)
    world = renameGalaxy(g2.world, g2.galaxy.id, 'Study')
    world = moveGalaxy(world, g2.galaxy.id, { x: 220, y: 340 })
    world = addReference(world, { title: 'ASME B31.3', ddc: '621.8' })
    const refId = world.references[0]!.id
    world = replaceGalaxyGraph(
      world,
      DEFAULT_GALAXY_ID,
      withShard(world.galaxies.find((g) => g.id === DEFAULT_GALAXY_ID)!.graph, 'shard-a', 'Project', refId),
    )
    world = replaceGalaxyGraph(
      world,
      g2.galaxy.id,
      withShard(world.galaxies.find((g) => g.id === g2.galaxy.id)!.graph, 'shard-b', 'Notes', refId),
    )

    const saved = await saveWorldStateToStorage(
      worldStateFromLoadedWorld(world, DEFAULT_GALAXY_ID),
    )
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const store = await (await import('./worldStore')).getWorldStore()
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.world.galaxies).toHaveLength(2)
    expect(loaded.world.galaxies.find((g) => g.id === g2.galaxy.id)?.name).toBe('Study')
    expect(loaded.world.galaxies.find((g) => g.id === g2.galaxy.id)?.universePosition).toEqual({
      x: 220,
      y: 340,
    })
    expect(loaded.world.references).toHaveLength(1)
    expect(countReferenceUsages(loaded.world, refId)).toBe(2)
  })
})

/**
 * @vitest-environment jsdom
 *
 * Universe mode must never materialize the hidden React canvas into the active Galaxy.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGraphDocument, documentToFlowState, type GraphDocumentV01 } from './graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from './emptyGraph'
import { writeActiveJsonPath, readActiveJsonPath } from './persistence/activeJsonPath'
import {
  commitWorldMutation,
  materializeWorldState,
  resolveWorldMutationSnapshot,
} from './persistence/worldActions'
import { worldStateFromLoadedWorld } from './persistence/worldContext'
import { replaceGalaxyGraph, wrapGraphAsDefaultWorld } from './persistence/worldDocument'
import { createGalaxy, renameGalaxy } from './persistence/worldGalaxies'
import { addReference } from './persistence/worldReferences'
import {
  installMemoryWorldStore,
  resetWorldStoreSingleton,
} from './persistence/worldStore'
import { DEFAULT_GALAXY_ID, type GraphAppWorldState } from './persistence/worldTypes'
import type { GraphPersistInput } from './useGraphApp'
import { useWorldShell } from './useWorldShell'

function blankGraph(label: string): GraphDocumentV01 {
  const base = buildGraphDocument({
    nodes: EMPTY_GRAPH_NODES,
    edges: EMPTY_GRAPH_EDGES,
    customSymbols: [],
    settings: {},
  })
  return {
    ...base,
    nodes: base.nodes.map((n, i) =>
      i === 0 ? { ...n, data: { ...n.data, label } } : n,
    ),
  }
}

function snapshotFromGraph(graph: GraphDocumentV01): GraphPersistInput {
  const flow = documentToFlowState(graph)
  return {
    nodes: flow.nodes,
    edges: flow.edges,
    customSymbols: flow.customSymbols,
    settings: flow.settings,
  }
}

function twoGalaxyWorld(): {
  worldState: GraphAppWorldState
  galaxyAId: string
  galaxyBId: string
  graphA: GraphDocumentV01
  graphB: GraphDocumentV01
} {
  let world = wrapGraphAsDefaultWorld(blankGraph('Galaxy-A'))
  const galaxyAId = DEFAULT_GALAXY_ID
  const created = createGalaxy(world)
  world = created.world
  const galaxyBId = created.galaxy.id
  const graphA = blankGraph('Galaxy-A')
  const graphB = blankGraph('Galaxy-B')
  world = replaceGalaxyGraph(world, galaxyAId, graphA)
  world = replaceGalaxyGraph(world, galaxyBId, graphB)
  return {
    worldState: worldStateFromLoadedWorld(world, galaxyBId),
    galaxyAId,
    galaxyBId,
    graphA,
    graphB,
  }
}

describe('Universe mutation snapshot selection', () => {
  it('T1 helper: universe mode never returns a canvas snapshot', () => {
    const getSnapshot = vi.fn(() => snapshotFromGraph(blankGraph('Hidden-A')))
    expect(resolveWorldMutationSnapshot('universe', undefined, getSnapshot)).toBeNull()
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(resolveWorldMutationSnapshot('galaxy', undefined, getSnapshot)).toEqual(
      snapshotFromGraph(blankGraph('Hidden-A')),
    )
    expect(resolveWorldMutationSnapshot('galaxy', { materialize: false }, getSnapshot)).toBeNull()
  })

  it('T1: Universe Reference create must not overwrite active Galaxy with hidden canvas', async () => {
    resetWorldStoreSingleton()
    installMemoryWorldStore()
    const { worldState, galaxyAId, galaxyBId, graphA, graphB } = twoGalaxyWorld()
    const hiddenA = snapshotFromGraph(graphA)

    // Prove the old bug path would clobber B:
    const clobbered = materializeWorldState(worldState, hiddenA)
    expect(clobbered.world.galaxies.find((g) => g.id === galaxyBId)!.graph.nodes[0]!.data.label).toBe(
      'Galaxy-A',
    )

    const snapshot = resolveWorldMutationSnapshot('universe', undefined, () => hiddenA)
    const result = await commitWorldMutation(worldState, snapshot, (ws) => ({
      ...ws,
      world: addReference(ws.world, { title: 'Spec' }),
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.worldState.world.galaxies.find((g) => g.id === galaxyBId)!.graph).toEqual(graphB)
    expect(result.worldState.world.galaxies.find((g) => g.id === galaxyAId)!.graph).toEqual(graphA)
    expect(result.worldState.world.references).toHaveLength(1)

    const renamed = await commitWorldMutation(worldState, snapshot, (ws) => ({
      ...ws,
      world: renameGalaxy(ws.world, galaxyBId, 'Beta'),
    }))
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.worldState.world.galaxies.find((g) => g.id === galaxyBId)!.graph).toEqual(graphB)
    expect(renamed.worldState.world.galaxies.find((g) => g.id === galaxyBId)!.name).toBe('Beta')
  })
})

describe('useWorldShell Universe active-delete rebind', () => {
  beforeEach(() => {
    resetWorldStoreSingleton()
    installMemoryWorldStore()
    localStorage.clear()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  function mountShell(initial: GraphAppWorldState, hiddenSnapshot: GraphPersistInput) {
    const worldRef = { current: initial }
    const applyCanvas = vi.fn()
    const resetSessionUi = vi.fn()
    const setActiveJsonPath = vi.fn()
    const setError = vi.fn()

    const hook = renderHook(
      ({ ws }: { ws: GraphAppWorldState }) =>
        useWorldShell({
          worldState: ws,
          setWorldState: (next) => {
            worldRef.current = next
            hook.rerender({ ws: next })
          },
          getSnapshot: () => hiddenSnapshot,
          cancelPendingAutosave: () => {},
          applyCanvas,
          resetSessionUi,
          setActiveJsonPath,
          setError,
        }),
      { initialProps: { ws: worldRef.current } },
    )

    return {
      hook,
      getWorldState: () => worldRef.current,
      applyCanvas,
      resetSessionUi,
      setActiveJsonPath,
    }
  }

  it('T2: delete active Galaxy rebinds hidden canvas to fallback and clears path', async () => {
    const { worldState, galaxyAId, galaxyBId, graphA, graphB } = twoGalaxyWorld()
    // A is active; hidden canvas still holds A
    const activeA = worldStateFromLoadedWorld(worldState.world, galaxyAId)
    writeActiveJsonPath('/tmp/galaxy-a.json')
    expect(readActiveJsonPath()).toBe('/tmp/galaxy-a.json')

    const { hook, getWorldState, applyCanvas, resetSessionUi, setActiveJsonPath } = mountShell(
      activeA,
      snapshotFromGraph(graphA),
    )

    await act(async () => {
      await hook.result.current.handleDeleteGalaxy(galaxyAId)
    })

    const next = getWorldState()
    expect(next.world.galaxies.some((g) => g.id === galaxyAId)).toBe(false)
    expect(next.activeGalaxyId).toBe(galaxyBId)
    expect(hook.result.current.nav.mode).toBe('universe')
    expect(applyCanvas).toHaveBeenCalledTimes(1)
    const applied = applyCanvas.mock.calls[0]![0] as { nodes: { data: { label: string } }[] }
    expect(applied.nodes[0]!.data.label).toBe('Galaxy-B')
    expect(resetSessionUi).toHaveBeenCalled()
    expect(setActiveJsonPath).toHaveBeenCalledWith(null)
    expect(readActiveJsonPath()).toBeNull()
    expect(next.world.galaxies.find((g) => g.id === galaxyBId)!.graph).toEqual(graphB)
  })

  it('T3: delete inactive Galaxy does not disturb active Galaxy or path', async () => {
    const { worldState, galaxyAId, galaxyBId, graphA } = twoGalaxyWorld()
    const activeA = worldStateFromLoadedWorld(worldState.world, galaxyAId)
    writeActiveJsonPath('/tmp/galaxy-a.json')

    const { hook, getWorldState, applyCanvas, resetSessionUi, setActiveJsonPath } = mountShell(
      activeA,
      snapshotFromGraph(graphA),
    )

    await act(async () => {
      await hook.result.current.handleDeleteGalaxy(galaxyBId)
    })

    const next = getWorldState()
    expect(next.activeGalaxyId).toBe(galaxyAId)
    expect(next.world.galaxies.find((g) => g.id === galaxyAId)!.graph).toEqual(graphA)
    expect(applyCanvas).not.toHaveBeenCalled()
    expect(resetSessionUi).not.toHaveBeenCalled()
    expect(setActiveJsonPath).not.toHaveBeenCalled()
    expect(readActiveJsonPath()).toBe('/tmp/galaxy-a.json')
    expect(hook.result.current.nav.mode).toBe('universe')
  })

  it('T4: Universe World mutation after active delete keeps fallback graph intact', async () => {
    const { worldState, galaxyAId, galaxyBId, graphA, graphB } = twoGalaxyWorld()
    const activeA = worldStateFromLoadedWorld(worldState.world, galaxyAId)
    const graphBBefore = structuredClone(graphB)

    const { hook, getWorldState, applyCanvas } = mountShell(activeA, snapshotFromGraph(graphA))

    await act(async () => {
      await hook.result.current.handleDeleteGalaxy(galaxyAId)
    })
    expect(getWorldState().activeGalaxyId).toBe(galaxyBId)
    expect(applyCanvas).toHaveBeenCalled()

    // Hidden canvas was rebound to B; even if getSnapshot were still A (stale mock),
    // Universe mode must not materialize it.
    await act(async () => {
      await hook.result.current.handleCreateReference({
        title: 'After Delete',
        ddc: '',
        creator: '',
        year: '',
        locator: '',
        note: '',
      })
    })

    const next = getWorldState()
    expect(next.world.galaxies.find((g) => g.id === galaxyBId)!.graph).toEqual(graphBBefore)
    expect(next.world.references.some((r) => r.title === 'After Delete')).toBe(true)
    expect(hook.result.current.nav.mode).toBe('universe')
  })
})

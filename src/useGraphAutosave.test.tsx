/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from './emptyGraph'
import { buildGraphDocument } from './graphDocument'
import { wrapGraphAsDefaultWorld } from './persistence/worldDocument'
import type { GraphAppWorldState } from './persistence/worldTypes'
import { DEFAULT_GALAXY_ID } from './persistence/worldTypes'
import { useGraphAutosave, type GraphPersistInput } from './useGraphApp'

const saveSpy = vi.hoisted(() =>
  vi.fn(async (_document: unknown, worldState: GraphAppWorldState | null) => {
    const base =
      worldState?.world ??
      wrapGraphAsDefaultWorld(
        buildGraphDocument({
          nodes: EMPTY_GRAPH_NODES,
          edges: EMPTY_GRAPH_EDGES,
          customSymbols: [],
          settings: {},
        }),
      )
    return {
      ok: true as const,
      worldState: {
        world: {
          ...base,
          galaxies: base.galaxies.map((g) => ({ ...g, graph: { ...g.graph } })),
        },
        activeGalaxyId: worldState?.activeGalaxyId ?? DEFAULT_GALAXY_ID,
      },
    }
  }),
)

vi.mock('./persistence/autosave', async () => {
  const actual = await vi.importActual<typeof import('./persistence/autosave')>(
    './persistence/autosave',
  )
  return {
    ...actual,
    saveDocumentToStorage: saveSpy,
  }
})

function makeSnapshot(gridSnapEnabled: boolean): GraphPersistInput {
  return {
    nodes: EMPTY_GRAPH_NODES,
    edges: EMPTY_GRAPH_EDGES,
    customSymbols: [],
    settings: { gridSnapEnabled },
  }
}

describe('useGraphAutosave self-trigger guard', () => {
  beforeEach(() => {
    saveSpy.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('worldState update after a successful save does not schedule a second save', async () => {
    const snapshotA = makeSnapshot(false)
    const snapshotB = makeSnapshot(true)

    const { rerender } = renderHook(
      ({
        snapshot,
        worldState,
      }: {
        snapshot: GraphPersistInput
        worldState: GraphAppWorldState | null
      }) => {
        // Parent holds worldState; mirror App useMemo stability by passing snapshot by identity.
        useGraphAutosave(snapshot, worldState, () => {
          /* worldState applied by parent via rerender below */
        }, true)
      },
      {
        initialProps: {
          snapshot: snapshotA,
          worldState: null as GraphAppWorldState | null,
        },
      },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(saveSpy).toHaveBeenCalledTimes(1)
    const savedWorld = saveSpy.mock.results[0]?.value
    const worldStateAfterSave = await savedWorld
    expect(worldStateAfterSave.ok).toBe(true)
    if (!worldStateAfterSave.ok) return

    // Parent applies worldState from save result while snapshot identity stays the same.
    await act(async () => {
      rerender({
        snapshot: snapshotA,
        worldState: worldStateAfterSave.worldState,
      })
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(saveSpy).toHaveBeenCalledTimes(1)

    // Real graph persistence input change must trigger exactly one new save.
    await act(async () => {
      rerender({
        snapshot: snapshotB,
        worldState: worldStateAfterSave.worldState,
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(saveSpy).toHaveBeenCalledTimes(2)
  })
})

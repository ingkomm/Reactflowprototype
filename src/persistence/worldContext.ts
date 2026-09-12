/**
 * Pure World runtime helpers for A1 (no module-global mutable context).
 * React (App / useGraphApp) owns GraphAppWorldState explicitly.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import { replaceGalaxyGraph, wrapGraphAsDefaultWorld } from './worldDocument'
import {
  DEFAULT_GALAXY_ID,
  type GraphAppWorldState,
  type WorldDocumentV03,
} from './worldTypes'

export type { GraphAppWorldState }

/** @deprecated Alias — prefer GraphAppWorldState. */
export type ActiveWorldContext = GraphAppWorldState

/** Pure: apply a GraphDocument into the active Galaxy of an existing World, or wrap anew. */
export function worldStateWithReplacedActiveGraph(
  graph: GraphDocumentV01,
  worldState: GraphAppWorldState | null,
): GraphAppWorldState {
  if (worldState) {
    return {
      world: replaceGalaxyGraph(worldState.world, worldState.activeGalaxyId, graph),
      activeGalaxyId: worldState.activeGalaxyId,
    }
  }
  return {
    world: wrapGraphAsDefaultWorld(graph),
    activeGalaxyId: DEFAULT_GALAXY_ID,
  }
}

export function worldStateFromLoadedWorld(
  world: WorldDocumentV03,
  activeGalaxyId: string = DEFAULT_GALAXY_ID,
): GraphAppWorldState {
  return { world, activeGalaxyId: activeGalaxyId || DEFAULT_GALAXY_ID }
}

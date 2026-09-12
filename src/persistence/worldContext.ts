/**
 * Pure World runtime helpers for A1 (no module-global mutable context).
 * React (App / useGraphApp) owns GraphAppWorldState explicitly.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import { getGalaxyById, replaceGalaxyGraph, wrapGraphAsDefaultWorld } from './worldDocument'
import { chooseInitialGalaxyId } from './worldGalaxies'
import {
  DEFAULT_GALAXY_ID,
  type GraphAppWorldState,
  type WorldDocumentV03,
} from './worldTypes'

export type { GraphAppWorldState }
export { chooseInitialGalaxyId }

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
  const id =
    activeGalaxyId && world.galaxies.some((g) => g.id === activeGalaxyId)
      ? activeGalaxyId
      : chooseInitialGalaxyId(world)
  return { world, activeGalaxyId: id }
}

/**
 * Autosave result means "this galaxy graph was saved" — merge graph only.
 * Keep current names / positions / other galaxies / references.
 */
export function mergeAutosavedGalaxyGraph(
  current: GraphAppWorldState,
  saved: GraphAppWorldState,
): GraphAppWorldState {
  const savedGalaxyId = saved.activeGalaxyId
  const savedGalaxy = getGalaxyById(saved.world, savedGalaxyId)
  if (!savedGalaxy) return current
  if (!getGalaxyById(current.world, savedGalaxyId)) return current
  return {
    world: replaceGalaxyGraph(current.world, savedGalaxyId, savedGalaxy.graph),
    activeGalaxyId: current.activeGalaxyId,
  }
}

/**
 * Commit helpers for World-level mutations (Galaxy / Reference).
 * Always materialize the live canvas graph into the active Galaxy first.
 */
import { snapshotToDocument, type GraphPersistInput } from '../useGraphApp'
import {
  backupWorldStateToStorage,
  saveWorldStateToStorage,
  type StorageSaveResult,
} from './autosave'
import type { GraphAppWorldState } from './worldTypes'
import { replaceGalaxyGraph } from './worldDocument'

export function materializeWorldState(
  worldState: GraphAppWorldState,
  snapshot: GraphPersistInput,
): GraphAppWorldState {
  const graph = snapshotToDocument(snapshot)
  return {
    ...worldState,
    world: replaceGalaxyGraph(worldState.world, worldState.activeGalaxyId, graph),
  }
}

export async function commitWorldMutation(
  worldState: GraphAppWorldState,
  snapshot: GraphPersistInput | null,
  mutator: (worldState: GraphAppWorldState) => GraphAppWorldState,
  options?: { backupFirst?: boolean },
): Promise<StorageSaveResult> {
  const base =
    snapshot != null ? materializeWorldState(worldState, snapshot) : worldState
  if (options?.backupFirst) {
    const backedUp = await backupWorldStateToStorage(base)
    if (!backedUp.ok) return backedUp
  }
  const candidate = mutator(base)
  return saveWorldStateToStorage(candidate)
}

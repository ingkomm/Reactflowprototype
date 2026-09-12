/**
 * Commit helpers for World-level mutations (Galaxy / Reference).
 * Materialize the live canvas only when a snapshot is supplied (Galaxy mode).
 */
import { snapshotToDocument, type GraphPersistInput } from '../useGraphApp'
import {
  backupWorldStateToStorage,
  saveWorldStateToStorage,
  type StorageSaveResult,
} from './autosave'
import type { GraphAppWorldState } from './worldTypes'
import { replaceGalaxyGraph } from './worldDocument'

/**
 * Galaxy mode: live React canvas is the active Galaxy source of truth.
 * Universe mode: worldState.world is SoT — never materialize the hidden canvas.
 */
export function resolveWorldMutationSnapshot(
  navMode: 'galaxy' | 'universe',
  opts: { materialize?: boolean } | undefined,
  getSnapshot: () => GraphPersistInput,
): GraphPersistInput | null {
  if (opts?.materialize === false) return null
  if (navMode !== 'galaxy') return null
  return getSnapshot()
}

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

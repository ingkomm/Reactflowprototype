/**
 * Explicit runtime World context for A1 (no Redux/Zustand).
 * Holds the hydrated WorldDocument and active Galaxy id so autosave can
 * replaceGalaxyGraph without discarding World metadata / inactive Galaxies.
 */
import type { WorldDocumentV03 } from './worldTypes'
import { DEFAULT_GALAXY_ID } from './worldTypes'

export type ActiveWorldContext = {
  world: WorldDocumentV03
  activeGalaxyId: string
}

let activeContext: ActiveWorldContext | null = null

export function getActiveWorldContext(): ActiveWorldContext | null {
  return activeContext
}

export function setActiveWorldContext(context: ActiveWorldContext): void {
  activeContext = {
    world: context.world,
    activeGalaxyId: context.activeGalaxyId || DEFAULT_GALAXY_ID,
  }
}

export function clearActiveWorldContext(): void {
  activeContext = null
}

export function updateActiveWorldDocument(world: WorldDocumentV03): void {
  if (!activeContext) {
    activeContext = { world, activeGalaxyId: DEFAULT_GALAXY_ID }
    return
  }
  activeContext = { ...activeContext, world }
}

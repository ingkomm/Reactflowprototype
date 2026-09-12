/**
 * Runtime-only sheet transition state (not persisted in WorldDocument).
 */
export type SheetTransition =
  | { phase: 'idle' }
  | {
      phase: 'entering-galaxy'
      galaxyId: string
      originPct: { x: number; y: number }
    }
  | {
      phase: 'leaving-galaxy'
      galaxyId: string
      originPct: { x: number; y: number }
    }

export const SHEET_TRANSITION_MS = 200

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function sheetTransitionDurationMs(): number {
  return prefersReducedMotion() ? 0 : SHEET_TRANSITION_MS
}

export function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Layer visibility during sheet transitions (nav.mode alone is not enough). */
export function shouldShowUniverseLayer(
  navMode: 'universe' | 'galaxy',
  phase: SheetTransition['phase'],
): boolean {
  return (
    navMode === 'universe' ||
    phase === 'entering-galaxy' ||
    phase === 'leaving-galaxy'
  )
}

export function shouldShowGalaxyLayer(
  navMode: 'universe' | 'galaxy',
  phase: SheetTransition['phase'],
): boolean {
  // Only after enterGalaxy has switched nav to galaxy (target graph loaded).
  // Do NOT key off entering-galaxy alone — that would mount the Galaxy layer
  // while the hidden canvas still holds the previous graph.
  void phase
  return navMode === 'galaxy'
}

/**
 * Universe → Galaxy enter sequence:
 * lock → load target graph → center Root → one transition wait → idle.
 * Target must load before the visual wait so stale canvas never animates in.
 */
export async function runEnterGalaxyTransition(options: {
  galaxyId: string
  originPct: { x: number; y: number }
  setUniverseEditing: (editing: boolean) => void
  setEntering: (galaxyId: string, originPct: { x: number; y: number }) => void
  enterGalaxy: (galaxyId: string) => Promise<boolean>
  bumpCenterOnRootToken: () => void
  setIdle: () => void
  durationMs?: () => number
  wait?: (ms: number) => Promise<void>
}): Promise<boolean> {
  const {
    galaxyId,
    originPct,
    setUniverseEditing,
    setEntering,
    enterGalaxy,
    bumpCenterOnRootToken,
    setIdle,
    durationMs = sheetTransitionDurationMs,
    wait = waitMs,
  } = options

  setUniverseEditing(false)
  setEntering(galaxyId, originPct)

  const entered = await enterGalaxy(galaxyId)
  if (!entered) {
    setIdle()
    return false
  }

  bumpCenterOnRootToken()
  await wait(durationMs())
  setIdle()
  return true
}

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

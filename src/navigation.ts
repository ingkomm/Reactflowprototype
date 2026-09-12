/**
 * Navigation is runtime UI state — never persisted in WorldDocument.
 */
export type NavigationState =
  | { mode: 'universe' }
  | { mode: 'galaxy'; galaxyId: string }

export function isUniverseMode(nav: NavigationState): boolean {
  return nav.mode === 'universe'
}

export function isGalaxyMode(nav: NavigationState): boolean {
  return nav.mode === 'galaxy'
}

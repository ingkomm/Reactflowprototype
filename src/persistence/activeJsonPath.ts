/**
 * Session identity for the last explicitly opened/saved external JSON file.
 * Not part of GraphDocument; separate from internal autosave recovery.
 */
export const ACTIVE_JSON_PATH_KEY = 'pob-active-json-path-v01'

/** Read persisted Active JSON path. Invalid/empty → null. Never throws. */
export function readActiveJsonPath(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_JSON_PATH_KEY)
    if (raw == null) return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/** Persist Active JSON path. Failure is swallowed (no crash). */
export function writeActiveJsonPath(path: string): void {
  const trimmed = path.trim()
  if (!trimmed) return
  try {
    localStorage.setItem(ACTIVE_JSON_PATH_KEY, trimmed)
  } catch {
    /* ignore quota / private-mode failures */
  }
}

/** Clear persisted Active JSON identity. Failure is swallowed. */
export function clearActiveJsonPath(): void {
  try {
    localStorage.removeItem(ACTIVE_JSON_PATH_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Browser localStorage read helpers.
 * Distinguishes key-missing (getItem returns null) from I/O / access failures (getItem throws).
 */

export type BrowserStorageReadResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'io'; message: string }

/** Read one localStorage key without collapsing SecurityError / access failures into null. */
export function readBrowserStorageKey(key: string): BrowserStorageReadResult {
  try {
    return { ok: true, value: localStorage.getItem(key) }
  } catch (err) {
    return {
      ok: false,
      reason: 'io',
      message: err instanceof Error ? err.message : 'localStorage read failed',
    }
  }
}

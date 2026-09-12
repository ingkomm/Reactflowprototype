/** Structural safety limits and storage size budgets (v0.2). */

/** @deprecated Prefer MAX_PORTABLE_JSON_BYTES / MAX_BROWSER_AUTOSAVE_BYTES. Kept as browser alias. */
export const MAX_JSON_BYTES = 2 * 1024 * 1024

/** Portable external JSON import/export safety ceiling (UTF-8 bytes). */
export const MAX_PORTABLE_JSON_BYTES = 64 * 1024 * 1024

/** Browser localStorage autosave ceiling (UTF-8 bytes). Desktop internal store has no such cap. */
export const MAX_BROWSER_AUTOSAVE_BYTES = 2 * 1024 * 1024

export const MAX_IMAGE_BYTES = 512 * 1024
export const MAX_STRING_LENGTH = 500
export const MAX_NODE_COUNT = 500
export const MAX_EDGE_COUNT = 2000
export const MAX_LOG_COUNT = 5000
export const MAX_CUSTOM_SYMBOLS = 100

/** Safety cap for Galaxy count inside a WorldDocument (0.3). Not a product UI limit. */
export const MAX_GALAXIES = 64

export const MIN_ORBIT_TIER_CAPACITY = 1
export const MAX_ORBIT_TIER_CAPACITY = 24

export function clampOrbitTierCapacity(value: number): number {
  return Math.min(
    MAX_ORBIT_TIER_CAPACITY,
    Math.max(MIN_ORBIT_TIER_CAPACITY, Math.floor(value)),
  )
}

export function isWithinStringLimit(value: string, max = MAX_STRING_LENGTH): boolean {
  return value.length <= max
}

/** Actual UTF-8 byte length (not string.length / code units). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

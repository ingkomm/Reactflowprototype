/** Import and document size limits for v0.1. */
export const MAX_JSON_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_BYTES = 512 * 1024
export const MAX_STRING_LENGTH = 500
export const MAX_NODE_COUNT = 500
export const MAX_EDGE_COUNT = 2000
export const MAX_LOG_COUNT = 5000
export const MAX_CUSTOM_SYMBOLS = 100

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

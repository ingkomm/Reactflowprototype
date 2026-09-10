/**
 * Shared orbit-ring link geometry used by Mastery Orbit and Root Orbit.
 * Same tier → arc (with occupied-slot / direction / endpoint trim rules).
 * Cross tier → straight chord.
 */

export type OrbitRingLinkSpec =
  | { kind: 'arc'; a1: number; a2: number; arcRadius: number; clockwise: boolean }
  | { kind: 'chord' }

export type FlowXY = { x: number; y: number }

/** True when the open arc from `fromSlot` → `toSlot` (exclusive) has no occupied slots. */
export function orbitArcHasOnlyVoids(
  occupiedSlots: Set<number>,
  capacity: number,
  fromSlot: number,
  toSlot: number,
): boolean {
  if (capacity <= 0) return false
  if (fromSlot === toSlot) return false
  let s = (fromSlot + 1) % capacity
  let guard = 0
  while (s !== toSlot) {
    if (occupiedSlots.has(s)) return false
    s = (s + 1) % capacity
    if (++guard > capacity) return false
  }
  return true
}

/** Angular trim (radians) so an orbit arc clears a node rim of the given radius. */
export function orbitEndpointAngularTrim(rimRadius: number, orbitRadius: number): number {
  if (orbitRadius <= 0) return 0
  return Math.asin(Math.min(1, rimRadius / orbitRadius))
}

/**
 * Core ring-link decision shared by Mastery and Root.
 * Callers supply angles / capacity / occupancy; this chooses arc vs chord and arc direction.
 */
export function computeOrbitRingLinkSpec(args: {
  sameTier: boolean
  capacity: number
  slotA: number
  slotB: number
  /** Occupied slots on this ring excluding A and B. */
  occupiedSlots: Set<number>
  angleARad: number
  angleBRad: number
  arcRadius: number
  trimARad: number
  trimBRad: number
}): OrbitRingLinkSpec {
  if (!args.sameTier) return { kind: 'chord' }

  const { capacity, slotA, slotB, occupiedSlots } = args
  const cwClear = orbitArcHasOnlyVoids(occupiedSlots, capacity, slotA, slotB)
  const ccwClear = orbitArcHasOnlyVoids(occupiedSlots, capacity, slotB, slotA)
  const cwDist = (slotB - slotA + capacity) % capacity
  const ccwDist = (slotA - slotB + capacity) % capacity
  const clockwise = cwClear && (!ccwClear || cwDist <= ccwDist)

  const a1 = clockwise ? args.angleARad + args.trimARad : args.angleARad - args.trimARad
  const a2 = clockwise ? args.angleBRad - args.trimBRad : args.angleBRad + args.trimBRad

  return {
    kind: 'arc',
    a1,
    a2,
    arcRadius: args.arcRadius,
    clockwise,
  }
}

export function polarOnOrbit(cx: number, cy: number, r: number, angleRad: number): FlowXY {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

/** SVG arc path for an OrbitRingLinkSpec arc (angles in radians). */
export function orbitRingArcPathD(
  cx: number,
  cy: number,
  r: number,
  a1: number,
  a2: number,
  clockwise: boolean,
): string {
  let delta = a2 - a1
  if (clockwise) {
    while (delta <= 0) delta += Math.PI * 2
    while (delta > Math.PI * 2) delta -= Math.PI * 2
  } else {
    while (delta >= 0) delta -= Math.PI * 2
    while (delta < -Math.PI * 2) delta += Math.PI * 2
  }
  const absDelta = Math.abs(delta)
  const useLong = absDelta > Math.PI ? 1 : 0
  const sweep = clockwise ? 1 : 0
  const p1 = polarOnOrbit(cx, cy, r, a1)
  const p2 = polarOnOrbit(cx, cy, r, a2)
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${useLong} ${sweep} ${p2.x} ${p2.y}`
}

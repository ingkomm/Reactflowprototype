import type { PassiveKind, PassiveNodeData, OrbitTier, OrbitTierCount } from './types'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  outermostBandRadius,
  BAND_STROKE,
} from './orbitGeometry'
import { kindUsesTrainingBands } from './stage'
import { clampOrbitTierCapacity } from './limits'

export {
  BAND_GAP,
  BAND_STROKE,
  BAND_BASE_PAD,
  COUNT_BAND_GAP,
  MASTERY_NEON_RIM_PAD,
  MASTERY_NEON_LABEL_GAP,
  masteryNeonOuterRadius,
  labelBelowBandOffset,
  masteryNeonLabelOffset,
} from './orbitGeometry'
export { MIN_ORBIT_TIER_CAPACITY, MAX_ORBIT_TIER_CAPACITY, clampOrbitTierCapacity } from './limits'

export const NODE_SIZE: Record<PassiveKind, number> = {
  initial: 120, // replaced by ROOT_HUB_SIZE below once orbit constants are known
  connect: 22,
  shard: 36,
  notable: 52,
  mastery: 76,
  voidMastery: 76,
  void: 28,
}

/** Mastery hubs (Void Master is retired — treated as mastery when present). */
export function isMasteryKind(kind: PassiveKind) {
  return kind === 'mastery' || kind === 'voidMastery'
}

/** Void spacer slots only — no icon, bands, links, or power. */
export function isStealthPassiveKind(kind: PassiveKind) {
  return kind === 'void'
}

export const DEFAULT_ORBIT_RADIUS = 180
/** Default max real members per orbit tier (empty remainder = void slots). */
export const DEFAULT_ORBIT_TIER_CAPACITY = 6
/** Radial gap between tier rings — enough for Notable + bands on adjacent tiers. */
export const ORBIT_TIER_STEP = Math.ceil(
  (outermostBandRadius(3, NODE_SIZE.notable) + BAND_STROKE / 2) * 2 + 24,
)

export function normalizeOrbitTierCount(count: number | undefined): OrbitTierCount {
  if (count === 2) return 2
  if (count === 3) return 3
  return 1
}

export function normalizeOrbitTier(tier: number | undefined, tierCount: OrbitTierCount): OrbitTier {
  const t = tier ?? 1
  if (t >= 3 && tierCount >= 3) return 3
  if (t >= 2 && tierCount >= 2) return 2
  return 1
}

/** Max members on a tier ring; unfilled slots are conceptual voids. */
export function getOrbitTierCapacity(data: PassiveNodeData, tier: OrbitTier): number {
  const custom = data.orbitCapacityByTier?.[tier]
  if (typeof custom === 'number' && Number.isFinite(custom)) {
    return clampOrbitTierCapacity(custom)
  }
  return DEFAULT_ORBIT_TIER_CAPACITY
}

export function countOrbitTierMembers(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
): number {
  return getOrderedTierSatellites(nodes, masteryId, tier).length
}

export function orbitTierFreeSlots(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
): number {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return 0
  const data = mastery.data as PassiveNodeData
  const capacity = getOrbitTierCapacity(data, tier)
  return Math.max(0, capacity - countOrbitTierMembers(nodes, masteryId, tier))
}

export function canAcceptOrbitMember(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
  satelliteId?: string,
): boolean {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) return false
  if ((mastery.data as PassiveNodeData).orbitLocked) return false

  const already = nodes.find((n) => n.id === satelliteId)
  if (already) {
    const ad = already.data as PassiveNodeData
    if (ad.masteryId === masteryId && normalizeOrbitTier(ad.orbitTier, normalizeOrbitTierCount((mastery.data as PassiveNodeData).orbitTierCount)) === tier) {
      return true
    }
  }
  return orbitTierFreeSlots(nodes, masteryId, tier) > 0
}

/** Tier 1 is always at DEFAULT_ORBIT_RADIUS; higher tiers expand outward only. */
export function orbitTierRadius(_tierCount: OrbitTierCount, tier: OrbitTier): number {
  return DEFAULT_ORBIT_RADIUS + (tier - 1) * ORBIT_TIER_STEP
}

/** Root hub diameter — roughly Mastery orbit tier-1 ring diameter. */
export const ROOT_HUB_SIZE = orbitTierRadius(1, 1) * 2

NODE_SIZE.initial = ROOT_HUB_SIZE

export function masteryOuterOrbitRadius(data: PassiveNodeData): number {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  return orbitTierRadius(tierCount, tierCount)
}

export function getSatelliteOrbitTier(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
): OrbitTier {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return 1
  const md = mastery.data as PassiveNodeData
  const sd = satellite.data as PassiveNodeData
  return normalizeOrbitTier(sd.orbitTier, normalizeOrbitTierCount(md.orbitTierCount))
}

/** Pick the nearest tier ring for a satellite based on distance from mastery center. */
export function inferOrbitTierFromDistance(
  dist: number,
  tierCount: OrbitTierCount,
): OrbitTier {
  let best: { tier: OrbitTier; err: number } | null = null
  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    const err = Math.abs(dist - orbitTierRadius(tierCount, tier))
    if (!best || err < best.err) best = { tier, err }
  }
  return best?.tier ?? 1
}

/** Update satellite tier and slot from drag position around mastery. */
export function applySatelliteOrbitPlacement(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
  tierOverride?: OrbitTier,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return nodes

  const md = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const dist = distanceBetweenCenters(satellite, mastery, nodes)
  const tier =
    tierOverride ??
    (tierCount > 1 ? inferOrbitTierFromDistance(dist, tierCount) : 1)

  let next = nodes.map((node) => {
    if (node.id !== satelliteId) return node
    const data = node.data as PassiveNodeData
    return { ...node, data: { ...data, orbitTier: tier } }
  })

  const { tier: slotTier, slot } = orbitSlotFromDropAngle(next, masteryId, satelliteId, tier)
  return assignSatelliteOrbitSlot(next, masteryId, satelliteId, slotTier, slot)
}
/** Degrees. -90 = top of the circle; layout advances clockwise. */
export const DEFAULT_ORBIT_START_ANGLE = -90
export const ORBIT_ANGLE_STEP = 15

export function isConnectKind(kind: PassiveKind) {
  return kind === 'connect'
}

export function isSatelliteKind(kind: PassiveKind) {
  return kind === 'shard' || kind === 'notable'
}

/** Nodes that may sit on a mastery orbit. */
export function isOrbitMemberKind(kind: PassiveKind) {
  return kind === 'shard' || kind === 'notable'
}

export function isVoidPassing(data: PassiveNodeData) {
  return data.kind === 'void' && Boolean(data.voidPassing)
}

/** Merge tier orders into flat orbitOrder (tier 1 → tier N). */
export function mergeOrbitOrderFromTiers(
  tierCount: OrbitTierCount,
  byTier: Partial<Record<OrbitTier, string[]>> | undefined,
): string[] {
  const merged: string[] = []
  for (let t = 1; t <= tierCount; t++) {
    for (const id of byTier?.[t as OrbitTier] ?? []) {
      merged.push(id)
    }
  }
  return merged
}

/** Remove a satellite from flat and per-tier orbit orders on a mastery. */
export function removeSatelliteFromOrbitOrders(
  data: PassiveNodeData,
  satelliteId: string,
): PassiveNodeData {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const byTier = { ...(data.orbitOrderByTier ?? {}) }
  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    if (byTier[tier]) {
      byTier[tier] = byTier[tier]!.filter((id) => id !== satelliteId)
    }
  }
  return {
    ...data,
    orbitOrder: (data.orbitOrder ?? []).filter((id) => id !== satelliteId),
    orbitOrderByTier: byTier,
  }
}

/** Set clockwise order for one tier and refresh the merged flat order. */
export function setMasteryTierOrbitOrder(
  data: PassiveNodeData,
  tier: OrbitTier,
  order: string[],
): PassiveNodeData {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const normalizedTier = normalizeOrbitTier(tier, tierCount)
  const byTier = { ...(data.orbitOrderByTier ?? {}) }
  byTier[normalizedTier] = order
  return {
    ...data,
    orbitOrderByTier: byTier,
    orbitOrder: mergeOrbitOrderFromTiers(tierCount, byTier),
  }
}

/** Resolve clockwise order for satellites on one tier ring. */
export function getOrderedTierSatellites(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return []

  const data = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const normalizedTier = normalizeOrbitTier(tier, tierCount)
  const satellites = getOrbitSatellites(nodes, masteryId).filter((sat) => {
    const sd = sat.data as PassiveNodeData
    return normalizeOrbitTier(sd.orbitTier, tierCount) === normalizedTier
  })
  const byId = new Map(satellites.map((s) => [s.id, s]))
  const ordered: PassiveFlowNode[] = []

  const tierOrder = data.orbitOrderByTier?.[normalizedTier]
  if (tierOrder && tierOrder.length > 0) {
    for (const id of tierOrder) {
      const sat = byId.get(id)
      if (sat) {
        ordered.push(sat)
        byId.delete(id)
      }
    }
  } else {
    for (const id of data.orbitOrder ?? []) {
      const sat = byId.get(id)
      if (sat) {
        ordered.push(sat)
        byId.delete(id)
      }
    }
  }
  for (const sat of byId.values()) {
    ordered.push(sat)
  }
  ordered.sort(
    (a, b) =>
      getSatelliteOrbitSlot(nodes, masteryId, a.id) - getSatelliteOrbitSlot(nodes, masteryId, b.id),
  )
  return ordered
}

/** Orbit order with passing void nodes removed (used for link adjacency on one tier). */
export function getOrbitAdjacencyMembers(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
): PassiveFlowNode[] {
  return getOrderedTierSatellites(nodes, masteryId, tier).filter(
    (sat) => !isVoidPassing(sat.data as PassiveNodeData),
  )
}

export function isMasteryOrbitLocked(nodes: PassiveFlowNode[], masteryId: string) {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return false
  return Boolean((mastery.data as PassiveNodeData).orbitLocked)
}

/** Slot index for a satellite on its tier (defaults to order index). */
export function getSatelliteOrbitSlot(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
): number {
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!satellite) return 0
  const data = satellite.data as PassiveNodeData
  if (typeof data.orbitSlot === 'number' && Number.isFinite(data.orbitSlot)) {
    return Math.max(0, Math.floor(data.orbitSlot))
  }
  const tier = getSatelliteOrbitTier(nodes, masteryId, satelliteId)
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return 0
  const md = mastery.data as PassiveNodeData
  const tierOrder = md.orbitOrderByTier?.[tier] ?? md.orbitOrder ?? []
  const index = tierOrder.indexOf(satelliteId)
  return index >= 0 ? index : 0
}

/** First unused slot index on a tier ring. */
export function findFirstFreeOrbitSlot(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
): number | null {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return null
  const md = mastery.data as PassiveNodeData
  const capacity = getOrbitTierCapacity(md, tier)
  const used = new Set<number>()
  for (const sat of getOrbitSatellites(nodes, masteryId)) {
    const sd = sat.data as PassiveNodeData
    if (normalizeOrbitTier(sd.orbitTier, normalizeOrbitTierCount(md.orbitTierCount)) !== tier) {
      continue
    }
    used.add(getSatelliteOrbitSlot(nodes, masteryId, sat.id))
  }
  for (let slot = 0; slot < capacity; slot++) {
    if (!used.has(slot)) return slot
  }
  return null
}

export type AssignOrbitSlotOptions = {
  /** Drag-start slot — occupant at the drop target receives this slot (direct swap, no revolver). */
  swapOriginSlot?: number
  swapOriginTier?: OrbitTier
}

/** Assign a slot on a tier; swaps with occupant when target is taken. */
export function assignSatelliteOrbitSlot(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
  tier: OrbitTier,
  slot: number,
  options?: AssignOrbitSlotOptions,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return nodes
  const md = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const capacity = getOrbitTierCapacity(md, tier)
  const normalizedSlot = ((Math.floor(slot) % capacity) + capacity) % capacity

  const satellite = nodes.find((n) => n.id === satelliteId)
  const currentSlot = satellite
    ? getSatelliteOrbitSlot(nodes, masteryId, satelliteId)
    : normalizedSlot
  const releaseSlot = options?.swapOriginSlot ?? currentSlot
  const releaseTier = normalizeOrbitTier(options?.swapOriginTier ?? tier, tierCount)

  const occupant = getOrbitSatellites(nodes, masteryId).find((sat) => {
    if (sat.id === satelliteId) return false
    const sd = sat.data as PassiveNodeData
    if (normalizeOrbitTier(sd.orbitTier, tierCount) !== tier) {
      return false
    }
    return getSatelliteOrbitSlot(nodes, masteryId, sat.id) === normalizedSlot
  })

  let next = nodes.map((node) => {
    if (node.id === satelliteId) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        data: { ...data, orbitTier: tier, orbitSlot: normalizedSlot },
      }
    }
    if (occupant && node.id === occupant.id) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        data: { ...data, orbitSlot: releaseSlot, orbitTier: releaseTier },
      }
    }
    return node
  })

  const tiersToSync = new Set<OrbitTier>([tier])
  if (occupant && releaseTier !== tier) tiersToSync.add(releaseTier)

  for (const syncTier of tiersToSync) {
    const tierSats = getOrbitSatellites(next, masteryId).filter((sat) => {
      const sd = sat.data as PassiveNodeData
      return normalizeOrbitTier(sd.orbitTier, tierCount) === syncTier
    })
    tierSats.sort(
      (a, b) =>
        getSatelliteOrbitSlot(next, masteryId, a.id) - getSatelliteOrbitSlot(next, masteryId, b.id),
    )
    const order = tierSats.map((s) => s.id)
    next = next.map((node) => {
      if (node.id !== masteryId) return node
      const data = node.data as PassiveNodeData
      return { ...node, data: setMasteryTierOrbitOrder(data, syncTier, order) }
    })
  }

  return next
}

/** Nearest capacity slot from a flow-space point around the mastery center. */
export function orbitSlotFromFlowPoint(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
  flowPoint: { x: number; y: number },
): number {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return 0

  const md = mastery.data as PassiveNodeData
  const capacity = getOrbitTierCapacity(md, tier)
  const mc = nodeCenter(mastery, nodes)
  const start = (getTierStartAngle(md, tier) * Math.PI) / 180

  let rel = Math.atan2(flowPoint.y - mc.y, flowPoint.x - mc.x) - start
  while (rel < 0) rel += Math.PI * 2
  while (rel >= Math.PI * 2) rel -= Math.PI * 2

  return Math.round((rel / (Math.PI * 2)) * capacity) % capacity
}

export type OrbitDragOrigin = {
  masteryId: string
  tier: OrbitTier
  slot: number
}

/**
 * Orbit member drag: always swap drag-start slot ↔ target slot (from snapshot).
 * Intermediate slots passed while dragging do not chain-shift other nodes.
 */
export function placeOrbitMemberFromDrag(
  snapshotNodes: PassiveFlowNode[],
  satelliteId: string,
  pointerCenter: { x: number; y: number },
  origin: OrbitDragOrigin,
): PassiveFlowNode[] {
  const { masteryId } = origin
  const mastery = snapshotNodes.find((n) => n.id === masteryId)
  if (!mastery) return snapshotNodes

  const md = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const mc = nodeCenter(mastery, snapshotNodes)
  const dist = Math.hypot(pointerCenter.x - mc.x, pointerCenter.y - mc.y)
  const targetTier =
    tierCount > 1 ? inferOrbitTierFromDistance(dist, tierCount) : (1 as OrbitTier)
  const targetSlot = orbitSlotFromFlowPoint(snapshotNodes, masteryId, targetTier, pointerCenter)

  if (targetTier === origin.tier && targetSlot === origin.slot) {
    return layoutMasteryOrbit(snapshotNodes, masteryId)
  }

  const next = assignSatelliteOrbitSlot(snapshotNodes, masteryId, satelliteId, targetTier, targetSlot, {
    swapOriginSlot: origin.slot,
    swapOriginTier: origin.tier,
  })
  return layoutMasteryOrbit(next, masteryId)
}

export type SatelliteDragOrigin =
  | ({ kind: 'orbit' } & OrbitDragOrigin)
  | { kind: 'external'; position: { x: number; y: number } }

const EXTERNAL_SWAP_HIT_SLACK = 48

/** Off-orbit satellite whose center is under the pointer (for orbit↔external swap). */
export function findExternalSatelliteNear(
  nodes: PassiveFlowNode[],
  pointerCenter: { x: number; y: number },
  excludeId: string,
): PassiveFlowNode | null {
  let best: { node: PassiveFlowNode; dist: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (node.id === excludeId || !isOrbitMemberKind(data.kind) || data.masteryId) continue
    const center = nodeCenter(node, nodes)
    const dist = Math.hypot(center.x - pointerCenter.x, center.y - pointerCenter.y)
    if (dist <= EXTERNAL_SWAP_HIT_SLACK && (!best || dist < best.dist)) {
      best = { node, dist }
    }
  }
  return best?.node ?? null
}

/** Orbit A (origin slot) ↔ target orbit occupied slot; origin slot receives target occupant. */
export function placeCrossOrbitSatelliteFromDrag(
  snapshotNodes: PassiveFlowNode[],
  satelliteId: string,
  pointerCenter: { x: number; y: number },
  origin: OrbitDragOrigin,
  target: OrbitAttachTarget,
): PassiveFlowNode[] {
  const targetMasteryId = target.mastery.id
  const targetTier = target.tier
  const targetSlot = orbitSlotFromFlowPoint(snapshotNodes, targetMasteryId, targetTier, pointerCenter)
  const occupant = getOrbitSlotOccupant(
    snapshotNodes,
    targetMasteryId,
    targetTier,
    targetSlot,
    satelliteId,
  )

  let next = snapshotNodes.map((node) => {
    const data = node.data as PassiveNodeData
    if (node.id === origin.masteryId) {
      return { ...node, data: removeSatelliteFromOrbitOrders(data, satelliteId) }
    }
    if (node.id === satelliteId) {
      return {
        ...node,
        data: {
          ...data,
          masteryId: targetMasteryId,
          orbitTier: targetTier,
          orbitSlot: targetSlot,
        },
      }
    }
    return node
  })

  if (occupant) {
    next = next.map((node) => {
      if (node.id !== occupant.id) return node
      const data = node.data as PassiveNodeData
      return {
        ...node,
        data: {
          ...data,
          masteryId: origin.masteryId,
          orbitTier: origin.tier,
          orbitSlot: origin.slot,
        },
      }
    })
  }

  next = layoutMasteryOrbit(next, origin.masteryId)
  next = layoutMasteryOrbit(next, targetMasteryId)
  return next
}

/** On-orbit satellite ↔ off-orbit satellite: external takes origin slot, dragged takes external's place. */
export function swapOrbitSatelliteWithExternal(
  snapshotNodes: PassiveFlowNode[],
  satelliteId: string,
  origin: OrbitDragOrigin,
  externalId: string,
): PassiveFlowNode[] {
  const external = snapshotNodes.find((n) => n.id === externalId)
  if (!external) return snapshotNodes
  const externalPos = { ...external.position }

  let next = snapshotNodes.map((node) => {
    if (node.id === origin.masteryId) {
      return { ...node, data: removeSatelliteFromOrbitOrders(node.data as PassiveNodeData, satelliteId) }
    }
    return node
  })

  next = next.map((node) => {
    if (node.id === externalId) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        data: {
          ...data,
          masteryId: origin.masteryId,
          orbitTier: origin.tier,
          orbitSlot: origin.slot,
        },
      }
    }
    if (node.id === satelliteId) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        position: externalPos,
        data: { ...data, masteryId: null, orbitSlot: undefined },
      }
    }
    return node
  })

  return layoutMasteryOrbit(next, origin.masteryId)
}

/**
 * Unified satellite drag preview/finalize from drag-start snapshot.
 * Same-orbit, cross-orbit, and orbit↔external all use direct swap (no revolver).
 */
export function placeSatelliteFromDrag(
  snapshotNodes: PassiveFlowNode[],
  satelliteId: string,
  pointerTopLeft: { x: number; y: number },
  origin: SatelliteDragOrigin,
): PassiveFlowNode[] {
  const satellite = snapshotNodes.find((n) => n.id === satelliteId)
  if (!satellite) return snapshotNodes

  if (origin.kind === 'external') {
    return placeExternalSatelliteOnOrbit(
      snapshotNodes,
      satelliteId,
      pointerTopLeft,
      origin.position,
    )
  }

  const dragged: PassiveFlowNode = { ...satellite, position: pointerTopLeft }
  const pointerCenter = nodeCenter(dragged, snapshotNodes)
  const atPointer = snapshotNodes.map((n) => (n.id === satelliteId ? dragged : n))
  const attachTarget = findOrbitAttachTarget(atPointer, dragged)

  if (attachTarget) {
    if (attachTarget.mastery.id === origin.masteryId) {
      return placeOrbitMemberFromDrag(snapshotNodes, satelliteId, pointerCenter, origin)
    }
    return placeCrossOrbitSatelliteFromDrag(
      snapshotNodes,
      satelliteId,
      pointerCenter,
      origin,
      attachTarget,
    )
  }

  const externalNear = findExternalSatelliteNear(snapshotNodes, pointerCenter, satelliteId)
  if (externalNear) {
    return swapOrbitSatelliteWithExternal(snapshotNodes, satelliteId, origin, externalNear.id)
  }

  let next = snapshotNodes.map((node) => {
    if (node.id === origin.masteryId) {
      return { ...node, data: removeSatelliteFromOrbitOrders(node.data as PassiveNodeData, satelliteId) }
    }
    if (node.id === satelliteId) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        position: pointerTopLeft,
        data: { ...data, masteryId: null, orbitSlot: undefined },
      }
    }
    return node
  })
  return layoutMasteryOrbit(next, origin.masteryId)
}

/** Nearest capacity slot from drop angle (allows landing on void spacers). */
export function orbitSlotFromDropAngle(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
  tierOverride?: OrbitTier,
): { tier: OrbitTier; slot: number } {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return { tier: 1, slot: 0 }

  const tier = tierOverride ?? getSatelliteOrbitTier(nodes, masteryId, satelliteId)
  const md = mastery.data as PassiveNodeData
  const capacity = getOrbitTierCapacity(md, tier)
  const mc = nodeCenter(mastery, nodes)
  const sc = nodeCenter(satellite, nodes)
  const start = (getTierStartAngle(md, tier) * Math.PI) / 180

  let rel = Math.atan2(sc.y - mc.y, sc.x - mc.x) - start
  while (rel < 0) rel += Math.PI * 2
  while (rel >= Math.PI * 2) rel -= Math.PI * 2

  const slot = Math.round((rel / (Math.PI * 2)) * capacity) % capacity
  return { tier, slot }
}

/** True when the open arc from `fromSlot` → `toSlot` (exclusive) has no occupied slots. */
function orbitArcHasOnlyVoids(
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

/**
 * Clockwise neighbors on a mastery orbit ring.
 * Empty capacity slots (void spacers) do not break adjacency — only other
 * satellites between the two nodes do.
 */
export function areOrbitAdjacent(
  nodes: PassiveFlowNode[],
  masteryId: string,
  aId: string,
  bId: string,
): boolean {
  const tierA = getSatelliteOrbitTier(nodes, masteryId, aId)
  const tierB = getSatelliteOrbitTier(nodes, masteryId, bId)
  if (tierA !== tierB) return false

  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return false
  const md = mastery.data as PassiveNodeData
  const capacity = getOrbitTierCapacity(md, tierA)
  const ia = getSatelliteOrbitSlot(nodes, masteryId, aId)
  const ib = getSatelliteOrbitSlot(nodes, masteryId, bId)
  if (ia === ib) return false

  const occupied = new Set<number>()
  for (const sat of getOrbitSatellites(nodes, masteryId)) {
    if (sat.id === aId || sat.id === bId) continue
    const sd = sat.data as PassiveNodeData
    if (normalizeOrbitTier(sd.orbitTier, normalizeOrbitTierCount(md.orbitTierCount)) !== tierA) {
      continue
    }
    if (isVoidPassing(sd)) continue
    occupied.add(getSatelliteOrbitSlot(nodes, masteryId, sat.id))
  }

  return (
    orbitArcHasOnlyVoids(occupied, capacity, ia, ib) ||
    orbitArcHasOnlyVoids(occupied, capacity, ib, ia)
  )
}

/** Starting angle (degrees) for one orbit tier; falls back to tier 1 / default. */
export function getTierStartAngle(data: PassiveNodeData, tier: OrbitTier): number {
  const fromTier = data.orbitStartAngleByTier?.[tier]
  if (fromTier != null) return fromTier
  if (tier === 1) return data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE
  return DEFAULT_ORBIT_START_ANGLE
}

/** Set the same start angle on every tier (used when orbit is locked). */
export function setMasteryUnifiedStartAngle(
  data: PassiveNodeData,
  degrees: number,
): PassiveNodeData {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const snapped = snapOrbitAngle(degrees)
  const byTier: Partial<Record<OrbitTier, number>> = {}
  for (let t = 1; t <= tierCount; t++) {
    byTier[t as OrbitTier] = snapped
  }
  return { ...data, orbitStartAngleByTier: byTier, orbitStartAngle: snapped }
}

/** Snapshot current start angle per tier (for locked unified drag). */
export function snapshotMasteryTierAngles(
  data: PassiveNodeData,
): Partial<Record<OrbitTier, number>> {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const snap: Partial<Record<OrbitTier, number>> = {}
  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    snap[tier] = getTierStartAngle(data, tier)
  }
  return snap
}

/** Apply the same rotation delta to every tier (orbit locked). */
export function rotateAllMasteryTiersByDelta(
  data: PassiveNodeData,
  originByTier: Partial<Record<OrbitTier, number>>,
  deltaDeg: number,
): PassiveNodeData {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const byTier: Partial<Record<OrbitTier, number>> = { ...(data.orbitStartAngleByTier ?? {}) }
  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    const origin = originByTier[tier] ?? getTierStartAngle(data, tier)
    byTier[tier] = snapOrbitAngle(origin + deltaDeg)
  }
  return {
    ...data,
    orbitStartAngleByTier: byTier,
    orbitStartAngle: byTier[1] ?? data.orbitStartAngle,
  }
}

/** Set snapped start angle for one tier; tier 1 also updates legacy orbitStartAngle. */
export function setMasteryTierStartAngle(
  data: PassiveNodeData,
  tier: OrbitTier,
  degrees: number,
): PassiveNodeData {
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const normalizedTier = normalizeOrbitTier(tier, tierCount)
  const snapped = snapOrbitAngle(degrees)
  const byTier = { ...(data.orbitStartAngleByTier ?? {}) }
  byTier[normalizedTier] = snapped
  const next: PassiveNodeData = { ...data, orbitStartAngleByTier: byTier }
  if (normalizedTier === 1) next.orbitStartAngle = snapped
  return next
}

/** True when two orbit tiers are neighbors (1↔2, 2↔3). */
export function areOrbitTiersAdjacent(tierA: OrbitTier, tierB: OrbitTier): boolean {
  return Math.abs(tierA - tierB) === 1
}

/** Orbit link: same tier = adjacent on ring; adjacent tiers (1↔2, 2↔3) = any pair. */
export function canOrbitLink(
  nodes: PassiveFlowNode[],
  masteryId: string,
  aId: string,
  bId: string,
): boolean {
  const source = nodes.find((n) => n.id === aId)
  const target = nodes.find((n) => n.id === bId)
  if (!source || !target) return false
  const sd = source.data as PassiveNodeData
  const td = target.data as PassiveNodeData
  if (!isSatelliteKind(sd.kind) || !isSatelliteKind(td.kind)) return false
  if (sd.masteryId !== masteryId || td.masteryId !== masteryId) return false

  const tierA = getSatelliteOrbitTier(nodes, masteryId, aId)
  const tierB = getSatelliteOrbitTier(nodes, masteryId, bId)
  if (tierA === tierB) return areOrbitAdjacent(nodes, masteryId, aId, bId)
  return areOrbitTiersAdjacent(tierA, tierB)
}

export type OrbitLinkSpec =
  | { kind: 'arc'; a1: number; a2: number; arcRadius: number; clockwise: boolean }
  | { kind: 'chord' }

/** Outermost training-band edge radius from the satellite node center. */
export function satelliteBandOuterRadius(data: PassiveNodeData): number {
  const nodeSize = NODE_SIZE[data.kind]
  const stageCount = data.stages?.length ?? 0
  if (stageCount <= 0) return nodeSize / 2
  return outermostBandRadius(stageCount, nodeSize) + BAND_STROKE / 2
}

/** True when training bands are rendered on the node (matches PassiveNode). */
export function nodeHasVisibleBands(data: PassiveNodeData, nodePowered: boolean): boolean {
  if (!nodePowered) return false
  if (!kindUsesTrainingBands(data.kind)) return false
  return (data.stages?.length ?? 0) > 0
}

/** Link trim radius: outside visible bands when present, otherwise the node face. */
export function nodeLinkTrimRadius(data: PassiveNodeData, nodePowered = false): number {
  if (nodeHasVisibleBands(data, nodePowered)) {
    return satelliteBandOuterRadius(data)
  }
  return NODE_SIZE[data.kind] / 2
}

/** Angular trim (radians) so an orbit arc clears the node rim or band outer edge. */
function orbitBandAngularTrim(
  data: PassiveNodeData,
  orbitRadius: number,
  nodePowered = false,
) {
  const rim = nodeLinkTrimRadius(data, nodePowered) + 2
  return Math.asin(Math.min(1, rim / orbitRadius))
}

function orbitSlotAngle(
  masteryData: PassiveNodeData,
  tier: OrbitTier,
  index: number,
  count: number,
) {
  const startRad = (getTierStartAngle(masteryData, tier) * Math.PI) / 180
  return startRad + (2 * Math.PI * index) / count
}

/** Orbit link geometry: arc on a tier ring, or chord across adjacent tiers. */
export function orbitLinkSpec(
  nodes: PassiveFlowNode[],
  masteryId: string,
  sourceId: string,
  targetId: string,
  options?: { sourcePowered?: boolean; targetPowered?: boolean },
): OrbitLinkSpec | null {
  if (!canOrbitLink(nodes, masteryId, sourceId, targetId)) return null

  const mastery = nodes.find((n) => n.id === masteryId)
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!mastery || !source || !target) return null

  const md = mastery.data as PassiveNodeData
  const sd = source.data as PassiveNodeData
  const td = target.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const tierA = getSatelliteOrbitTier(nodes, masteryId, sourceId)
  const tierB = getSatelliteOrbitTier(nodes, masteryId, targetId)

  if (tierA !== tierB) return { kind: 'chord' }

  const orbitR = orbitTierRadius(tierCount, tierA)
  const capacity = getOrbitTierCapacity(md, tierA)
  const ia = getSatelliteOrbitSlot(nodes, masteryId, sourceId)
  const ib = getSatelliteOrbitSlot(nodes, masteryId, targetId)

  const occupied = new Set<number>()
  for (const sat of getOrbitSatellites(nodes, masteryId)) {
    if (sat.id === sourceId || sat.id === targetId) continue
    const satData = sat.data as PassiveNodeData
    if (normalizeOrbitTier(satData.orbitTier, tierCount) !== tierA) continue
    if (isVoidPassing(satData)) continue
    occupied.add(getSatelliteOrbitSlot(nodes, masteryId, sat.id))
  }

  const cwClear = orbitArcHasOnlyVoids(occupied, capacity, ia, ib)
  const ccwClear = orbitArcHasOnlyVoids(occupied, capacity, ib, ia)
  const cwDist = (ib - ia + capacity) % capacity
  const ccwDist = (ia - ib + capacity) % capacity
  const clockwise = cwClear && (!ccwClear || cwDist <= ccwDist)

  const a1Raw = orbitSlotAngle(md, tierA, ia, capacity)
  const a2Raw = orbitSlotAngle(md, tierA, ib, capacity)
  const trimA = orbitBandAngularTrim(sd, orbitR, options?.sourcePowered ?? false)
  const trimB = orbitBandAngularTrim(td, orbitR, options?.targetPowered ?? false)

  const a1 = clockwise ? a1Raw + trimA : a1Raw - trimA
  const a2 = clockwise ? a2Raw - trimB : a2Raw + trimB

  return {
    kind: 'arc',
    a1,
    a2,
    arcRadius: orbitR,
    clockwise,
  }
}

/** @deprecated Use orbitLinkSpec */
export function orbitAdjacentArcSpec(
  nodes: PassiveFlowNode[],
  masteryId: string,
  sourceId: string,
  targetId: string,
): { a1: number; a2: number; arcRadius: number; clockwise: boolean } | null {
  const spec = orbitLinkSpec(nodes, masteryId, sourceId, targetId)
  if (!spec || spec.kind !== 'arc') return null
  return spec
}

/** Pad link endpoints outside visible bands (links never draw through band rings). */
export function linkEndpointPad(data: PassiveNodeData, nodePowered = false) {
  const hasBands = nodeHasVisibleBands(data, nodePowered)
  return nodeLinkTrimRadius(data, nodePowered) + (hasBands ? 4 : 2)
}

export function trimStraightEndpoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePad: number,
  targetPad: number,
) {
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy)
  if (len <= sourcePad + targetPad + 1) {
    return { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty }
  }
  const ux = dx / len
  const uy = dy / len
  return {
    sourceX: sx + ux * sourcePad,
    sourceY: sy + uy * sourcePad,
    targetX: tx - ux * targetPad,
    targetY: ty - uy * targetPad,
  }
}

/** Same-orbit Notable ↔ its Mastery center link. */
export function isSameOrbitNotableMasteryLink(
  sd: PassiveNodeData,
  td: PassiveNodeData,
  sourceId: string,
  targetId: string,
) {
  if (sd.kind === 'notable' && isMasteryKind(td.kind) && td.kind === 'mastery' && sd.masteryId === targetId) return true
  if (td.kind === 'notable' && isMasteryKind(sd.kind) && sd.kind === 'mastery' && td.masteryId === sourceId) return true
  return false
}

export function linkGlowStyle(color: string, selected: boolean, powered: boolean) {
  const strokeMix = powered ? 82 : 38
  const glowMix = powered ? 50 : 14
  return {
    stroke: `color-mix(in srgb, ${color} ${strokeMix}%, #eef3f7)`,
    strokeWidth: selected ? 3 : 2.5,
    filter: `drop-shadow(0 0 ${powered ? 8 : 4}px color-mix(in srgb, ${color} ${glowMix}%, transparent))`,
    opacity: powered ? 1 : 0.38,
    cursor: 'pointer' as const,
  }
}

export function poweredLinkGlowStyle(color: string, selected: boolean) {
  return linkGlowStyle(color, selected, true)
}

export const CROSS_ORBIT_GLOW_COLOR = '#9fe8dd'

export function snapOrbitAngle(degrees: number) {
  const stepped = Math.round(degrees / ORBIT_ANGLE_STEP) * ORBIT_ANGLE_STEP
  // Normalize to (-180, 180]
  let n = ((stepped + 180) % 360 + 360) % 360 - 180
  if (n === -180) n = 180
  return n
}

export function orbitAngleOptions() {
  const options: number[] = []
  for (let deg = -180; deg < 180; deg += ORBIT_ANGLE_STEP) {
    options.push(deg)
  }
  return options
}

/** Screen/flow atan2 degrees; Y grows downward (clockwise from +X). */
export function pointerAngleDeg(cx: number, cy: number, x: number, y: number) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI
}

export function normalizeAngleDelta(degrees: number) {
  let n = ((degrees + 180) % 360 + 360) % 360 - 180
  if (n === -180) n = 180
  return n
}

/** Half-width (flow px) of the empty orbit ring drag target. */
export const ORBIT_HIT_HALF_WIDTH = 20

/**
 * Radius of the node interaction disk (face + stage bands + link rim).
 * Must stay in sync with PassiveNode `--connect-r`.
 */
export function nodeInteractRadius(data: PassiveNodeData) {
  const nodeSize = NODE_SIZE[data.kind]
  const outerBandR = outermostBandRadius(data.stages?.length ?? 0, nodeSize)
  return Math.max(outerBandR + 8, nodeSize / 2 + 16)
}

/**
 * Hit-test empty mastery orbit ring space in flow coordinates.
 * Returns null when the point is on any node (face / bands / link rim),
 * so node drag and connect always win over orbit rotate.
 */
export function findMasteryOrbitRingAt(
  nodes: PassiveFlowNode[],
  flowPoint: { x: number; y: number },
): { masteryId: string; tier: OrbitTier; pointerDeg: number } | null {
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!data?.kind) continue
    const c = nodeCenter(node, nodes)
    if (Math.hypot(flowPoint.x - c.x, flowPoint.y - c.y) <= nodeInteractRadius(data) + 4) {
      return null
    }
  }

  let best: { masteryId: string; tier: OrbitTier; pointerDeg: number; err: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind)) continue
    const c = nodeCenter(node, nodes)
    const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
    for (let tier = 1; tier <= tierCount; tier++) {
      const orbitTier = tier as OrbitTier
      const radius = orbitTierRadius(tierCount, orbitTier)
      const dist = Math.hypot(flowPoint.x - c.x, flowPoint.y - c.y)
      const err = Math.abs(dist - radius)
      if (err > ORBIT_HIT_HALF_WIDTH) continue
      if (!best || err < best.err) {
        best = {
          masteryId: node.id,
          tier: orbitTier,
          pointerDeg: pointerAngleDeg(c.x, c.y, flowPoint.x, flowPoint.y),
          err,
        }
      }
    }
  }
  return best
    ? { masteryId: best.masteryId, tier: best.tier, pointerDeg: best.pointerDeg }
    : null
}

/** Walk parentId chain to absolute top-left in flow coords. */
export function absolutePosition(
  node: { id: string; position: { x: number; y: number }; parentId?: string },
  nodes: { id: string; position: { x: number; y: number }; parentId?: string }[],
) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

export function toParentRelative(
  absolute: { x: number; y: number },
  parentId: string,
  nodes: { id: string; position: { x: number; y: number }; parentId?: string }[],
) {
  const parent = nodes.find((n) => n.id === parentId)
  if (!parent) return absolute
  const origin = absolutePosition(parent, nodes)
  return { x: absolute.x - origin.x, y: absolute.y - origin.y }
}

export function nodeCenter(
  node: PassiveFlowNode,
  nodes?: { id: string; position: { x: number; y: number }; parentId?: string }[],
) {
  const size = NODE_SIZE[(node.data as PassiveNodeData).kind]
  const origin = nodes ? absolutePosition(node, nodes) : node.position
  return {
    x: origin.x + size / 2,
    y: origin.y + size / 2,
  }
}

export function positionFromCenter(
  centerX: number,
  centerY: number,
  kind: PassiveKind,
): { x: number; y: number } {
  const size = NODE_SIZE[kind]
  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
  }
}

export function getOrbitSatellites(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  return nodes.filter((n) => {
    const data = n.data as PassiveNodeData
    return data.masteryId === masteryId && isOrbitMemberKind(data.kind)
  })
}

/** All orbit satellites in tier order (tier 1 → tier N). */
export function getOrderedOrbitSatellites(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return []

  const tierCount = normalizeOrbitTierCount((mastery.data as PassiveNodeData).orbitTierCount)
  const ordered: PassiveFlowNode[] = []
  for (let t = 1; t <= tierCount; t++) {
    ordered.push(...getOrderedTierSatellites(nodes, masteryId, t as OrbitTier))
  }
  return ordered
}

export function syncOrbitOrder(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return nodes

  const data = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const byTier: Partial<Record<OrbitTier, string[]>> = {}
  let changed = false

  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    const orderIds = getOrderedTierSatellites(nodes, masteryId, tier).map((s) => s.id)
    byTier[tier] = orderIds
    const prev = data.orbitOrderByTier?.[tier] ?? []
    if (prev.length !== orderIds.length || !prev.every((id, i) => id === orderIds[i])) {
      changed = true
    }
  }

  const flatOrder = mergeOrbitOrderFromTiers(tierCount, byTier)
  const prevFlat = data.orbitOrder ?? []
  if (
    !changed &&
    prevFlat.length === flatOrder.length &&
    prevFlat.every((id, i) => id === flatOrder[i])
  ) {
    return nodes
  }

  return nodes.map((node) => {
    if (node.id !== masteryId) return node
    return { ...node, data: { ...data, orbitOrderByTier: byTier, orbitOrder: flatOrder } }
  })
}

/** Place satellites evenly on a circular orbit around the mastery center. */
export function layoutMasteryOrbit(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const synced = syncOrbitOrder(nodes, masteryId)
  const mastery = synced.find((n) => n.id === masteryId)
  if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) {
    return synced
  }

  const data = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const center = nodeCenter(mastery, synced)
  const positioned = new Map<string, { x: number; y: number }>()

  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    const tierSatellites = getOrderedTierSatellites(synced, masteryId, tier)
    if (tierSatellites.length === 0) continue

    const capacity = getOrbitTierCapacity(data, tier)
    const startRad = (getTierStartAngle(data, tier) * Math.PI) / 180
    const radius = orbitTierRadius(tierCount, tier)
    tierSatellites.forEach((sat) => {
      const satData = sat.data as PassiveNodeData
      const rawSlot = getSatelliteOrbitSlot(synced, masteryId, sat.id)
      const slot = ((rawSlot % capacity) + capacity) % capacity
      const angle = startRad + (2 * Math.PI * slot) / capacity
      const abs = positionFromCenter(
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle),
        satData.kind,
      )
      positioned.set(
        sat.id,
        sat.parentId ? toParentRelative(abs, sat.parentId, synced) : abs,
      )
    })
  }

  if (positioned.size === 0) {
    return synced
  }

  return synced.map((node) => {
    const next = positioned.get(node.id)
    if (!next) return node
    return {
      ...node,
      position: next,
      draggable: true,
    }
  })
}

/**
 * After capacity change: map each satellite to a unique slot in [0, capacity).
 * Prevents overlap when old slots wrap onto the same angle.
 */
export function rematerializeOrbitTierSlots(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
  capacity: number,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery || capacity < 1) return nodes

  const sats = getOrderedTierSatellites(nodes, masteryId, tier)
    .slice()
    .sort(
      (a, b) =>
        getSatelliteOrbitSlot(nodes, masteryId, a.id) -
        getSatelliteOrbitSlot(nodes, masteryId, b.id),
    )

  if (sats.length > capacity) return nodes

  const used = new Set<number>()
  const assignments = new Map<string, number>()

  for (const sat of sats) {
    const raw = getSatelliteOrbitSlot(nodes, masteryId, sat.id)
    const preferred = ((raw % capacity) + capacity) % capacity
    let slot = preferred
    if (used.has(slot)) {
      slot = -1
      for (let i = 1; i < capacity; i++) {
        const cand = (preferred + i) % capacity
        if (!used.has(cand)) {
          slot = cand
          break
        }
      }
      if (slot < 0) return nodes
    }
    used.add(slot)
    assignments.set(sat.id, slot)
  }

  let next = nodes.map((node) => {
    const slot = assignments.get(node.id)
    if (slot == null) return node
    const data = node.data as PassiveNodeData
    return { ...node, data: { ...data, orbitTier: tier, orbitSlot: slot } }
  })

  const order = [...assignments.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)

  next = next.map((node) => {
    if (node.id !== masteryId) return node
    return { ...node, data: setMasteryTierOrbitOrder(node.data as PassiveNodeData, tier, order) }
  })

  return next
}

export function withMasteryDragFlags(
  nodes: PassiveFlowNode[],
  selectedId: string | null = null,
): PassiveFlowNode[] {
  return nodes.map((node) => {
    const data = node.data as PassiveNodeData
    // Mastery orbits are large; keep them under satellite titles/links visually.
    // Selected mastery must NOT jump above satellites — orbits are children of the mastery node.
    const isMastery = isMasteryKind(data.kind)
    const baseZ = isMastery ? 1 : 6
    const selectedZ = isMastery ? 2 : 40
    return {
      ...node,
      dragHandle: '.node-drag-handle',
      draggable: node.id !== INITIAL_NODE_ID,
      zIndex: node.id === selectedId ? selectedZ : baseZ,
    }
  })
}

/**
 * Remove nodes, detach orphans from deleted masteries, prune orbitOrder,
 * then evenly re-layout every affected mastery orbit.
 */
export function removeNodesAndRelayout(
  nodes: PassiveFlowNode[],
  removeIds: Iterable<string>,
  selectedId: string | null = null,
): PassiveFlowNode[] {
  const ids = new Set(removeIds)
  if (ids.size === 0) return withMasteryDragFlags(nodes, selectedId)

  const affectedMasteries = new Set<string>()

  for (const node of nodes) {
    if (!ids.has(node.id)) continue
    const data = node.data as PassiveNodeData
    if (data.masteryId) affectedMasteries.add(data.masteryId)
    if (isMasteryKind(data.kind)) affectedMasteries.add(node.id)
  }

  let next = nodes
    .filter((n) => !ids.has(n.id))
    .map((node) => {
      const data = node.data as PassiveNodeData
      if (data.masteryId && ids.has(data.masteryId)) {
        return {
          ...node,
          data: { ...data, masteryId: null },
          draggable: true,
        }
      }
      if (isMasteryKind(data.kind)) {
        let nextData = data
        for (const id of ids) {
          if ((data.orbitOrder ?? []).includes(id)) {
            nextData = removeSatelliteFromOrbitOrders(nextData, id)
          }
        }
        if (
          nextData.orbitOrder?.length !== (data.orbitOrder ?? []).length ||
          JSON.stringify(nextData.orbitOrderByTier) !== JSON.stringify(data.orbitOrderByTier)
        ) {
          affectedMasteries.add(node.id)
          return { ...node, data: nextData }
        }
      }
      return node
    })

  for (const masteryId of affectedMasteries) {
    if (ids.has(masteryId)) continue
    next = layoutMasteryOrbit(next, masteryId)
  }

  return withMasteryDragFlags(next, selectedId)
}

export function totalTrainingCount(trainings: { count: number }[]) {
  return trainings.reduce((sum, t) => sum + (Number.isFinite(t.count) ? t.count : 0), 0)
}

export function trainingProgressLabel(total: number) {
  const rem = total % 3
  const filled = rem === 0 && total > 0 ? 3 : rem
  return `${filled}/3`
}

/** Fractional band level (3 trainings = 1.0). */
export function trainingBandLevel(total: number) {
  return Math.max(0, total) / 3
}

/** True when both satellites belong to the same Mastery orbit. */
export function shareSameOrbit(
  a: { data: PassiveNodeData },
  b: { data: PassiveNodeData },
) {
  const am = a.data.masteryId
  const bm = b.data.masteryId
  return Boolean(am && bm && am === bm)
}

export const ORBIT_ATTACH_SLACK = 56
export const ORBIT_DETACH_SLACK = 72

export function distanceBetweenCenters(
  a: PassiveFlowNode,
  b: PassiveFlowNode,
  nodes?: PassiveFlowNode[],
) {
  const ca = nodeCenter(a, nodes)
  const cb = nodeCenter(b, nodes)
  return Math.hypot(ca.x - cb.x, ca.y - cb.y)
}

/** Nearest mastery by center distance. */
export function findNearestMastery(nodes: PassiveFlowNode[], satellite: PassiveFlowNode) {
  let best: { mastery: PassiveFlowNode; dist: number; radius: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind)) continue
    const dist = distanceBetweenCenters(satellite, node, nodes)
    const radius = masteryOuterOrbitRadius(data)
    if (!best || dist < best.dist) {
      best = { mastery: node, dist, radius }
    }
  }
  return best
}

export type OrbitAttachTarget = {
  mastery: PassiveFlowNode
  tier: OrbitTier
}

/**
 * External drop target: satellite center within slack of a specific tier ring.
 * Unlike findNearestMastery (outer disk), this matches 2·3단 rings individually.
 */
export function findOrbitAttachTarget(
  nodes: PassiveFlowNode[],
  satellite: PassiveFlowNode,
): OrbitAttachTarget | null {
  let best: (OrbitAttachTarget & { err: number }) | null = null

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind) || data.orbitLocked) continue

    const tierCount = normalizeOrbitTierCount(data.orbitTierCount)
    const dist = distanceBetweenCenters(satellite, node, nodes)

    for (let t = 1; t <= tierCount; t++) {
      const tier = t as OrbitTier
      const err = Math.abs(dist - orbitTierRadius(tierCount, tier))
      if (err <= ORBIT_ATTACH_SLACK && (!best || err < best.err)) {
        best = { mastery: node, tier, err }
      }
    }
  }

  if (!best) return null
  return { mastery: best.mastery, tier: best.tier }
}

/** Satellite occupying a specific slot on a tier (if any). */
export function getOrbitSlotOccupant(
  nodes: PassiveFlowNode[],
  masteryId: string,
  tier: OrbitTier,
  slot: number,
  excludeId?: string,
): PassiveFlowNode | null {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return null
  const md = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const normalizedSlot = slot

  for (const sat of getOrbitSatellites(nodes, masteryId)) {
    if (excludeId && sat.id === excludeId) continue
    const sd = sat.data as PassiveNodeData
    if (normalizeOrbitTier(sd.orbitTier, tierCount) !== tier) continue
    if (getSatelliteOrbitSlot(nodes, masteryId, sat.id) === normalizedSlot) return sat
  }
  return null
}

/** Detach occupant to `outgoingPosition`; incoming takes its orbit slot. */
export function swapExternalWithOrbitOccupant(
  nodes: PassiveFlowNode[],
  masteryId: string,
  incomingId: string,
  tier: OrbitTier,
  slot: number,
  outgoingId: string,
  outgoingPosition: { x: number; y: number },
): PassiveFlowNode[] {
  let next = nodes.map((node) => {
    if (node.id === outgoingId) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        position: outgoingPosition,
        data: { ...data, masteryId: null, orbitSlot: undefined },
      }
    }
    if (node.id === incomingId) {
      const data = node.data as PassiveNodeData
      return {
        ...node,
        data: { ...data, masteryId, orbitTier: tier, orbitSlot: slot },
      }
    }
    if (node.id === masteryId) {
      const data = node.data as PassiveNodeData
      return { ...node, data: removeSatelliteFromOrbitOrders(data, outgoingId) }
    }
    return node
  })

  const md = next.find((n) => n.id === masteryId)?.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const tierSats = getOrbitSatellites(next, masteryId).filter((sat) => {
    const sd = sat.data as PassiveNodeData
    return normalizeOrbitTier(sd.orbitTier, tierCount) === tier
  })
  tierSats.sort(
    (a, b) =>
      getSatelliteOrbitSlot(next, masteryId, a.id) - getSatelliteOrbitSlot(next, masteryId, b.id),
  )
  const order = tierSats.map((s) => s.id)

  next = next.map((node) => {
    if (node.id !== masteryId) return node
    const data = node.data as PassiveNodeData
    return { ...node, data: setMasteryTierOrbitOrder(data, tier, order) }
  })

  return layoutMasteryOrbit(next, masteryId)
}

export type PlaceOrbitOptions = {
  preferredTier?: OrbitTier
  /** Incoming node's off-orbit position — occupant at target slot detaches here. */
  swapOriginPosition?: { x: number; y: number }
  /** Drag-start slot for on-orbit moves (direct swap with target slot). */
  swapOriginSlot?: number
  swapOriginTier?: OrbitTier
}

/** Prefer nearest ring with a free slot; optional tier hint from drop target. */
export function resolveOrbitAttachTier(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
  preferredTier?: OrbitTier,
  options?: { allowOccupiedSwap?: boolean },
): OrbitTier | null {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return null

  const md = mastery.data as PassiveNodeData
  const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
  const dist = distanceBetweenCenters(satellite, mastery, nodes)

  const ranked: { tier: OrbitTier; err: number }[] = []
  for (let t = 1; t <= tierCount; t++) {
    const tier = t as OrbitTier
    ranked.push({ tier, err: Math.abs(dist - orbitTierRadius(tierCount, tier)) })
  }
  ranked.sort((a, b) => a.err - b.err)

  if (
    preferredTier &&
    tierAcceptsAttach(nodes, masteryId, satelliteId, preferredTier, options?.allowOccupiedSwap)
  ) {
    return preferredTier
  }

  for (const { tier } of ranked) {
    if (tierAcceptsAttach(nodes, masteryId, satelliteId, tier, options?.allowOccupiedSwap)) {
      return tier
    }
  }
  return null
}

function tierAcceptsAttach(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
  tier: OrbitTier,
  allowOccupiedSwap?: boolean,
): boolean {
  if (canAcceptOrbitMember(nodes, masteryId, tier, satelliteId)) return true
  if (!allowOccupiedSwap) return false
  const { slot } = orbitSlotFromDropAngle(nodes, masteryId, satelliteId, tier)
  return getOrbitSlotOccupant(nodes, masteryId, tier, slot, satelliteId) != null
}

/** Attach / reposition a satellite on a mastery orbit (returns null when no tier has room). */
export function placeSatelliteOnMasteryOrbit(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
  options?: PlaceOrbitOptions,
): PassiveFlowNode[] | null {
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!satellite) return null

  const prevMasteryId = (satellite.data as PassiveNodeData).masteryId ?? null
  const wasOffOrbit = prevMasteryId !== masteryId
  const externalSwap = options?.swapOriginPosition != null
  const allowOccupiedSwap = wasOffOrbit || externalSwap

  const tier = resolveOrbitAttachTier(nodes, masteryId, satelliteId, options?.preferredTier, {
    allowOccupiedSwap,
  })
  if (tier == null) return null

  const { slot } = orbitSlotFromDropAngle(nodes, masteryId, satelliteId, tier)
  const occupant = getOrbitSlotOccupant(nodes, masteryId, tier, slot, satelliteId)

  if (externalSwap && occupant) {
    return swapExternalWithOrbitOccupant(
      nodes,
      masteryId,
      satelliteId,
      tier,
      slot,
      occupant.id,
      options!.swapOriginPosition!,
    )
  }

  if ((wasOffOrbit || externalSwap) && !occupant) {
    let next = nodes.map((node) => {
      if (node.id !== satelliteId) return node
      const data = node.data as PassiveNodeData
      return {
        ...node,
        data: { ...data, masteryId, orbitTier: tier, orbitSlot: slot },
      }
    })
    if (prevMasteryId && prevMasteryId !== masteryId) {
      next = next.map((node) => {
        if (node.id !== prevMasteryId) return node
        return {
          ...node,
          data: removeSatelliteFromOrbitOrders(node.data as PassiveNodeData, satelliteId),
        }
      })
    }
    const mastery = next.find((n) => n.id === masteryId)
    if (mastery) {
      const md = mastery.data as PassiveNodeData
      const tierSats = getOrbitSatellites(next, masteryId).filter((sat) => {
        const sd = sat.data as PassiveNodeData
        return (
          normalizeOrbitTier(sd.orbitTier, normalizeOrbitTierCount(md.orbitTierCount)) === tier
        )
      })
      tierSats.sort(
        (a, b) =>
          getSatelliteOrbitSlot(next, masteryId, a.id) -
          getSatelliteOrbitSlot(next, masteryId, b.id),
      )
      next = next.map((node) => {
        if (node.id !== masteryId) return node
        return {
          ...node,
          data: setMasteryTierOrbitOrder(node.data as PassiveNodeData, tier, tierSats.map((s) => s.id)),
        }
      })
    }
    if (prevMasteryId && prevMasteryId !== masteryId) {
      next = layoutMasteryOrbit(next, prevMasteryId)
    }
    return layoutMasteryOrbit(next, masteryId)
  }

  if (!wasOffOrbit && options?.swapOriginSlot != null) {
    const next = assignSatelliteOrbitSlot(nodes, masteryId, satelliteId, tier, slot, {
      swapOriginSlot: options.swapOriginSlot,
      swapOriginTier: options.swapOriginTier,
    })
    return layoutMasteryOrbit(next, masteryId)
  }

  let next = applySatelliteOrbitPlacement(nodes, masteryId, satelliteId, tier)
  return layoutMasteryOrbit(next, masteryId)
}

/**
 * External drag: cursor follow off-ring; on ring = empty slot place OR occupied slot
 * position-swap with drag-origin (never revolver / never overlap).
 */
export function placeExternalSatelliteOnOrbit(
  nodes: PassiveFlowNode[],
  satelliteId: string,
  currentPosition: { x: number; y: number },
  swapOrigin: { x: number; y: number },
): PassiveFlowNode[] {
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!satellite) return nodes

  const dragged: PassiveFlowNode = { ...satellite, position: currentPosition }
  const pointerCenter = nodeCenter(dragged, nodes)
  const atPointer = nodes.map((n) => (n.id === satelliteId ? dragged : n))

  // Prefer the orbit member under the cursor — direct A↔B position/slot swap.
  const hitMember = findOrbitMemberNearPointer(atPointer, pointerCenter, satelliteId)
  if (hitMember) {
    const md = hitMember.data as PassiveNodeData
    const masteryId = md.masteryId
    if (masteryId && !isMasteryOrbitLocked(nodes, masteryId)) {
      const tier = getSatelliteOrbitTier(nodes, masteryId, hitMember.id)
      const slot = getSatelliteOrbitSlot(nodes, masteryId, hitMember.id)
      return swapExternalWithOrbitOccupant(
        atPointer,
        masteryId,
        satelliteId,
        tier,
        slot,
        hitMember.id,
        swapOrigin,
      )
    }
  }

  const target = findOrbitAttachTarget(atPointer, dragged)
  if (!target) {
    return atPointer.map((n) =>
      n.id === satelliteId
        ? {
            ...n,
            position: currentPosition,
            data: {
              ...(n.data as PassiveNodeData),
              masteryId: null,
              orbitSlot: undefined,
            },
          }
        : n,
    )
  }

  const masteryId = target.mastery.id
  const tier = target.tier
  const slot = orbitSlotFromFlowPoint(atPointer, masteryId, tier, pointerCenter)
  const occupant = getOrbitSlotOccupant(atPointer, masteryId, tier, slot, satelliteId)

  if (occupant) {
    return swapExternalWithOrbitOccupant(
      atPointer,
      masteryId,
      satelliteId,
      tier,
      slot,
      occupant.id,
      swapOrigin,
    )
  }

  // Empty / void slot — place only; do not shift other orbit members.
  let next = atPointer.map((n) => {
    if (n.id !== satelliteId) return n
    const d = n.data as PassiveNodeData
    return {
      ...n,
      data: { ...d, masteryId, orbitTier: tier, orbitSlot: slot },
    }
  })
  const mastery = next.find((n) => n.id === masteryId)
  if (mastery) {
    const mdata = mastery.data as PassiveNodeData
    const tierCount = normalizeOrbitTierCount(mdata.orbitTierCount)
    const tierSats = getOrbitSatellites(next, masteryId).filter((sat) => {
      const sd = sat.data as PassiveNodeData
      return normalizeOrbitTier(sd.orbitTier, tierCount) === tier
    })
    tierSats.sort(
      (a, b) =>
        getSatelliteOrbitSlot(next, masteryId, a.id) - getSatelliteOrbitSlot(next, masteryId, b.id),
    )
    next = next.map((n) => {
      if (n.id !== masteryId) return n
      return {
        ...n,
        data: setMasteryTierOrbitOrder(n.data as PassiveNodeData, tier, tierSats.map((s) => s.id)),
      }
    })
  }
  return layoutMasteryOrbit(next, masteryId)
}

/** Orbit member whose center is near the pointer (for external→orbit node swap). */
export function findOrbitMemberNearPointer(
  nodes: PassiveFlowNode[],
  pointerCenter: { x: number; y: number },
  excludeId: string,
): PassiveFlowNode | null {
  let best: { node: PassiveFlowNode; dist: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (node.id === excludeId || !isOrbitMemberKind(data.kind) || !data.masteryId) continue
    if (isMasteryOrbitLocked(nodes, data.masteryId)) continue
    const center = nodeCenter(node, nodes)
    const hitR = NODE_SIZE[data.kind] / 2 + 12
    const dist = Math.hypot(center.x - pointerCenter.x, center.y - pointerCenter.y)
    if (dist <= hitR && (!best || dist < best.dist)) {
      best = { node, dist }
    }
  }
  return best?.node ?? null
}

/** Insert satellite into tier-local clockwise order using drop angle around mastery. */
export function orbitOrderByDropAngleInTier(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
): { tier: OrbitTier; order: string[] } {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return { tier: 1, order: [satelliteId] }

  const tier = getSatelliteOrbitTier(nodes, masteryId, satelliteId)
  const mc = nodeCenter(mastery, nodes)
  const md = mastery.data as PassiveNodeData
  const start = (getTierStartAngle(md, tier) * Math.PI) / 180

  const norm = (angle: number) => {
    let rel = angle - start
    while (rel < 0) rel += Math.PI * 2
    while (rel >= Math.PI * 2) rel -= Math.PI * 2
    return rel
  }

  const others = getOrderedTierSatellites(nodes, masteryId, tier).filter(
    (s) => s.id !== satelliteId,
  )
  const items = [
    ...others.map((o) => {
      const c = nodeCenter(o, nodes)
      return { id: o.id, rel: norm(Math.atan2(c.y - mc.y, c.x - mc.x)) }
    }),
    (() => {
      const c = nodeCenter(satellite, nodes)
      return { id: satelliteId, rel: norm(Math.atan2(c.y - mc.y, c.x - mc.x)) }
    })(),
  ]
  items.sort((a, b) => a.rel - b.rel)
  return { tier, order: items.map((i) => i.id) }
}

/** @deprecated Use orbitOrderByDropAngleInTier */
export function orbitOrderByDropAngle(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
): string[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return [satelliteId]
  const { tier, order } = orbitOrderByDropAngleInTier(nodes, masteryId, satelliteId)
  const data = mastery.data as PassiveNodeData
  return setMasteryTierOrbitOrder(data, tier, order).orbitOrder ?? order
}

import type { Edge } from '@xyflow/react'
import type { PassiveNodeData } from './types'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import { isRootPowerHandle } from './initialHub'
import {
  NODE_SIZE,
  ROOT_HUB_SIZE,
  ROOT_HUB_RIM_PAD,
  ROOT_ORBIT_TIER_RADIUS,
  layoutMasteryOrbit,
  masteryOuterOrbitRadius,
  isMasteryKind,
} from './orbit'

/** Spatial-only Root orbit tier (no Active/Standby/Archive meaning). */
export type RootOrbitTier = 1 | 2 | 3

export const ROOT_HUB_RADIUS = ROOT_HUB_SIZE / 2
export const ROOT_HUB_DIAMETER = ROOT_HUB_SIZE

export const ROOT_ORBIT_ATTACH_SLACK = 48
export const ROOT_ORBIT_DETACH_SLACK = 64

export { ROOT_ORBIT_TIER_RADIUS, ROOT_HUB_RIM_PAD }

export function normalizeRootOrbitTier(value: unknown): RootOrbitTier | null {
  if (value === 1 || value === 2 || value === 3) return value
  if (value === '1' || value === '2' || value === '3') return Number(value) as RootOrbitTier
  return null
}

export function isOnRootOrbit(data: PassiveNodeData): boolean {
  return normalizeRootOrbitTier(data.rootOrbitTier) != null
}

/**
 * Read-only Inspector label for Root Orbit membership.
 * Slot is stored 0-based and shown 1-based.
 */
export function formatRootOrbitMembership(data: PassiveNodeData): string {
  const tier = normalizeRootOrbitTier(data.rootOrbitTier)
  if (tier == null) return 'Not on Root Orbit.'
  const slot = normalizeRootOrbitSlot(data.rootOrbitSlot)
  const slotText = slot != null ? `슬롯 ${slot + 1}` : '슬롯 —'
  return `${tier}단 · ${slotText}`
}

export function rootOrbitTierRadius(tier: RootOrbitTier): number {
  return ROOT_ORBIT_TIER_RADIUS[tier]
}

/** Pick nearest internal ring for a distance from Root center. */
export function inferRootOrbitTier(dist: number): RootOrbitTier {
  let best: RootOrbitTier = 1
  let bestErr = Infinity
  for (const tier of [1, 2, 3] as const) {
    const err = Math.abs(dist - ROOT_ORBIT_TIER_RADIUS[tier])
    if (err < bestErr) {
      bestErr = err
      best = tier
    }
  }
  return best
}

export function getRootOrbitMembers(
  nodes: PassiveFlowNode[],
  tier?: RootOrbitTier,
): PassiveFlowNode[] {
  return nodes.filter((node) => {
    const data = node.data as PassiveNodeData
    if (!isValidRootOrbitMemberKind(data.kind)) return false
    const t = normalizeRootOrbitTier(data.rootOrbitTier)
    if (t == null) return false
    return tier == null ? true : t === tier
  })
}

export const DEFAULT_ROOT_ORBIT_CAPACITY = 6
export const DEFAULT_ROOT_ORBIT_START_ANGLE = -90
export const MIN_ROOT_ORBIT_CAPACITY = 1
export const MAX_ROOT_ORBIT_CAPACITY = 24

function rootNodeData(nodes: PassiveFlowNode[]): PassiveNodeData | null {
  const root = nodes.find((n) => n.id === INITIAL_NODE_ID)
  return root ? (root.data as PassiveNodeData) : null
}

export function getRootOrbitCapacity(
  rootData: PassiveNodeData | null | undefined,
  tier: RootOrbitTier,
): number {
  const raw = rootData?.rootOrbitCapacityByTier?.[tier]
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(
      MIN_ROOT_ORBIT_CAPACITY,
      Math.min(MAX_ROOT_ORBIT_CAPACITY, Math.floor(raw)),
    )
  }
  return DEFAULT_ROOT_ORBIT_CAPACITY
}

export function getRootOrbitStartAngle(
  rootData: PassiveNodeData | null | undefined,
  tier: RootOrbitTier,
): number {
  const raw = rootData?.rootOrbitStartAngleByTier?.[tier]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return DEFAULT_ROOT_ORBIT_START_ANGLE
}

export function setRootOrbitCapacity(
  data: PassiveNodeData,
  tier: RootOrbitTier,
  capacity: number,
): PassiveNodeData {
  const next = Math.max(
    MIN_ROOT_ORBIT_CAPACITY,
    Math.min(MAX_ROOT_ORBIT_CAPACITY, Math.floor(capacity)),
  )
  return {
    ...data,
    rootOrbitCapacityByTier: {
      ...(data.rootOrbitCapacityByTier ?? {}),
      [tier]: next,
    },
  }
}

export function setRootOrbitStartAngle(
  data: PassiveNodeData,
  tier: RootOrbitTier,
  degrees: number,
): PassiveNodeData {
  return {
    ...data,
    rootOrbitStartAngleByTier: {
      ...(data.rootOrbitStartAngleByTier ?? {}),
      [tier]: degrees,
    },
  }
}

export function normalizeRootOrbitSlot(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const slot = Math.floor(value)
  return slot < 0 ? null : slot
}

export function rootOrbitAngleDegrees(
  startAngle: number,
  slot: number,
  capacity: number,
): number {
  const cap = Math.max(1, capacity)
  return startAngle + (360 * slot) / cap
}

function angularDistanceDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

export function occupiedRootOrbitSlots(
  nodes: PassiveFlowNode[],
  tier: RootOrbitTier,
  exceptId?: string,
): Set<number> {
  const occupied = new Set<number>()
  for (const node of nodes) {
    if (exceptId && node.id === exceptId) continue
    const data = node.data as PassiveNodeData
    if (!isValidRootOrbitMemberKind(data.kind)) continue
    if (normalizeRootOrbitTier(data.rootOrbitTier) !== tier) continue
    const slot = normalizeRootOrbitSlot(data.rootOrbitSlot)
    if (slot != null) occupied.add(slot)
  }
  return occupied
}

export function findNearestFreeRootOrbitSlot(
  nodes: PassiveFlowNode[],
  tier: RootOrbitTier,
  pointerAngleDeg: number,
  exceptId?: string,
): number | null {
  const rootData = rootNodeData(nodes)
  const capacity = getRootOrbitCapacity(rootData, tier)
  const start = getRootOrbitStartAngle(rootData, tier)
  const occupied = occupiedRootOrbitSlots(nodes, tier, exceptId)
  let best: number | null = null
  let bestErr = Infinity
  for (let slot = 0; slot < capacity; slot++) {
    if (occupied.has(slot)) continue
    const angle = rootOrbitAngleDegrees(start, slot, capacity)
    const err = angularDistanceDeg(pointerAngleDeg, angle)
    if (err < bestErr) {
      bestErr = err
      best = slot
    }
  }
  return best
}

/** Assign missing rootOrbitSlot values deterministically (stable by id). */
export function ensureRootOrbitSlotsAssigned(nodes: PassiveFlowNode[]): PassiveFlowNode[] {
  const rootData = rootNodeData(nodes)
  let next = nodes
  for (const tier of [1, 2, 3] as const) {
    const capacity = getRootOrbitCapacity(rootData, tier)
    const members = getRootOrbitMembers(next, tier)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
    const occupied = occupiedRootOrbitSlots(next, tier)
    for (const member of members) {
      const data = member.data as PassiveNodeData
      const existing = normalizeRootOrbitSlot(data.rootOrbitSlot)
      if (existing != null && existing < capacity) {
        occupied.add(existing)
        continue
      }
      let slot: number | null = null
      for (let s = 0; s < capacity; s++) {
        if (!occupied.has(s)) {
          slot = s
          break
        }
      }
      if (slot == null) slot = members.findIndex((m) => m.id === member.id)
      occupied.add(slot)
      next = next.map((node) =>
        node.id === member.id
          ? {
              ...node,
              data: { ...(node.data as PassiveNodeData), rootOrbitSlot: slot! },
            }
          : node,
      )
    }
  }
  return next
}


function topLeftFromCenter(cx: number, cy: number, size: number) {
  return { x: cx - size / 2, y: cy - size / 2 }
}

/** Strip optional Root-orbit membership field. */
export function withoutRootOrbitTier(data: PassiveNodeData): PassiveNodeData {
  if (normalizeRootOrbitTier(data.rootOrbitTier) == null && data.rootOrbitSlot == null) {
    return data
  }
  const { rootOrbitTier: _r, rootOrbitSlot: _s, ...rest } = data
  return rest
}

/** Layout all Root-orbit Notables around world origin (Root center). */
export function layoutRootOrbit(nodes: PassiveFlowNode[]): PassiveFlowNode[] {
  const rootData = rootNodeData(nodes)
  const positions = new Map<string, { x: number; y: number }>()
  for (const tier of [1, 2, 3] as const) {
    const members = getRootOrbitMembers(nodes, tier)
    if (members.length === 0) continue
    const radius = ROOT_ORBIT_TIER_RADIUS[tier]
    const capacity = getRootOrbitCapacity(rootData, tier)
    const start = getRootOrbitStartAngle(rootData, tier)
    for (const member of members) {
      const data = member.data as PassiveNodeData
      const slot = normalizeRootOrbitSlot(data.rootOrbitSlot)
      if (slot == null) continue
      const angleDeg = rootOrbitAngleDegrees(start, slot, capacity)
      const rad = (angleDeg * Math.PI) / 180
      const size = NODE_SIZE[data.kind as 'notable' | 'shard']
      positions.set(
        member.id,
        topLeftFromCenter(Math.cos(rad) * radius, Math.sin(rad) * radius, size),
      )
    }
  }
  if (positions.size === 0) return nodes
  return nodes.map((node) => {
    const next = positions.get(node.id)
    return next ? { ...node, position: next } : node
  })
}

function clearMasteryOrbitFields(
  nodes: PassiveFlowNode[],
  satelliteId: string,
): { nodes: PassiveFlowNode[]; prevMasteryId: string | null } {
  const sat = nodes.find((n) => n.id === satelliteId)
  const prevMasteryId = (sat?.data as PassiveNodeData | undefined)?.masteryId ?? null
  let next = nodes.map((node) => {
    if (node.id !== satelliteId) return node
    const data = node.data as PassiveNodeData
    const { masteryId: _m, orbitTier: _t, orbitSlot: _s, ...rest } = data
    return {
      ...node,
      data: { ...rest, masteryId: null },
    }
  })
  if (prevMasteryId) {
    next = next.map((node) => {
      if (node.id !== prevMasteryId) return node
      const data = node.data as PassiveNodeData
      const scrub = (list?: string[]) => list?.filter((id) => id !== satelliteId)
      return {
        ...node,
        data: {
          ...data,
          orbitOrder: scrub(data.orbitOrder),
          orbitOrderByTier: data.orbitOrderByTier
            ? {
                1: scrub(data.orbitOrderByTier[1]),
                2: scrub(data.orbitOrderByTier[2]),
                3: scrub(data.orbitOrderByTier[3]),
              }
            : data.orbitOrderByTier,
        },
      }
    })
  }
  return { nodes: next, prevMasteryId }
}

/** Attach Notable to Root orbit tier, or null when not allowed. */
export function placeNotableOnRootOrbit(
  nodes: PassiveFlowNode[],
  satelliteId: string,
  preferredTier?: RootOrbitTier,
  preferredSlot?: number,
): PassiveFlowNode[] | null {
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!satellite) return null
  const data = satellite.data as PassiveNodeData
  if (!isValidRootOrbitMemberKind(data.kind)) return null

  const tier = preferredTier ?? 1
  const size = NODE_SIZE[data.kind as 'notable' | 'shard']
  const cx = satellite.position.x + size / 2
  const cy = satellite.position.y + size / 2
  const pointerAngle = (Math.atan2(cy, cx) * 180) / Math.PI
  const slot =
    preferredSlot != null
      ? preferredSlot
      : findNearestFreeRootOrbitSlot(nodes, tier, pointerAngle, satelliteId)
  if (slot == null) return null

  const cleared = clearMasteryOrbitFields(nodes, satelliteId)
  let next = cleared.nodes.map((node) => {
    if (node.id !== satelliteId) return node
    const d = node.data as PassiveNodeData
    return {
      ...node,
      data: {
        ...d,
        masteryId: null,
        rootOrbitTier: tier,
        rootOrbitSlot: slot,
      },
    }
  })
  next = layoutRootOrbit(next)
  if (cleared.prevMasteryId) {
    next = layoutMasteryOrbit(next, cleared.prevMasteryId)
  }
  return next
}

export function clearRootOrbitMembership(
  nodes: PassiveFlowNode[],
  satelliteId: string,
): PassiveFlowNode[] {
  const next = nodes.map((node) => {
    if (node.id !== satelliteId) return node
    const data = node.data as PassiveNodeData
    if (normalizeRootOrbitTier(data.rootOrbitTier) == null) return node
    return { ...node, data: withoutRootOrbitTier(data) }
  })
  return layoutRootOrbit(next)
}

export type RootOrbitDragResult =
  | { kind: 'root'; nodes: PassiveFlowNode[] }
  | { kind: 'detached'; nodes: PassiveFlowNode[] }

/**
 * Drag settle against Root arena (center at world 0,0).
 * Notable only. Returns null when Root orbit should not handle this drop.
 */

/** Gap kept between Root rim and an ejected node's collision radius. */
export const ROOT_BOUNDARY_GAP = 8

export function isClearlyInsideRoot(dist: number, bodyRadius: number): boolean {
  return dist + bodyRadius <= ROOT_HUB_RADIUS
}

export function overlapsRootArena(dist: number, collisionRadius: number): boolean {
  return dist < ROOT_HUB_RADIUS + collisionRadius
}

/** Collision radius used when pushing a node fully outside Root. */
export function rootEjectCollisionRadius(node: PassiveFlowNode): number {
  const data = node.data as PassiveNodeData
  if (isMasteryKind(data.kind)) {
    return masteryOuterOrbitRadius(data) + NODE_SIZE.notable / 2
  }
  return NODE_SIZE[data.kind] / 2
}

/** Radial push-out so center sits at Root radius + collision + gap. */
export function ejectCenterOutsideRoot(
  center: { x: number; y: number },
  collisionRadius: number,
  gap = ROOT_BOUNDARY_GAP,
): { x: number; y: number } {
  const minDist = ROOT_HUB_RADIUS + collisionRadius + gap
  const dist = Math.hypot(center.x, center.y)
  if (dist >= minDist - 1e-6) return center
  if (dist < 1e-6) return { x: minDist, y: 0 }
  const scale = minDist / dist
  return { x: center.x * scale, y: center.y * scale }
}

function shouldExemptFromRootEject(data: PassiveNodeData): boolean {
  if (data.kind === 'initial') return true
  // Root-orbit Shard/Notable members are allowed inside the arena.
  if (
    isValidRootOrbitMemberKind(data.kind) &&
    normalizeRootOrbitTier(data.rootOrbitTier) != null
  ) {
    return true
  }
  // Connected Connects are NOT exempt — eject like any external node.
  // Mastery satellites are kept clear via the parent Mastery hub eject.
  if (data.masteryId) return true
  return false
}

/**
 * Push nodes that partially overlap Root fully outside.
 * When onlyId is set, only that node (plus Mastery orbit relayout) is considered.
 */
export function applyRootBoundaryEject(
  nodes: PassiveFlowNode[],
  onlyId?: string,
): PassiveFlowNode[] {
  let next = nodes
  const affectedMasteries: string[] = []
  for (const node of nodes) {
    if (onlyId && node.id !== onlyId) continue
    const data = node.data as PassiveNodeData
    if (shouldExemptFromRootEject(data)) continue
    const size = NODE_SIZE[data.kind]
    const center = {
      x: node.position.x + size / 2,
      y: node.position.y + size / 2,
    }
    const radius = rootEjectCollisionRadius(node)
    if (!overlapsRootArena(Math.hypot(center.x, center.y), radius)) continue
    const ejected = ejectCenterOutsideRoot(center, radius)
    if (ejected.x === center.x && ejected.y === center.y) continue
    next = next.map((n) =>
      n.id === node.id
        ? {
            ...n,
            position: {
              x: ejected.x - size / 2,
              y: ejected.y - size / 2,
            },
          }
        : n,
    )
    if (isMasteryKind(data.kind)) affectedMasteries.push(node.id)
  }
  for (const masteryId of affectedMasteries) {
    next = layoutMasteryOrbit(next, masteryId)
  }
  return next
}

export function placeNotableFromRootOrbitDrag(
  nodes: PassiveFlowNode[],
  satelliteId: string,
  pointerTopLeft: { x: number; y: number },
): RootOrbitDragResult | null {
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!satellite) return null
  const data = satellite.data as PassiveNodeData
  if (!isValidRootOrbitMemberKind(data.kind)) return null

  const size = NODE_SIZE[data.kind as 'notable' | 'shard']
  const bodyR = size / 2
  const cx = pointerTopLeft.x + size / 2
  const cy = pointerTopLeft.y + size / 2
  const dist = Math.hypot(cx, cy)
  const wasOnRoot = normalizeRootOrbitTier(data.rootOrbitTier) != null
  const clearlyInside = isClearlyInsideRoot(dist, bodyR)
  const overlaps = overlapsRootArena(dist, bodyR)
  const pointerAngle = (Math.atan2(cy, cx) * 180) / Math.PI

  // Clear inside → nearest tier + nearest free slot (no free slot → eject).
  if (clearlyInside) {
    const tier = inferRootOrbitTier(dist)
    const slot = findNearestFreeRootOrbitSlot(nodes, tier, pointerAngle, satelliteId)
    if (slot == null) {
      const ejected = ejectCenterOutsideRoot({ x: cx, y: cy }, bodyR)
      const topLeft = { x: ejected.x - size / 2, y: ejected.y - size / 2 }
      const base = wasOnRoot ? clearRootOrbitMembership(nodes, satelliteId) : nodes
      return {
        kind: 'detached',
        nodes: base.map((node) =>
          node.id === satelliteId ? { ...node, position: topLeft } : node,
        ),
      }
    }
    const withPointer = nodes.map((node) =>
      node.id === satelliteId ? { ...node, position: pointerTopLeft } : node,
    )
    const next = placeNotableOnRootOrbit(withPointer, satelliteId, tier, slot)
    return next ? { kind: 'root', nodes: next } : null
  }

  // Ambiguous rim overlap → eject fully outside (never auto-attach).
  if (overlaps) {
    const ejected = ejectCenterOutsideRoot({ x: cx, y: cy }, bodyR)
    const topLeft = { x: ejected.x - size / 2, y: ejected.y - size / 2 }
    const base = wasOnRoot ? clearRootOrbitMembership(nodes, satelliteId) : nodes
    return {
      kind: 'detached',
      nodes: base.map((node) =>
        node.id === satelliteId ? { ...node, position: topLeft } : node,
      ),
    }
  }

  // Clearly outside: detach if it was on Root, otherwise leave to other handlers.
  if (wasOnRoot) {
    const cleared = clearRootOrbitMembership(nodes, satelliteId)
    return {
      kind: 'detached',
      nodes: cleared.map((node) =>
        node.id === satelliteId ? { ...node, position: pointerTopLeft } : node,
      ),
    }
  }

  return null
}

/** Root hub must stay fixed at origin top-left. */
export function ensureRootFixed(nodes: PassiveFlowNode[]): PassiveFlowNode[] {
  const half = ROOT_HUB_DIAMETER / 2
  return nodes.map((node) => {
    if (node.id !== INITIAL_NODE_ID) return node
    return {
      ...node,
      position: { x: -half, y: -half },
      draggable: false,
    }
  })
}

/** CSS percent diameter for an internal orbit ring (tier radius / hub radius × 100). */
export function rootOrbitRingPercent(tier: RootOrbitTier): number {
  return (ROOT_ORBIT_TIER_RADIUS[tier] / ROOT_HUB_RADIUS) * 100
}

export function isValidRootOrbitMemberKind(kind: string): boolean {
  return kind === 'notable' || kind === 'shard'
}

/** No global Root-orbit Notable hard cap — only spacing/tier geometry. */
export function rootOrbitHasGlobalHardCap(): boolean {
  return false
}

/** Clear Root-orbit field when a satellite binds to a Mastery orbit. */
export function stripRootOrbitWhenMasteryBound(nodes: PassiveFlowNode[]): PassiveFlowNode[] {
  let changed = false
  const next = nodes.map((node) => {
    const data = node.data as PassiveNodeData
    if (!data.masteryId || normalizeRootOrbitTier(data.rootOrbitTier) == null) return node
    changed = true
    return { ...node, data: withoutRootOrbitTier(data) }
  })
  return changed ? layoutRootOrbit(next) : nodes
}

/**
 * Drop Power Core edges whose other endpoint is not a Root Orbit Shard/Notable.
 * Call after orbit detach, kind change, or mastery bind that clears membership.
 */
export function stripInvalidRootPowerEdges(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.filter((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return false
    const sd = source.data as PassiveNodeData
    const td = target.data as PassiveNodeData
    const rootIsSource = sd.kind === 'initial'
    const rootIsTarget = td.kind === 'initial'
    if (!rootIsSource && !rootIsTarget) return true

    // Runtime Power Core edges are Root → member with sourceHandle root-power only.
    if (!rootIsSource || !isRootPowerHandle(edge.sourceHandle)) return true

    const od = target.data as PassiveNodeData
    return isValidRootOrbitMemberKind(od.kind) && isOnRootOrbit(od)
  })
}

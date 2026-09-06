import type { PassiveNodeData } from './types'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
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
    if (data.kind !== 'notable') return false
    const t = normalizeRootOrbitTier(data.rootOrbitTier)
    if (t == null) return false
    return tier == null ? true : t === tier
  })
}

function topLeftFromCenter(cx: number, cy: number, size: number) {
  return { x: cx - size / 2, y: cy - size / 2 }
}

/** Strip optional Root-orbit membership field. */
export function withoutRootOrbitTier(data: PassiveNodeData): PassiveNodeData {
  if (normalizeRootOrbitTier(data.rootOrbitTier) == null) return data
  const { rootOrbitTier: _r, ...rest } = data
  return rest
}

/** Layout all Root-orbit Notables around world origin (Root center). */
export function layoutRootOrbit(nodes: PassiveFlowNode[]): PassiveFlowNode[] {
  const byTier: Record<RootOrbitTier, PassiveFlowNode[]> = { 1: [], 2: [], 3: [] }
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (data.kind !== 'notable') continue
    const tier = normalizeRootOrbitTier(data.rootOrbitTier)
    if (tier == null) continue
    byTier[tier].push(node)
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const tier of [1, 2, 3] as const) {
    const members = byTier[tier]
    if (members.length === 0) continue
    const radius = ROOT_ORBIT_TIER_RADIUS[tier]
    const start = (-90 * Math.PI) / 180
    members.forEach((member, index) => {
      const angle = start + (index * 2 * Math.PI) / members.length
      const size = NODE_SIZE.notable
      positions.set(
        member.id,
        topLeftFromCenter(Math.cos(angle) * radius, Math.sin(angle) * radius, size),
      )
    })
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
): PassiveFlowNode[] | null {
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!satellite) return null
  const data = satellite.data as PassiveNodeData
  if (data.kind !== 'notable') return null

  const tier = preferredTier ?? 1
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
  // Root-orbit Notables are allowed inside the arena.
  if (data.kind === 'notable' && normalizeRootOrbitTier(data.rootOrbitTier) != null) return true
  // Socketed Connects sit on the rim by design.
  if (data.kind === 'connect' && data.initialSlot != null) return true
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
  if (data.kind !== 'notable') return null

  const size = NODE_SIZE.notable
  const bodyR = size / 2
  const cx = pointerTopLeft.x + size / 2
  const cy = pointerTopLeft.y + size / 2
  const dist = Math.hypot(cx, cy)
  const wasOnRoot = normalizeRootOrbitTier(data.rootOrbitTier) != null
  const clearlyInside = isClearlyInsideRoot(dist, bodyR)
  const overlaps = overlapsRootArena(dist, bodyR)

  // Clear inside → attach to nearest Root orbit tier.
  if (clearlyInside) {
    const tier = inferRootOrbitTier(dist)
    const next = placeNotableOnRootOrbit(nodes, satelliteId, tier)
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
  return kind === 'notable'
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

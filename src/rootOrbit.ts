import type { PassiveNodeData } from './types'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  NODE_SIZE,
  ROOT_HUB_SIZE,
  ROOT_HUB_RIM_PAD,
  ROOT_ORBIT_TIER_RADIUS,
  layoutMasteryOrbit,
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
  const cx = pointerTopLeft.x + size / 2
  const cy = pointerTopLeft.y + size / 2
  const dist = Math.hypot(cx, cy)
  const wasOnRoot = normalizeRootOrbitTier(data.rootOrbitTier) != null

  if (dist <= ROOT_HUB_RADIUS + ROOT_ORBIT_ATTACH_SLACK) {
    const tier = inferRootOrbitTier(dist)
    const next = placeNotableOnRootOrbit(nodes, satelliteId, tier)
    return next ? { kind: 'root', nodes: next } : null
  }

  if (wasOnRoot && dist > ROOT_HUB_RADIUS + ROOT_ORBIT_DETACH_SLACK) {
    const cleared = clearRootOrbitMembership(nodes, satelliteId)
    return {
      kind: 'detached',
      nodes: cleared.map((node) =>
        node.id === satelliteId ? { ...node, position: pointerTopLeft } : node,
      ),
    }
  }

  if (wasOnRoot) {
    const next = placeNotableOnRootOrbit(
      nodes,
      satelliteId,
      normalizeRootOrbitTier(data.rootOrbitTier) ?? 1,
    )
    return next ? { kind: 'root', nodes: next } : null
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

/** CSS percent radius for drawing an internal orbit ring inside the Root hub. */
export function rootOrbitRingPercent(tier: RootOrbitTier): number {
  return (ROOT_ORBIT_TIER_RADIUS[tier] / ROOT_HUB_RADIUS) * 50
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

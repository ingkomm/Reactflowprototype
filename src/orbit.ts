import type { PassiveKind, PassiveNodeData } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'

export const NODE_SIZE: Record<PassiveKind, number> = {
  small: 48,
  notable: 68,
  mastery: 76,
}

export const DEFAULT_ORBIT_RADIUS = 180
/** Degrees. -90 = top of the circle; layout advances clockwise. */
export const DEFAULT_ORBIT_START_ANGLE = -90
export const ORBIT_ANGLE_STEP = 30

export function isSatelliteKind(kind: PassiveKind) {
  return kind === 'small' || kind === 'notable'
}

export function snapOrbitAngle(degrees: number) {
  const stepped = Math.round(degrees / ORBIT_ANGLE_STEP) * ORBIT_ANGLE_STEP
  // Normalize to (-180, 180]
  let n = ((stepped + 180) % 360 + 360) % 360 - 180
  if (n === -180) n = 180
  return n
}

export function orbitAngleOptions() {
  const options: number[] = []
  for (let deg = -180; deg <= 150; deg += ORBIT_ANGLE_STEP) {
    options.push(deg)
  }
  return options
}

export function nodeCenter(node: PassiveFlowNode) {
  const size = NODE_SIZE[(node.data as PassiveNodeData).kind]
  return {
    x: node.position.x + size / 2,
    y: node.position.y + size / 2,
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
    return data.masteryId === masteryId && isSatelliteKind(data.kind)
  })
}

/** Resolve clockwise order from mastery.orbitOrder, appending any missing satellites. */
export function getOrderedOrbitSatellites(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return []

  const data = mastery.data as PassiveNodeData
  const satellites = getOrbitSatellites(nodes, masteryId)
  const byId = new Map(satellites.map((s) => [s.id, s]))
  const ordered: PassiveFlowNode[] = []

  for (const id of data.orbitOrder ?? []) {
    const sat = byId.get(id)
    if (sat) {
      ordered.push(sat)
      byId.delete(id)
    }
  }
  for (const sat of byId.values()) {
    ordered.push(sat)
  }
  return ordered
}

export function syncOrbitOrder(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const ordered = getOrderedOrbitSatellites(nodes, masteryId)
  const orderIds = ordered.map((s) => s.id)

  return nodes.map((node) => {
    if (node.id !== masteryId) return node
    const data = node.data as PassiveNodeData
    const prev = data.orbitOrder ?? []
    if (
      prev.length === orderIds.length &&
      prev.every((id, i) => id === orderIds[i])
    ) {
      return node
    }
    return { ...node, data: { ...data, orbitOrder: orderIds } }
  })
}

/** Place satellites evenly on a circular orbit around the mastery center. */
export function layoutMasteryOrbit(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const synced = syncOrbitOrder(nodes, masteryId)
  const mastery = synced.find((n) => n.id === masteryId)
  if (!mastery || (mastery.data as PassiveNodeData).kind !== 'mastery') {
    return synced
  }

  const data = mastery.data as PassiveNodeData
  const radius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const startDeg = data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE
  const startRad = (startDeg * Math.PI) / 180
  const center = nodeCenter(mastery)
  const satellites = getOrderedOrbitSatellites(synced, masteryId)

  if (satellites.length === 0) {
    return synced
  }

  const positioned = new Map<string, { x: number; y: number }>()
  satellites.forEach((sat, index) => {
    // Screen Y grows downward, so increasing angle from start is clockwise.
    const angle = startRad + (2 * Math.PI * index) / satellites.length
    const kind = (sat.data as PassiveNodeData).kind
    positioned.set(
      sat.id,
      positionFromCenter(
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle),
        kind,
      ),
    )
  })

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

export function withMasteryDragFlags(
  nodes: PassiveFlowNode[],
  selectedId: string | null = null,
): PassiveFlowNode[] {
  return nodes.map((node) => {
    const data = node.data as PassiveNodeData
    // Mastery orbits are large; keep them under satellite titles/links visually.
    const baseZ = data.kind === 'mastery' ? 1 : 6
    return {
      ...node,
      draggable: true,
      zIndex: node.id === selectedId ? 40 : baseZ,
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
    if (data.kind === 'mastery') affectedMasteries.add(node.id)
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
      if (data.kind === 'mastery') {
        const pruned = (data.orbitOrder ?? []).filter((id) => !ids.has(id))
        if (pruned.length !== (data.orbitOrder ?? []).length) {
          affectedMasteries.add(node.id)
          return { ...node, data: { ...data, orbitOrder: pruned } }
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

export function distanceBetweenCenters(a: PassiveFlowNode, b: PassiveFlowNode) {
  const ca = nodeCenter(a)
  const cb = nodeCenter(b)
  return Math.hypot(ca.x - cb.x, ca.y - cb.y)
}

/** Nearest mastery by center distance. */
export function findNearestMastery(nodes: PassiveFlowNode[], satellite: PassiveFlowNode) {
  let best: { mastery: PassiveFlowNode; dist: number; radius: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (data.kind !== 'mastery') continue
    const dist = distanceBetweenCenters(satellite, node)
    const radius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
    if (!best || dist < best.dist) {
      best = { mastery: node, dist, radius }
    }
  }
  return best
}

/** Insert satellite into clockwise orbit order using drop angle around mastery. */
export function orbitOrderByDropAngle(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
): string[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return [satelliteId]

  const mc = nodeCenter(mastery)
  const start =
    (((mastery.data as PassiveNodeData).orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE) * Math.PI) /
    180

  const norm = (angle: number) => {
    let rel = angle - start
    while (rel < 0) rel += Math.PI * 2
    while (rel >= Math.PI * 2) rel -= Math.PI * 2
    return rel
  }

  const others = getOrderedOrbitSatellites(nodes, masteryId).filter((s) => s.id !== satelliteId)
  const items = [
    ...others.map((o) => {
      const c = nodeCenter(o)
      return { id: o.id, rel: norm(Math.atan2(c.y - mc.y, c.x - mc.x)) }
    }),
    (() => {
      const c = nodeCenter(satellite)
      return { id: satelliteId, rel: norm(Math.atan2(c.y - mc.y, c.x - mc.x)) }
    })(),
  ]
  items.sort((a, b) => a.rel - b.rel)
  return items.map((i) => i.id)
}

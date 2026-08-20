import type { PassiveKind, PassiveNodeData } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'

export const NODE_SIZE: Record<PassiveKind, number> = {
  small: 72,
  notable: 104,
  mastery: 112,
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
      draggable: false,
    }
  })
}

export function withMasteryDragFlags(nodes: PassiveFlowNode[]): PassiveFlowNode[] {
  return nodes.map((node) => {
    const data = node.data as PassiveNodeData
    const lockedToOrbit = Boolean(data.masteryId) && isSatelliteKind(data.kind)
    return {
      ...node,
      draggable: !lockedToOrbit,
    }
  })
}

export function totalTrainingCount(trainings: { count: number }[]) {
  return trainings.reduce((sum, t) => sum + (Number.isFinite(t.count) ? t.count : 0), 0)
}

export function trainingProgressLabel(total: number) {
  const rem = total % 3
  const filled = rem === 0 && total > 0 ? 3 : rem
  return `${filled}/3`
}

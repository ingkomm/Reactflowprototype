import type { PassiveKind, PassiveNodeData } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'

export const NODE_SIZE: Record<PassiveKind, number> = {
  small: 72,
  notable: 104,
  mastery: 112,
}

export const DEFAULT_ORBIT_RADIUS = 180

export function isSatelliteKind(kind: PassiveKind) {
  return kind === 'small' || kind === 'notable'
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

/** Place satellites evenly on a circular orbit around the mastery center. */
export function layoutMasteryOrbit(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery || (mastery.data as PassiveNodeData).kind !== 'mastery') {
    return nodes
  }

  const data = mastery.data as PassiveNodeData
  const radius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const center = nodeCenter(mastery)

  const satellites = nodes.filter(
    (n) => (n.data as PassiveNodeData).masteryId === masteryId && isSatelliteKind((n.data as PassiveNodeData).kind),
  )

  if (satellites.length === 0) {
    return nodes
  }

  const positioned = new Map<string, { x: number; y: number }>()
  satellites.forEach((sat, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / satellites.length
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

  return nodes.map((node) => {
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

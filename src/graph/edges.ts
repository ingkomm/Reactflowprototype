import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from '../components/PassiveNode'
import { isMasteryKind, isOrbitMemberKind } from '../kinds'
import { classifyPassiveConnection, pruneEdgesReachableFromInitial } from '../power'
import type { PassiveNodeData } from '../types'

export function passiveLinkEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `link-${sourceId}-${targetId}`,
    type: 'center',
    source: sourceId,
    target: targetId,
    sourceHandle: 'center',
    targetHandle: 'center-target',
  }
}

export function notableLinkEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `notable-${sourceId}-${targetId}`,
    type: 'notable',
    source: sourceId,
    target: targetId,
    sourceHandle: 'center',
    targetHandle: 'center-target',
    zIndex: 0,
  }
}

export function orbitLinkEdge(sourceId: string, targetId: string, masteryId: string): Edge {
  return {
    id: `orbit-${sourceId}-${targetId}`,
    type: 'orbit',
    source: sourceId,
    target: targetId,
    data: { masteryId },
    zIndex: 1,
  }
}

/** Clockwise ring links between adjacent ids in `order`. */
export function orbitAdjacentEdges(order: string[], masteryId: string): Edge[] {
  if (order.length < 2) return []
  return order.map((id, i) => {
    const next = order[(i + 1) % order.length]!
    return orbitLinkEdge(id, next, masteryId)
  })
}

export function findLinkEdge(
  edges: Edge[],
  a: string,
  b: string,
  type?: 'center' | 'orbit' | 'notable',
) {
  return edges.find((e) => {
    if (type && e.type !== type) return false
    return (e.source === a && e.target === b) || (e.source === b && e.target === a)
  })
}

export function resolveMasteryPair(
  source: PassiveFlowNode,
  target: PassiveFlowNode,
): { mastery: PassiveFlowNode; satellite: PassiveFlowNode } | null {
  const sourceData = source.data as PassiveNodeData
  const targetData = target.data as PassiveNodeData

  if (isMasteryKind(sourceData.kind) && isOrbitMemberKind(targetData.kind)) {
    return { mastery: source, satellite: target }
  }
  if (isMasteryKind(targetData.kind) && isOrbitMemberKind(sourceData.kind)) {
    return { mastery: target, satellite: source }
  }
  return null
}

export function pruneInvalidEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return edges.filter((e) => {
    const source = nodes.find((n) => n.id === e.source)
    const target = nodes.find((n) => n.id === e.target)
    if (!source || !target) return false
    const linkKind = classifyPassiveConnection(source, target, nodes)
    if (e.type === 'orbit') return linkKind === 'orbit'
    if (e.type === 'notable') return linkKind === 'notable'
    return linkKind === 'center'
  })
}

export function sanitizeEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return pruneEdgesReachableFromInitial(nodes, pruneInvalidEdges(nodes, edges))
}

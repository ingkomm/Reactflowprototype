import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { PassiveNodeData } from './types'
import { getOrderedOrbitSatellites, isSatelliteKind, shareSameOrbit } from './orbit'

export type LinkKind = 'center' | 'orbit'

export function edgeLinkKind(edge: Edge): LinkKind {
  return edge.type === 'orbit' ? 'orbit' : 'center'
}

function isInitial(data: PassiveNodeData) {
  return data.kind === 'initial'
}

function isMastery(data: PassiveNodeData) {
  return data.kind === 'mastery'
}

function findCenterEdge(edges: Edge[], a: string, b: string) {
  return edges.find(
    (e) =>
      edgeLinkKind(e) === 'center' &&
      ((e.source === a && e.target === b) || (e.source === b && e.target === a)),
  )
}

/** POB-style power: Initial → center/orbit links; Mastery ← powered Notable + center link. */
export function computePoweredNodeIds(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const powered = new Set<string>()

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (isInitial(data)) powered.add(node.id)
  }

  let changed = true
  while (changed) {
    changed = false
      for (const edge of edges) {
      const kind = edgeLinkKind(edge)
      if (kind !== 'center' && kind !== 'orbit') continue

      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) continue
      const sd = source.data as PassiveNodeData
      const td = target.data as PassiveNodeData

      for (const [from, , to] of [
        [source, sd, target] as const,
        [target, td, source] as const,
      ]) {
        if (!powered.has(from.id)) continue
        const toData = to.data as PassiveNodeData
        if (isMastery(toData)) continue
        if (!powered.has(to.id)) {
          powered.add(to.id)
          changed = true
        }
      }
    }
  }

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMastery(data)) continue
    const satellites = getOrderedOrbitSatellites(nodes, node.id)
    for (const sat of satellites) {
      const satData = sat.data as PassiveNodeData
      if (satData.kind !== 'notable') continue
      if (!powered.has(sat.id)) continue
      if (findCenterEdge(edges, node.id, sat.id)) {
        powered.add(node.id)
        break
      }
    }
  }

  return powered
}

export function isEdgePowered(
  edge: Edge,
  powered: Set<string>,
): boolean {
  return powered.has(edge.source) && powered.has(edge.target)
}

/** Whether a new center/orbit link is allowed between two nodes. */
export function classifyPassiveConnection(
  source: PassiveFlowNode,
  target: PassiveFlowNode,
  _nodes: PassiveFlowNode[],
  areAdjacent: (masteryId: string, a: string, b: string) => boolean,
): LinkKind | 'attach' | null {
  if (source.id === target.id) return null

  const sd = source.data as PassiveNodeData
  const td = target.data as PassiveNodeData

  if (isInitial(sd) || isInitial(td)) {
    const other = isInitial(sd) ? td : sd
    if (other.kind === 'small') return 'center'
    return null
  }

  if (
    (sd.kind === 'notable' && isMastery(td)) ||
    (isMastery(sd) && td.kind === 'notable')
  ) {
    const notable = sd.kind === 'notable' ? sd : td
    const mastery = isMastery(sd) ? source : target
    const notableNode = sd.kind === 'notable' ? source : target
    if (notable.masteryId === mastery.id) return 'center'
    void notableNode
    return null
  }

  if (isMastery(sd) && (td.kind === 'small' || td.kind === 'notable')) {
    return 'attach'
  }
  if (isMastery(td) && (sd.kind === 'small' || sd.kind === 'notable')) {
    return 'attach'
  }

  // Notable ↔ Notable direct links are never allowed.
  if (sd.kind === 'notable' && td.kind === 'notable') return null

  if (
    shareSameOrbit({ data: sd }, { data: td }) &&
    isSatelliteKind(sd.kind) &&
    isSatelliteKind(td.kind)
  ) {
    const masteryId = sd.masteryId!
    if (areAdjacent(masteryId, source.id, target.id)) return 'orbit'
    return null
  }

  // Off-orbit / cross-orbit: straight center links (orbit-internal stays arc-only above).
  if (!shareSameOrbit({ data: sd }, { data: td })) {
    if (sd.kind === 'small' && td.kind === 'small') return 'center'
    if (
      (sd.kind === 'small' && td.kind === 'notable') ||
      (sd.kind === 'notable' && td.kind === 'small')
    ) {
      return 'center'
    }
  }

  return null
}

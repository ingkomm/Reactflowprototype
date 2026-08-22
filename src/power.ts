import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { PassiveNodeData } from './types'
import { isStageComplete } from './stage'
import {
  getOrderedOrbitSatellites,
  canOrbitLink,
  isMasteryKind,
  isOrbitMemberKind,
  isSatelliteKind,
  isStealthPassiveKind,
  shareSameOrbit,
} from './orbit'

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

function isStealth(data: PassiveNodeData) {
  return isStealthPassiveKind(data.kind)
}

/** At least one stage band must be complete before power flows onward. */
export function canTransmitPower(data: PassiveNodeData): boolean {
  if (data.kind === 'initial') return true
  if (isStealth(data)) return false
  if (data.stages.length === 0) return false
  return data.stages.some(isStageComplete)
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

      for (const [from, fromData, to] of [
        [source, sd, target] as const,
        [target, td, source] as const,
      ]) {
        if (!powered.has(from.id)) continue
        if (!canTransmitPower(fromData)) continue
        const toData = to.data as PassiveNodeData
        if (isMastery(toData)) continue
        if (isStealth(toData)) continue
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
      if (!canTransmitPower(satData)) continue
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

/** Nodes reachable from any Initial node via center/orbit links. */
export function getNodesReachableFromInitial(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): Set<string> {
  const reachable = new Set<string>()
  const queue: string[] = []

  for (const node of nodes) {
    if ((node.data as PassiveNodeData).kind === 'initial') {
      reachable.add(node.id)
      queue.push(node.id)
    }
  }

  const adj = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (edge.type !== 'center' && edge.type !== 'orbit' && edge.type) continue
    for (const [a, b] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ] as const) {
      if (!adj.has(a)) adj.set(a, new Set())
      adj.get(a)!.add(b)
    }
  }

  while (queue.length > 0) {
    const id = queue.pop()!
    for (const next of adj.get(id) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next)
        queue.push(next)
      }
    }
  }

  return reachable
}

/** Drop links whose endpoints are not both reachable from Initial. */
export function pruneEdgesReachableFromInitial(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): Edge[] {
  const reachable = getNodesReachableFromInitial(nodes, edges)
  if (reachable.size === 0) return []
  return edges.filter((e) => reachable.has(e.source) && reachable.has(e.target))
}

/** Whether a new center/orbit link is allowed between two nodes. */
export function classifyPassiveConnection(
  source: PassiveFlowNode,
  target: PassiveFlowNode,
  nodes: PassiveFlowNode[],
): LinkKind | 'attach' | null {
  if (source.id === target.id) return null

  const sd = source.data as PassiveNodeData
  const td = target.data as PassiveNodeData

  if (isStealth(sd) || isStealth(td)) return null

  if (isInitial(sd) || isInitial(td)) {
    const other = isInitial(sd) ? td : sd
    if (other.kind === 'small') return 'center'
    return null
  }

  if (
    (sd.kind === 'notable' && isMasteryKind(td.kind) && td.kind === 'mastery') ||
    (isMasteryKind(sd.kind) && sd.kind === 'mastery' && td.kind === 'notable')
  ) {
    const notable = sd.kind === 'notable' ? sd : td
    const mastery = sd.kind === 'mastery' ? source : target
    if (notable.masteryId === mastery.id) return 'center'
    return null
  }

  if (isMasteryKind(sd.kind) && isOrbitMemberKind(td.kind)) {
    return 'attach'
  }
  if (isMasteryKind(td.kind) && isOrbitMemberKind(sd.kind)) {
    return 'attach'
  }

  if (sd.kind === 'notable' && td.kind === 'notable') return null

  if (
    shareSameOrbit({ data: sd }, { data: td }) &&
    isSatelliteKind(sd.kind) &&
    isSatelliteKind(td.kind)
  ) {
    const masteryId = sd.masteryId!
    if (canOrbitLink(nodes, masteryId, source.id, target.id)) return 'orbit'
    return null
  }

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

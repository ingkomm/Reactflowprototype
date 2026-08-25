import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { PassiveNodeData } from './types'
import { NODE_SIZE, isConnectKind, isMasteryKind, isOrbitMemberKind, isSatelliteKind } from './kinds'
import { canNotableTransmit, kindUsesTrainingBands } from './stage'
import {
  getOrderedOrbitSatellites,
  canOrbitLink,
  shareSameOrbit,
} from './orbit'

export type LinkKind = 'center' | 'orbit' | 'notable'

export function edgeLinkKind(edge: Edge): LinkKind {
  if (edge.type === 'orbit') return 'orbit'
  if (edge.type === 'notable') return 'notable'
  return 'center'
}

function isInitial(data: PassiveNodeData) {
  return data.kind === 'initial'
}

function isConnectEnabled(data: PassiveNodeData) {
  return data.connectEnabled !== false
}

/**
 * Whether a powered node may push power across a link.
 * - Initial: always (root source)
 * - Connect: when On
 * - Small: when powered
 * - Notable: first cumulative band (3) complete
 */
export function canTransmitPower(data: PassiveNodeData): boolean {
  if (isInitial(data)) return true
  if (isConnectKind(data.kind)) return isConnectEnabled(data)
  if (data.kind === 'small') return true
  if (isMasteryKind(data.kind)) return false
  if (kindUsesTrainingBands(data.kind)) return canNotableTransmit(data.stages ?? [])
  return false
}

/** Power: Initial → Connect → graph; Mastery ← powered transmitting satellite on orbit. */
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
        if (isMasteryKind(toData.kind)) continue
        if (!powered.has(to.id)) {
          powered.add(to.id)
          changed = true
        }
      }
    }
  }

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind)) continue
    const satellites = getOrderedOrbitSatellites(nodes, node.id)
    for (const sat of satellites) {
      const satData = sat.data as PassiveNodeData
      if (!powered.has(sat.id)) continue
      if (!canTransmitPower(satData)) continue
      powered.add(node.id)
      break
    }
  }

  return powered
}

export type PowerFlowMeta = {
  /** Hop distance from Initial along the power propagation path. */
  depth: Map<string, number>
  /** Node id that powered this node (toward Initial). */
  parent: Map<string, string>
}

/** Depth/parent tree mirroring {@link computePoweredNodeIds} propagation. */
export function computePowerFlowMeta(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): PowerFlowMeta {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depth = new Map<string, number>()
  const parent = new Map<string, string>()

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (isInitial(data)) {
      depth.set(node.id, 0)
    }
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
        if (!depth.has(from.id)) continue
        if (!canTransmitPower(fromData)) continue
        const toData = to.data as PassiveNodeData
        if (isMasteryKind(toData.kind)) continue
        if (!depth.has(to.id)) {
          depth.set(to.id, depth.get(from.id)! + 1)
          parent.set(to.id, from.id)
          changed = true
        }
      }
    }
  }

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind)) continue
    const satellites = getOrderedOrbitSatellites(nodes, node.id)
    for (const sat of satellites) {
      const satData = sat.data as PassiveNodeData
      if (!depth.has(sat.id)) continue
      if (!canTransmitPower(satData)) continue
      const nextDepth = depth.get(sat.id)! + 1
      if (!depth.has(node.id) || nextDepth > depth.get(node.id)!) {
        depth.set(node.id, nextDepth)
        parent.set(node.id, sat.id)
      }
      break
    }
  }

  return { depth, parent }
}

/** Near-Initial → far-from-Initial orientation for powered link visuals. */
export function resolvePowerFlowDirection(
  aId: string,
  bId: string,
  { depth, parent }: PowerFlowMeta,
): { fromId: string; toId: string } {
  if (parent.get(aId) === bId) return { fromId: bId, toId: aId }
  if (parent.get(bId) === aId) return { fromId: aId, toId: bId }

  const da = depth.get(aId)
  const db = depth.get(bId)
  if (da != null && db != null && da !== db) {
    return da < db ? { fromId: aId, toId: bId } : { fromId: bId, toId: aId }
  }

  return aId <= bId ? { fromId: aId, toId: bId } : { fromId: bId, toId: aId }
}

type Point = { x: number; y: number }

/** Map power-flow from/to ids to beam/flare coordinates and target node radius. */
export function orientPowerLinkVisual(
  sourceId: string,
  targetId: string,
  sourcePt: Point,
  targetPt: Point,
  sd: PassiveNodeData,
  td: PassiveNodeData,
  flowMeta: PowerFlowMeta,
) {
  const { fromId, toId } = resolvePowerFlowDirection(sourceId, targetId, flowMeta)
  const fromPt = fromId === sourceId ? sourcePt : targetPt
  const toPt = toId === sourceId ? sourcePt : targetPt
  const toData = toId === sourceId ? sd : td
  return {
    sx: fromPt.x,
    sy: fromPt.y,
    tx: toPt.x,
    ty: toPt.y,
    targetFlareR: NODE_SIZE[toData.kind] / 2,
  }
}

/** Nodes reachable from any Initial node via center/orbit links. */
export function getNodesReachableFromInitial(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): Set<string> {
  const reachable = new Set<string>()
  const queue: string[] = []

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (isInitial(data)) {
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
  const nodeIds = new Set(nodes.map((n) => n.id))
  if (reachable.size === 0) return edges.filter((e) => e.type === 'notable' && nodeIds.has(e.source) && nodeIds.has(e.target))
  return edges.filter((e) => {
    if (e.type === 'notable') {
      return nodeIds.has(e.source) && nodeIds.has(e.target)
    }
    return reachable.has(e.source) && reachable.has(e.target)
  })
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

  if (isInitial(sd) || isInitial(td)) {
    const other = isInitial(sd) ? td : sd
    if (isConnectKind(other.kind)) return 'center'
    return null
  }

  if (isMasteryKind(sd.kind) && isOrbitMemberKind(td.kind)) {
    return 'attach'
  }
  if (isMasteryKind(td.kind) && isOrbitMemberKind(sd.kind)) {
    return 'attach'
  }
  if (isMasteryKind(sd.kind) || isMasteryKind(td.kind)) {
    return null
  }

  if (sd.kind === 'notable' && td.kind === 'notable') return 'notable'

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
    if (isConnectKind(sd.kind) && isConnectKind(td.kind)) return 'center'
    if (isConnectKind(sd.kind) && (td.kind === 'small' || td.kind === 'notable')) return 'center'
    if (isConnectKind(td.kind) && (sd.kind === 'small' || sd.kind === 'notable')) return 'center'
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

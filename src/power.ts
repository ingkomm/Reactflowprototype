import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { PassiveNodeData } from './types'
import { NODE_SIZE } from './orbit'
import { canNotableTransmit, kindUsesTrainingBands } from './stage'
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

function isConnectEnabled(data: PassiveNodeData) {
  return data.kind !== 'initial' || data.connectEnabled !== false
}

function isMastery(data: PassiveNodeData) {
  return data.kind === 'mastery' || data.kind === 'voidMastery'
}

function isStealth(data: PassiveNodeData) {
  return isStealthPassiveKind(data.kind)
}

/**
 * Whether a powered node may push power across a link.
 * - Initial / Small (Connect): always, when powered
 * - Notable: first cumulative band (3) complete
 * - Mastery / Void: never (Mastery has no personal outbound links)
 */
export function canTransmitPower(data: PassiveNodeData): boolean {
  if (data.kind === 'initial') return isConnectEnabled(data)
  if (data.kind === 'small') return true
  if (isStealth(data) || isMastery(data)) return false
  if (kindUsesTrainingBands(data.kind)) return canNotableTransmit(data.stages ?? [])
  return false
}

/** POB-style power: Initial/Connect → center/orbit; Mastery ← powered transmitting satellite on orbit (no personal link). */
export function computePoweredNodeIds(
  nodes: PassiveFlowNode[],
  edges: Edge[],
): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const powered = new Set<string>()

  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (isInitial(data) && isConnectEnabled(data)) powered.add(node.id)
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
      if (isStealth(satData)) continue
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
    if (isInitial(data) && isConnectEnabled(data)) {
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
        if (isMastery(toData)) continue
        if (isStealth(toData)) continue
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
    if (!isMastery(data)) continue
    const satellites = getOrderedOrbitSatellites(nodes, node.id)
    for (const sat of satellites) {
      const satData = sat.data as PassiveNodeData
      if (isStealth(satData)) continue
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
    const data = node.data as PassiveNodeData
    if (isInitial(data) && isConnectEnabled(data)) {
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

  // Mastery has no personal center links — only orbit attach / satellite orbit links.
  if (isMasteryKind(sd.kind) && isOrbitMemberKind(td.kind)) {
    return 'attach'
  }
  if (isMasteryKind(td.kind) && isOrbitMemberKind(sd.kind)) {
    return 'attach'
  }
  if (isMasteryKind(sd.kind) || isMasteryKind(td.kind)) {
    return null
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

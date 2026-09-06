/**
 * Shared Root geometry for persisted edges and connection drag preview.
 * Root body is never an endpoint — only Power Core / rim sockets / orbit paths.
 */
import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  isRootPowerHandle,
  parseRootSocketHandle,
  rootPowerFlowPosition,
  rootSocketFlowPosition,
} from './initialHub'
import { NODE_SIZE } from './orbit'
import {
  isOnRootOrbit,
  isValidRootOrbitMemberKind,
  normalizeRootOrbitTier,
  rootOrbitTierRadius,
  type RootOrbitTier,
} from './rootOrbit'
import type { PassiveNodeData } from './types'
import { INITIAL_NODE_ID } from './types'

export type FlowPoint = { x: number; y: number }

export function rootCenterFlowPosition(rootTopLeft: FlowPoint): FlowPoint {
  return rootPowerFlowPosition(rootTopLeft)
}

export function nodeFlowCenter(
  topLeft: FlowPoint,
  size: number,
): FlowPoint {
  return { x: topLeft.x + size / 2, y: topLeft.y + size / 2 }
}

export function flowPointAngleRad(center: FlowPoint, point: FlowPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x)
}

export function polarFlowPoint(center: FlowPoint, radius: number, angleRad: number): FlowPoint {
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad),
  }
}

/** Normalize delta into (-π, π]. */
export function shortestAngleDelta(fromRad: number, toRad: number): number {
  let d = toRad - fromRad
  while (d <= -Math.PI) d += Math.PI * 2
  while (d > Math.PI) d -= Math.PI * 2
  return d
}

export function svgArcPath(
  center: FlowPoint,
  radius: number,
  a0: number,
  a1: number,
): string {
  const delta = shortestAngleDelta(a0, a1)
  const end = a0 + delta
  const large = Math.abs(delta) > Math.PI ? 1 : 0
  const sweep = delta >= 0 ? 1 : 0
  const p0 = polarFlowPoint(center, radius, a0)
  const p1 = polarFlowPoint(center, radius, end)
  return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${large} ${sweep} ${p1.x} ${p1.y}`
}

export function svgStraightPath(a: FlowPoint, b: FlowPoint): string {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
}

/**
 * Resolve a Root-aware connection endpoint.
 * Root: only root-power or socket-N — never hub-center fallback for unknown handles.
 * Non-Root: node center (or provided fallback).
 */
export function resolveRootAwareEndpoint(args: {
  kind: PassiveNodeData['kind']
  nodeTopLeft: FlowPoint
  handleId: string | null | undefined
  measuredSize?: number
  fallbackPoint?: FlowPoint | null
}): FlowPoint | null {
  const { kind, nodeTopLeft, handleId, measuredSize, fallbackPoint } = args
  if (kind === 'initial') {
    if (isRootPowerHandle(handleId)) {
      return rootPowerFlowPosition(nodeTopLeft)
    }
    return rootSocketFlowPosition(nodeTopLeft, handleId)
  }
  if (fallbackPoint) return fallbackPoint
  const size = measuredSize ?? NODE_SIZE[kind] ?? NODE_SIZE.shard
  return nodeFlowCenter(nodeTopLeft, size)
}

export function isRootOrbitMemberData(data: PassiveNodeData): boolean {
  return isValidRootOrbitMemberKind(data.kind) && isOnRootOrbit(data)
}

/** True when a center edge between these nodes should use Root Orbit geometry. */
export function isRootOrbitMemberLink(
  sourceData: PassiveNodeData,
  targetData: PassiveNodeData,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): boolean {
  if (isRootPowerHandle(sourceHandle) || isRootPowerHandle(targetHandle)) return false
  if (sourceData.kind === 'initial' || targetData.kind === 'initial') return false
  return isRootOrbitMemberData(sourceData) && isRootOrbitMemberData(targetData)
}

export type RootLinkPathResult = {
  pathD: string
  start: FlowPoint
  end: FlowPoint
  mode: 'straight' | 'same-tier-arc' | 'cross-tier'
}

const ARC_ENDPOINT_TRIM_RAD = 0.12

export function buildSameTierRootOrbitArcPath(
  rootCenter: FlowPoint,
  tier: RootOrbitTier,
  sourceCenter: FlowPoint,
  targetCenter: FlowPoint,
): RootLinkPathResult {
  const radius = rootOrbitTierRadius(tier)
  let a0 = flowPointAngleRad(rootCenter, sourceCenter)
  let a1 = flowPointAngleRad(rootCenter, targetCenter)
  const delta = shortestAngleDelta(a0, a1)
  const trim = Math.min(ARC_ENDPOINT_TRIM_RAD, Math.abs(delta) / 3)
  if (delta >= 0) {
    a0 += trim
    a1 = a0 + (delta - trim * 2)
  } else {
    a0 -= trim
    a1 = a0 + (delta + trim * 2)
  }
  const start = polarFlowPoint(rootCenter, radius, a0)
  const end = polarFlowPoint(rootCenter, radius, a1)
  return {
    pathD: svgArcPath(rootCenter, radius, a0, a1),
    start,
    end,
    mode: 'same-tier-arc',
  }
}

/**
 * Cross-tier Root Orbit path: radial to mid radius → short arc → radial to target tier.
 * Avoids a bare chord through Root center.
 */
export function buildCrossTierRootOrbitPath(
  rootCenter: FlowPoint,
  sourceTier: RootOrbitTier,
  targetTier: RootOrbitTier,
  sourceCenter: FlowPoint,
  targetCenter: FlowPoint,
): RootLinkPathResult {
  const r0 = rootOrbitTierRadius(sourceTier)
  const r1 = rootOrbitTierRadius(targetTier)
  const rMid = (r0 + r1) / 2
  const a0 = flowPointAngleRad(rootCenter, sourceCenter)
  const a1 = flowPointAngleRad(rootCenter, targetCenter)
  const p0 = polarFlowPoint(rootCenter, r0, a0)
  const mid0 = polarFlowPoint(rootCenter, rMid, a0)
  const p1 = polarFlowPoint(rootCenter, r1, a1)
  const arc = svgArcPath(rootCenter, rMid, a0, a1).replace(/^M[^A]+/, '')
  const pathD = `M ${p0.x} ${p0.y} L ${mid0.x} ${mid0.y} ${arc} L ${p1.x} ${p1.y}`
  return {
    pathD,
    start: p0,
    end: p1,
    mode: 'cross-tier',
  }
}

export function buildRootOrbitMemberLinkPath(args: {
  rootCenter: FlowPoint
  sourceData: PassiveNodeData
  targetData: PassiveNodeData
  sourceCenter: FlowPoint
  targetCenter: FlowPoint
}): RootLinkPathResult | null {
  const tierA = normalizeRootOrbitTier(args.sourceData.rootOrbitTier)
  const tierB = normalizeRootOrbitTier(args.targetData.rootOrbitTier)
  if (tierA == null || tierB == null) return null
  if (tierA === tierB) {
    return buildSameTierRootOrbitArcPath(
      args.rootCenter,
      tierA,
      args.sourceCenter,
      args.targetCenter,
    )
  }
  return buildCrossTierRootOrbitPath(
    args.rootCenter,
    tierA,
    tierB,
    args.sourceCenter,
    args.targetCenter,
  )
}

export function findRootFlowNode(nodes: Array<{ id: string }>): { id: string } | undefined {
  return nodes.find((n) => n.id === INITIAL_NODE_ID)
}

/** Preview start/end equality helper for Root socket / Power Core. */
export function rootHandleFlowPosition(
  rootTopLeft: FlowPoint,
  handleId: string | null | undefined,
): FlowPoint | null {
  return resolveRootAwareEndpoint({
    kind: 'initial',
    nodeTopLeft: rootTopLeft,
    handleId,
  })
}

export function parseRootSocketSlot(handleId: string | null | undefined) {
  return parseRootSocketHandle(handleId)
}

/** Edges that participate in Root↔Connect socket occupancy. */
export function isRootConnectEdge(
  edge: Edge,
  rootId: string = INITIAL_NODE_ID,
): boolean {
  return (
    (edge.source === rootId && parseRootSocketHandle(edge.sourceHandle) != null) ||
    (edge.target === rootId && parseRootSocketHandle(edge.targetHandle) != null)
  )
}

export function getRootConnectSlotFromEdge(
  edge: Edge,
  rootId: string = INITIAL_NODE_ID,
): ReturnType<typeof parseRootSocketHandle> {
  if (edge.source === rootId) return parseRootSocketHandle(edge.sourceHandle)
  if (edge.target === rootId) return parseRootSocketHandle(edge.targetHandle)
  return null
}

export function findRootConnectEdgeForSlot(
  edges: Edge[],
  slot: number,
  rootId: string = INITIAL_NODE_ID,
  exceptConnectId?: string,
): Edge | undefined {
  return edges.find((edge) => {
    const edgeSlot = getRootConnectSlotFromEdge(edge, rootId)
    if (edgeSlot !== slot) return false
    const connectId = edge.source === rootId ? edge.target : edge.source
    if (exceptConnectId && connectId === exceptConnectId) return false
    return true
  })
}

export function getRootConnectSlotForNode(
  edges: Edge[],
  connectId: string,
  rootId: string = INITIAL_NODE_ID,
): ReturnType<typeof parseRootSocketHandle> {
  for (const edge of edges) {
    const pair =
      (edge.source === rootId && edge.target === connectId) ||
      (edge.source === connectId && edge.target === rootId)
    if (!pair) continue
    return getRootConnectSlotFromEdge(edge, rootId)
  }
  return null
}

export function isRootSocketOccupied(
  edges: Edge[],
  slot: number,
  rootId: string = INITIAL_NODE_ID,
  exceptConnectId?: string,
): boolean {
  return findRootConnectEdgeForSlot(edges, slot, rootId, exceptConnectId) != null
}

/**
 * Derive Connect.initialSlot from authoritative Root↔Connect edges.
 * Clears initialSlot when no Root socket edge exists.
 */
export function syncConnectInitialSlotsFromEdges(
  nodes: PassiveFlowNode[],
  edges: Edge[],
  rootId: string = INITIAL_NODE_ID,
): PassiveFlowNode[] {
  return nodes.map((node) => {
    const data = node.data as PassiveNodeData
    if (data.kind !== 'connect') return node
    const slot = getRootConnectSlotForNode(edges, node.id, rootId)
    if (slot == null) {
      if (data.initialSlot == null) return node
      const { initialSlot: _removed, ...rest } = data
      return { ...node, data: rest as PassiveNodeData }
    }
    if (data.initialSlot === slot) return node
    return { ...node, data: { ...data, initialSlot: slot } }
  })
}

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
import { NODE_SIZE, nodeLinkTrimRadius } from './orbit'
import {
  computeOrbitRingLinkSpec,
  orbitEndpointAngularTrim,
  type OrbitRingLinkSpec,
} from './orbitLinkGeometry'
import {
  getRootOrbitCapacity,
  getRootOrbitMembers,
  getRootOrbitStartAngle,
  isOnRootOrbit,
  isValidRootOrbitMemberKind,
  normalizeRootOrbitSlot,
  normalizeRootOrbitTier,
  rootOrbitAngleDegrees,
  rootOrbitTierRadius,
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

/**
 * Root Orbit member↔member link geometry — same rules as Mastery `orbitLinkSpec`
 * (same tier → arc, cross tier → chord). Only data sources differ.
 */
export function rootOrbitLinkSpec(
  nodes: PassiveFlowNode[],
  sourceId: string,
  targetId: string,
  options?: {
    sourcePowered?: boolean
    targetPowered?: boolean
    sourceHandle?: string | null
    targetHandle?: string | null
  },
): OrbitRingLinkSpec | null {
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!source || !target) return null

  const sd = source.data as PassiveNodeData
  const td = target.data as PassiveNodeData
  if (!isRootOrbitMemberLink(sd, td, options?.sourceHandle, options?.targetHandle)) {
    return null
  }

  const root = nodes.find((n) => n.id === INITIAL_NODE_ID)
  if (!root) return null
  const rootData = root.data as PassiveNodeData

  const tierA = normalizeRootOrbitTier(sd.rootOrbitTier)
  const tierB = normalizeRootOrbitTier(td.rootOrbitTier)
  if (tierA == null || tierB == null) return null

  if (tierA !== tierB) return { kind: 'chord' }

  const capacity = getRootOrbitCapacity(rootData, tierA)
  const slotA = normalizeRootOrbitSlot(sd.rootOrbitSlot)
  const slotB = normalizeRootOrbitSlot(td.rootOrbitSlot)
  if (slotA == null || slotB == null || slotA === slotB) return { kind: 'chord' }

  const occupied = new Set<number>()
  for (const member of getRootOrbitMembers(nodes, tierA)) {
    if (member.id === sourceId || member.id === targetId) continue
    const slot = normalizeRootOrbitSlot((member.data as PassiveNodeData).rootOrbitSlot)
    if (slot != null) occupied.add(slot)
  }

  const startDeg = getRootOrbitStartAngle(rootData, tierA)
  const orbitR = rootOrbitTierRadius(tierA)
  const angleARad = (rootOrbitAngleDegrees(startDeg, slotA, capacity) * Math.PI) / 180
  const angleBRad = (rootOrbitAngleDegrees(startDeg, slotB, capacity) * Math.PI) / 180
  const trimARad = orbitEndpointAngularTrim(
    nodeLinkTrimRadius(sd, options?.sourcePowered ?? false) + 2,
    orbitR,
  )
  const trimBRad = orbitEndpointAngularTrim(
    nodeLinkTrimRadius(td, options?.targetPowered ?? false) + 2,
    orbitR,
  )

  return computeOrbitRingLinkSpec({
    sameTier: true,
    capacity,
    slotA,
    slotB,
    occupiedSlots: occupied,
    angleARad,
    angleBRad,
    arcRadius: orbitR,
    trimARad,
    trimBRad,
  })
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

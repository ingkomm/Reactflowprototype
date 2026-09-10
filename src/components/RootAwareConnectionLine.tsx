import type { ConnectionLineComponentProps } from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import { NODE_SIZE } from '../orbit'
import { resolveRootAwareEndpoint, type FlowPoint } from '../rootGeometry'

function internalTopLeft(node: {
  internals: { positionAbsolute: { x: number; y: number } }
}): FlowPoint {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
  }
}

/**
 * Connection drag preview that shares Root endpoint resolution with CenterEdge.
 * Root socket / Power Core previews start at the exact handle — never hub center.
 */
export function RootAwareConnectionLine({
  fromNode,
  fromHandle,
  fromX,
  fromY,
  toNode,
  toHandle,
  toX,
  toY,
  connectionLineStyle,
}: ConnectionLineComponentProps) {
  const fromData = fromNode.data as PassiveNodeData
  const fromPoint =
    resolveRootAwareEndpoint({
      kind: fromData.kind,
      nodeTopLeft: internalTopLeft(fromNode),
      handleId: fromHandle?.id,
      measuredSize: fromNode.measured.width ?? NODE_SIZE[fromData.kind],
      fallbackPoint: { x: fromX, y: fromY },
    }) ?? { x: fromX, y: fromY }

  let toPoint: FlowPoint = { x: toX, y: toY }
  if (toNode && toHandle) {
    const toData = toNode.data as PassiveNodeData
    const resolved = resolveRootAwareEndpoint({
      kind: toData.kind,
      nodeTopLeft: internalTopLeft(toNode),
      handleId: toHandle.id,
      measuredSize: toNode.measured.width ?? NODE_SIZE[toData.kind],
      fallbackPoint: { x: toX, y: toY },
    })
    if (resolved) toPoint = resolved
  }

  return (
    <g className="react-flow__connection">
      <path
        fill="none"
        className="react-flow__connection-path"
        d={`M ${fromPoint.x},${fromPoint.y} L ${toPoint.x},${toPoint.y}`}
        style={connectionLineStyle}
      />
    </g>
  )
}

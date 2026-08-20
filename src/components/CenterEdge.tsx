import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'

export type CenterFlowEdge = Edge<Record<string, never>, 'center'>

/** Straight edge that always meets each node's geometric center. */
export function CenterEdge({
  id,
  source,
  target,
  style,
  interactionWidth = 24,
  selected,
}: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) {
    return null
  }

  const sourceX =
    sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2
  const sourceY =
    sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2
  const targetX =
    targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2
  const targetY =
    targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2

  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        ...style,
        strokeWidth: selected ? 3 : (style?.strokeWidth as number | undefined) ?? 2,
        cursor: 'pointer',
      }}
      interactionWidth={interactionWidth}
    />
  )
}

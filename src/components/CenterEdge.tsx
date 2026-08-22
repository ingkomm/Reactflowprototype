import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { usePowerSet } from '../PowerContext'

export type CenterFlowEdge = Edge<Record<string, never>, 'center'>

/** Match quiet node/orbit edge: cool gray at low contrast. */
const LINK_STROKE = 'color-mix(in srgb, #9aa8b5 22%, transparent)'
const LINK_STROKE_SELECTED = 'color-mix(in srgb, #9aa8b5 38%, transparent)'
const LINK_STROKE_POWERED = 'color-mix(in srgb, #9aa8b5 42%, transparent)'
const LINK_STROKE_POWERED_SELECTED = 'color-mix(in srgb, #c5d0da 55%, transparent)'
const LINK_WIDTH = 1
/** Half-gap between the two parallel solid strokes. */
const DOUBLE_OFFSET = 2

/** Straight solid double-line edge through each node's geometric center. */
export function CenterEdge({
  id,
  source,
  target,
  interactionWidth = 28,
  selected,
}: EdgeProps) {
  const powered = usePowerSet()
  const lit = powered.has(source) && powered.has(target)
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

  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * DOUBLE_OFFSET
  const oy = (dx / len) * DOUBLE_OFFSET

  const [pathA] = getStraightPath({
    sourceX: sourceX + ox,
    sourceY: sourceY + oy,
    targetX: targetX + ox,
    targetY: targetY + oy,
  })
  const [pathB] = getStraightPath({
    sourceX: sourceX - ox,
    sourceY: sourceY - oy,
    targetX: targetX - ox,
    targetY: targetY - oy,
  })

  const stroke = lit
    ? selected
      ? LINK_STROKE_POWERED_SELECTED
      : LINK_STROKE_POWERED
    : selected
      ? LINK_STROKE_SELECTED
      : LINK_STROKE
  const lineStyle = {
    stroke,
    strokeWidth: LINK_WIDTH,
    cursor: 'pointer' as const,
  }

  return (
    <>
      <BaseEdge
        id={`${id}-hit`}
        path={getStraightPath({ sourceX, sourceY, targetX, targetY })[0]}
        style={{ stroke: 'transparent', strokeWidth: 1 }}
        interactionWidth={interactionWidth}
      />
      <BaseEdge id={`${id}-a`} path={pathA} style={lineStyle} interactionWidth={0} />
      <BaseEdge id={`${id}-b`} path={pathB} style={lineStyle} interactionWidth={0} />
    </>
  )
}

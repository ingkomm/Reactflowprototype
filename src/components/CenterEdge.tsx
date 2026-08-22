import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import {
  CROSS_ORBIT_GLOW_COLOR,
  isSameOrbitNotableMasteryLink,
  linkEndpointPad,
  poweredLinkGlowStyle,
  trimStraightEndpoints,
} from '../orbit'
import { usePassiveClasses } from '../PassiveClassContext'
import { usePowerSet } from '../PowerContext'

export type CenterFlowEdge = Edge<Record<string, unknown>, 'center'>

const LINK_STROKE = 'color-mix(in srgb, #9aa8b5 22%, transparent)'
const LINK_STROKE_SELECTED = 'color-mix(in srgb, #9aa8b5 38%, transparent)'
const LINK_WIDTH = 1
const DOUBLE_OFFSET = 2

export function CenterEdge({
  id,
  source,
  target,
  interactionWidth = 28,
  selected,
}: EdgeProps) {
  const powered = usePowerSet()
  const { resolve } = usePassiveClasses()
  const lit = powered.has(source) && powered.has(target)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) {
    return null
  }

  const sd = sourceNode.data as PassiveNodeData
  const td = targetNode.data as PassiveNodeData
  const notableMastery = isSameOrbitNotableMasteryLink(sd, td, source, target)

  const sourceCX =
    sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2
  const sourceCY =
    sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2
  const targetCX =
    targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2
  const targetCY =
    targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2

  const trimEndpoints = lit || notableMastery
  const { sourceX, sourceY, targetX, targetY } = trimEndpoints
    ? trimStraightEndpoints(
        sourceCX,
        sourceCY,
        targetCX,
        targetCY,
        linkEndpointPad(sd),
        linkEndpointPad(td),
      )
    : { sourceX: sourceCX, sourceY: sourceCY, targetX: targetCX, targetY: targetCY }

  const hitPath = getStraightPath({ sourceX: sourceCX, sourceY: sourceCY, targetX: targetCX, targetY: targetCY })[0]

  if (lit) {
    const masteryData = sd.kind === 'mastery' ? sd : td.kind === 'mastery' ? td : null
    const glowColor =
      notableMastery && masteryData
        ? resolve(masteryData.classId, 'mastery').iconColor
        : CROSS_ORBIT_GLOW_COLOR
    const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
    return (
      <>
        <BaseEdge
          id={`${id}-hit`}
          path={hitPath}
          style={{ stroke: 'transparent', strokeWidth: 1 }}
          interactionWidth={interactionWidth}
        />
        <BaseEdge
          id={id}
          path={path}
          style={poweredLinkGlowStyle(glowColor, Boolean(selected))}
          interactionWidth={0}
        />
      </>
    )
  }

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

  const stroke = selected ? LINK_STROKE_SELECTED : LINK_STROKE
  const lineStyle = {
    stroke,
    strokeWidth: LINK_WIDTH,
    cursor: 'pointer' as const,
  }

  return (
    <>
      <BaseEdge
        id={`${id}-hit`}
        path={hitPath}
        style={{ stroke: 'transparent', strokeWidth: 1 }}
        interactionWidth={interactionWidth}
      />
      <BaseEdge id={`${id}-a`} path={pathA} style={lineStyle} interactionWidth={0} />
      <BaseEdge id={`${id}-b`} path={pathB} style={lineStyle} interactionWidth={0} />
    </>
  )
}

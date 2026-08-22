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
  linkEndpointPad,
  linkGlowStyle,
  trimStraightEndpoints,
} from '../orbit'
import { usePowerSet } from '../PowerContext'

export type CenterFlowEdge = Edge<Record<string, unknown>, 'center'>

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

  const sd = sourceNode.data as PassiveNodeData
  const td = targetNode.data as PassiveNodeData

  const sourceCX =
    sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2
  const sourceCY =
    sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2
  const targetCX =
    targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2
  const targetCY =
    targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2

  const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
    sourceCX,
    sourceCY,
    targetCX,
    targetCY,
    linkEndpointPad(sd),
    linkEndpointPad(td),
  )

  const hitPath = getStraightPath({
    sourceX: sourceCX,
    sourceY: sourceCY,
    targetX: targetCX,
    targetY: targetCY,
  })[0]
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
        style={linkGlowStyle(CROSS_ORBIT_GLOW_COLOR, Boolean(selected), lit)}
        interactionWidth={0}
      />
    </>
  )
}

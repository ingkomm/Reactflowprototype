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
  NODE_SIZE,
  trimStraightEndpoints,
} from '../orbit'
import { usePowerSet } from '../PowerContext'
import { PoweredLinkVisual } from './PoweredLinkVisual'

export type CenterFlowEdge = Edge<Record<string, unknown>, 'center'>

export function CenterEdge({
  id,
  source,
  target,
  interactionWidth = 28,
  selected,
}: EdgeProps) {
  const powered = usePowerSet()
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

  const sourceLit = powered.has(source)
  const targetLit = powered.has(target)
  const lit = sourceLit && targetLit

  const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
    sourceCX,
    sourceCY,
    targetCX,
    targetCY,
    linkEndpointPad(sd, sourceLit),
    linkEndpointPad(td, targetLit),
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
      {lit ? (
        <PoweredLinkVisual
          id={id}
          pathD={path}
          sx={sourceX}
          sy={sourceY}
          tx={targetX}
          ty={targetY}
          sourceFlareR={NODE_SIZE[sd.kind] / 2}
          targetFlareR={NODE_SIZE[td.kind] / 2}
          selected={Boolean(selected)}
        />
      ) : (
        <BaseEdge
          id={id}
          path={path}
          style={linkGlowStyle(CROSS_ORBIT_GLOW_COLOR, Boolean(selected), false)}
          interactionWidth={0}
        />
      )}
    </>
  )
}

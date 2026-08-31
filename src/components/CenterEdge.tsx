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
import { rootSocketFlowPosition } from '../initialHub'
import { usePowerSet, usePowerFlowMeta } from '../PowerContext'
import { orientPowerLinkVisual } from '../power'
import { PoweredLinkVisual } from './PoweredLinkVisual'

export type CenterFlowEdge = Edge<Record<string, unknown>, 'center'>

function nodeCenter(node: NonNullable<ReturnType<typeof useInternalNode>>) {
  return {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
  }
}

function endpointForNode(
  node: NonNullable<ReturnType<typeof useInternalNode>>,
  data: PassiveNodeData,
  handleId: string | null | undefined,
  rfX: number | undefined,
  rfY: number | undefined,
) {
  if (data.kind === 'initial') {
    const socket = rootSocketFlowPosition(node.internals.positionAbsolute, handleId)
    if (socket) return socket
  }
  if (typeof rfX === 'number' && typeof rfY === 'number') {
    return { x: rfX, y: rfY }
  }
  return nodeCenter(node)
}

export function CenterEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  interactionWidth = 28,
  selected,
}: EdgeProps) {
  const powered = usePowerSet()
  const flowMeta = usePowerFlowMeta()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) {
    return null
  }

  const sd = sourceNode.data as PassiveNodeData
  const td = targetNode.data as PassiveNodeData

  const sourcePt = endpointForNode(sourceNode, sd, sourceHandleId, sourceX, sourceY)
  const targetPt = endpointForNode(targetNode, td, targetHandleId, targetX, targetY)

  const sourceLit = powered.has(source)
  const targetLit = powered.has(target)
  const lit = sourceLit && targetLit

  const sourcePad =
    sd.kind === 'initial' ? 2 : linkEndpointPad(sd, sourceLit)
  const targetPad =
    td.kind === 'initial' ? 2 : linkEndpointPad(td, targetLit)

  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = trimStraightEndpoints(
    sourcePt.x,
    sourcePt.y,
    targetPt.x,
    targetPt.y,
    sourcePad,
    targetPad,
  )

  const hitPath = getStraightPath({
    sourceX: sourcePt.x,
    sourceY: sourcePt.y,
    targetX: targetPt.x,
    targetY: targetPt.y,
  })[0]
  const [path] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty })
  const beam = orientPowerLinkVisual(
    source,
    target,
    { x: sx, y: sy },
    { x: tx, y: ty },
    sd,
    td,
    flowMeta,
  )

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
          sx={beam.sx}
          sy={beam.sy}
          tx={beam.tx}
          ty={beam.ty}
          targetFlareR={beam.targetFlareR}
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

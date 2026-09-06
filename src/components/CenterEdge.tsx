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
import { isRootPowerHandle, rootPowerFlowPosition, rootSocketFlowPosition } from '../initialHub'
import { usePowerSet, usePowerFlowMeta } from '../powerContext.shared'
import { orientPowerLinkVisual } from '../power'
import { PoweredLinkVisual } from './PoweredLinkVisual'

export type CenterFlowEdge = Edge<Record<string, unknown>, 'center'>

function nodeCenter(node: NonNullable<ReturnType<typeof useInternalNode>>) {
  return {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
  }
}

/**
 * Root endpoints only via root-power (center) or socket-N (rim).
 * Invalid / missing Root handles resolve to null — never hub-center fallback.
 */
function endpointForNode(
  node: NonNullable<ReturnType<typeof useInternalNode>>,
  data: PassiveNodeData,
  handleId: string | null | undefined,
): { x: number; y: number } | null {
  if (data.kind === 'initial') {
    if (isRootPowerHandle(handleId)) {
      return rootPowerFlowPosition(node.internals.positionAbsolute)
    }
    return rootSocketFlowPosition(node.internals.positionAbsolute, handleId)
  }
  return nodeCenter(node)
}

export function CenterEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
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

  const sourcePt = endpointForNode(sourceNode, sd, sourceHandleId)
  const targetPt = endpointForNode(targetNode, td, targetHandleId)
  if (!sourcePt || !targetPt) {
    return null
  }

  const sourceLit = powered.has(source)
  const targetLit = powered.has(target)
  const lit = sourceLit && targetLit

  const sourcePad = sd.kind === 'initial' ? 2 : linkEndpointPad(sd, sourceLit)
  const targetPad = td.kind === 'initial' ? 2 : linkEndpointPad(td, targetLit)

  const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
    sourcePt.x,
    sourcePt.y,
    targetPt.x,
    targetPt.y,
    sourcePad,
    targetPad,
  )

  // Keep edge hit clear of Root socket / Power Core disks so handles stay interactive.
  const ROOT_HANDLE_HIT_CLEAR_PX = 20
  const hitSource = { ...sourcePt }
  const hitTarget = { ...targetPt }
  const dx = targetPt.x - sourcePt.x
  const dy = targetPt.y - sourcePt.y
  const len = Math.hypot(dx, dy)
  if (len > ROOT_HANDLE_HIT_CLEAR_PX * 2 + 1) {
    const ux = dx / len
    const uy = dy / len
    if (sd.kind === 'initial') {
      hitSource.x = sourcePt.x + ux * ROOT_HANDLE_HIT_CLEAR_PX
      hitSource.y = sourcePt.y + uy * ROOT_HANDLE_HIT_CLEAR_PX
    }
    if (td.kind === 'initial') {
      hitTarget.x = targetPt.x - ux * ROOT_HANDLE_HIT_CLEAR_PX
      hitTarget.y = targetPt.y - uy * ROOT_HANDLE_HIT_CLEAR_PX
    }
  }
  const hitPath = getStraightPath({
    sourceX: hitSource.x,
    sourceY: hitSource.y,
    targetX: hitTarget.x,
    targetY: hitTarget.y,
  })[0]
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const beam = orientPowerLinkVisual(
    source,
    target,
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
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

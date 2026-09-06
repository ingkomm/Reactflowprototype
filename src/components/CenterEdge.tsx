import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  useStore,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import { INITIAL_NODE_ID } from '../types'
import {
  CROSS_ORBIT_GLOW_COLOR,
  linkEndpointPad,
  linkGlowStyle,
  NODE_SIZE,
  trimStraightEndpoints,
} from '../orbit'
import {
  orbitRingArcPathD,
  polarOnOrbit,
} from '../orbitLinkGeometry'
import { usePowerSet, usePowerFlowMeta } from '../powerContext.shared'
import { orientPowerLinkVisual } from '../power'
import { PoweredLinkVisual } from './PoweredLinkVisual'
import type { PassiveFlowNode } from './PassiveNode'
import {
  isRootOrbitMemberLink,
  nodeFlowCenter,
  resolveRootAwareEndpoint,
  rootOrbitLinkSpec,
  type FlowPoint,
} from '../rootGeometry'

export type CenterFlowEdge = Edge<Record<string, unknown>, 'center'>

function absoluteTopLeft(node: NonNullable<ReturnType<typeof useInternalNode>>): FlowPoint {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
  }
}

function endpointForNode(
  node: NonNullable<ReturnType<typeof useInternalNode>>,
  data: PassiveNodeData,
  handleId: string | null | undefined,
): FlowPoint | null {
  return resolveRootAwareEndpoint({
    kind: data.kind,
    nodeTopLeft: absoluteTopLeft(node),
    handleId,
    measuredSize: node.measured.width ?? NODE_SIZE[data.kind],
  })
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
  const nodes = useStore((s) => s.nodes)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const rootNode = useInternalNode(INITIAL_NODE_ID)

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

  const orbitSpec =
    rootNode != null
      ? rootOrbitLinkSpec(nodes as PassiveFlowNode[], source, target, {
          sourcePowered: sourceLit,
          targetPowered: targetLit,
          sourceHandle: sourceHandleId,
          targetHandle: targetHandleId,
        })
      : null

  let path: string
  let hitPath: string
  let beamStart: FlowPoint
  let beamEnd: FlowPoint

  if (orbitSpec?.kind === 'arc' && rootNode) {
    const rootCenter = nodeFlowCenter(
      absoluteTopLeft(rootNode),
      rootNode.measured.width ?? NODE_SIZE.initial,
    )
    path = orbitRingArcPathD(
      rootCenter.x,
      rootCenter.y,
      orbitSpec.arcRadius,
      orbitSpec.a1,
      orbitSpec.a2,
      orbitSpec.clockwise,
    )
    hitPath = path
    beamStart = polarOnOrbit(rootCenter.x, rootCenter.y, orbitSpec.arcRadius, orbitSpec.a1)
    beamEnd = polarOnOrbit(rootCenter.x, rootCenter.y, orbitSpec.arcRadius, orbitSpec.a2)
  } else if (orbitSpec?.kind === 'chord') {
    const sourceCenter = nodeFlowCenter(
      absoluteTopLeft(sourceNode),
      sourceNode.measured.width ?? NODE_SIZE[sd.kind],
    )
    const targetCenter = nodeFlowCenter(
      absoluteTopLeft(targetNode),
      targetNode.measured.width ?? NODE_SIZE[td.kind],
    )
    const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
      sourceCenter.x,
      sourceCenter.y,
      targetCenter.x,
      targetCenter.y,
      linkEndpointPad(sd, sourceLit),
      linkEndpointPad(td, targetLit),
    )
    path = getStraightPath({ sourceX, sourceY, targetX, targetY })[0]
    hitPath = getStraightPath({
      sourceX: sourceCenter.x,
      sourceY: sourceCenter.y,
      targetX: targetCenter.x,
      targetY: targetCenter.y,
    })[0]
    beamStart = { x: sourceX, y: sourceY }
    beamEnd = { x: targetX, y: targetY }
  } else {
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

    // Keep straight-edge hit clear of Root socket / Power Core disks.
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
    hitPath = getStraightPath({
      sourceX: hitSource.x,
      sourceY: hitSource.y,
      targetX: hitTarget.x,
      targetY: hitTarget.y,
    })[0]
    path = getStraightPath({ sourceX, sourceY, targetX, targetY })[0]
    beamStart = { x: sourceX, y: sourceY }
    beamEnd = { x: targetX, y: targetY }
  }

  const beam = orientPowerLinkVisual(
    source,
    target,
    beamStart,
    beamEnd,
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

/** Test helper: Power Core edges stay straight (not orbit-arc classified). */
export function centerEdgeUsesOrbitGeometry(
  sourceData: PassiveNodeData,
  targetData: PassiveNodeData,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): boolean {
  return isRootOrbitMemberLink(sourceData, targetData, sourceHandle, targetHandle)
}

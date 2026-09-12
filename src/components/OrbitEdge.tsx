import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  useStore,
  type EdgeProps,
} from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import type { PassiveFlowNode } from './PassiveNode'
import {
  CROSS_ORBIT_GLOW_COLOR,
  linkEndpointPad,
  linkGlowStyle,
  orbitLinkSpec,
  trimStraightEndpoints,
} from '../orbit'
import { orbitRingArcPathD, polarOnOrbit } from '../orbitLinkGeometry'
import { usePowerSet, usePowerFlowMeta } from '../powerContext.shared'
import { orientPowerLinkVisual } from '../power'
import { PoweredLinkVisual } from './PoweredLinkVisual'

export type OrbitEdgeData = {
  masteryId?: string
}

export function OrbitEdge({
  id,
  source,
  target,
  data,
  selected,
  interactionWidth = 28,
}: EdgeProps) {
  const powered = usePowerSet()
  const flowMeta = usePowerFlowMeta()
  const nodes = useStore((s) => s.nodes)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const sd = sourceNode?.data as PassiveNodeData | undefined
  const td = targetNode?.data as PassiveNodeData | undefined
  const edgeData = data as OrbitEdgeData | undefined
  const masteryId = edgeData?.masteryId ?? sd?.masteryId ?? ''
  const masteryNode = useInternalNode(masteryId)

  if (!sourceNode || !targetNode || !masteryNode || !masteryId || !sd || !td) return null

  const sourceLit = powered.has(source)
  const targetLit = powered.has(target)

  const spec = orbitLinkSpec(nodes as PassiveFlowNode[], masteryId, source, target, {
    sourcePowered: sourceLit,
    targetPowered: targetLit,
  })
  if (!spec) return null

  const lit = sourceLit && targetLit
  const lineStyle = linkGlowStyle(CROSS_ORBIT_GLOW_COLOR, Boolean(selected), false)

  const sourceCX =
    sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2
  const sourceCY =
    sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2
  const targetCX =
    targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2
  const targetCY =
    targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2

  if (spec.kind === 'chord') {
    const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
      sourceCX,
      sourceCY,
      targetCX,
      targetCY,
      linkEndpointPad(sd, sourceLit),
      linkEndpointPad(td, targetLit),
    )
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
    const hitPath = getStraightPath({
      sourceX: sourceCX,
      sourceY: sourceCY,
      targetX: targetCX,
      targetY: targetCY,
    })[0]

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
          <BaseEdge id={id} path={path} style={lineStyle} interactionWidth={0} />
        )}
      </>
    )
  }

  const mc = {
    x: masteryNode.internals.positionAbsolute.x + (masteryNode.measured.width ?? 88) / 2,
    y: masteryNode.internals.positionAbsolute.y + (masteryNode.measured.height ?? 88) / 2,
  }

  const path = orbitRingArcPathD(mc.x, mc.y, spec.arcRadius, spec.a1, spec.a2, spec.clockwise)
  const start = polarOnOrbit(mc.x, mc.y, spec.arcRadius, spec.a1)
  const end = polarOnOrbit(mc.x, mc.y, spec.arcRadius, spec.a2)
  const beam = orientPowerLinkVisual(
    source,
    target,
    start,
    end,
    sd,
    td,
    flowMeta,
  )

  return (
    <>
      <BaseEdge
        id={`${id}-hit`}
        path={path}
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
        <BaseEdge id={id} path={path} style={lineStyle} interactionWidth={0} />
      )}
    </>
  )
}

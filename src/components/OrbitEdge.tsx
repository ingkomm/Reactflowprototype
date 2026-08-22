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
  NODE_SIZE,
  orbitLinkSpec,
  trimStraightEndpoints,
} from '../orbit'
import { usePowerSet } from '../PowerContext'
import { PoweredLinkVisual } from './PoweredLinkVisual'

export type OrbitEdgeData = {
  masteryId?: string
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function orbitArcPath(
  cx: number,
  cy: number,
  r: number,
  a1: number,
  a2: number,
  clockwise: boolean,
) {
  let delta = a2 - a1
  if (clockwise) {
    while (delta <= 0) delta += Math.PI * 2
    while (delta > Math.PI * 2) delta -= Math.PI * 2
  } else {
    while (delta >= 0) delta -= Math.PI * 2
    while (delta < -Math.PI * 2) delta += Math.PI * 2
  }
  const absDelta = Math.abs(delta)
  const useLong = absDelta > Math.PI
  const sweep = clockwise ? 1 : 0
  const p1 = polar(cx, cy, r, a1)
  const p2 = polar(cx, cy, r, a2)
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${useLong ? 1 : 0} ${sweep} ${p2.x} ${p2.y}`
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
            sx={sourceX}
            sy={sourceY}
            tx={targetX}
            ty={targetY}
            sourceFlareR={NODE_SIZE[sd.kind] / 2}
            targetFlareR={NODE_SIZE[td.kind] / 2}
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

  const path = orbitArcPath(mc.x, mc.y, spec.arcRadius, spec.a1, spec.a2, spec.clockwise)
  const start = polar(mc.x, mc.y, spec.arcRadius, spec.a1)
  const end = polar(mc.x, mc.y, spec.arcRadius, spec.a2)

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
          sx={start.x}
          sy={start.y}
          tx={end.x}
          ty={end.y}
          sourceFlareR={NODE_SIZE[sd.kind] / 2}
          targetFlareR={NODE_SIZE[td.kind] / 2}
          selected={Boolean(selected)}
        />
      ) : (
        <BaseEdge id={id} path={path} style={lineStyle} interactionWidth={0} />
      )}
    </>
  )
}

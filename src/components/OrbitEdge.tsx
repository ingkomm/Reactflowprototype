import {
  BaseEdge,
  useInternalNode,
  useStore,
  type EdgeProps,
} from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import type { PassiveFlowNode } from './PassiveNode'
import { CROSS_ORBIT_GLOW_COLOR, orbitAdjacentArcSpec, poweredLinkGlowStyle } from '../orbit'
import { usePowerSet } from '../PowerContext'

export type OrbitEdgeData = {
  masteryId?: string
}

const ORBIT_OFF = 'color-mix(in srgb, #9aa8b5 18%, transparent)'

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
}: EdgeProps) {
  const powered = usePowerSet()
  const nodes = useStore((s) => s.nodes)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const sd = sourceNode?.data as PassiveNodeData | undefined
  const edgeData = data as OrbitEdgeData | undefined
  const masteryId = edgeData?.masteryId ?? sd?.masteryId ?? ''
  const masteryNode = useInternalNode(masteryId)

  if (!sourceNode || !targetNode || !masteryNode || !masteryId) return null

  const arc = orbitAdjacentArcSpec(nodes as PassiveFlowNode[], masteryId, source, target)
  if (!arc) return null

  const mc = {
    x: masteryNode.internals.positionAbsolute.x + (masteryNode.measured.width ?? 76) / 2,
    y: masteryNode.internals.positionAbsolute.y + (masteryNode.measured.height ?? 76) / 2,
  }

  const path = orbitArcPath(mc.x, mc.y, arc.arcRadius, arc.a1, arc.a2, arc.clockwise)

  const lit = powered.has(source) && powered.has(target)

  return (
    <>
      <BaseEdge id={`${id}-hit`} path={path} style={{ stroke: 'transparent', strokeWidth: 14 }} />
      <BaseEdge
        id={id}
        path={path}
        style={
          lit
            ? poweredLinkGlowStyle(CROSS_ORBIT_GLOW_COLOR, Boolean(selected))
            : { stroke: ORBIT_OFF, strokeWidth: 1, cursor: 'pointer' }
        }
        interactionWidth={0}
      />
    </>
  )
}

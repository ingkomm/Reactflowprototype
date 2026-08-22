import {
  BaseEdge,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import { DEFAULT_ORBIT_RADIUS } from '../orbit'
import { usePowerSet } from '../PowerContext'

export type OrbitEdgeData = {
  masteryId?: string
}

const ORBIT_GLOW = 'color-mix(in srgb, #9fe8dd 82%, #eef3f7)'
const ORBIT_OFF = 'color-mix(in srgb, #9aa8b5 18%, transparent)'

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function orbitArcPath(cx: number, cy: number, r: number, a1: number, a2: number) {
  let delta = a2 - a1
  while (delta <= 0) delta += Math.PI * 2
  while (delta > Math.PI * 2) delta -= Math.PI * 2
  const useLong = delta > Math.PI
  const p1 = polar(cx, cy, r, a1)
  const p2 = polar(cx, cy, r, a2)
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${useLong ? 1 : 0} 1 ${p2.x} ${p2.y}`
}

export function OrbitEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps) {
  const powered = usePowerSet()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const sd = sourceNode?.data as PassiveNodeData | undefined
  const edgeData = data as OrbitEdgeData | undefined
  const masteryId = edgeData?.masteryId ?? sd?.masteryId ?? ''
  const masteryNode = useInternalNode(masteryId)

  if (!sourceNode || !targetNode || !masteryNode || !masteryId) return null

  const md = masteryNode.data as PassiveNodeData
  const radius = md.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const mc = {
    x: masteryNode.internals.positionAbsolute.x + (masteryNode.measured.width ?? 76) / 2,
    y: masteryNode.internals.positionAbsolute.y + (masteryNode.measured.height ?? 76) / 2,
  }
  const sc = {
    x: sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2,
    y: sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2,
  }
  const tc = {
    x: targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2,
    y: targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2,
  }

  const path = orbitArcPath(
    mc.x,
    mc.y,
    radius,
    Math.atan2(sc.y - mc.y, sc.x - mc.x),
    Math.atan2(tc.y - mc.y, tc.x - mc.x),
  )

  const lit = powered.has(source) && powered.has(target)
  const stroke = lit ? ORBIT_GLOW : ORBIT_OFF

  return (
    <>
      <BaseEdge id={`${id}-hit`} path={path} style={{ stroke: 'transparent', strokeWidth: 14 }} />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: lit ? (selected ? 3 : 2.5) : 1,
          filter: lit
            ? 'drop-shadow(0 0 8px color-mix(in srgb, #9fe8dd 50%, transparent))'
            : undefined,
          cursor: 'pointer',
        }}
        interactionWidth={0}
      />
    </>
  )
}

import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { NODE_SIZE, trimStraightEndpoints } from '../orbit'

export type NotableFlowEdge = Edge<Record<string, unknown>, 'notable'>

/** Soft, faint straight affinity link — glow and core blend into one haze. */
export function NotableEdge({ id, source, target, interactionWidth = 36, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  const sourceCX =
    sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2
  const sourceCY =
    sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2
  const targetCX =
    targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2
  const targetCY =
    targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2

  const notableR = NODE_SIZE.notable / 2
  const beamWidth = notableR / 2

  const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
    sourceCX,
    sourceCY,
    targetCX,
    targetCY,
    notableR * 0.35,
    notableR * 0.35,
  )

  const hitPath = getStraightPath({
    sourceX: sourceCX,
    sourceY: sourceCY,
    targetX: targetCX,
    targetY: targetCY,
  })[0]
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  const tint = 'color-mix(in srgb, #cfe8e4 8%, transparent)'
  const baseOpacity = selected ? 0.22 : 0.12

  return (
    <>
      <BaseEdge
        id={`${id}-hit`}
        path={hitPath}
        style={{ stroke: 'transparent', strokeWidth: 1 }}
        interactionWidth={interactionWidth}
      />
      {/* Soft outer haze */}
      <BaseEdge
        id={`${id}-haze`}
        path={path}
        style={{
          stroke: tint,
          strokeWidth: beamWidth * 2.4,
          strokeLinecap: 'round',
          opacity: baseOpacity * 0.55,
          filter: 'blur(7px)',
        }}
        interactionWidth={0}
      />
      {/* Mid bloom — blends into haze */}
      <BaseEdge
        id={`${id}-glow`}
        path={path}
        style={{
          stroke: tint,
          strokeWidth: beamWidth * 1.45,
          strokeLinecap: 'round',
          opacity: baseOpacity * 0.85,
          filter: 'blur(3.5px)',
        }}
        interactionWidth={0}
      />
      {/* Soft core — still blurred so it doesn't read as a hard line */}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: tint,
          strokeWidth: beamWidth * 0.85,
          strokeLinecap: 'round',
          opacity: baseOpacity,
          filter: 'blur(1.2px)',
        }}
        interactionWidth={0}
      />
    </>
  )
}

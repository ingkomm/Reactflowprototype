import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { NODE_SIZE, trimStraightEndpoints } from '../orbit'

export type NotableFlowEdge = Edge<Record<string, unknown>, 'notable'>

/** Wide, very faint straight affinity link between two Notable nodes. */
export function NotableEdge({ id, source, target, interactionWidth = 32, selected }: EdgeProps) {
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

  const tint = 'color-mix(in srgb, #cfe8e4 6%, transparent)'

  return (
    <>
      <BaseEdge
        id={`${id}-hit`}
        path={hitPath}
        style={{ stroke: 'transparent', strokeWidth: 1 }}
        interactionWidth={interactionWidth}
      />
      <BaseEdge
        id={`${id}-glow`}
        path={path}
        style={{
          stroke: tint,
          strokeWidth: beamWidth * 2.2,
          strokeLinecap: 'round',
          opacity: selected ? 0.22 : 0.14,
          filter: 'blur(3px)',
        }}
        interactionWidth={0}
      />
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: tint,
          strokeWidth: beamWidth,
          strokeLinecap: 'round',
          opacity: selected ? 0.28 : 0.18,
        }}
        interactionWidth={0}
      />
    </>
  )
}

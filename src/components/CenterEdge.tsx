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
  isSameOrbitNotableMasteryLink,
  linkEndpointPad,
  linkGlowStyle,
  NODE_SIZE,
  trimStraightEndpoints,
} from '../orbit'
import { usePowerSet } from '../PowerContext'
import './CenterEdge.css'

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

  const isMasteryPowerLink = isSameOrbitNotableMasteryLink(sd, td, source, target)

  const notableIsSource = sd.kind === 'notable'
  const notableCX = notableIsSource ? sourceCX : targetCX
  const notableCY = notableIsSource ? sourceCY : targetCY
  const masteryCX = notableIsSource ? targetCX : sourceCX
  const masteryCY = notableIsSource ? targetCY : sourceCY
  const notableData = notableIsSource ? sd : td

  const { sourceX, sourceY, targetX, targetY } = trimStraightEndpoints(
    sourceCX,
    sourceCY,
    targetCX,
    targetCY,
    linkEndpointPad(sd, sourceLit, lit),
    linkEndpointPad(td, targetLit, lit),
  )

  const hitPath = getStraightPath({
    sourceX: sourceCX,
    sourceY: sourceCY,
    targetX: targetCX,
    targetY: targetCY,
  })[0]
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  const beamEnd = trimStraightEndpoints(
    notableCX,
    notableCY,
    masteryCX,
    masteryCY,
    linkEndpointPad(notableData, sourceLit || targetLit, lit),
    NODE_SIZE.mastery / 2 + 2,
  )
  const [beamPath] = getStraightPath({
    sourceX: beamEnd.sourceX,
    sourceY: beamEnd.sourceY,
    targetX: beamEnd.targetX,
    targetY: beamEnd.targetY,
  })

  const masteryR = NODE_SIZE.mastery / 2 + 8
  const gradId = `mastery-beam-${id}`

  return (
    <>
      <BaseEdge
        id={`${id}-hit`}
        path={hitPath}
        style={{ stroke: 'transparent', strokeWidth: 1 }}
        interactionWidth={interactionWidth}
      />
      {isMasteryPowerLink && lit ? (
        <>
          <defs>
            <linearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1={notableCX}
              y1={notableCY}
              x2={masteryCX}
              y2={masteryCY}
            >
              <stop offset="0%" stopColor="#c8fff5" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#9fe8dd" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#3db8a8" stopOpacity="0" />
            </linearGradient>
            <radialGradient
              id={`${gradId}-halo`}
              gradientUnits="userSpaceOnUse"
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 22}
            >
              <stop offset="0%" stopColor="#d4fff8" stopOpacity="0.42" />
              <stop offset="55%" stopColor="#9fe8dd" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#3db8a8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="mastery-stellar-glow" aria-hidden>
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 22}
              fill={`url(#${gradId}-halo)`}
              className="mastery-stellar-glow__halo"
            />
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 16}
              className="mastery-stellar-glow__ring mastery-stellar-glow__ring--c"
            />
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 10}
              className="mastery-stellar-glow__ring mastery-stellar-glow__ring--b"
            />
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 4}
              className="mastery-stellar-glow__ring mastery-stellar-glow__ring--a"
            />
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR}
              className="mastery-stellar-glow__core"
            />
          </g>
          <path
            d={beamPath}
            className="mastery-power-beam"
            stroke={`url(#${gradId})`}
          />
        </>
      ) : (
        <BaseEdge
          id={id}
          path={path}
          style={linkGlowStyle(CROSS_ORBIT_GLOW_COLOR, Boolean(selected), lit)}
          interactionWidth={0}
        />
      )}
    </>
  )
}

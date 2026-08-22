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
    linkEndpointPad(sd),
    linkEndpointPad(td),
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
    linkEndpointPad(notableData),
    NODE_SIZE.mastery / 2 + 2,
  )
  const [beamPath] = getStraightPath({
    sourceX: beamEnd.sourceX,
    sourceY: beamEnd.sourceY,
    targetX: beamEnd.targetX,
    targetY: beamEnd.targetY,
  })

  const masteryR = NODE_SIZE.mastery / 2
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
              <stop offset="0%" stopColor="#b8f5ec" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#9fe8dd" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#7fd4c8" stopOpacity="0" />
            </linearGradient>
            <radialGradient
              id={`${gradId}-flare-outer`}
              gradientUnits="userSpaceOnUse"
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 28}
            >
              <stop offset="0%" stopColor="#d8fff8" stopOpacity="0.5" />
              <stop offset="42%" stopColor="#9fe8dd" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#5ec4b4" stopOpacity="0" />
            </radialGradient>
            <radialGradient
              id={`${gradId}-flare-mid`}
              gradientUnits="userSpaceOnUse"
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 16}
            >
              <stop offset="0%" stopColor="#eafffb" stopOpacity="0.65" />
              <stop offset="55%" stopColor="#9fe8dd" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#7fd4c8" stopOpacity="0" />
            </radialGradient>
            <radialGradient
              id={`${gradId}-flare-inner`}
              gradientUnits="userSpaceOnUse"
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 6}
            >
              <stop offset="0%" stopColor="#f4fffd" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#9fe8dd" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#7fd4c8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g className="mastery-power-link" aria-hidden>
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 28}
              fill={`url(#${gradId}-flare-outer)`}
              className="mastery-power-link__flare mastery-power-link__flare--outer"
            />
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 16}
              fill={`url(#${gradId}-flare-mid)`}
              className="mastery-power-link__flare mastery-power-link__flare--mid"
            />
            <circle
              cx={masteryCX}
              cy={masteryCY}
              r={masteryR + 6}
              fill={`url(#${gradId}-flare-inner)`}
              className="mastery-power-link__flare mastery-power-link__flare--inner"
            />
          </g>
          <path
            d={beamPath}
            className="mastery-power-link__beam-wide"
            stroke={`url(#${gradId})`}
          />
          <path
            d={beamPath}
            className="mastery-power-link__beam-mid"
            stroke={`url(#${gradId})`}
          />
          <path
            d={beamPath}
            className="mastery-power-link__beam-core"
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

import type { StageData } from '../types'
import {
  isStageComplete,
  sortedStages,
  stageLoggedCount,
} from '../stage'
import './TrainingBands.css'

type Props = {
  stages: StageData[]
  nodeSize: number
}

export const BAND_GAP = 7
export const BAND_STROKE = 3.2
export const BAND_BASE_PAD = 4
export const COUNT_BAND_GAP = 12
/** Angular gap between segment cells (radians). */
const SEGMENT_GAP = 0.09

export function bandCountForStages(stages: StageData[]) {
  return stages.length
}

/** Radius from node center to the middle of the outermost stage band. */
export function outermostBandRadius(stageCount: number, nodeSize: number) {
  if (stageCount <= 0) return nodeSize / 2
  const baseR = nodeSize / 2 + BAND_BASE_PAD
  return baseR + (stageCount - 1) * BAND_GAP
}

/** Distance from node center to place labels outside the outermost band. */
export function labelBelowBandOffset(stageCount: number, nodeSize: number) {
  if (stageCount <= 0) return nodeSize / 2 + COUNT_BAND_GAP
  return outermostBandRadius(stageCount, nodeSize) + BAND_STROKE / 2 + COUNT_BAND_GAP
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  }
}

/** Arc path for one segment cell. Angles in radians, 0 = east, clockwise with Y-down. */
function segmentPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const span = end - start
  if (span <= 0.001) return ''
  const from = polar(cx, cy, r, start)
  const to = polar(cx, cy, r, end)
  const large = span > Math.PI ? 1 : 0
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`
}

type RingProps = {
  stage: StageData
  cx: number
  cy: number
  r: number
}

function StageRing({ stage, cx, cy, r }: RingProps) {
  const goal = Math.max(1, stage.goal)
  const filled = isStageComplete(stage) ? goal : stageLoggedCount(stage)
  const complete = isStageComplete(stage)
  const circumferenceAngle = Math.PI * 2
  const usable = circumferenceAngle - goal * SEGMENT_GAP
  const segSpan = usable / goal
  // Start at top (-90°)
  const origin = -Math.PI / 2

  if (complete) {
    return (
      <circle
        className="training-bands__complete"
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        strokeWidth={BAND_STROKE}
      />
    )
  }

  return (
    <g className="training-bands__stage">
      {Array.from({ length: goal }, (_, i) => {
        const start = origin + i * (segSpan + SEGMENT_GAP)
        const end = start + segSpan
        const d = segmentPath(cx, cy, r, start, end)
        const isFilled = i < filled
        return (
          <path
            key={`${stage.id}-${i}`}
            className={
              isFilled ? 'training-bands__cell is-filled' : 'training-bands__cell'
            }
            d={d}
            fill="none"
            strokeWidth={BAND_STROKE}
            strokeLinecap="butt"
          />
        )
      })}
    </g>
  )
}

/** One segmented ring per stage: stage 1 innermost → outer. */
export function TrainingBands({ stages, nodeSize }: Props) {
  const ordered = sortedStages(stages)
  if (ordered.length === 0) return null

  const bandCount = ordered.length
  const padding = BAND_GAP * bandCount + BAND_STROKE * 2 + 2
  const svgSize = nodeSize + padding * 2
  const cx = svgSize / 2
  const cy = svgSize / 2
  const baseR = nodeSize / 2 + BAND_BASE_PAD

  return (
    <svg
      className="training-bands"
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      aria-hidden
    >
      {ordered.map((stage, i) => (
        <StageRing
          key={stage.id}
          stage={stage}
          cx={cx}
          cy={cy}
          r={baseR + i * BAND_GAP}
        />
      ))}
    </svg>
  )
}

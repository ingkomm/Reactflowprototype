import type { StageData } from '../types'
import {
  isStageComplete,
  notableBandFills,
  notableBandGoalsForDays,
  NOTABLE_BAND_GOALS,
  sortedStages,
  stageLoggedCount,
  totalRawLoggedAcrossStages,
  visibleNotableBandCount,
} from '../stage'
import { BAND_GAP, BAND_STROKE, BAND_BASE_PAD } from '../orbitGeometry'
import './TrainingBands.css'

type Props = {
  stages: StageData[]
  nodeSize: number
}

const SEGMENT_GAP = 0.09

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
  ringKey: string
  goal: number
  filled: number
  cx: number
  cy: number
  r: number
}

function StageRing({ ringKey, goal, filled, cx, cy, r }: RingProps) {
  const safeGoal = Math.max(1, goal)
  const safeFilled = Math.min(safeGoal, Math.max(0, filled))
  const circumferenceAngle = Math.PI * 2
  const usable = circumferenceAngle - safeGoal * SEGMENT_GAP
  const segSpan = usable / safeGoal
  // Start at top (-90°)
  const origin = -Math.PI / 2

  // Always segmented cells — never a solid completed circle.
  return (
    <g className="training-bands__stage">
      {Array.from({ length: safeGoal }, (_, i) => {
        const start = origin + i * (segSpan + SEGMENT_GAP)
        const end = start + segSpan
        const d = segmentPath(cx, cy, r, start, end)
        const isFilled = i < safeFilled
        return (
          <path
            key={`${ringKey}-${i}`}
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

/**
 * One segmented ring per band: stage 1 innermost → outer.
 * Notable uses dynamic goals 3,5,7,9,… from unique practice days (9+ UI-only).
 */
export function TrainingBands({ stages, nodeSize }: Props) {
  const ordered = sortedStages(stages)
  if (ordered.length === 0) return null

  const isNotableBands =
    ordered.length === NOTABLE_BAND_GOALS.length &&
    ordered.every((s, i) => s.goal === NOTABLE_BAND_GOALS[i])
  const totalLogged = totalRawLoggedAcrossStages(ordered)

  let rings: { key: string; goal: number; filled: number }[]
  if (isNotableBands) {
    const goals = notableBandGoalsForDays(totalLogged)
    const fills = notableBandFills(totalLogged)
    const visibleCount = visibleNotableBandCount(totalLogged)
    rings = goals.slice(0, visibleCount).map((goal, i) => ({
      key: `band-${goal}`,
      goal,
      filled: fills[i] ?? 0,
    }))
  } else {
    rings = ordered.map((stage) => ({
      key: stage.id,
      goal: stage.goal,
      filled: isStageComplete(stage) ? stage.goal : stageLoggedCount(stage),
    }))
  }

  if (rings.length === 0) return null

  const bandCount = rings.length
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
      {rings.map((ring, i) => (
        <StageRing
          key={ring.key}
          ringKey={ring.key}
          goal={ring.goal}
          filled={ring.filled}
          cx={cx}
          cy={cy}
          r={baseR + i * BAND_GAP}
        />
      ))}
    </svg>
  )
}

import { TRAININGS_PER_BAND } from '../types'
import './TrainingBands.css'

type Props = {
  total: number
  nodeSize: number
}

export const BAND_GAP = 6
export const BAND_STROKE = 2.5
export const BAND_BASE_PAD = 3
/** Extra gap between outermost band stroke and the training count label. */
export const COUNT_BAND_GAP = 12

export function bandCountForTotal(total: number) {
  if (total <= 0) return 0
  const fullBands = Math.floor(total / TRAININGS_PER_BAND)
  const remainder = total % TRAININGS_PER_BAND
  return fullBands + (remainder > 0 ? 1 : 0)
}

/** Radius from node center to the middle of the outermost band stroke. */
export function outermostBandRadius(total: number, nodeSize: number) {
  const bandCount = bandCountForTotal(total)
  if (bandCount === 0) return nodeSize / 2
  const baseR = nodeSize / 2 + BAND_BASE_PAD
  return baseR + (bandCount - 1) * BAND_GAP
}

/** Distance from node center to place the training count below the bands. */
export function trainingCountOffset(total: number, nodeSize: number) {
  if (total <= 0) return nodeSize / 2 + COUNT_BAND_GAP
  return outermostBandRadius(total, nodeSize) + BAND_STROKE / 2 + COUNT_BAND_GAP
}

/** Outer progress bands: 1 full ring per 3 trainings; remainder fills the next ring. */
export function TrainingBands({ total, nodeSize }: Props) {
  if (total <= 0) return null

  const fullBands = Math.floor(total / TRAININGS_PER_BAND)
  const remainder = total % TRAININGS_PER_BAND
  const progress = remainder / TRAININGS_PER_BAND
  const bandCount = fullBands + (progress > 0 ? 1 : 0)
  if (bandCount === 0) return null

  const padding = BAND_GAP * bandCount + BAND_STROKE * 2
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
      {Array.from({ length: fullBands }, (_, i) => {
        const r = baseR + i * BAND_GAP
        return (
          <circle
            key={`full-${i}`}
            className="training-bands__full"
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={BAND_STROKE}
          />
        )
      })}
      {progress > 0 && (
        <circle
          className="training-bands__partial"
          cx={cx}
          cy={cy}
          r={baseR + fullBands * BAND_GAP}
          fill="none"
          strokeWidth={BAND_STROKE}
          strokeDasharray={`${2 * Math.PI * (baseR + fullBands * BAND_GAP) * progress} ${
            2 * Math.PI * (baseR + fullBands * BAND_GAP)
          }`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
    </svg>
  )
}

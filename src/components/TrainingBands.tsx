import { TRAININGS_PER_BAND } from '../types'
import './TrainingBands.css'

type Props = {
  total: number
  nodeSize: number
}

/** Outer progress bands: 1 full ring per 3 trainings; remainder fills the next ring. */
export function TrainingBands({ total, nodeSize }: Props) {
  if (total <= 0) return null

  const fullBands = Math.floor(total / TRAININGS_PER_BAND)
  const remainder = total % TRAININGS_PER_BAND
  const progress = remainder / TRAININGS_PER_BAND
  const bandCount = fullBands + (progress > 0 ? 1 : 0)
  if (bandCount === 0) return null

  const gap = 6
  const stroke = 2.5
  const padding = gap * bandCount + stroke * 2
  const svgSize = nodeSize + padding * 2
  const cx = svgSize / 2
  const cy = svgSize / 2
  const baseR = nodeSize / 2 + 3

  return (
    <svg
      className="training-bands"
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      aria-hidden
    >
      {Array.from({ length: fullBands }, (_, i) => {
        const r = baseR + i * gap
        return (
          <circle
            key={`full-${i}`}
            className="training-bands__full"
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={stroke}
          />
        )
      })}
      {progress > 0 && (
        <circle
          className="training-bands__partial"
          cx={cx}
          cy={cy}
          r={baseR + fullBands * gap}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${2 * Math.PI * (baseR + fullBands * gap) * progress} ${
            2 * Math.PI * (baseR + fullBands * gap)
          }`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
    </svg>
  )
}

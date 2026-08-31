import './SymbolScaleSlider.css'
import {
  DEFAULT_SYMBOL_SCALE,
  MAX_SYMBOL_SCALE,
  MIN_SYMBOL_SCALE,
  normalizeSymbolScale,
  SYMBOL_SCALE_STEP,
} from '../customSymbol'

type Props = {
  value?: number
  onChange: (scale: number) => void
  label?: string
}

export function SymbolScaleSlider({
  value = DEFAULT_SYMBOL_SCALE,
  onChange,
  label = '확대',
}: Props) {
  const scale = normalizeSymbolScale(value)
  const percent = Math.round(scale * 100)

  return (
    <div className="symbol-scale-slider" role="group" aria-label={label}>
      <div className="symbol-scale-slider__head">
        <span className="symbol-scale-slider__label">{label}</span>
        <span className="symbol-scale-slider__value">{percent}%</span>
      </div>
      <input
        type="range"
        className="symbol-scale-slider__input"
        min={MIN_SYMBOL_SCALE}
        max={MAX_SYMBOL_SCALE}
        step={SYMBOL_SCALE_STEP}
        value={scale}
        onChange={(event) => onChange(normalizeSymbolScale(Number(event.target.value)))}
      />
    </div>
  )
}

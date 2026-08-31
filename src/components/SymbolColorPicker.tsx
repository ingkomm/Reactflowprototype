import type { CSSProperties } from 'react'
import { NODE_ICON_COLORS } from '../types'
import './SymbolColorPicker.css'

type Props = {
  value: string
  onChange: (color: string) => void
  label?: string
}

export function SymbolColorPicker({ value, onChange, label = '색상' }: Props) {
  return (
    <div className="symbol-color-picker" role="group" aria-label={label}>
      <span className="symbol-color-picker__label">{label}</span>
      <div className="symbol-color-picker__swatches">
        {NODE_ICON_COLORS.map((color) => {
          const selected = value.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              className={`symbol-color-picker__swatch${selected ? ' is-selected' : ''}`}
              style={{ '--swatch-color': color } as CSSProperties}
              aria-label={color}
              aria-pressed={selected}
              onClick={() => onChange(color)}
            />
          )
        })}
      </div>
    </div>
  )
}

import { useId, type CSSProperties } from 'react'
import type { CustomSymbol } from '../types'
import { normalizeSymbolScale, SYMBOL_MASK_ID } from '../customSymbol'

type Props = {
  symbol: CustomSymbol
  /** Tint applied via currentColor (imported markup is monochrome). */
  color?: string
  className?: string
  style?: CSSProperties
  title?: string
}

/** Renders imported SVG as a monochrome glyph tinted by `color`. */
export function CustomSymbolGlyph({ symbol, color, className, style, title }: Props) {
  const reactId = useId().replace(/:/g, '')
  const markup = symbol.markup.includes(SYMBOL_MASK_ID)
    ? symbol.markup.split(SYMBOL_MASK_ID).join(`mask-${reactId}`)
    : symbol.markup
  const scale = normalizeSymbolScale(symbol.scale)

  return (
    <svg
      className={className}
      style={{
        color: color ?? 'currentColor',
        fill: 'currentColor',
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'center',
        ...style,
      }}
      viewBox={symbol.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g fill="currentColor" dangerouslySetInnerHTML={{ __html: markup }} />
    </svg>
  )
}

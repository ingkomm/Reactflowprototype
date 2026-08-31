import type { CSSProperties } from 'react'
import type { CustomSymbol } from '../types'

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
  return (
    <svg
      className={className}
      style={{ color: color ?? 'currentColor', fill: 'currentColor', ...style }}
      viewBox={symbol.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g fill="currentColor" dangerouslySetInnerHTML={{ __html: symbol.markup }} />
    </svg>
  )
}

import type { CSSProperties } from 'react'
import type { CustomSymbol } from '../types'

type Props = {
  symbol: CustomSymbol
  className?: string
  style?: CSSProperties
  title?: string
}

/** Renders imported SVG with original aspect ratio (contain). */
export function CustomSymbolGlyph({ symbol, className, style, title }: Props) {
  return (
    <svg
      className={className}
      style={style}
      viewBox={symbol.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g dangerouslySetInnerHTML={{ __html: symbol.markup }} />
    </svg>
  )
}

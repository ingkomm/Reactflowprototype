import { useId, type CSSProperties } from 'react'
import type { CustomSymbol } from '../types'
import { normalizeSymbolScale, parseRasterSymbolMarkup } from '../customSymbol'

type Props = {
  symbol: CustomSymbol
  /** Tint applied via currentColor (imported markup is monochrome). */
  color?: string
  className?: string
  style?: CSSProperties
  title?: string
}

/** Renders imported raster symbol as a monochrome glyph tinted by `color`. */
export function CustomSymbolGlyph({ symbol, color, className, style, title }: Props) {
  const reactId = useId().replace(/:/g, '')
  const maskId = `mask-${reactId}`
  const raster = parseRasterSymbolMarkup(symbol.markup)
  const scale = normalizeSymbolScale(symbol.scale)

  if (!raster) return null

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
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={raster.width}
          height={raster.height}
        >
          <image
            href={raster.dataUrl}
            width={raster.width}
            height={raster.height}
            preserveAspectRatio="xMidYMid meet"
          />
        </mask>
      </defs>
      <rect
        width={raster.width}
        height={raster.height}
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  )
}

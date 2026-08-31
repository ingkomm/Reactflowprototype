import type { CSSProperties } from 'react'
import type { CustomIcon } from '../types'
import { CUSTOM_ICON_SIZE } from '../customIcon'

type Props = {
  icon: CustomIcon
  className?: string
  style?: CSSProperties
  title?: string
}

/** Renders a 16×16 dot icon as an SVG pixel grid. */
export function CustomIconGlyph({ icon, className, style, title }: Props) {
  const size = CUSTOM_ICON_SIZE
  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      shapeRendering="crispEdges"
    >
      {title ? <title>{title}</title> : null}
      {icon.pixels.map((color, index) => {
        if (!color) return null
        const x = index % size
        const y = Math.floor(index / size)
        return <rect key={index} x={x} y={y} width={1} height={1} fill={color} />
      })}
    </svg>
  )
}

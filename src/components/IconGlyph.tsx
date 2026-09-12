import type { CSSProperties } from 'react'
import { getIconDef } from '../icons'

type Props = {
  iconId: string
  className?: string
  style?: CSSProperties
  title?: string
}

/** Solid vector glyph sized to fill its container. */
export function IconGlyph({ iconId, className, style, title }: Props) {
  const icon = getIconDef(iconId)
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {icon.paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  )
}

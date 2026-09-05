import type { CSSProperties } from 'react'
import type { PassiveKind } from '../types'
import { DEFAULT_ICON_BY_KIND } from '../types'
import './DefaultNodeShape.css'

type Props = {
  kind: PassiveKind
  powered?: boolean
  /** Symbol tint for filled circle glyphs. */
  color?: string
  className?: string
  style?: CSSProperties
  /** Preview size in px (library / inspector). */
  size?: number
}

const UNPOWERED_FILL = '#6a7580'

/** Built-in defaults: mastery / notable / small = solid filled circles. Connect = socket. */
export function DefaultNodeShape({
  kind,
  powered = true,
  color,
  className,
  style,
  size,
}: Props) {
  const resolved = kind === 'voidMastery' ? 'mastery' : kind
  const tintKind =
    resolved === 'mastery' || resolved === 'notable' || resolved === 'shard'
      ? resolved
      : kind
  const fill = powered ? (color ?? DEFAULT_ICON_BY_KIND[tintKind]) : UNPOWERED_FILL

  const dimStyle: CSSProperties | undefined = size
    ? { width: size, height: size, ...style }
    : style

  if (resolved === 'connect') {
    return (
      <svg
        className={`default-node-shape default-node-shape--connect${className ? ` ${className}` : ''}`}
        style={dimStyle}
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle cx="50" cy="50" r="28" fill={powered ? '#42e890' : UNPOWERED_FILL} opacity={powered ? 0.95 : 0.7} />
        <circle cx="50" cy="50" r="18" fill={powered ? '#b4ffd2' : '#4a5560'} opacity={0.85} />
      </svg>
    )
  }

  return (
    <svg
      className={`default-node-shape default-node-shape--circle${className ? ` ${className}` : ''}`}
      style={dimStyle}
      viewBox="0 0 100 100"
      aria-hidden
    >
      <circle cx="50" cy="50" r="50" fill={fill} />
    </svg>
  )
}

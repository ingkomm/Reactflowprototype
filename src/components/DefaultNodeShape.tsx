import type { CSSProperties } from 'react'
import type { PassiveKind } from '../types'
import './DefaultNodeShape.css'

type Props = {
  kind: PassiveKind
  powered?: boolean
  className?: string
  style?: CSSProperties
  /** Preview size in px (library / inspector). */
  size?: number
}

const HEX_POINTS = '50,4 96,27 96,73 50,96 4,73 4,27'

/** Built-in default glyphs: mastery = full circle, notable = hexagon, small = medium circle. */
export function DefaultNodeShape({ kind, powered = true, className, style, size }: Props) {
  const fill = powered ? 'rgba(255, 255, 255, 0.42)' : 'rgba(106, 117, 128, 0.38)'
  const resolved = kind === 'voidMastery' ? 'mastery' : kind

  const dimStyle: CSSProperties | undefined = size
    ? { width: size, height: size, ...style }
    : style

  if (resolved === 'notable') {
    return (
      <svg
        className={`default-node-shape default-node-shape--notable${className ? ` ${className}` : ''}`}
        style={dimStyle}
        viewBox="0 0 100 100"
        aria-hidden
      >
        <polygon points={HEX_POINTS} fill={fill} />
      </svg>
    )
  }

  if (resolved === 'mastery') {
    return (
      <svg
        className={`default-node-shape default-node-shape--mastery${className ? ` ${className}` : ''}`}
        style={dimStyle}
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle cx="50" cy="50" r="46" fill={fill} />
      </svg>
    )
  }

  if (resolved === 'connect') {
    return (
      <svg
        className={`default-node-shape default-node-shape--connect${className ? ` ${className}` : ''}`}
        style={dimStyle}
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle cx="50" cy="50" r="28" fill={powered ? 'rgba(66, 232, 144, 0.55)' : 'rgba(106, 117, 128, 0.38)'} />
        <circle cx="50" cy="50" r="18" fill={powered ? 'rgba(180, 255, 210, 0.45)' : 'rgba(74, 85, 96, 0.35)'} />
      </svg>
    )
  }

  if (resolved === 'small') {
    return (
      <svg
        className={`default-node-shape default-node-shape--small${className ? ` ${className}` : ''}`}
        style={dimStyle}
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle cx="50" cy="50" r="32" fill={fill} />
      </svg>
    )
  }

  return (
    <svg
      className={`default-node-shape${className ? ` ${className}` : ''}`}
      style={dimStyle}
      viewBox="0 0 100 100"
      aria-hidden
    >
      <circle cx="50" cy="50" r="36" fill={fill} />
    </svg>
  )
}

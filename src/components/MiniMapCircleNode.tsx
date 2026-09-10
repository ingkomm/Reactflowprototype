import { memo, type MouseEvent } from 'react'
import type { MiniMapNodeProps } from '@xyflow/react'

function MiniMapCircleNodeComponent({
  x,
  y,
  width,
  height,
  style,
  selected,
  color,
  strokeColor,
  strokeWidth,
  onClick,
  id,
}: MiniMapNodeProps) {
  const size = Math.min(width, height)
  const r = size / 2
  const cx = x + width / 2
  const cy = y + height / 2

  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      style={style}
      className={selected ? 'selected' : undefined}
      fill={color}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      onClick={onClick ? (event: MouseEvent) => onClick(event, id) : undefined}
    />
  )
}

export const MiniMapCircleNode = memo(MiniMapCircleNodeComponent)

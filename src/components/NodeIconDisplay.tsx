import type { CSSProperties } from 'react'
import { useCustomIcons } from '../CustomIconContext'
import { IconGlyph } from './IconGlyph'
import { CustomIconGlyph } from './CustomIconGlyph'

type Props = {
  iconId: string
  customIconId?: string | null
  className?: string
  style?: CSSProperties
  title?: string
}

/** Built-in class icon, or user dot icon when customIconId is set. */
export function NodeIconDisplay({ iconId, customIconId, className, style, title }: Props) {
  const { getCustomIcon } = useCustomIcons()
  const custom = customIconId ? getCustomIcon(customIconId) : null
  if (custom) {
    return <CustomIconGlyph icon={custom} className={className} style={style} title={title ?? custom.name} />
  }
  return <IconGlyph iconId={iconId} className={className} style={style} title={title} />
}

import { useMemo, useState } from 'react'
import {
  ICON_SETS,
  iconsInSet,
  type IconSetId,
} from '../icons'
import { IconGlyph } from './IconGlyph'
import './IconPicker.css'

type Props = {
  open: boolean
  value: string
  onClose: () => void
  onSelect: (iconId: string) => void
}

export function IconPicker({ open, value, onClose, onSelect }: Props) {
  const currentSet = useMemo(() => {
    for (const set of ICON_SETS) {
      if (iconsInSet(set.id).some((i) => i.id === value)) return set.id
    }
    return ICON_SETS[0]!.id
  }, [value])

  const [setId, setSetId] = useState<IconSetId>(currentSet)

  const icons = iconsInSet(setId)

  if (!open) return null

  return (
    <div className="icon-picker-backdrop" role="presentation" onClick={onClose}>
      <div
        key={currentSet}
        className="icon-picker"
        role="dialog"
        aria-modal="true"
        aria-label="아이콘 셋 선택"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="icon-picker__head">
          <div>
            <h3>아이콘 셋</h3>
            <p>단색 벡터 인포그래픽을 고르세요. 원형 노드를 꽉 채웁니다.</p>
          </div>
          <button type="button" className="icon-picker__close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="icon-picker__tabs" role="tablist">
          {ICON_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              role="tab"
              aria-selected={setId === set.id}
              className={`icon-picker__tab${setId === set.id ? ' is-active' : ''}`}
              onClick={() => setSetId(set.id)}
            >
              {set.label}
            </button>
          ))}
        </div>

        <div className="icon-picker__grid">
          {icons.map((icon) => {
            const selected = value === icon.id
            return (
              <button
                key={icon.id}
                type="button"
                className={`icon-picker__item${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onSelect(icon.id)
                  onClose()
                }}
                title={icon.label}
              >
                <span className="icon-picker__glyph-wrap">
                  <IconGlyph iconId={icon.id} className="icon-picker__glyph" />
                </span>
                <span className="icon-picker__label">{icon.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

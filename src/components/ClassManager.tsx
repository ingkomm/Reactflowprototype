import { useMemo, useState } from 'react'
import type { NodeIconColor, PassiveKind } from '../types'
import { NODE_ICON_COLORS, PASSIVE_KIND_LABEL } from '../types'
import { getIconDef } from '../icons'
import {
  classesForKind,
  createPassiveClassId,
  type PassiveClass,
} from '../passiveClass'
import { IconGlyph } from './IconGlyph'
import { IconPicker } from './IconPicker'
import './ClassManager.css'

type Props = {
  open: boolean
  classes: PassiveClass[]
  onClose: () => void
  onChange: (next: PassiveClass[]) => void
}

const KIND_TABS: PassiveKind[] = ['initial', 'connect', 'mastery', 'voidMastery', 'notable', 'small', 'void']

export function ClassManager({ open, classes, onClose, onChange }: Props) {
  const [kind, setKind] = useState<PassiveKind>('mastery')
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null)

  const list = useMemo(() => classesForKind(classes, kind), [classes, kind])
  const editing = iconPickerFor
    ? classes.find((c) => c.id === iconPickerFor) ?? null
    : null

  if (!open) return null

  const patchClass = (id: string, patch: Partial<PassiveClass>) => {
    onChange(classes.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const addClass = () => {
    const next: PassiveClass = {
      id: createPassiveClassId(kind),
      kind,
      label: `새 ${PASSIVE_KIND_LABEL[kind]}`,
      iconId: list[0]?.iconId ?? 'tr-target',
      iconColor: list[0]?.iconColor ?? NODE_ICON_COLORS[0],
    }
    onChange([...classes, next])
  }

  const removeClass = (id: string) => {
    if (list.length <= 1) return
    onChange(classes.filter((c) => c.id !== id))
  }

  return (
    <>
    <div className="class-manager-backdrop" role="presentation" onClick={onClose}>
      <div
        className="class-manager"
        role="dialog"
        aria-modal="true"
        aria-label="패시브 클래스 관리"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="class-manager__head">
          <div>
            <h2>패시브 클래스</h2>
            <p>Kind별 클래스에 아이콘·색상을 묶습니다. 노드에서는 클래스만 고르면 됩니다.</p>
          </div>
          <button type="button" className="class-manager__close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="class-manager__tabs" role="tablist">
          {KIND_TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`class-manager__tab${kind === k ? ' is-active' : ''}`}
              onClick={() => setKind(k)}
            >
              {PASSIVE_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="class-manager__toolbar">
          <span>{list.length}개 클래스</span>
          <button type="button" className="btn btn--primary" onClick={addClass}>
            클래스 추가
          </button>
        </div>

        <ul className="class-manager__list">
          {list.map((cls) => (
            <li key={cls.id} className="class-manager__row">
              <button
                type="button"
                className="class-manager__icon-btn"
                style={{ color: cls.iconColor }}
                title="아이콘 변경"
                onClick={() => setIconPickerFor(cls.id)}
              >
                <IconGlyph iconId={cls.iconId} />
              </button>

              <div className="class-manager__fields">
                <label className="class-manager__label">
                  <span>이름</span>
                  <input
                    value={cls.label}
                    onChange={(e) => patchClass(cls.id, { label: e.target.value })}
                  />
                </label>
                <p className="class-manager__meta">{getIconDef(cls.iconId).label}</p>
                <div className="class-manager__colors" role="listbox" aria-label="클래스 색상">
                  {NODE_ICON_COLORS.map((color) => {
                    const selected = cls.iconColor === color
                    return (
                      <button
                        key={color}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`color-swatch${selected ? ' is-selected' : ''}`}
                        style={{ background: color }}
                        title={color}
                        onClick={() =>
                          patchClass(cls.id, { iconColor: color as NodeIconColor })
                        }
                      />
                    )
                  })}
                </div>
              </div>

              <button
                type="button"
                className="btn btn--danger class-manager__delete"
                disabled={list.length <= 1}
                title={list.length <= 1 ? 'Kind당 최소 1개 필요' : '클래스 삭제'}
                onClick={() => removeClass(cls.id)}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>

    <IconPicker
      open={Boolean(editing)}
      value={editing?.iconId ?? 'tr-target'}
      onClose={() => setIconPickerFor(null)}
      onSelect={(iconId) => {
        if (!editing) return
        patchClass(editing.id, { iconId })
        setIconPickerFor(null)
      }}
    />
    </>
  )
}

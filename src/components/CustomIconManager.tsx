import { useState } from 'react'
import type { CustomIcon } from '../types'
import { CustomIconGlyph } from './CustomIconGlyph'
import { DotIconEditor } from './DotIconEditor'
import './CustomIconManager.css'

type Props = {
  open: boolean
  customIcons: CustomIcon[]
  onClose: () => void
  onChange: (next: CustomIcon[]) => void
}

export function CustomIconManager({ open, customIcons, onClose, onChange }: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CustomIcon | null>(null)

  if (!open) return null

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const openEdit = (icon: CustomIcon) => {
    setEditing(icon)
    setEditorOpen(true)
  }

  const removeIcon = (id: string) => {
    onChange(customIcons.filter((icon) => icon.id !== id))
  }

  return (
    <>
      <div className="custom-icon-manager-backdrop" role="presentation" onClick={onClose}>
        <div
          className="custom-icon-manager"
          role="dialog"
          aria-modal="true"
          aria-label="사용자 아이콘 관리"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="custom-icon-manager__head">
            <div>
              <h2>사용자 아이콘</h2>
              <p>16×16 도트 아이콘을 만들고 Notable·Mastery·Small 노드에 적용합니다.</p>
            </div>
            <button type="button" className="custom-icon-manager__close" onClick={onClose}>
              ×
            </button>
          </header>

          <div className="custom-icon-manager__toolbar">
            <span>{customIcons.length}개</span>
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              새 아이콘
            </button>
          </div>

          {customIcons.length === 0 ? (
            <p className="custom-icon-manager__empty">아직 사용자 아이콘이 없습니다.</p>
          ) : (
            <ul className="custom-icon-manager__list">
              {customIcons.map((icon) => (
                <li key={icon.id} className="custom-icon-manager__row">
                  <span className="custom-icon-manager__glyph">
                    <CustomIconGlyph icon={icon} />
                  </span>
                  <div className="custom-icon-manager__meta">
                    <strong>{icon.name}</strong>
                    <small>{icon.width}×{icon.height}</small>
                  </div>
                  <button type="button" className="btn btn--ghost" onClick={() => openEdit(icon)}>
                    수정
                  </button>
                  <button type="button" className="btn btn--danger" onClick={() => removeIcon(icon.id)}>
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <DotIconEditor
        open={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSave={(icon) => {
          const exists = customIcons.some((item) => item.id === icon.id)
          onChange(exists ? customIcons.map((item) => (item.id === icon.id ? icon : item)) : [...customIcons, icon])
        }}
      />
    </>
  )
}

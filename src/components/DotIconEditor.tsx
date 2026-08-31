import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  clearCustomIcon,
  createCustomIcon,
  CUSTOM_ICON_PALETTE,
  CUSTOM_ICON_SIZE,
  setCustomIconPixel,
} from '../customIcon'
import type { CustomIcon } from '../types'
import { CustomIconGlyph } from './CustomIconGlyph'
import './DotIconEditor.css'

type Tool = 'draw' | 'erase'

type Props = {
  open: boolean
  initial?: CustomIcon | null
  onClose: () => void
  onSave: (icon: CustomIcon) => void
}

export function DotIconEditor({ open, initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CustomIcon>(() => createCustomIcon('새 아이콘'))
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState<string>(CUSTOM_ICON_PALETTE[0]!)
  const paintingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setDraft(initial ? { ...initial, pixels: [...initial.pixels] } : createCustomIcon('새 아이콘'))
    setTool('draw')
    setColor(CUSTOM_ICON_PALETTE[0]!)
  }, [open, initial])

  const paintAt = useCallback(
    (x: number, y: number) => {
      setDraft((prev) => setCustomIconPixel(prev, x, y, tool === 'erase' ? null : color))
    },
    [color, tool],
  )

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * CUSTOM_ICON_SIZE)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * CUSTOM_ICON_SIZE)
    if (x < 0 || y < 0 || x >= CUSTOM_ICON_SIZE || y >= CUSTOM_ICON_SIZE) return
    paintAt(x, y)
  }

  if (!open) return null

  return (
    <div className="dot-editor-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dot-editor"
        role="dialog"
        aria-modal="true"
        aria-label="도트 아이콘 편집기"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dot-editor__head">
          <div>
            <h3>도트 아이콘 편집기</h3>
            <p>16×16 격자 · 투명 픽셀 지원 · 제한 팔레트</p>
          </div>
          <button type="button" className="dot-editor__close" onClick={onClose}>
            ×
          </button>
        </header>

        <label className="field">
          <span>아이콘 이름</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="아이콘 이름"
          />
        </label>

        <div className="dot-editor__tools">
          <div className="dot-editor__tool-group" role="group" aria-label="도구">
            <button
              type="button"
              className={`btn btn--ghost${tool === 'draw' ? ' is-active' : ''}`}
              onClick={() => setTool('draw')}
            >
              그리기
            </button>
            <button
              type="button"
              className={`btn btn--ghost${tool === 'erase' ? ' is-active' : ''}`}
              onClick={() => setTool('erase')}
            >
              지우기
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setDraft((prev) => clearCustomIcon(prev))}>
              전체 지우기
            </button>
          </div>

          <div className="dot-editor__palette" role="listbox" aria-label="색상 팔레트">
            {CUSTOM_ICON_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="option"
                aria-selected={color === swatch}
                className={`color-swatch${color === swatch ? ' is-selected' : ''}`}
                style={{ background: swatch }}
                title={swatch}
                onClick={() => {
                  setColor(swatch)
                  setTool('draw')
                }}
              />
            ))}
          </div>
        </div>

        <div className="dot-editor__canvas-wrap">
          <svg
            className="dot-editor__canvas"
            viewBox={`0 0 ${CUSTOM_ICON_SIZE} ${CUSTOM_ICON_SIZE}`}
            onPointerDown={(e) => {
              paintingRef.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              handlePointer(e)
            }}
            onPointerMove={(e) => {
              if (!paintingRef.current) return
              handlePointer(e)
            }}
            onPointerUp={() => {
              paintingRef.current = false
            }}
            onPointerLeave={() => {
              paintingRef.current = false
            }}
          >
            <rect width={CUSTOM_ICON_SIZE} height={CUSTOM_ICON_SIZE} fill="transparent" />
            {Array.from({ length: CUSTOM_ICON_SIZE * CUSTOM_ICON_SIZE }, (_, index) => {
              const x = index % CUSTOM_ICON_SIZE
              const y = Math.floor(index / CUSTOM_ICON_SIZE)
              const fill = draft.pixels[index]
              return (
                <rect
                  key={index}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  fill={fill ?? 'transparent'}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={0.04}
                />
              )
            })}
          </svg>

          <div className="dot-editor__preview">
            <span>미리보기</span>
            <span className="dot-editor__preview-glyph">
              <CustomIconGlyph icon={draft} />
            </span>
          </div>
        </div>

        <footer className="dot-editor__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              if (!draft.name.trim()) return
              onSave({ ...draft, name: draft.name.trim() })
              onClose()
            }}
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  )
}

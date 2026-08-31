import { useRef } from 'react'
import type { CustomSymbol } from '../types'
import {
  DEFAULT_SYMBOL_ID,
  LIBRARY_KIND_LABEL,
  resolveSymbolColor,
  type SymbolEditorKind,
} from '../librarySymbols'
import { DefaultNodeShape } from './DefaultNodeShape'
import { CustomSymbolGlyph } from './CustomSymbolGlyph'
import { SymbolColorPicker } from './SymbolColorPicker'
import { SymbolScaleSlider } from './SymbolScaleSlider'
import './SymbolKindEditor.css'

type Props = {
  kind: SymbolEditorKind
  open: boolean
  customSymbols: CustomSymbol[]
  defaultSymbolColors: Partial<Record<SymbolEditorKind, string>>
  importError: string | null
  onClose: () => void
  onImportSvg: (file: File, kind: SymbolEditorKind) => void
  onDeleteSymbol: (symbolId: string) => void
  onDefaultColorChange: (kind: SymbolEditorKind, color: string) => void
  onCustomSymbolColorChange: (symbolId: string, color: string) => void
  onCustomSymbolScaleChange: (symbolId: string, scale: number) => void
}

export function SymbolKindEditor({
  kind,
  open,
  customSymbols,
  defaultSymbolColors,
  importError,
  onClose,
  onImportSvg,
  onDeleteSymbol,
  onDefaultColorChange,
  onCustomSymbolColorChange,
  onCustomSymbolScaleChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const kindSymbols = customSymbols.filter((s) => !s.kind || s.kind === kind)
  const defaultColor = resolveSymbolColor(DEFAULT_SYMBOL_ID, kind, customSymbols, defaultSymbolColors)

  if (!open) return null

  return (
    <div className="symbol-kind-editor__backdrop" role="presentation" onClick={onClose}>
      <div
        className="symbol-kind-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`symbol-editor-${kind}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="symbol-kind-editor__head">
          <h2 id={`symbol-editor-${kind}`}>{LIBRARY_KIND_LABEL[kind]} symbols</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <p className="symbol-kind-editor__hint">
          Default는 꽉 채운 원형입니다. SVG·PNG를 가져오면 단색 마스크로 변환되어 색상·확대를
          조절할 수 있습니다.
        </p>

        <ul className="symbol-kind-editor__list">
          <li className="symbol-kind-editor__row">
            <span className="symbol-kind-editor__preview">
              <DefaultNodeShape kind={kind} size={36} color={defaultColor} />
            </span>
            <div className="symbol-kind-editor__meta">
              <span className="symbol-kind-editor__name">Default</span>
              <SymbolColorPicker
                value={defaultColor}
                onChange={(color) => onDefaultColorChange(kind, color)}
              />
            </div>
            <span className="symbol-kind-editor__badge">built-in</span>
          </li>
          {kindSymbols.map((symbol) => {
            const symbolColor = resolveSymbolColor(
              symbol.id,
              kind,
              customSymbols,
              defaultSymbolColors,
            )
            return (
              <li key={symbol.id} className="symbol-kind-editor__row">
                <span className="symbol-kind-editor__preview symbol-kind-editor__preview--custom">
                  <CustomSymbolGlyph symbol={symbol} color={symbolColor} />
                </span>
                <div className="symbol-kind-editor__meta">
                  <span className="symbol-kind-editor__name">{symbol.name}</span>
                  <SymbolColorPicker
                    value={symbolColor}
                    onChange={(color) => onCustomSymbolColorChange(symbol.id, color)}
                  />
                  <SymbolScaleSlider
                    value={symbol.scale}
                    onChange={(scale) => onCustomSymbolScaleChange(symbol.id, scale)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--icon symbol-kind-editor__delete"
                  aria-label={`${symbol.name} 삭제`}
                  onClick={() => onDeleteSymbol(symbol.id)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>

        {importError && (
          <p className="symbol-kind-editor__error" role="alert">
            {importError}
          </p>
        )}

        <footer className="symbol-kind-editor__foot">
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            Import SVG / PNG
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,.svg,image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp,image/gif,.gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onImportSvg(file, kind)
            }}
          />
        </footer>
      </div>
    </div>
  )
}

export { DEFAULT_SYMBOL_ID }

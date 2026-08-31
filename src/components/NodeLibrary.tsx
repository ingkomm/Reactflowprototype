import { useRef } from 'react'
import type { CustomSymbol } from '../types'
import type { NodeTemplatePayload } from '../nodeTemplate'
import { encodePalettePayload, LIBRARY_NODE_KINDS, PALETTE_MIME } from '../nodeTemplate'
import { PASSIVE_KIND_LABEL, type PassiveKind } from '../types'
import { DEFAULT_ICON_ID_BY_KIND } from '../icons'
import { DEFAULT_ICON_BY_KIND } from '../types'
import { NODE_SIZE } from '../orbit'
import { IconGlyph } from './IconGlyph'
import { CustomSymbolGlyph } from './CustomSymbolGlyph'
import './NodeLibrary.css'

type Props = {
  customSymbols: CustomSymbol[]
  symbolImportError: string | null
  onPlaceTemplate: (template: NodeTemplatePayload) => void
  onImportSvg: (file: File) => void
  onDeleteSymbol: (symbolId: string) => void
}

function beginPaletteDrag(event: React.DragEvent, template: NodeTemplatePayload) {
  event.dataTransfer.setData(PALETTE_MIME, encodePalettePayload(template))
  event.dataTransfer.effectAllowed = 'copy'
}

function SystemPreview({ kind }: { kind: PassiveKind }) {
  const size = NODE_SIZE[kind]
  const color = DEFAULT_ICON_BY_KIND[kind]
  return (
    <span
      className="node-library__preview node-library__preview--system"
      style={{ width: Math.min(size, 40), height: Math.min(size, 40), color }}
    >
      <IconGlyph iconId={DEFAULT_ICON_ID_BY_KIND[kind]} />
    </span>
  )
}

export function NodeLibrary({
  customSymbols,
  symbolImportError,
  onPlaceTemplate,
  onImportSvg,
  onDeleteSymbol,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <aside className="node-library" aria-label="Node library">
      <section className="node-library__section">
        <h2 className="node-library__heading">NODES</h2>
        <ul className="node-library__list">
          {LIBRARY_NODE_KINDS.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                className="node-library__item node-library__item--system"
                draggable
                onDragStart={(event) => beginPaletteDrag(event, { source: 'system', kind })}
                onClick={() => onPlaceTemplate({ source: 'system', kind })}
                title={`${PASSIVE_KIND_LABEL[kind]} — 클릭: 중앙 추가 · 드래그: 위치 지정`}
              >
                <SystemPreview kind={kind} />
                <span className="node-library__label">{PASSIVE_KIND_LABEL[kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="node-library__section node-library__section--custom">
        <div className="node-library__section-head">
          <h2 className="node-library__heading">CUSTOM SYMBOLS</h2>
          <button
            type="button"
            className="btn btn--ghost node-library__import"
            onClick={() => fileInputRef.current?.click()}
          >
            Import SVG
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,.svg"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) onImportSvg(file)
            }}
          />
        </div>
        {symbolImportError && (
          <p className="node-library__error" role="alert">
            {symbolImportError}
          </p>
        )}
        {customSymbols.length === 0 ? (
          <p className="node-library__empty">가져온 SVG가 없습니다.</p>
        ) : (
          <ul className="node-library__list">
            {customSymbols.map((symbol) => (
              <li key={symbol.id} className="node-library__symbol-row">
                <button
                  type="button"
                  className="node-library__item node-library__item--custom"
                  draggable
                  onDragStart={(event) =>
                    beginPaletteDrag(event, { source: 'custom', symbolId: symbol.id })
                  }
                  onClick={() => onPlaceTemplate({ source: 'custom', symbolId: symbol.id })}
                  title={`${symbol.name} — Small 노드로 추가`}
                >
                  <span className="node-library__preview node-library__preview--custom">
                    <CustomSymbolGlyph symbol={symbol} />
                  </span>
                  <span className="node-library__label">{symbol.name}</span>
                </button>
                <button
                  type="button"
                  className="btn btn--icon node-library__delete"
                  aria-label={`${symbol.name} 삭제`}
                  onClick={() => onDeleteSymbol(symbol.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

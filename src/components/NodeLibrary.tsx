import type { NodeTemplatePayload } from '../nodeTemplate'
import { encodePalettePayload, PALETTE_MIME } from '../nodeTemplate'
import {
  DEFAULT_SYMBOL_ID,
  LIBRARY_KINDS,
  LIBRARY_KIND_LABEL,
  SYMBOL_EDITOR_KINDS,
  type LibraryKind,
  type SymbolEditorKind,
} from '../librarySymbols'
import { NODE_SIZE } from '../orbit'
import { useCustomSymbols } from '../CustomSymbolContext'
import { DefaultNodeShape } from './DefaultNodeShape'
import './NodeLibrary.css'

type Props = {
  onPlaceTemplate: (template: NodeTemplatePayload) => void
  onOpenSymbolEditor: (kind: SymbolEditorKind) => void
}

function beginPaletteDrag(event: React.DragEvent, template: NodeTemplatePayload) {
  event.dataTransfer.setData(PALETTE_MIME, encodePalettePayload(template))
  event.dataTransfer.effectAllowed = 'copy'
}

function SpannerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.7 13.8 19 11.1l1.4-1.4a1 1 0 0 0 0-1.4l-2.8-2.8a1 1 0 0 0-1.4 0L14.8 6.9 12.1 4.2a1 1 0 0 0-1.4 0l-1.5 1.5 3.5 3.5-1.4 1.4-3.5-3.5L6.3 8.6a1 1 0 0 0 0 1.4l2.7 2.7-1.4 1.4L4.9 10.4a1 1 0 0 0-1.4 0L2 11.9l3.5 3.5-1.4 1.4L.6 13.3a1 1 0 0 0 0 1.4l2.8 2.8a1 1 0 0 0 1.4 0l1.5-1.5 3.5 3.5 1.4-1.4-3.5-3.5 1.4-1.4 3.5 3.5 1.5-1.5a1 1 0 0 0 0-1.4l-2.7-2.7 1.4-1.4 2.7 2.7a1 1 0 0 0 1.4 0l1.5-1.5a1 1 0 0 0 0-1.4l-2.8-2.8z"
      />
    </svg>
  )
}

function hasSymbolEditor(kind: LibraryKind): kind is SymbolEditorKind {
  return (SYMBOL_EDITOR_KINDS as readonly LibraryKind[]).includes(kind)
}

export function NodeLibrary({ onPlaceTemplate, onOpenSymbolEditor }: Props) {
  const { resolveSymbolColor } = useCustomSymbols()

  return (
    <aside className="node-library" aria-label="Node library">
      <h2 className="node-library__heading">Nodes</h2>
      <ul className="node-library__rows">
        {LIBRARY_KINDS.map((kind) => {
          const template: NodeTemplatePayload = {
            source: 'symbol',
            symbolId: DEFAULT_SYMBOL_ID,
            kind,
          }
          const previewSize = Math.min(NODE_SIZE[kind], 34)
          const previewClass = kind === 'connect' ? ' node-library__preview--connect' : ''
          const previewColor =
            kind === 'mastery' || kind === 'notable' || kind === 'small'
              ? resolveSymbolColor(DEFAULT_SYMBOL_ID, kind)
              : undefined
          return (
            <li key={kind} className="node-library__row">
              <button
                type="button"
                className="node-library__default"
                draggable
                onDragStart={(event) => beginPaletteDrag(event, template)}
                onClick={() => onPlaceTemplate(template)}
                title={`${LIBRARY_KIND_LABEL[kind]} Default — 클릭: 중앙 추가 · 드래그: 위치 지정`}
              >
                <span className={`node-library__preview${previewClass}`}>
                  <DefaultNodeShape kind={kind} size={previewSize} color={previewColor} />
                </span>
                <span className="node-library__label">{LIBRARY_KIND_LABEL[kind]}</span>
              </button>
              {hasSymbolEditor(kind) ? (
                <button
                  type="button"
                  className="node-library__settings btn btn--icon"
                  aria-label={`${LIBRARY_KIND_LABEL[kind]} 심볼 설정`}
                  title="심볼 커스터마이징"
                  onClick={() => onOpenSymbolEditor(kind)}
                >
                  <SpannerIcon />
                </button>
              ) : (
                <span className="node-library__settings-spacer" aria-hidden />
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

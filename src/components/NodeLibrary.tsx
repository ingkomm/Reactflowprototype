import { useState } from 'react'
import type { NodeTemplatePayload } from '../nodeTemplate'
import { encodePalettePayload, PALETTE_MIME } from '../nodeTemplate'
import { LIBRARY_BRANCHES, type LibrarySymbol } from '../librarySymbols'
import { NODE_SIZE } from '../orbit'
import { IconGlyph } from './IconGlyph'
import './NodeLibrary.css'

type Props = {
  onPlaceTemplate: (template: NodeTemplatePayload) => void
}

function beginPaletteDrag(event: React.DragEvent, template: NodeTemplatePayload) {
  event.dataTransfer.setData(PALETTE_MIME, encodePalettePayload(template))
  event.dataTransfer.effectAllowed = 'copy'
}

function SymbolPreview({ symbol }: { symbol: LibrarySymbol }) {
  const size = Math.min(NODE_SIZE[symbol.kind], 32)
  return (
    <span
      className="node-library__preview"
      style={{ width: size, height: size, color: symbol.iconColor }}
    >
      <IconGlyph iconId={symbol.iconId} />
    </span>
  )
}

function SymbolLeaf({
  symbol,
  onPlaceTemplate,
}: {
  symbol: LibrarySymbol
  onPlaceTemplate: (template: NodeTemplatePayload) => void
}) {
  const template: NodeTemplatePayload = {
    source: 'symbol',
    symbolId: symbol.id,
    kind: symbol.kind,
  }
  return (
    <li className="node-library__tree-leaf">
      <button
        type="button"
        className="node-library__tree-item"
        draggable
        onDragStart={(event) => beginPaletteDrag(event, template)}
        onClick={() => onPlaceTemplate(template)}
        title={`${symbol.label} — 클릭: 중앙 추가 · 드래그: 위치 지정`}
      >
        <SymbolPreview symbol={symbol} />
        <span className="node-library__tree-label">{symbol.label}</span>
      </button>
    </li>
  )
}

export function NodeLibrary({ onPlaceTemplate }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LIBRARY_BRANCHES.filter((b) => b.expandable).map((b) => [b.kind, true])),
  )

  const toggleBranch = (kind: string) => {
    setExpanded((prev) => ({ ...prev, [kind]: !prev[kind] }))
  }

  return (
    <aside className="node-library" aria-label="Node library">
      <h2 className="node-library__heading">Nodes</h2>
      <ul className="node-library__tree">
        {LIBRARY_BRANCHES.map((branch) => {
          if (!branch.expandable) {
            const symbol = branch.symbols[0]!
            const template: NodeTemplatePayload = {
              source: 'symbol',
              symbolId: symbol.id,
              kind: symbol.kind,
            }
            return (
              <li key={branch.kind} className="node-library__tree-branch">
                <button
                  type="button"
                  className="node-library__tree-item node-library__tree-item--branch"
                  draggable
                  onDragStart={(event) => beginPaletteDrag(event, template)}
                  onClick={() => onPlaceTemplate(template)}
                  title={`${branch.label} — 클릭: 중앙 추가 · 드래그: 위치 지정`}
                >
                  <SymbolPreview symbol={symbol} />
                  <span className="node-library__tree-label">{branch.label}</span>
                </button>
              </li>
            )
          }

          const isOpen = expanded[branch.kind] ?? true
          return (
            <li key={branch.kind} className="node-library__tree-branch">
              <button
                type="button"
                className="node-library__tree-toggle"
                aria-expanded={isOpen}
                onClick={() => toggleBranch(branch.kind)}
              >
                <span className="node-library__tree-caret" aria-hidden>
                  {isOpen ? '▾' : '▸'}
                </span>
                <span className="node-library__tree-branch-label">{branch.label}</span>
              </button>
              {isOpen && (
                <ul className="node-library__tree-children">
                  {branch.symbols.map((symbol) => (
                    <SymbolLeaf key={symbol.id} symbol={symbol} onPlaceTemplate={onPlaceTemplate} />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

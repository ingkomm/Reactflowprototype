import type { PassiveKind } from '../types'
import { ADDABLE_PASSIVE_KINDS, PASSIVE_KIND_LABEL } from '../types'

type Props = {
  addKind: PassiveKind
  onAddKindChange: (kind: PassiveKind) => void
  onAddNode: () => void
  gridSnapEnabled: boolean
  onGridSnapChange: (enabled: boolean) => void
  emptySlotHighlightEnabled: boolean
  onEmptySlotHighlightChange: (enabled: boolean) => void
  onDeleteSelected: () => void
  hasSelection: boolean
  onOpenClassManager: () => void
}

export function TopBar({
  addKind,
  onAddKindChange,
  onAddNode,
  gridSnapEnabled,
  onGridSnapChange,
  emptySlotHighlightEnabled,
  onEmptySlotHighlightChange,
  onDeleteSelected,
  hasSelection,
  onOpenClassManager,
}: Props) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden />
        <div>
          <p className="topbar__eyebrow">Path of Building style</p>
          <h1>Passive Tree Prototype</h1>
        </div>
      </div>

      <div className="topbar__actions">
        <label className="topbar__kind">
          <span>Add as</span>
          <select
            value={addKind}
            onChange={(e) => onAddKindChange(e.target.value as PassiveKind)}
          >
            {ADDABLE_PASSIVE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PASSIVE_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--primary" onClick={onAddNode}>
          Add Node
        </button>
        <label className="topbar__toggle">
          <input
            type="checkbox"
            checked={gridSnapEnabled}
            onChange={(e) => onGridSnapChange(e.target.checked)}
          />
          <span>그리드 스냅</span>
        </label>
        <label className="topbar__toggle">
          <input
            type="checkbox"
            checked={emptySlotHighlightEnabled}
            onChange={(e) => onEmptySlotHighlightChange(e.target.checked)}
          />
          <span>빈 슬롯 표시</span>
        </label>
        <button
          type="button"
          className="btn btn--danger"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
        >
          Delete Selected
        </button>
        <button type="button" className="btn" onClick={onOpenClassManager}>
          클래스
        </button>
      </div>
    </header>
  )
}

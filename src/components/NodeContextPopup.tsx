import { useEffect } from 'react'
import { useFloatingPanelDrag } from '../useFloatingPanelDrag'
import './NodeContextPopup.css'

export type NodeContextPopupState = {
  nodeId: string
  x: number
  y: number
} | null

type Props = {
  open: boolean
  x: number
  y: number
  nodeLabel: string
  canPinVideos?: boolean
  isVideoPinned?: boolean
  onClose: () => void
  onToggleVideoPin?: () => void
}

/** Generic right-click menu for non-Shard/non-Notable nodes (e.g. Mastery pin). */
export function NodeContextPopup({
  open,
  x,
  y,
  nodeLabel,
  canPinVideos = false,
  isVideoPinned = false,
  onClose,
  onToggleVideoPin,
}: Props) {
  const { panelRef, position, headerDragProps } = useFloatingPanelDrag(x, y)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="node-context-popup__backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="node-context-popup"
        role="menu"
        aria-label={`${nodeLabel} 컨텍스트 메뉴`}
        data-testid="node-context-popup"
        style={{ left: position.x, top: position.y }}
      >
        <header
          className="node-context-popup__head"
          data-testid="node-context-popup-head"
          {...headerDragProps}
        >
          <strong>{nodeLabel}</strong>
        </header>

        {canPinVideos && onToggleVideoPin ? (
          <footer className="node-context-popup__foot">
            <button type="button" className="btn btn--ghost" onClick={onToggleVideoPin}>
              {isVideoPinned ? '동영상 핀 해제' : '동영상 핀'}
            </button>
          </footer>
        ) : (
          <p className="node-context-popup__empty">빠른 동작 없음</p>
        )}
      </div>
    </>
  )
}

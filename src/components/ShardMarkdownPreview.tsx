import { useEffect } from 'react'
import { MarkdownView } from './MarkdownView'
import { useFloatingPanelDrag } from '../useFloatingPanelDrag'
import type { ViewerPanelBounds } from '../pinnedViewer'
import './ShardMarkdownPreview.css'

type Props = {
  open: boolean
  x: number
  y: number
  nodeLabel: string
  markdown?: string
  onClose: () => void
  /** When true, no backdrop and Escape does not close (unless closeOnEscape). */
  pinned?: boolean
  /** Default true for transient viewers. */
  modal?: boolean
  /** Default true for transient viewers; false for pinned. */
  closeOnEscape?: boolean
  zIndex?: number
  onPin?: (position: { x: number; y: number }) => void
  onBoundsChange?: (bounds: ViewerPanelBounds) => void
  onActivate?: () => void
}

/** Read-only Shard markdown quick view (edit stays in Inspector). */
export function ShardMarkdownPreview({
  open,
  x,
  y,
  nodeLabel,
  markdown,
  onClose,
  pinned = false,
  modal,
  closeOnEscape,
  zIndex,
  onPin,
  onBoundsChange,
  onActivate,
}: Props) {
  const showModal = modal ?? !pinned
  const escapeCloses = closeOnEscape ?? !pinned
  const { panelRef, position, headerDragProps } = useFloatingPanelDrag(x, y, {
    onBoundsChange,
  })

  useEffect(() => {
    if (!open || !escapeCloses) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, escapeCloses, onClose])

  if (!open) return null

  const hasContent = Boolean(markdown?.trim())
  const panelStyle = pinned
    ? { left: position.x, top: position.y, zIndex: zIndex ?? undefined }
    : { zIndex: zIndex ?? undefined }

  const pinAtPanel = () => {
    if (!onPin) return
    const rect = panelRef.current?.getBoundingClientRect()
    onPin({
      x: rect?.left ?? position.x,
      y: rect?.top ?? position.y,
    })
  }

  return (
    <>
      {showModal ? (
        <button
          type="button"
          className="shard-markdown-preview__backdrop"
          aria-label="닫기"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        className={`shard-markdown-preview${pinned ? ' is-pinned' : ' is-preview'}`}
        role="dialog"
        aria-label={`${nodeLabel} Markdown 미리보기`}
        data-testid="shard-markdown-preview"
        data-pinned={pinned ? 'true' : 'false'}
        data-resizable={pinned ? 'true' : 'false'}
        style={panelStyle}
        onPointerDownCapture={onActivate}
      >
        <header
          className="shard-markdown-preview__head"
          data-testid="shard-markdown-preview-head"
          {...(pinned ? headerDragProps : {})}
        >
          <div>
            <p className="shard-markdown-preview__kind">Shard{pinned ? ' · Pin' : ''}</p>
            <strong>{nodeLabel}</strong>
          </div>
          <div className="shard-markdown-preview__actions">
            {!pinned && onPin ? (
              <button
                type="button"
                className="btn btn--ghost"
                data-testid="viewer-pin"
                onClick={pinAtPanel}
              >
                Pin
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>
        <div className="shard-markdown-preview__body">
          {hasContent ? (
            <MarkdownView markdown={markdown ?? ''} />
          ) : (
            <p className="shard-markdown-preview__empty">Markdown이 비어 있습니다.</p>
          )}
        </div>
      </div>
    </>
  )
}

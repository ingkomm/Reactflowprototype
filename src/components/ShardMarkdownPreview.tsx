import { useEffect } from 'react'
import { MarkdownView } from './MarkdownView'
import { useFloatingPanelDrag } from '../useFloatingPanelDrag'
import './ShardMarkdownPreview.css'

type Props = {
  open: boolean
  x: number
  y: number
  nodeLabel: string
  markdown?: string
  onClose: () => void
}

/** Read-only Shard markdown quick view (edit stays in Inspector). */
export function ShardMarkdownPreview({
  open,
  x,
  y,
  nodeLabel,
  markdown,
  onClose,
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

  const hasContent = Boolean(markdown?.trim())

  return (
    <>
      <button
        type="button"
        className="shard-markdown-preview__backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="shard-markdown-preview"
        role="dialog"
        aria-label={`${nodeLabel} Markdown 미리보기`}
        data-testid="shard-markdown-preview"
        style={{ left: position.x, top: position.y }}
      >
        <header
          className="shard-markdown-preview__head"
          data-testid="shard-markdown-preview-head"
          {...headerDragProps}
        >
          <div>
            <p className="shard-markdown-preview__kind">Shard</p>
            <strong>{nodeLabel}</strong>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            닫기
          </button>
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

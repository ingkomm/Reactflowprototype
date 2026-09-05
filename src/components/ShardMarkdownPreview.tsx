import { useEffect, useLayoutEffect, useRef } from 'react'
import { MarkdownView } from './MarkdownView'
import './ShardMarkdownPreview.css'

type Props = {
  open: boolean
  x: number
  y: number
  nodeLabel: string
  markdown?: string
  onClose: () => void
}

function clampPosition(x: number, y: number, width: number, height: number) {
  const margin = 8
  const maxX = Math.max(margin, window.innerWidth - width - margin)
  const maxY = Math.max(margin, window.innerHeight - height - margin)
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  }
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
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const next = clampPosition(x, y, rect.width, rect.height)
    panelRef.current.style.left = `${next.x}px`
    panelRef.current.style.top = `${next.y}px`
  }, [open, x, y, markdown])

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
        style={{ left: x, top: y }}
      >
        <header className="shard-markdown-preview__head">
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

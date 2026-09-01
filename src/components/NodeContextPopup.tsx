import { useEffect, useLayoutEffect, useRef } from 'react'
import type { TrainingLog } from '../types'
import { memoPreview, recentMemoLogs, recentPracticeLogs } from '../dailyLog'
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
  logs: TrainingLog[]
  canPinVideos?: boolean
  isVideoPinned?: boolean
  onClose: () => void
  onSelectLog: (logId: string) => void
  onToggleVideoPin?: () => void
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

export function NodeContextPopup({
  open,
  x,
  y,
  nodeLabel,
  logs,
  canPinVideos = false,
  isVideoPinned = false,
  onClose,
  onSelectLog,
  onToggleVideoPin,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const recentLogs = recentPracticeLogs(logs)
  const memoLogs = recentMemoLogs(logs)

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
  }, [open, x, y, logs.length, memoLogs.length])

  if (!open) return null

  return (
    <>
      <button type="button" className="node-context-popup__backdrop" aria-label="닫기" onClick={onClose} />
      <div
        ref={panelRef}
        className="node-context-popup"
        role="menu"
        aria-label={`${nodeLabel} 컨텍스트 메뉴`}
        style={{ left: x, top: y }}
      >
        <header className="node-context-popup__head">
          <strong>{nodeLabel}</strong>
        </header>

        <section className="node-context-popup__section">
          <h3>최근 연습 기록</h3>
          {recentLogs.length === 0 ? (
            <p className="node-context-popup__empty">기록 없음</p>
          ) : (
            <ul className="node-context-popup__list">
              {recentLogs.map((log) => (
                <li key={log.id}>
                  <button type="button" className="node-context-popup__item" onClick={() => onSelectLog(log.id)}>
                    <span className="node-context-popup__date">{log.date}</span>
                    {log.media?.[0]?.url ? <span className="node-context-popup__tag">영상</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="node-context-popup__section">
          <h3>Simple Memo</h3>
          {memoLogs.length === 0 ? (
            <p className="node-context-popup__empty">메모 없음</p>
          ) : (
            <ul className="node-context-popup__list">
              {memoLogs.map((log) => (
                <li key={`memo-${log.id}`}>
                  <button type="button" className="node-context-popup__item" onClick={() => onSelectLog(log.id)}>
                    <span className="node-context-popup__memo">{memoPreview(log.note ?? '')}</span>
                    <span className="node-context-popup__date node-context-popup__date--sub">{log.date}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canPinVideos && onToggleVideoPin ? (
          <footer className="node-context-popup__foot">
            <button type="button" className="btn btn--ghost" onClick={onToggleVideoPin}>
              {isVideoPinned ? '동영상 핀 해제' : '동영상 핀'}
            </button>
          </footer>
        ) : null}
      </div>
    </>
  )
}

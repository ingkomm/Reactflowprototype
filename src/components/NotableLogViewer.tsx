import { useEffect, useMemo, useState } from 'react'
import type { TrainingLog, VideoMedia } from '../types'
import { dailyLogTimelineLabel, sortedDailyLogs } from '../dailyLog'
import { useFloatingPanelDrag } from '../useFloatingPanelDrag'
import type { ViewerPanelBounds } from '../pinnedViewer'
import { MarkdownView } from './MarkdownView'
import { VideoEmbed } from './VideoEmbed'
import './NotableLogViewer.css'

type Props = {
  open: boolean
  x: number
  y: number
  nodeLabel: string
  /** Notable current summary (node.markdown) — not a Daily Log body. */
  markdown?: string
  logs: TrainingLog[]
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

function logHasVideo(log: TrainingLog): boolean {
  return Boolean(log.media?.some((item) => item.url?.trim()))
}

function videosOf(log: TrainingLog | null): VideoMedia[] {
  if (!log?.media?.length) return []
  return log.media.filter((item) => item.url?.trim())
}

/**
 * Read-only Notable viewer: Summary (markdown) + Daily Log timeline.
 * Remount with `key={nodeId}` from App for session defaults.
 * Panel position/size (when pinned) are UI-only (never persisted).
 */
export function NotableLogViewer({
  open,
  x,
  y,
  nodeLabel,
  markdown,
  logs,
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
  const timeline = useMemo(() => sortedDailyLogs(logs), [logs])
  const [selectedLogId, setSelectedLogId] = useState<string | null>(
    () => timeline[0]?.id ?? null,
  )
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !escapeCloses) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, escapeCloses, onClose])

  const selectedLog =
    timeline.find((log) => log.id === selectedLogId) ?? timeline[0] ?? null
  const videos = videosOf(selectedLog)
  const activeVideo =
    videos.find((item) => item.id === selectedVideoId) ?? videos[0] ?? null
  const hasSummary = Boolean(markdown?.trim())

  const selectLog = (logId: string) => {
    setSelectedLogId(logId)
    setSelectedVideoId(null)
  }

  if (!open) return null

  return (
    <>
      {showModal ? (
        <button
          type="button"
          className="notable-log-viewer__backdrop"
          aria-label="닫기"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        className={`notable-log-viewer${pinned ? ' is-pinned' : ''}`}
        role="dialog"
        aria-label={`${nodeLabel} Notable Viewer`}
        style={{ left: position.x, top: position.y, zIndex: zIndex ?? undefined }}
        data-testid="notable-log-viewer"
        data-pinned={pinned ? 'true' : 'false'}
        data-resizable={pinned ? 'true' : 'false'}
        onPointerDownCapture={onActivate}
      >
        <header
          className="notable-log-viewer__head"
          data-testid="notable-log-viewer-head"
          {...headerDragProps}
        >
          <div>
            <p className="notable-log-viewer__kind">Notable{pinned ? ' · Pin' : ''}</p>
            <strong>{nodeLabel}</strong>
          </div>
          <div className="notable-log-viewer__actions">
            {!pinned && onPin ? (
              <button
                type="button"
                className="btn btn--ghost"
                data-testid="viewer-pin"
                onClick={() => onPin({ x: position.x, y: position.y })}
              >
                Pin
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </header>

        <section className="notable-log-viewer__summary" data-testid="notable-summary">
          <h3 className="notable-log-viewer__section-title">Summary</h3>
          {hasSummary ? (
            <MarkdownView markdown={markdown ?? ''} />
          ) : (
            <p className="notable-log-viewer__empty">Summary가 비어 있습니다.</p>
          )}
        </section>

        <section className="notable-log-viewer__timeline" data-testid="notable-timeline">
          <h3 className="notable-log-viewer__section-title">Timeline</h3>
          {timeline.length === 0 ? (
            <p className="notable-log-viewer__empty">Daily Log가 없습니다.</p>
          ) : (
            <div className="notable-log-viewer__layout">
              <aside className="notable-log-viewer__playlist" aria-label="Daily Log timeline">
                <ul className="notable-log-viewer__list">
                  {timeline.map((log) => {
                    const active = log.id === selectedLog?.id
                    return (
                      <li key={log.id}>
                        <button
                          type="button"
                          className={`notable-log-viewer__item${active ? ' is-active' : ''}`}
                          data-testid={`notable-log-item-${log.id}`}
                          aria-pressed={active}
                          onClick={() => selectLog(log.id)}
                        >
                          <span className="notable-log-viewer__date">{log.date}</span>
                          <span className="notable-log-viewer__memo">
                            {dailyLogTimelineLabel(log)}
                          </span>
                          {logHasVideo(log) ? (
                            <span className="notable-log-viewer__tag">영상</span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </aside>

              <div className="notable-log-viewer__detail" data-testid="notable-log-detail">
                <p className="notable-log-viewer__note-date">{selectedLog?.date}</p>

                {videos.length > 0 ? (
                  <div className="notable-log-viewer__video" data-testid="notable-video-pane">
                    {videos.length > 1 ? (
                      <ul className="notable-log-viewer__video-list" aria-label="Video playlist">
                        {videos.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              data-testid={`notable-video-item-${item.id}`}
                              className={`notable-log-viewer__video-item${
                                item.id === activeVideo?.id ? ' is-active' : ''
                              }`}
                              onClick={() => setSelectedVideoId(item.id)}
                            >
                              {item.title?.trim() || item.url}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {activeVideo ? (
                      <>
                        {activeVideo.note?.trim() ? (
                          <p
                            className="notable-log-viewer__media-note"
                            data-testid="notable-legacy-media-note"
                          >
                            {activeVideo.note}
                          </p>
                        ) : null}
                        <div
                          className="notable-log-viewer__player"
                          data-testid="notable-video-player"
                        >
                          <VideoEmbed media={activeVideo} />
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {selectedLog?.note?.trim() ? (
                  <div
                    className="notable-log-viewer__short-note"
                    data-testid="notable-short-note"
                  >
                    <MarkdownView markdown={selectedLog.note} />
                  </div>
                ) : (
                  <p className="notable-log-viewer__empty" data-testid="notable-short-note-empty">
                    짧은 메모가 없습니다.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TrainingLog, VideoMedia } from '../types'
import { dailyLogSummary, sortedDailyLogs } from '../dailyLog'
import { MarkdownView } from './MarkdownView'
import { VideoEmbed } from './VideoEmbed'
import './NotableLogViewer.css'

type ViewerMode = 'note' | 'video'

type Props = {
  open: boolean
  x: number
  y: number
  nodeLabel: string
  logs: TrainingLog[]
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

function logHasVideo(log: TrainingLog): boolean {
  return Boolean(log.media?.some((item) => item.url?.trim()))
}

function videosOf(log: TrainingLog | null): VideoMedia[] {
  if (!log?.media?.length) return []
  return log.media.filter((item) => item.url?.trim())
}

/** Read-only Notable Daily Log viewer (edit stays in Inspector / DailyLogPanel). */
export function NotableLogViewer({
  open,
  x,
  y,
  nodeLabel,
  logs,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const playlist = useMemo(() => sortedDailyLogs(logs), [logs])
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [viewerMode, setViewerMode] = useState<ViewerMode>('note')
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [sessionKey, setSessionKey] = useState<string | null>(null)

  // Reset UI selection when a new popup session opens (node/open edge).
  const openKey = open ? `${nodeLabel}:${playlist.map((l) => l.id).join(',')}` : null
  if (open && openKey !== sessionKey) {
    setSessionKey(openKey)
    setSelectedLogId(playlist[0]?.id ?? null)
    setViewerMode('note')
    setSelectedVideoId(null)
  }
  if (!open && sessionKey !== null) {
    setSessionKey(null)
  }

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
  }, [open, x, y, playlist.length, viewerMode])

  const selectedLog =
    playlist.find((log) => log.id === selectedLogId) ?? playlist[0] ?? null
  const videos = videosOf(selectedLog)
  const activeVideo =
    videos.find((item) => item.id === selectedVideoId) ?? videos[0] ?? null

  const selectLog = (logId: string) => {
    setSelectedLogId(logId)
    setSelectedVideoId(null)
  }

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="notable-log-viewer__backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="notable-log-viewer"
        role="dialog"
        aria-label={`${nodeLabel} Log Viewer`}
        style={{ left: x, top: y }}
      >
        <header className="notable-log-viewer__head">
          <div>
            <p className="notable-log-viewer__kind">Notable</p>
            <strong>{nodeLabel}</strong>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            닫기
          </button>
        </header>

        {playlist.length === 0 ? (
          <p className="notable-log-viewer__empty">Daily Log가 없습니다.</p>
        ) : (
          <div className="notable-log-viewer__layout">
            <aside className="notable-log-viewer__playlist" aria-label="Log playlist">
              <ul className="notable-log-viewer__list">
                {playlist.map((log) => {
                  const active = log.id === selectedLog?.id
                  return (
                    <li key={log.id}>
                      <button
                        type="button"
                        className={`notable-log-viewer__item${active ? ' is-active' : ''}`}
                        onClick={() => selectLog(log.id)}
                      >
                        <span className="notable-log-viewer__date">{log.date}</span>
                        <span className="notable-log-viewer__memo">
                          {dailyLogSummary(log)}
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

            <section className="notable-log-viewer__viewer">
              <div className="notable-log-viewer__modes" role="tablist" aria-label="Viewer mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewerMode === 'note'}
                  className={`notable-log-viewer__mode${viewerMode === 'note' ? ' is-active' : ''}`}
                  onClick={() => setViewerMode('note')}
                >
                  Note
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewerMode === 'video'}
                  className={`notable-log-viewer__mode${viewerMode === 'video' ? ' is-active' : ''}`}
                  onClick={() => setViewerMode('video')}
                >
                  Video
                </button>
              </div>

              {viewerMode === 'note' ? (
                <div className="notable-log-viewer__note">
                  <p className="notable-log-viewer__note-date">{selectedLog?.date}</p>
                  {selectedLog?.note?.trim() ? (
                    <MarkdownView markdown={selectedLog.note} />
                  ) : (
                    <p className="notable-log-viewer__empty">메모가 없습니다.</p>
                  )}
                </div>
              ) : (
                <div className="notable-log-viewer__video">
                  {videos.length === 0 ? (
                    <p className="notable-log-viewer__empty">No video</p>
                  ) : (
                    <>
                      {videos.length > 1 ? (
                        <ul className="notable-log-viewer__video-list" aria-label="Video playlist">
                          {videos.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
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
                      {activeVideo ? <VideoEmbed media={activeVideo} /> : null}
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}

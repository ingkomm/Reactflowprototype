import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { TrainingLog, VideoMedia } from '../types'
import { dailyLogSummary, sortedDailyLogs } from '../dailyLog'
import { useFloatingPanelDrag } from '../useFloatingPanelDrag'
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

const DEFAULT_PLAYER_WIDTH = 480
const DEFAULT_PLAYER_HEIGHT = 270
const MIN_PLAYER_WIDTH = 320
const MIN_PLAYER_HEIGHT = 180

function clampPlayerSize(width: number, height: number) {
  const maxWidth = Math.max(MIN_PLAYER_WIDTH, window.innerWidth - 48)
  const maxHeight = Math.max(MIN_PLAYER_HEIGHT, window.innerHeight - 160)
  return {
    width: Math.min(Math.max(MIN_PLAYER_WIDTH, Math.round(width)), maxWidth),
    height: Math.min(Math.max(MIN_PLAYER_HEIGHT, Math.round(height)), maxHeight),
  }
}

function logHasVideo(log: TrainingLog): boolean {
  return Boolean(log.media?.some((item) => item.url?.trim()))
}

function videosOf(log: TrainingLog | null): VideoMedia[] {
  if (!log?.media?.length) return []
  return log.media.filter((item) => item.url?.trim())
}

/**
 * Read-only Notable Daily Log viewer.
 * Remount with `key={nodeId}` from App for session defaults.
 * Panel position and player size are UI-only and never written to the graph document.
 */
export function NotableLogViewer({
  open,
  x,
  y,
  nodeLabel,
  logs,
  onClose,
}: Props) {
  const { panelRef, position, headerDragProps } = useFloatingPanelDrag(x, y)
  const playlist = useMemo(() => sortedDailyLogs(logs), [logs])
  const [selectedLogId, setSelectedLogId] = useState<string | null>(
    () => playlist[0]?.id ?? null,
  )
  const [viewerMode, setViewerMode] = useState<ViewerMode>('note')
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [playerSize, setPlayerSize] = useState({
    width: DEFAULT_PLAYER_WIDTH,
    height: DEFAULT_PLAYER_HEIGHT,
  })
  const resizeRef = useRef<{
    startX: number
    startY: number
    originW: number
    originH: number
  } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = resizeRef.current
      if (!drag) return
      setPlayerSize(
        clampPlayerSize(
          drag.originW + (event.clientX - drag.startX),
          drag.originH + (event.clientY - drag.startY),
        ),
      )
    }
    const onUp = () => {
      resizeRef.current = null
      document.body.classList.remove('is-notable-player-resizing')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('is-notable-player-resizing')
    }
  }, [])

  const selectedLog =
    playlist.find((log) => log.id === selectedLogId) ?? playlist[0] ?? null
  const videos = videosOf(selectedLog)
  const activeVideo =
    videos.find((item) => item.id === selectedVideoId) ?? videos[0] ?? null

  const selectLog = (logId: string) => {
    setSelectedLogId(logId)
    setSelectedVideoId(null)
  }

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originW: playerSize.width,
      originH: playerSize.height,
    }
    document.body.classList.add('is-notable-player-resizing')
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
        style={{ left: position.x, top: position.y }}
        data-testid="notable-log-viewer"
      >
        <header
          className="notable-log-viewer__head"
          data-testid="notable-log-viewer-head"
          {...headerDragProps}
        >
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
                        data-testid={`notable-log-item-${log.id}`}
                        aria-pressed={active}
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
                  data-testid="notable-mode-note"
                  className={`notable-log-viewer__mode${viewerMode === 'note' ? ' is-active' : ''}`}
                  onClick={() => setViewerMode('note')}
                >
                  Note
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewerMode === 'video'}
                  data-testid="notable-mode-video"
                  className={`notable-log-viewer__mode${viewerMode === 'video' ? ' is-active' : ''}`}
                  onClick={() => setViewerMode('video')}
                >
                  Video
                </button>
              </div>

              {viewerMode === 'note' ? (
                <div className="notable-log-viewer__note" data-testid="notable-note-pane">
                  <p className="notable-log-viewer__note-date">{selectedLog?.date}</p>
                  {selectedLog?.note?.trim() ? (
                    <MarkdownView markdown={selectedLog.note} />
                  ) : (
                    <p className="notable-log-viewer__empty">메모가 없습니다.</p>
                  )}
                </div>
              ) : (
                <div className="notable-log-viewer__video" data-testid="notable-video-pane">
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
                        <div
                          className="notable-log-viewer__player"
                          data-testid="notable-video-player"
                          style={{
                            width: playerSize.width,
                            height: playerSize.height,
                          }}
                        >
                          <VideoEmbed media={activeVideo} />
                          <button
                            type="button"
                            className="notable-log-viewer__resize"
                            aria-label="영상 크기 조절"
                            title="드래그해서 플레이어 크기 조절"
                            data-testid="notable-video-resize"
                            data-no-drag
                            onPointerDown={beginResize}
                          />
                        </div>
                      ) : null}
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

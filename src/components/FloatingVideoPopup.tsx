import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useStore, useReactFlow } from '@xyflow/react'
import type { PassiveFlowNode } from './PassiveNode'
import type { PassiveNodeData } from '../types'
import { dailyLogSummary } from '../dailyLog'
import { extractDailyLogsFromNodeData } from '../dailyLogNode'
import { NODE_SIZE } from '../orbit'
import { isLocalVideoMedia, isYouTubeShortsUrl } from '../videoMedia'
import { VideoEmbed } from './VideoEmbed'
import './FloatingVideoPopup.css'

type Props = {
  floatingNodeId: string
  stackIndex: number
  containerRef: RefObject<HTMLElement | null>
  onClose: (nodeId: string) => void
  onSelectLog?: (nodeId: string, logId: string) => void
}

const DEFAULT_PLAYER_WIDTH = 320
export const MIN_PLAYER_WIDTH = 200
/** Landscape / square floating-video resize ceiling (matches prior behavior). */
export const MAX_PLAYER_WIDTH = 720
/** Portrait (aspect < 1) floating-video resize ceiling — aligned with VideoEmbed portrait cap. */
export const PORTRAIT_MAX_PLAYER_WIDTH = 420
/** Fallback until VideoEmbed reports the media aspect (and for resize math). */
export const DEFAULT_PIN_ASPECT = 16 / 9

type DragMode = 'move' | 'resize' | null

/**
 * Pin frame aspect follows VideoEmbed's reported ratio for all media types
 * (local intrinsic, Shorts 9:16, standard YouTube 16:9).
 */
export function resolvePinnedPlayerAspect(mediaAspect: number | null): number {
  if (mediaAspect != null && mediaAspect > 0) return mediaAspect
  return DEFAULT_PIN_ASPECT
}

/** Max Pin player width for the current resolved aspect (portrait shares VideoEmbed's 420 cap). */
export function resolvePinnedMaxPlayerWidth(aspect: number): number {
  return aspect < 1 ? PORTRAIT_MAX_PLAYER_WIDTH : MAX_PLAYER_WIDTH
}

export function clampPinnedPlayerWidth(width: number, aspect: number): number {
  const max = resolvePinnedMaxPlayerWidth(aspect)
  return Math.min(max, Math.max(MIN_PLAYER_WIDTH, width))
}

export function pinnedPlayerHeight(width: number, aspect: number): number {
  return width / aspect
}

export function FloatingVideoPopup(props: Props) {
  return <FloatingVideoPopupInner key={`${props.floatingNodeId}-${props.stackIndex}`} {...props} />
}

function FloatingVideoPopupInner({
  floatingNodeId,
  stackIndex,
  containerRef,
  onClose,
  onSelectLog,
}: Props) {
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const transform = useStore((s) => s.transform)
  const { flowToScreenPosition } = useReactFlow()
  const [activeLogId, setActiveLogId] = useState<string | null>(null)
  const [offset, setOffset] = useState({ x: stackIndex * 28, y: stackIndex * 28 })
  const [playerWidth, setPlayerWidth] = useState(DEFAULT_PLAYER_WIDTH)
  const [mediaAspect, setMediaAspect] = useState<number | null>(null)
  const [trackedVideoId, setTrackedVideoId] = useState<string | null>(null)
  const [layout, setLayout] = useState({
    nodeCenter: { x: 0, y: 0 },
    popupLeft: 0,
    popupTop: 0,
    anchorX: 0,
    anchorY: 0,
    playerHeight: DEFAULT_PLAYER_WIDTH / DEFAULT_PIN_ASPECT,
  })
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    originOffsetX: number
    originOffsetY: number
    originWidth: number
  } | null>(null)
  const endDragRef = useRef<(() => void) | null>(null)
  const aspectRef = useRef(DEFAULT_PIN_ASPECT)

  const node = useMemo(
    () => nodes.find((n) => n.id === floatingNodeId) ?? null,
    [nodes, floatingNodeId],
  )

  const data = (node?.data as PassiveNodeData | undefined) ?? null
  const logs = useMemo(() => (data ? extractDailyLogsFromNodeData(data) : []), [data])

  const resolvedLogId =
    activeLogId && logs.some((log) => log.id === activeLogId) ? activeLogId : (logs[0]?.id ?? null)

  const activeLog = useMemo(() => {
    if (!logs.length || !resolvedLogId) return null
    return logs.find((log) => log.id === resolvedLogId) ?? logs[0]!
  }, [logs, resolvedLogId])

  const activeVideo = activeLog?.media?.[0] ?? null
  const activeVideoId = activeVideo?.id ?? null
  // Reset cached local ratio when the pinned media identity changes.
  if (activeVideoId !== trackedVideoId) {
    setTrackedVideoId(activeVideoId)
    setMediaAspect(null)
  }
  const isLocalActive = Boolean(activeVideo && isLocalVideoMedia(activeVideo))
  const isShortsActive = Boolean(activeVideo && isYouTubeShortsUrl(activeVideo.url))
  const playerAspect = resolvePinnedPlayerAspect(mediaAspect)

  useEffect(() => {
    aspectRef.current = playerAspect
  }, [playerAspect])

  // Landscape→portrait media switch: shrink an oversized Pin to the portrait ceiling.
  const maxPlayerWidth = resolvePinnedMaxPlayerWidth(playerAspect)
  if (playerWidth > maxPlayerWidth) {
    setPlayerWidth(maxPlayerWidth)
  }

  useLayoutEffect(() => {
    if (!node || !data) return
    const size = NODE_SIZE[data.kind] ?? 52
    const screen = flowToScreenPosition({
      x: node.position.x + size / 2,
      y: node.position.y + size / 2,
    })
    const bounds = containerRef.current?.getBoundingClientRect()
    const nodeCenter = {
      x: screen.x - (bounds?.left ?? 0),
      y: screen.y - (bounds?.top ?? 0),
    }
    const baseLeft = nodeCenter.x + Math.max(36, size * 0.35) + 40
    const baseTop = Math.max(12, nodeCenter.y - 110)
    const popupLeft = baseLeft + offset.x
    const popupTop = baseTop + offset.y
    const playerHeight = activeVideo ? pinnedPlayerHeight(playerWidth, playerAspect) : 0
    setLayout({
      nodeCenter,
      popupLeft,
      popupTop,
      anchorX: popupLeft + playerWidth / 2,
      anchorY: popupTop + 20,
      playerHeight,
    })
  }, [
    activeVideo,
    containerRef,
    data,
    flowToScreenPosition,
    node,
    offset.x,
    offset.y,
    playerAspect,
    playerWidth,
    transform,
  ])

  const beginDrag = useCallback(
    (mode: Exclude<DragMode, null>, event: ReactPointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        originOffsetX: offset.x,
        originOffsetY: offset.y,
        originWidth: playerWidth,
      }

      const handleMove = (moveEvent: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        const dx = moveEvent.clientX - drag.startX
        const dy = moveEvent.clientY - drag.startY
        if (drag.mode === 'move') {
          setOffset({ x: drag.originOffsetX + dx, y: drag.originOffsetY + dy })
          return
        }
        const aspect = aspectRef.current
        const delta = Math.max(dx, dy * aspect)
        setPlayerWidth(clampPinnedPlayerWidth(drag.originWidth + delta, aspect))
      }

      const handleUp = () => {
        dragRef.current = null
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        endDragRef.current = null
      }

      endDragRef.current = handleUp
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [offset.x, offset.y, playerWidth],
  )

  useEffect(() => {
    return () => {
      endDragRef.current?.()
    }
  }, [])

  if (!node || !data) return null

  const handleLogClick = (logId: string) => {
    setActiveLogId(logId)
    onSelectLog?.(floatingNodeId, logId)
  }

  const resizeTitle = isLocalActive
    ? '드래그해서 크기 조절 (원본 비율 유지)'
    : isShortsActive
      ? '드래그해서 크기 조절 (9:16 유지)'
      : '드래그해서 크기 조절 (16:9 유지)'

  return (
    <div className="floating-video-layer" aria-live="polite">
      <svg className="floating-video-layer__links" aria-hidden>
        <line
          x1={layout.nodeCenter.x}
          y1={layout.nodeCenter.y}
          x2={layout.anchorX}
          y2={layout.anchorY}
          className="floating-video-layer__link"
        />
        <circle cx={layout.nodeCenter.x} cy={layout.nodeCenter.y} r={5} className="floating-video-layer__dot" />
        <circle cx={layout.anchorX} cy={layout.anchorY} r={4} className="floating-video-layer__dot" />
      </svg>

      <div
        className="floating-video-popup"
        style={
          {
            left: layout.popupLeft,
            top: layout.popupTop,
            width: playerWidth + 24,
            zIndex: 40 + stackIndex,
            '--player-width': `${playerWidth}px`,
          } as CSSProperties
        }
        role="dialog"
        aria-label={`${data.label} Daily Log`}
        data-player-aspect={String(playerAspect)}
      >
        <header
          className="floating-video-popup__head"
          onPointerDown={(event) => beginDrag('move', event)}
        >
          <div>
            <p className="floating-video-popup__eyebrow">Floating Daily Log · 드래그로 이동</p>
            <h3 className="floating-video-popup__title">{data.label}</h3>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onClose(floatingNodeId)}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="영상 닫기"
          >
            ×
          </button>
        </header>

        {logs.length === 0 ? (
          <p className="floating-video-popup__empty">이 노드에 Daily Log가 없습니다.</p>
        ) : (
          <>
            <ul className="floating-video-popup__log-list">
              {logs.map((log) => {
                const selected = log.id === resolvedLogId
                return (
                  <li key={log.id}>
                    <button
                      type="button"
                      className={`floating-video-popup__log-card${selected ? ' is-active' : ''}`}
                      onClick={() => handleLogClick(log.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <span className="floating-video-popup__log-date">{log.date}</span>
                      <span className="floating-video-popup__log-summary">{dailyLogSummary(log)}</span>
                      {log.media?.[0]?.url ? (
                        <span className="floating-video-popup__log-tag">영상</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>

            {activeLog ? (
              <div className="floating-video-popup__detail">
                {activeLog.note?.trim() ? (
                  <p className="floating-video-popup__memo">{activeLog.note.trim()}</p>
                ) : null}
                {activeVideo ? (
                  <div
                    className={`floating-video-popup__player${isLocalActive ? ' floating-video-popup__player--local' : ''}`}
                  >
                    <VideoEmbed media={activeVideo} onAspectRatioChange={setMediaAspect} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {activeVideo ? (
          <button
            type="button"
            className="floating-video-popup__resize"
            aria-label="크기 조절"
            title={resizeTitle}
            onPointerDown={(event) => beginDrag('resize', event)}
          />
        ) : null}
      </div>
    </div>
  )
}

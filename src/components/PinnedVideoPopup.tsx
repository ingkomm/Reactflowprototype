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
import { VideoEmbed } from './VideoEmbed'
import './PinnedVideoPopup.css'

type Props = {
  pinnedNodeId: string
  stackIndex: number
  containerRef: RefObject<HTMLElement | null>
  onClose: (nodeId: string) => void
  onSelectLog?: (nodeId: string, logId: string) => void
}

const DEFAULT_PLAYER_WIDTH = 320
const MIN_PLAYER_WIDTH = 200
const MAX_PLAYER_WIDTH = 720
const ASPECT = 16 / 9

type DragMode = 'move' | 'resize' | null

export function PinnedVideoPopup(props: Props) {
  return <PinnedVideoPopupInner key={`${props.pinnedNodeId}-${props.stackIndex}`} {...props} />
}

function PinnedVideoPopupInner({
  pinnedNodeId,
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
  const [layout, setLayout] = useState({
    nodeCenter: { x: 0, y: 0 },
    popupLeft: 0,
    popupTop: 0,
    anchorX: 0,
    anchorY: 0,
    playerHeight: DEFAULT_PLAYER_WIDTH / ASPECT,
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

  const node = useMemo(
    () => nodes.find((n) => n.id === pinnedNodeId) ?? null,
    [nodes, pinnedNodeId],
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
    const playerHeight = activeLog?.media?.[0] ? playerWidth / ASPECT : 0
    setLayout({
      nodeCenter,
      popupLeft,
      popupTop,
      anchorX: popupLeft + playerWidth / 2,
      anchorY: popupTop + 20,
      playerHeight,
    })
  }, [
    activeLog?.media?.[0]?.url,
    containerRef,
    data,
    flowToScreenPosition,
    node,
    offset.x,
    offset.y,
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
        const delta = Math.max(dx, dy * ASPECT)
        const next = Math.min(
          MAX_PLAYER_WIDTH,
          Math.max(MIN_PLAYER_WIDTH, drag.originWidth + delta),
        )
        setPlayerWidth(next)
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
    onSelectLog?.(pinnedNodeId, logId)
  }

  return (
    <div className="pinned-video-layer" aria-live="polite">
      <svg className="pinned-video-layer__links" aria-hidden>
        <line
          x1={layout.nodeCenter.x}
          y1={layout.nodeCenter.y}
          x2={layout.anchorX}
          y2={layout.anchorY}
          className="pinned-video-layer__link"
        />
        <circle cx={layout.nodeCenter.x} cy={layout.nodeCenter.y} r={5} className="pinned-video-layer__dot" />
        <circle cx={layout.anchorX} cy={layout.anchorY} r={4} className="pinned-video-layer__dot" />
      </svg>

      <div
        className="pinned-video-popup"
        style={
          {
            left: layout.popupLeft,
            top: layout.popupTop,
            width: playerWidth + 24,
            zIndex: 40 + stackIndex,
            '--player-width': `${playerWidth}px`,
            '--player-height': `${layout.playerHeight}px`,
          } as CSSProperties
        }
        role="dialog"
        aria-label={`${data.label} Daily Log`}
      >
        <header
          className="pinned-video-popup__head"
          onPointerDown={(event) => beginDrag('move', event)}
        >
          <div>
            <p className="pinned-video-popup__eyebrow">Pinned Daily Log · 드래그로 이동</p>
            <h3 className="pinned-video-popup__title">{data.label}</h3>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onClose(pinnedNodeId)}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="핀 해제"
          >
            ×
          </button>
        </header>

        {logs.length === 0 ? (
          <p className="pinned-video-popup__empty">이 노드에 Daily Log가 없습니다.</p>
        ) : (
          <>
            <ul className="pinned-video-popup__log-list">
              {logs.map((log) => {
                const selected = log.id === resolvedLogId
                return (
                  <li key={log.id}>
                    <button
                      type="button"
                      className={`pinned-video-popup__log-card${selected ? ' is-active' : ''}`}
                      onClick={() => handleLogClick(log.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <span className="pinned-video-popup__log-date">{log.date}</span>
                      <span className="pinned-video-popup__log-summary">{dailyLogSummary(log)}</span>
                      {log.media?.[0]?.url ? (
                        <span className="pinned-video-popup__log-tag">영상</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>

            {activeLog ? (
              <div className="pinned-video-popup__detail">
                {activeLog.note?.trim() ? (
                  <p className="pinned-video-popup__memo">{activeLog.note.trim()}</p>
                ) : null}
                {activeVideo ? (
                  <div className="pinned-video-popup__player">
                    <VideoEmbed media={activeVideo} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {activeVideo ? (
          <button
            type="button"
            className="pinned-video-popup__resize"
            aria-label="크기 조절"
            title="드래그해서 크기 조절 (16:9 유지)"
            onPointerDown={(event) => beginDrag('resize', event)}
          />
        ) : null}
      </div>
    </div>
  )
}

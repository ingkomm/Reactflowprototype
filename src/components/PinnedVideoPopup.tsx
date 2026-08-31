import {
  useCallback,
  useEffect,
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
import { NODE_SIZE } from '../orbit'
import { collectNodeVideos } from '../videoMedia'
import { VideoEmbed } from './VideoEmbed'
import './PinnedVideoPopup.css'

type Props = {
  pinnedNodeId: string | null
  containerRef: RefObject<HTMLElement | null>
  onClose: () => void
}

const DEFAULT_PLAYER_WIDTH = 320
const MIN_PLAYER_WIDTH = 200
const MAX_PLAYER_WIDTH = 720
const ASPECT = 16 / 9

type DragMode = 'move' | 'resize' | null

export function PinnedVideoPopup({ pinnedNodeId, containerRef, onClose }: Props) {
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const transform = useStore((s) => s.transform)
  const { flowToScreenPosition } = useReactFlow()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [playerWidth, setPlayerWidth] = useState(DEFAULT_PLAYER_WIDTH)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    originOffsetX: number
    originOffsetY: number
    originWidth: number
  } | null>(null)

  const node = useMemo(
    () => (pinnedNodeId ? nodes.find((n) => n.id === pinnedNodeId) ?? null : null),
    [nodes, pinnedNodeId],
  )

  const data = (node?.data as PassiveNodeData | undefined) ?? null
  const videos = useMemo(() => (data ? collectNodeVideos(data) : []), [data])

  useEffect(() => {
    setActiveId(null)
    setOffset({ x: 0, y: 0 })
    setPlayerWidth(DEFAULT_PLAYER_WIDTH)
  }, [pinnedNodeId])

  const active = useMemo(() => {
    if (!videos.length) return null
    return videos.find((v) => v.id === activeId) ?? videos[0]!
  }, [videos, activeId])

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.mode === 'move') {
      setOffset({ x: drag.originOffsetX + dx, y: drag.originOffsetY + dy })
      return
    }
    if (drag.mode === 'resize') {
      // Keep 16:9 by sizing from width; vertical drag also contributes via average.
      const delta = Math.max(dx, dy * ASPECT)
      const next = Math.min(
        MAX_PLAYER_WIDTH,
        Math.max(MIN_PLAYER_WIDTH, drag.originWidth + delta),
      )
      setPlayerWidth(next)
    }
  }, [])

  const endDrag = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
  }, [onPointerMove])

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
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
    },
    [endDrag, offset.x, offset.y, onPointerMove, playerWidth],
  )

  useEffect(() => () => endDrag(), [endDrag])

  if (!node || !data || !pinnedNodeId) return null

  const size = NODE_SIZE[data.kind] ?? 52
  void transform
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
  const playerHeight = playerWidth / ASPECT
  const anchorX = popupLeft + playerWidth / 2
  const anchorY = popupTop + 20

  return (
    <div className="pinned-video-layer" aria-live="polite">
      <svg className="pinned-video-layer__links" aria-hidden>
        <line
          x1={nodeCenter.x}
          y1={nodeCenter.y}
          x2={anchorX}
          y2={anchorY}
          className="pinned-video-layer__link"
        />
        <circle cx={nodeCenter.x} cy={nodeCenter.y} r={5} className="pinned-video-layer__dot" />
        <circle cx={anchorX} cy={anchorY} r={4} className="pinned-video-layer__dot" />
      </svg>

      <div
        className="pinned-video-popup"
        style={
          {
            left: popupLeft,
            top: popupTop,
            width: playerWidth + 24,
            '--player-width': `${playerWidth}px`,
            '--player-height': `${playerHeight}px`,
          } as CSSProperties
        }
        role="dialog"
        aria-label={`${data.label} 동영상`}
      >
        <header
          className="pinned-video-popup__head"
          onPointerDown={(event) => beginDrag('move', event)}
        >
          <div>
            <p className="pinned-video-popup__eyebrow">Pinned videos · 드래그로 이동</p>
            <h3 className="pinned-video-popup__title">{data.label}</h3>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="핀 해제"
          >
            ×
          </button>
        </header>

        {videos.length === 0 ? (
          <p className="pinned-video-popup__empty">이 노드에 연결된 동영상이 없습니다.</p>
        ) : (
          <>
            <label className="pinned-video-popup__select-field">
              <span>동영상</span>
              <select
                className="pinned-video-popup__select"
                value={active?.id ?? ''}
                onChange={(event) => setActiveId(event.target.value)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {videos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || item.url}
                  </option>
                ))}
              </select>
            </label>
            {active ? (
              <div className="pinned-video-popup__player">
                <VideoEmbed media={active} />
              </div>
            ) : null}
          </>
        )}

        <button
          type="button"
          className="pinned-video-popup__resize"
          aria-label="크기 조절"
          title="드래그해서 크기 조절 (16:9 유지)"
          onPointerDown={(event) => beginDrag('resize', event)}
        />
      </div>
    </div>
  )
}

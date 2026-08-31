import { useMemo, useState, type CSSProperties, type RefObject } from 'react'
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

export function PinnedVideoPopup({ pinnedNodeId, containerRef, onClose }: Props) {
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const transform = useStore((s) => s.transform)
  const { flowToScreenPosition } = useReactFlow()
  const [activeId, setActiveId] = useState<string | null>(null)

  const node = useMemo(
    () => (pinnedNodeId ? nodes.find((n) => n.id === pinnedNodeId) ?? null : null),
    [nodes, pinnedNodeId],
  )

  const data = (node?.data as PassiveNodeData | undefined) ?? null
  const videos = useMemo(() => (data ? collectNodeVideos(data) : []), [data])

  const active = useMemo(() => {
    if (!videos.length) return null
    return videos.find((v) => v.id === activeId) ?? videos[0]!
  }, [videos, activeId])

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
  const popupLeft = nodeCenter.x + Math.max(36, size * 0.35) + 40
  const popupTop = Math.max(12, nodeCenter.y - 110)
  const anchorX = popupLeft
  const anchorY = popupTop + 28

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
        style={{ left: popupLeft, top: popupTop } as CSSProperties}
        role="dialog"
        aria-label={`${data.label} 동영상`}
      >
        <header className="pinned-video-popup__head">
          <div>
            <p className="pinned-video-popup__eyebrow">Pinned videos</p>
            <h3 className="pinned-video-popup__title">{data.label}</h3>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="핀 해제">
            ×
          </button>
        </header>

        {videos.length === 0 ? (
          <p className="pinned-video-popup__empty">이 노드에 연결된 동영상이 없습니다.</p>
        ) : (
          <>
            <ul className="pinned-video-popup__list">
              {videos.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`pinned-video-popup__item${active?.id === item.id ? ' is-active' : ''}`}
                    onClick={() => setActiveId(item.id)}
                  >
                    <span className="pinned-video-popup__item-title">
                      {item.title || item.url}
                    </span>
                    {item.note ? (
                      <span className="pinned-video-popup__item-note">{item.note}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {active ? (
              <div className="pinned-video-popup__player">
                <VideoEmbed media={active} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

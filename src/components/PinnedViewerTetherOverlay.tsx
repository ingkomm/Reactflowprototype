import { useMemo } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { NODE_SIZE } from '../orbit'
import type { PassiveNodeData } from '../types'
import {
  nearestPointOnRectEdge,
  type PinnedViewerEntry,
  type ViewerPanelBounds,
} from '../pinnedViewer'
import './PinnedViewerTetherOverlay.css'

type Props = {
  entries: PinnedViewerEntry[]
  boundsByNodeId: Record<string, ViewerPanelBounds>
  nodes: Node[]
}

/**
 * UI-only dashed tethers from pinned viewers to their source nodes.
 * Not a graph edge — never persisted, never participates in power/orbit.
 */
export function PinnedViewerTetherOverlay({ entries, boundsByNodeId, nodes }: Props) {
  const { flowToScreenPosition } = useReactFlow()
  // Re-render on pan/zoom.
  const viewport = useStore((s) => s.transform)

  const lines = useMemo(() => {
    void viewport
    return entries.flatMap((entry) => {
      const node = nodes.find((n) => n.id === entry.nodeId)
      const bounds = boundsByNodeId[entry.nodeId]
      if (!node || !bounds || bounds.width <= 0 || bounds.height <= 0) return []

      const data = node.data as PassiveNodeData
      const size = NODE_SIZE[data.kind] ?? 52
      const screen = flowToScreenPosition({
        x: node.position.x + size / 2,
        y: node.position.y + size / 2,
      })
      const end = nearestPointOnRectEdge(bounds, screen)
      return [
        {
          key: entry.nodeId,
          x1: screen.x,
          y1: screen.y,
          x2: end.x,
          y2: end.y,
        },
      ]
    })
  }, [boundsByNodeId, entries, flowToScreenPosition, nodes, viewport])

  if (lines.length === 0) return null

  return (
    <svg
      className="pinned-viewer-tether-overlay"
      data-testid="pinned-viewer-tether-overlay"
      aria-hidden
    >
      {lines.map((line) => (
        <line
          key={line.key}
          className="pinned-viewer-tether-overlay__line"
          data-testid={`pinned-viewer-tether-${line.key}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
        />
      ))}
    </svg>
  )
}

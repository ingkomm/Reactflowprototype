/** UI-only pinned Shard/Notable viewer state (never persisted). */

export type PinnedViewerKind = 'shard' | 'notable'

export type PinnedViewerEntry = {
  nodeId: string
  kind: PinnedViewerKind
  x: number
  y: number
  zIndex: number
}

export type ViewerPanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type FloatingPanelPoint = { x: number; y: number }

/** Closest point on a rectangle's edge to `point` (screen space). */
export function nearestPointOnRectEdge(
  rect: ViewerPanelBounds,
  point: FloatingPanelPoint,
): FloatingPanelPoint {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const clampedX = Math.min(Math.max(point.x, left), right)
  const clampedY = Math.min(Math.max(point.y, top), bottom)

  if (point.x < left || point.x > right || point.y < top || point.y > bottom) {
    return { x: clampedX, y: clampedY }
  }

  const toLeft = point.x - left
  const toRight = right - point.x
  const toTop = point.y - top
  const toBottom = bottom - point.y
  const nearest = Math.min(toLeft, toRight, toTop, toBottom)
  if (nearest === toLeft) return { x: left, y: point.y }
  if (nearest === toRight) return { x: right, y: point.y }
  if (nearest === toTop) return { x: point.x, y: top }
  return { x: point.x, y: bottom }
}

export function findPinnedViewer(
  entries: PinnedViewerEntry[],
  nodeId: string,
): PinnedViewerEntry | undefined {
  return entries.find((entry) => entry.nodeId === nodeId)
}

/** Pin a viewer or bring an existing one to front. One pinned viewer per node. */
export function pinOrFocusViewer(
  entries: PinnedViewerEntry[],
  next: Omit<PinnedViewerEntry, 'zIndex'>,
  nextZIndex: number,
): PinnedViewerEntry[] {
  const existing = findPinnedViewer(entries, next.nodeId)
  if (existing) {
    return entries.map((entry) =>
      entry.nodeId === next.nodeId ? { ...entry, zIndex: nextZIndex } : entry,
    )
  }
  return [...entries, { ...next, zIndex: nextZIndex }]
}

export function bringPinnedViewerToFront(
  entries: PinnedViewerEntry[],
  nodeId: string,
  nextZIndex: number,
): PinnedViewerEntry[] {
  if (!findPinnedViewer(entries, nodeId)) return entries
  return entries.map((entry) =>
    entry.nodeId === nodeId ? { ...entry, zIndex: nextZIndex } : entry,
  )
}

export function closePinnedViewer(
  entries: PinnedViewerEntry[],
  nodeId: string,
): PinnedViewerEntry[] {
  return entries.filter((entry) => entry.nodeId !== nodeId)
}

/** Drop pinned viewers whose source node no longer exists. */
export function prunePinnedViewers(
  entries: PinnedViewerEntry[],
  nodeIds: Iterable<string>,
): PinnedViewerEntry[] {
  const alive = new Set(nodeIds)
  const next = entries.filter((entry) => alive.has(entry.nodeId))
  return next.length === entries.length ? entries : next
}

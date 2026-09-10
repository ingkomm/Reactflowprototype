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

/** Pin panel center in screen space (tether endpoint). */
export function viewerPanelCenter(bounds: ViewerPanelBounds): FloatingPanelPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
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

/**
 * Close pinned viewers whose node kind no longer matches the viewer kind.
 * Shard↔Notable are not auto-converted.
 */
export function prunePinnedViewersByKindMismatch(
  entries: PinnedViewerEntry[],
  nodeKinds: Iterable<{ id: string; kind: string }>,
): PinnedViewerEntry[] {
  const kindById = new Map<string, string>()
  for (const node of nodeKinds) kindById.set(node.id, node.kind)
  const next = entries.filter((entry) => kindById.get(entry.nodeId) === entry.kind)
  return next.length === entries.length ? entries : next
}

/** Canvas snap / background grid helpers. */

export const DEFAULT_GRID_SNAP_SCALE = 20

/** Selectable snap scales (multiples of 10). */
export const GRID_SNAP_SCALE_OPTIONS = [10, 20, 30, 40, 50, 60, 80, 100] as const

export type GridSnapScale = (typeof GRID_SNAP_SCALE_OPTIONS)[number]

/** @deprecated Prefer DEFAULT_GRID_SNAP_SCALE / normalizeGridSnapScale */
export const CANVAS_GRID_GAP = DEFAULT_GRID_SNAP_SCALE

export function normalizeGridSnapScale(value: unknown): GridSnapScale {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value / 10) * 10
    if ((GRID_SNAP_SCALE_OPTIONS as readonly number[]).includes(rounded)) {
      return rounded as GridSnapScale
    }
  }
  return DEFAULT_GRID_SNAP_SCALE
}

export function snapToCanvasGrid(value: number, gap: number = DEFAULT_GRID_SNAP_SCALE) {
  const step = gap > 0 ? gap : DEFAULT_GRID_SNAP_SCALE
  return Math.round(value / step) * step
}

export function snapNodeTopLeft(
  position: { x: number; y: number },
  gap: number = DEFAULT_GRID_SNAP_SCALE,
) {
  return {
    x: snapToCanvasGrid(position.x, gap),
    y: snapToCanvasGrid(position.y, gap),
  }
}

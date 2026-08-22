/** Matches React Flow Background dot gap in App.tsx */
export const CANVAS_GRID_GAP = 22

export function snapToCanvasGrid(value: number, gap = CANVAS_GRID_GAP) {
  return Math.round(value / gap) * gap
}

export function snapNodeTopLeft(
  position: { x: number; y: number },
  gap = CANVAS_GRID_GAP,
) {
  return {
    x: snapToCanvasGrid(position.x, gap),
    y: snapToCanvasGrid(position.y, gap),
  }
}

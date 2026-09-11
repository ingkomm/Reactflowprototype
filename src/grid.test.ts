import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRID_SNAP_SCALE,
  normalizeGridSnapScale,
  snapNodeCenter,
  snapNodeTopLeft,
  snapToCanvasGrid,
} from './grid'
import { NODE_SIZE } from './orbit'
import { pinGraphSoRootCenteredAtOrigin, rootTopLeftAtOrigin } from './initialHub'
import { INITIAL_NODE_ID } from './types'

describe('grid snap scale', () => {
  it('normalizes to multiples of 10 from the option list', () => {
    expect(normalizeGridSnapScale(20)).toBe(20)
    expect(normalizeGridSnapScale(25)).toBe(30)
    expect(normalizeGridSnapScale(37)).toBe(40)
    expect(normalizeGridSnapScale(999)).toBe(DEFAULT_GRID_SNAP_SCALE)
    expect(normalizeGridSnapScale('nope')).toBe(DEFAULT_GRID_SNAP_SCALE)
  })

  it('snaps positions using the selected scale', () => {
    expect(snapToCanvasGrid(24, 10)).toBe(20)
    expect(snapNodeTopLeft({ x: 24, y: 36 }, 10)).toEqual({ x: 20, y: 40 })
  })

  it('snaps node center onto grid intersections', () => {
    const gap = 20
    const size = 40
    const snapped = snapNodeCenter({ x: 13, y: 27 }, size, gap)
    expect((snapped.x + size / 2) % gap).toBe(0)
    expect((snapped.y + size / 2) % gap).toBe(0)
    expect(snapped).toEqual({ x: 20, y: 20 })

    const connectSize = 22
    const connectSnapped = snapNodeCenter({ x: 11, y: 9 }, connectSize, gap)
    expect(connectSnapped.x + connectSize / 2).toBe(20)
    expect(connectSnapped.y + connectSize / 2).toBe(20)

    const masterySize = 76
    const masterySnapped = snapNodeCenter({ x: 33, y: 41 }, masterySize, 10)
    expect((masterySnapped.x + masterySize / 2) % 10).toBe(0)
    expect((masterySnapped.y + masterySize / 2) % 10).toBe(0)
  })
})

describe('root origin lock', () => {
  it('places Root top-left so the center is at (0, 0)', () => {
    const topLeft = rootTopLeftAtOrigin()
    expect(topLeft.x + NODE_SIZE.initial / 2).toBe(0)
    expect(topLeft.y + NODE_SIZE.initial / 2).toBe(0)
  })

  it('translates a legacy graph so Root stays centered at origin', () => {
    const nodes = [
      { id: INITIAL_NODE_ID, position: { x: 80, y: 80 } },
      { id: 'other', position: { x: 200, y: 120 } },
    ]
    const pinned = pinGraphSoRootCenteredAtOrigin(nodes)
    const root = pinned.find((n) => n.id === INITIAL_NODE_ID)!
    const other = pinned.find((n) => n.id === 'other')!
    expect(root.position).toEqual(rootTopLeftAtOrigin())
    expect(other.position.x - root.position.x).toBe(200 - 80)
    expect(other.position.y - root.position.y).toBe(120 - 80)
  })
})

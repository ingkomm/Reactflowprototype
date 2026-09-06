import { describe, expect, it } from 'vitest'
import { NODE_SIZE, ROOT_HUB_SIZE } from './orbit'
import {
  connectPositionForInitialHub,
  pinGraphSoRootCenteredAtOrigin,
  rootTopLeftAtOrigin,
  snapSocketedConnectsToRoot,
} from './initialHub'
import { INITIAL_NODE_ID } from './types'
// INITIAL via types if needed

describe('Root hub sizing', () => {
  it('is sized for three internal Notable orbit rings', () => {
    expect(NODE_SIZE.initial).toBe(ROOT_HUB_SIZE)
    expect(ROOT_HUB_SIZE).toBeGreaterThan(NODE_SIZE.notable * 6)
  })
})

describe('snapSocketedConnectsToRoot', () => {
  it('does not move Connect nodes that declare initialSlot', () => {
    const root = {
      id: INITIAL_NODE_ID,
      position: { x: -100, y: -100 },
      data: { kind: 'initial' as const },
    }
    const freePos = { x: 420, y: 310 }
    const nodes = [
      root,
      {
        id: 'c1',
        position: { ...freePos },
        data: { kind: 'connect' as const, initialSlot: 0 as const },
      },
    ]
    const snapped = snapSocketedConnectsToRoot(nodes)
    const connect = snapped.find((n) => n.id === 'c1')!
    expect(connect.position).toEqual(freePos)
  })
})

import { describe, expect, it } from 'vitest'
import { NODE_SIZE, ROOT_HUB_SIZE } from './orbit'
import {
  isRootPowerHandle,
  ROOT_POWER_HANDLE_ID,
  rootPowerFlowPosition,
  snapSocketedConnectsToRoot,
} from './initialHub'
import { INITIAL_NODE_ID } from './types'

describe('Root hub sizing', () => {
  it('is sized for three internal Notable orbit rings', () => {
    expect(NODE_SIZE.initial).toBe(ROOT_HUB_SIZE)
    expect(ROOT_HUB_SIZE).toBeGreaterThan(NODE_SIZE.notable * 6)
  })
})

describe('Root Power Core helpers', () => {
  it('recognizes root-power and root-power-target handles', () => {
    expect(isRootPowerHandle(ROOT_POWER_HANDLE_ID)).toBe(true)
    expect(isRootPowerHandle('root-power-target')).toBe(true)
    expect(isRootPowerHandle('center')).toBe(false)
    expect(isRootPowerHandle('socket-0')).toBe(false)
    expect(isRootPowerHandle(null)).toBe(false)
  })

  it('places Power Core at exact hub center', () => {
    const topLeft = { x: -NODE_SIZE.initial / 2, y: -NODE_SIZE.initial / 2 }
    expect(rootPowerFlowPosition(topLeft)).toEqual({ x: 0, y: 0 })
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

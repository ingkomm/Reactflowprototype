import { describe, expect, it } from 'vitest'
import { NODE_SIZE, ROOT_HUB_SIZE } from './orbit'
import {
  isRootPowerHandle,
  ROOT_POWER_HANDLE_ID,
  rootPowerFlowPosition,
} from './initialHub'

describe('Root hub sizing', () => {
  it('is sized for three internal Notable orbit rings', () => {
    expect(NODE_SIZE.initial).toBe(ROOT_HUB_SIZE)
    expect(ROOT_HUB_SIZE).toBeGreaterThan(NODE_SIZE.notable * 6)
  })
})

describe('Root Power Core helpers', () => {
  it('recognizes only the source-only root-power handle', () => {
    expect(isRootPowerHandle(ROOT_POWER_HANDLE_ID)).toBe(true)
    expect(isRootPowerHandle('root-power-target')).toBe(false)
    expect(isRootPowerHandle('center')).toBe(false)
    expect(isRootPowerHandle('socket-0')).toBe(false)
    expect(isRootPowerHandle(null)).toBe(false)
  })

  it('places Power Core at exact hub center', () => {
    const topLeft = { x: -NODE_SIZE.initial / 2, y: -NODE_SIZE.initial / 2 }
    expect(rootPowerFlowPosition(topLeft)).toEqual({ x: 0, y: 0 })
  })
})


import { describe, expect, it, vi } from 'vitest'
import {
  runEnterGalaxyTransition,
  shouldShowGalaxyLayer,
  shouldShowUniverseLayer,
} from './sheetTransition'

describe('Universe → Galaxy enter: no stale-canvas flash', () => {
  it('loads target Galaxy before the transition wait', async () => {
    const calls: string[] = []
    const enterGalaxy = vi.fn(async (id: string) => {
      calls.push(`enter:${id}`)
      return true
    })
    const wait = vi.fn(async (ms: number) => {
      calls.push(`wait:${ms}`)
    })

    await runEnterGalaxyTransition({
      galaxyId: 'galaxy-b',
      originPct: { x: 40, y: 60 },
      setUniverseEditing: () => calls.push('edit-off'),
      setEntering: (id) => calls.push(`entering:${id}`),
      enterGalaxy,
      bumpCenterOnRootToken: () => calls.push('center'),
      setIdle: () => calls.push('idle'),
      durationMs: () => 200,
      wait,
    })

    expect(enterGalaxy).toHaveBeenCalledWith('galaxy-b')
    expect(calls.indexOf('enter:galaxy-b')).toBeGreaterThan(-1)
    expect(calls.indexOf('enter:galaxy-b')).toBeLessThan(calls.indexOf('wait:200'))
    expect(calls.indexOf('entering:galaxy-b')).toBeLessThan(calls.indexOf('enter:galaxy-b'))
    expect(calls.indexOf('center')).toBeLessThan(calls.indexOf('wait:200'))
    expect(calls).toEqual([
      'edit-off',
      'entering:galaxy-b',
      'enter:galaxy-b',
      'center',
      'wait:200',
      'idle',
    ])
  })

  it('aborts transition when enterGalaxy fails (no animation wait)', async () => {
    const calls: string[] = []
    await runEnterGalaxyTransition({
      galaxyId: 'missing',
      originPct: { x: 10, y: 10 },
      setUniverseEditing: () => calls.push('edit-off'),
      setEntering: () => calls.push('entering'),
      enterGalaxy: async () => {
        calls.push('enter-fail')
        return false
      },
      bumpCenterOnRootToken: () => calls.push('center'),
      setIdle: () => calls.push('idle'),
      durationMs: () => 200,
      wait: async () => {
        calls.push('wait')
      },
    })
    expect(calls).toEqual(['edit-off', 'entering', 'enter-fail', 'idle'])
  })
})

describe('sheet layer visibility during enter', () => {
  it('keeps Universe while entering even after nav switches to galaxy', () => {
    expect(shouldShowUniverseLayer('galaxy', 'entering-galaxy')).toBe(true)
    expect(shouldShowGalaxyLayer('galaxy', 'entering-galaxy')).toBe(true)
  })

  it('does not mount Galaxy layer before nav is galaxy (prevents stale flash)', () => {
    expect(shouldShowUniverseLayer('universe', 'entering-galaxy')).toBe(true)
    expect(shouldShowGalaxyLayer('universe', 'entering-galaxy')).toBe(false)
  })

  it('idle galaxy shows only Galaxy; idle universe shows only Universe', () => {
    expect(shouldShowUniverseLayer('galaxy', 'idle')).toBe(false)
    expect(shouldShowGalaxyLayer('galaxy', 'idle')).toBe(true)
    expect(shouldShowUniverseLayer('universe', 'idle')).toBe(true)
    expect(shouldShowGalaxyLayer('universe', 'idle')).toBe(false)
  })
})

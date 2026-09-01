import { describe, expect, it } from 'vitest'
import { clampOrbitTierCapacity, getOrbitTierCapacity } from './orbit'
import { createPassiveData } from './graphFactory'

describe('orbit capacity', () => {
  it('clamps custom tier capacity to 1–24', () => {
    expect(clampOrbitTierCapacity(0)).toBe(1)
    expect(clampOrbitTierCapacity(100)).toBe(24)
    expect(clampOrbitTierCapacity(12)).toBe(12)
  })

  it('reads clamped capacity from mastery data', () => {
    const data = createPassiveData('mastery', 'M', {
      orbitCapacityByTier: { 1: 48, 2: 0 },
    })
    expect(getOrbitTierCapacity(data, 1)).toBe(24)
    expect(getOrbitTierCapacity(data, 2)).toBe(1)
  })
})

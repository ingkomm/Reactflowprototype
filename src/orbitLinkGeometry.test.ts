import { describe, expect, it } from 'vitest'
import {
  computeOrbitRingLinkSpec,
  orbitArcHasOnlyVoids,
  orbitRingArcPathD,
} from './orbitLinkGeometry'

describe('orbitLinkGeometry', () => {
  it('orbitArcHasOnlyVoids skips occupied intermediate slots', () => {
    const occupied = new Set([1])
    expect(orbitArcHasOnlyVoids(occupied, 4, 0, 2)).toBe(false)
    expect(orbitArcHasOnlyVoids(occupied, 4, 2, 0)).toBe(true)
  })

  it('same tier prefers clear shorter arc; cross tier is chord', () => {
    const chord = computeOrbitRingLinkSpec({
      sameTier: false,
      capacity: 4,
      slotA: 0,
      slotB: 1,
      occupiedSlots: new Set(),
      angleARad: 0,
      angleBRad: Math.PI / 2,
      arcRadius: 100,
      trimARad: 0.1,
      trimBRad: 0.1,
    })
    expect(chord).toEqual({ kind: 'chord' })

    const arc = computeOrbitRingLinkSpec({
      sameTier: true,
      capacity: 4,
      slotA: 0,
      slotB: 1,
      occupiedSlots: new Set(),
      angleARad: 0,
      angleBRad: Math.PI / 2,
      arcRadius: 100,
      trimARad: 0.1,
      trimBRad: 0.1,
    })
    expect(arc.kind).toBe('arc')
    if (arc.kind === 'arc') {
      expect(arc.clockwise).toBe(true)
      expect(arc.a1).toBeCloseTo(0.1)
      expect(arc.a2).toBeCloseTo(Math.PI / 2 - 0.1)
      const path = orbitRingArcPathD(0, 0, arc.arcRadius, arc.a1, arc.a2, arc.clockwise)
      expect(path).toMatch(/^M .+ A 100 100 /)
      expect(path.includes(' L ')).toBe(false)
    }
  })
})

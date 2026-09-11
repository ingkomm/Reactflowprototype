import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PIN_ASPECT,
  pinnedPlayerHeight,
  resolvePinnedPlayerAspect,
} from './PinnedVideoPopup'

describe('resolvePinnedPlayerAspect', () => {
  it('keeps YouTube / non-local pins at 16:9', () => {
    expect(resolvePinnedPlayerAspect(false, null)).toBe(DEFAULT_PIN_ASPECT)
    expect(resolvePinnedPlayerAspect(false, 4 / 3)).toBe(DEFAULT_PIN_ASPECT)
  })

  it('falls back to 16:9 while local metadata is unknown', () => {
    expect(resolvePinnedPlayerAspect(true, null)).toBe(DEFAULT_PIN_ASPECT)
  })

  it('uses local intrinsic ratio when known (4:3, portrait, iPad-ish)', () => {
    expect(resolvePinnedPlayerAspect(true, 4 / 3)).toBeCloseTo(4 / 3)
    expect(resolvePinnedPlayerAspect(true, 9 / 16)).toBeCloseTo(9 / 16)
    expect(resolvePinnedPlayerAspect(true, 1660 / 2388)).toBeCloseTo(1660 / 2388)
  })

  it('ignores non-positive local ratios', () => {
    expect(resolvePinnedPlayerAspect(true, 0)).toBe(DEFAULT_PIN_ASPECT)
    expect(resolvePinnedPlayerAspect(true, -1)).toBe(DEFAULT_PIN_ASPECT)
  })
})

describe('pinnedPlayerHeight', () => {
  it('derives height from width ÷ aspect without stretching', () => {
    expect(pinnedPlayerHeight(320, 16 / 9)).toBeCloseTo(180)
    expect(pinnedPlayerHeight(320, 4 / 3)).toBeCloseTo(240)
    expect(pinnedPlayerHeight(180, 9 / 16)).toBeCloseTo(320)
  })
})

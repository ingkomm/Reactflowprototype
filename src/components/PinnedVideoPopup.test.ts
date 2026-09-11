import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PIN_ASPECT,
  pinnedPlayerHeight,
  resolvePinnedPlayerAspect,
} from './PinnedVideoPopup'

describe('resolvePinnedPlayerAspect', () => {
  it('falls back to 16:9 while media aspect is unknown', () => {
    expect(resolvePinnedPlayerAspect(null)).toBe(DEFAULT_PIN_ASPECT)
  })

  it('uses VideoEmbed-reported ratio for local / Shorts / YouTube', () => {
    expect(resolvePinnedPlayerAspect(4 / 3)).toBeCloseTo(4 / 3)
    expect(resolvePinnedPlayerAspect(9 / 16)).toBeCloseTo(9 / 16)
    expect(resolvePinnedPlayerAspect(16 / 9)).toBeCloseTo(16 / 9)
    expect(resolvePinnedPlayerAspect(2360 / 1640)).toBeCloseTo(2360 / 1640)
  })

  it('ignores non-positive ratios', () => {
    expect(resolvePinnedPlayerAspect(0)).toBe(DEFAULT_PIN_ASPECT)
    expect(resolvePinnedPlayerAspect(-1)).toBe(DEFAULT_PIN_ASPECT)
  })
})

describe('pinnedPlayerHeight', () => {
  it('derives height from width ÷ aspect without stretching', () => {
    expect(pinnedPlayerHeight(320, 16 / 9)).toBeCloseTo(180)
    expect(pinnedPlayerHeight(320, 4 / 3)).toBeCloseTo(240)
    expect(pinnedPlayerHeight(180, 9 / 16)).toBeCloseTo(320)
    expect(pinnedPlayerHeight(320, 2360 / 1640)).toBeCloseTo(320 / (2360 / 1640))
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PIN_ASPECT,
  MAX_PLAYER_WIDTH,
  MIN_PLAYER_WIDTH,
  PORTRAIT_MAX_PLAYER_WIDTH,
  clampPinnedPlayerWidth,
  pinnedPlayerHeight,
  resolvePinnedMaxPlayerWidth,
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

describe('resolvePinnedMaxPlayerWidth / clampPinnedPlayerWidth', () => {
  it('caps portrait (aspect < 1) at 420', () => {
    expect(resolvePinnedMaxPlayerWidth(9 / 16)).toBe(PORTRAIT_MAX_PLAYER_WIDTH)
    expect(resolvePinnedMaxPlayerWidth(0.5)).toBe(420)
  })

  it('keeps landscape / square at 720', () => {
    expect(resolvePinnedMaxPlayerWidth(16 / 9)).toBe(MAX_PLAYER_WIDTH)
    expect(resolvePinnedMaxPlayerWidth(1)).toBe(MAX_PLAYER_WIDTH)
    expect(resolvePinnedMaxPlayerWidth(4 / 3)).toBe(720)
  })

  it('clamps an oversized landscape width down when switching to portrait', () => {
    expect(clampPinnedPlayerWidth(600, 9 / 16)).toBe(420)
    expect(clampPinnedPlayerWidth(720, 0.75)).toBe(420)
  })

  it('preserves landscape resize room up to 720 and floor at 200', () => {
    expect(clampPinnedPlayerWidth(600, 16 / 9)).toBe(600)
    expect(clampPinnedPlayerWidth(800, 16 / 9)).toBe(720)
    expect(clampPinnedPlayerWidth(100, 16 / 9)).toBe(MIN_PLAYER_WIDTH)
    expect(clampPinnedPlayerWidth(100, 9 / 16)).toBe(MIN_PLAYER_WIDTH)
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

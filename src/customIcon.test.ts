import { describe, expect, it } from 'vitest'
import {
  createCustomIcon,
  createEmptyCustomIconPixels,
  normalizeCustomIconPixels,
  setCustomIconPixel,
  validateCustomIcon,
} from './customIcon'

describe('customIcon', () => {
  it('creates 16x16 icons with transparent pixels', () => {
    const icon = createCustomIcon('Test')
    expect(icon.width).toBe(16)
    expect(icon.height).toBe(16)
    expect(icon.pixels).toHaveLength(256)
    expect(icon.pixels.every((px: string | null) => px === null)).toBe(true)
  })

  it('only accepts palette colors', () => {
    const icon = createCustomIcon('Test')
    const painted = setCustomIconPixel(icon, 0, 0, '#D9730D')
    expect(painted.pixels[0]).toBe('#D9730D')
    const rejected = setCustomIconPixel(painted, 1, 0, '#123456')
    expect(rejected.pixels[1]).toBeNull()
  })

  it('validates stored icons', () => {
    const icon = createCustomIcon('Saved')
    icon.pixels[0] = '#D9730D'
    expect(validateCustomIcon(icon)?.id).toBe(icon.id)
    expect(validateCustomIcon({ ...icon, width: 8 })).toBeNull()
  })

  it('normalizes pixel array length', () => {
    const pixels = normalizeCustomIconPixels(['#D9730D'])
    expect(pixels).toHaveLength(256)
    expect(pixels[0]).toBe('#D9730D')
    expect(pixels[1]).toBeNull()
  })

  it('clears to transparent grid', () => {
    const icon = createCustomIcon('X', createEmptyCustomIconPixels().map((px: string | null, i: number) => (i === 0 ? '#D9730D' : px)))
    expect(icon.pixels[0]).toBe('#D9730D')
  })
})

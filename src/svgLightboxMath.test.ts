import { describe, expect, it } from 'vitest'
import {
  SVG_LIGHTBOX_MAX_SCALE,
  SVG_LIGHTBOX_MIN_SCALE,
  SVG_LIGHTBOX_SCALE_STEP,
  clampSvgPan,
  clampSvgScale,
  computeFitScale,
} from './svgLightboxMath'

describe('svgLightboxMath', () => {
  it('clamps scale to 0.5–4 and steps', () => {
    expect(clampSvgScale(0.1)).toBe(SVG_LIGHTBOX_MIN_SCALE)
    expect(clampSvgScale(9)).toBe(SVG_LIGHTBOX_MAX_SCALE)
    expect(SVG_LIGHTBOX_SCALE_STEP).toBe(0.25)
  })

  it('computes fit without upscaling', () => {
    expect(computeFitScale(800, 400, 400, 200)).toBe(0.5)
    expect(computeFitScale(40, 20, 400, 200)).toBe(1)
  })

  it('clamps pan', () => {
    expect(clampSvgPan(-999, -999, 2, 100, 100, 200, 200)).toEqual({ tx: 0, ty: 0 })
  })
})

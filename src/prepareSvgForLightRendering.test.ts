/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLightSvgObjectUrl,
  prepareSvgForLightRendering,
} from './prepareSvgForLightRendering'

const LIGHT_ONLY = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="color-scheme: light"><rect width="10" height="10" fill="#fff"/></svg>`

const ADAPTIVE = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="color-scheme: light dark" viewBox="0 0 10 10">
<style type="text/css">rect{fill:light-dark(#ffffff,#111111);}</style>
<rect width="10" height="10"/>
</svg>`

describe('prepareSvgForLightRendering', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forces light color-scheme on adaptive SVG without mutating the input string', () => {
    const original = ADAPTIVE
    const copy = original.slice()
    const prepared = prepareSvgForLightRendering(original)
    expect(original).toBe(copy)
    expect(prepared).not.toBe(original)
    expect(prepared).toMatch(/color-scheme:\s*light\s*!important/i)
    expect(prepared).toMatch(/color-scheme="light"/i)
    // Original adaptive CSS body is preserved in the rendering copy.
    expect(prepared).toContain('light-dark(#ffffff,#111111)')
  })

  it('keeps light-only SVG renderable and still forces light scheme', () => {
    const prepared = prepareSvgForLightRendering(LIGHT_ONLY)
    expect(prepared).toMatch(/color-scheme/i)
    expect(prepared).toContain('fill="#fff"')
  })

  it('returns trimmed input for invalid XML without throwing', () => {
    expect(prepareSvgForLightRendering('  not-svg  ')).toBe('not-svg')
  })

  it('createLightSvgObjectUrl produces a blob URL from light-prepared source', async () => {
    let captured: Blob | null = null
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => {
        captured = blob
        return 'blob:light-0'
      }),
    })
    const url = createLightSvgObjectUrl(ADAPTIVE)
    expect(url).toBe('blob:light-0')
    expect(captured).toBeInstanceOf(Blob)
    const text = await captured!.text()
    expect(text).toMatch(/color-scheme:\s*light\s*!important/i)
    expect(ADAPTIVE).toContain('color-scheme: light dark')
  })
})

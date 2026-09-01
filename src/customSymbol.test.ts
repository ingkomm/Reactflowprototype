import { describe, expect, it } from 'vitest'
import {
  buildMaskedImageMarkup,
  normalizeSymbolScale,
  sanitizeSvgFile,
  SYMBOL_MASK_ID,
  validateCustomSymbol,
} from './customSymbol'

const SAMPLE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" fill="#D9730D"/></svg>`

describe('customSymbol', () => {
  it('imports svg with viewBox and converts paints to currentColor', () => {
    const result = sanitizeSvgFile(SAMPLE, 'Circle')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol.viewBox).toBe('0 0 24 24')
    expect(result.symbol.markup).toContain('circle')
    expect(result.symbol.markup).toContain('currentColor')
    expect(result.symbol.markup.toLowerCase()).not.toContain('#d9730d')
  })

  it('infers viewBox from width/height when missing', () => {
    const result = sanitizeSvgFile(
      `<svg width="1024px" height="512"><rect width="1024" height="512" fill="#fff"/></svg>`,
      'HiRes',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol.viewBox).toBe('0 0 1024 512')
    expect(result.symbol.width).toBe(1024)
    expect(result.symbol.height).toBe(512)
  })

  it('keeps embedded data:image hrefs', () => {
    const dataUrl = 'data:image/png;base64,aaaa'
    const result = sanitizeSvgFile(
      `<svg width="100" height="100"><image href="${dataUrl}" width="100" height="100"/></svg>`,
      'Embed',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol.markup).toContain(dataUrl)
  })

  it('rejects svg without viewBox or size', () => {
    const result = sanitizeSvgFile('<svg><rect width="10" height="10"/></svg>', 'Bad')
    expect(result.ok).toBe(false)
  })

  it('strips script tags', () => {
    const result = sanitizeSvgFile(
      `<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>`,
      'X',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol.markup.toLowerCase()).not.toContain('script')
  })

  it('keeps none fills while mono-converting other paints', () => {
    const result = sanitizeSvgFile(
      `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 2l4 8H8l4-8z" fill="#ff0000" stroke="#00ff00"/></svg>`,
      'Star',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol.markup).toContain('fill="none"')
    expect(result.symbol.markup).toContain('fill="currentColor"')
    expect(result.symbol.markup).toContain('stroke="currentColor"')
  })

  it('builds masked image markup for raster tinting', () => {
    const markup = buildMaskedImageMarkup('data:image/png;base64,xx', 64, 32)
    expect(markup).toContain(SYMBOL_MASK_ID)
    expect(markup).toContain('fill="currentColor"')
    expect(markup).toContain('data:image/png;base64,xx')
  })

  it('normalizes symbol scale into 50%–200%', () => {
    expect(normalizeSymbolScale(undefined)).toBe(1)
    expect(normalizeSymbolScale(0.1)).toBe(0.5)
    expect(normalizeSymbolScale(3)).toBe(2)
    expect(normalizeSymbolScale(1.23)).toBe(1.25)
  })

  it('validates stored symbols', () => {
    const imported = sanitizeSvgFile(SAMPLE, 'Circle')
    if (!imported.ok) throw new Error('import failed')
    expect(validateCustomSymbol(imported.symbol)?.id).toBe(imported.symbol.id)
  })

  it('rejects svg file import in v0.1', async () => {
    const file = new File(['<svg viewBox="0 0 10 10"></svg>'], 'x.svg', {
      type: 'image/svg+xml',
    })
    const { importSymbolFile } = await import('./customSymbol')
    const result = await importSymbolFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('SVG')
  })
})

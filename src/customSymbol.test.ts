import { describe, expect, it } from 'vitest'
import { sanitizeSvgFile, validateCustomSymbol } from './customSymbol'

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

  it('rejects svg without viewBox', () => {
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

  it('validates stored symbols', () => {
    const imported = sanitizeSvgFile(SAMPLE, 'Circle')
    if (!imported.ok) throw new Error('import failed')
    expect(validateCustomSymbol(imported.symbol)?.id).toBe(imported.symbol.id)
  })
})

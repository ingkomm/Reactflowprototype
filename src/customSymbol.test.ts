import { describe, expect, it } from 'vitest'
import { sanitizeSvgFile, validateCustomSymbol } from './customSymbol'

const SAMPLE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" fill="#D9730D"/></svg>`

describe('customSymbol', () => {
  it('imports svg with viewBox', () => {
    const result = sanitizeSvgFile(SAMPLE, 'Circle')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol.viewBox).toBe('0 0 24 24')
    expect(result.symbol.markup).toContain('circle')
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

  it('validates stored symbols', () => {
    const imported = sanitizeSvgFile(SAMPLE, 'Circle')
    if (!imported.ok) throw new Error('import failed')
    expect(validateCustomSymbol(imported.symbol)?.id).toBe(imported.symbol.id)
  })
})

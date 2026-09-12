import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = dirname(fileURLToPath(import.meta.url))

describe('Galaxy sheet-layer full-height workspace', () => {
  it('keeps height chain from sheet-layer--galaxy to .workspace', () => {
    const css = readFileSync(join(root, 'App.css'), 'utf8')
    expect(css).toMatch(
      /\.sheet-layer--galaxy\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s,
    )
    expect(css).toMatch(/\.sheet-layer--galaxy\s*>\s*\.workspace\s*\{[^}]*height:\s*100%/s)
    expect(css).toMatch(/\.sheet-layer--galaxy\s*>\s*\.workspace\s*\{[^}]*min-height:\s*0/s)
  })
})

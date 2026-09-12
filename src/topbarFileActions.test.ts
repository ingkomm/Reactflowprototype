/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

describe('topbar Active JSON file actions', () => {
  it('renders compact English Save / Save As / Load actions', () => {
    const app = readFileSync(join(root, 'App.tsx'), 'utf8')
    expect(app).toContain('topbar__file-actions')
    expect(app).toContain('topbar__file-btn')
    expect(app).toMatch(/>\s*Save\s*</)
    expect(app).toMatch(/>\s*Save As\s*</)
    expect(app).toMatch(/>\s*Load\s*</)
    expect(app).not.toMatch(/data-testid="topbar-save-json"[^>]*>\s*저장/)
    // File buttons must not use primary btn class
    const saveBlock = app.slice(
      app.indexOf('data-testid="topbar-save-json"') - 80,
      app.indexOf('data-testid="topbar-save-json"') + 120,
    )
    expect(saveBlock).toContain('topbar__file-btn')
    expect(saveBlock).not.toMatch(/className="btn"/)
  })

  it('defines compact file-btn styles without primary btn look', () => {
    const css = readFileSync(join(root, 'App.css'), 'utf8')
    expect(css).toMatch(/\.topbar__file-btn\s*\{[^}]*font-size:\s*0\.72rem/s)
    expect(css).toMatch(/\.topbar__file-btn\s*\{[^}]*padding:\s*4px 7px/s)
    expect(css).toMatch(/\.topbar__file-actions\s*\{[^}]*gap:\s*4px/s)
    expect(css).toMatch(/\.topbar__active-json\s*\{[^}]*font-size:\s*0\.7rem/s)
  })

  it('initializes activeJsonPath from persisted storage helpers', () => {
    const app = readFileSync(join(root, 'App.tsx'), 'utf8')
    expect(app).toContain("useState<string | null>(() => readActiveJsonPath())")
    expect(app).toContain('writeActiveJsonPath(result.path)')
    expect(app).toContain('writeActiveJsonPath(opened.path)')
    expect(app).toContain('clearActiveJsonPath()')
    expect(app).toContain("from './persistence/activeJsonPath'")
  })
})

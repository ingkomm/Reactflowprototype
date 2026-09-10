/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DailyLogPanel } from './DailyLogPanel'
import { createDailyLog } from '../dailyLog'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function mount(ui: React.ReactNode) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(ui)
  })
  return {
    host,
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('DailyLogPanel compact + editor modal', () => {
  afterEach(() => {
    document.body.querySelectorAll('[data-testid="daily-log-editor-modal"]').forEach((el) => el.remove())
  })

  it('keeps inspector compact without inline memo textarea', () => {
    const logs = [
      createDailyLog('2026-09-10', '```svg\n<svg xmlns="http://www.w3.org/2000/svg"/>\n```'),
      createDailyLog('2026-09-09', '# Title\n\nbody'),
      createDailyLog('2026-09-08', 'L'.repeat(200)),
    ]
    const view = mount(
      <DailyLogPanel logs={logs} onChangeLogs={() => undefined} />,
    )

    expect(view.host.querySelector('[data-testid="daily-log-open-add"]')).toBeTruthy()
    expect(view.host.querySelector('textarea')).toBeNull()
    expect(document.body.querySelector('[data-testid="daily-log-editor-modal"]')).toBeNull()

    const previews = [...view.host.querySelectorAll('.daily-log-card__preview')].map(
      (el) => el.textContent,
    )
    expect(previews[0]).toBe('SVG')
    expect(previews[1]).toBe('Title')
    expect(previews[2]).toBe('L'.repeat(200))
    expect(view.host.textContent).not.toContain('<svg')

    view.unmount()
  })

  it('opens add modal, cancel leaves data unchanged; save adds log', () => {
    let logs = [createDailyLog('2026-09-01', 'keep')]
    const view = mount(
      <DailyLogPanel
        logs={logs}
        onChangeLogs={(next) => {
          logs = next
        }}
      />,
    )

    act(() => {
      ;(view.host.querySelector('[data-testid="daily-log-open-add"]') as HTMLButtonElement).click()
    })
    expect(document.body.querySelector('[data-testid="daily-log-editor-modal"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="daily-log-editor-memo"]')).toBeTruthy()

    act(() => {
      ;(document.body.querySelector('[data-testid="daily-log-editor-close"]') as HTMLButtonElement).click()
    })
    expect(document.body.querySelector('[data-testid="daily-log-editor-modal"]')).toBeNull()
    expect(logs).toHaveLength(1)

    act(() => {
      ;(view.host.querySelector('[data-testid="daily-log-open-add"]') as HTMLButtonElement).click()
    })
    act(() => {
      ;(document.body.querySelector('[data-testid="daily-log-editor-save"]') as HTMLButtonElement).click()
    })
    expect(logs.length).toBe(2)
    expect(logs.some((log) => log.note === 'keep')).toBe(true)
    expect(document.body.querySelector('[data-testid="daily-log-editor-modal"]')).toBeNull()

    view.unmount()
  })

  it('opens edit modal with existing values', () => {
    const log = createDailyLog('2026-09-05', 'existing note', [
      { id: 'v1', url: 'https://youtu.be/aaaaaaaaaaa', title: 'Clip' },
    ])
    const view = mount(<DailyLogPanel logs={[log]} onChangeLogs={() => undefined} />)

    act(() => {
      ;(view.host.querySelector(`[data-testid="daily-log-edit-${log.id}"]`) as HTMLButtonElement).click()
    })
    const modal = document.body.querySelector('[data-testid="daily-log-editor-modal"]')
    expect(modal).toBeTruthy()
    expect(
      (document.body.querySelector('[data-testid="daily-log-editor-date"]') as HTMLInputElement).value,
    ).toBe('2026-09-05')
    expect(
      (document.body.querySelector('[data-testid="daily-log-editor-memo"]') as HTMLTextAreaElement)
        .value,
    ).toBe('existing note')
    expect(
      (document.body.querySelector('[data-testid="daily-log-editor-video"]') as HTMLInputElement)
        .value,
    ).toBe('https://youtu.be/aaaaaaaaaaa')

    view.unmount()
  })

  it('list CSS prevents horizontal overflow and uses single-line ellipsis', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'DailyLogPanel.css'),
      'utf8',
    )
    expect(css).toMatch(/\.daily-log-list\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(css).toMatch(/\.daily-log-card__preview\s*\{[^}]*white-space:\s*nowrap/s)
    expect(css).toMatch(/\.daily-log-card__preview\s*\{[^}]*text-overflow:\s*ellipsis/s)
  })

  it('SvgLightbox panel CSS uses near-fullscreen viewport size', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SvgLightbox.css'),
      'utf8',
    )
    expect(css).toMatch(/width:\s*calc\(100vw - 32px\)/)
    expect(css).toMatch(/height:\s*calc\(100vh - 32px\)/)
    expect(css).toMatch(/max-width:\s*none/)
    expect(css).toMatch(/max-height:\s*none/)
  })

  it('editor modal CSS is large enough for long Markdown/SVG source', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'DailyLogEditorModal.css'),
      'utf8',
    )
    expect(css).toMatch(/min-height:\s*320px/)
    expect(css).toMatch(/width:\s*min\(800px,\s*calc\(100vw - 32px\)\)/)
  })
})

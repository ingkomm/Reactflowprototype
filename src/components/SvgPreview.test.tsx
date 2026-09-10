/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  SVG_PREVIEW_MAX_SCALE,
  SVG_PREVIEW_MIN_SCALE,
  SVG_PREVIEW_SCALE_STEP,
  SvgPreview,
  clampSvgPan,
  computeFitScale,
} from './SvgPreview'
import { NotableLogViewer } from './NotableLogViewer'
import { createDailyLog } from '../dailyLog'

const SIMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#abc"/></svg>'

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

describe('computeFitScale / clampSvgPan', () => {
  it('fits large SVG down and does not upscale small SVG', () => {
    expect(computeFitScale(800, 400, 400, 200)).toBe(0.5)
    expect(computeFitScale(100, 50, 400, 200)).toBe(1)
  })

  it('clamps pan so content stays usable in viewport', () => {
    const panned = clampSvgPan(-500, -500, 2, 100, 100, 200, 200)
    expect(panned.tx).toBe(0)
    expect(panned.ty).toBe(0)
    const small = clampSvgPan(50, 50, 0.5, 100, 100, 200, 200)
    expect(small.tx).toBe(50)
    expect(small.ty).toBe(50)
  })

  it('keeps zoom range and step constants in the requested band', () => {
    expect(SVG_PREVIEW_MIN_SCALE).toBe(0.5)
    expect(SVG_PREVIEW_MAX_SCALE).toBe(4)
    expect(SVG_PREVIEW_SCALE_STEP).toBe(0.25)
  })
})

describe('SvgPreview zoom / pan', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts fitted, zooms with +/- and Fit, pans via pointer drag, revokes blob URL', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:svg-preview'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => undefined
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => undefined
    }

    const view = mount(<SvgPreview svg={SIMPLE_SVG} />)
    const viewport = view.host.querySelector('.svg-preview__viewport') as HTMLDivElement
    const img = view.host.querySelector('[data-testid="markdown-svg-image"]') as HTMLImageElement
    expect(viewport).toBeTruthy()
    expect(img).toBeTruthy()

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 200 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 100 })
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 400 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 200 })

    act(() => {
      img.dispatchEvent(new Event('load'))
    })

    const zoomLabel = () => view.host.querySelector('.svg-preview__zoom')?.textContent
    expect(zoomLabel()).toBe('50%')

    const buttons = [...view.host.querySelectorAll('.svg-preview__btn')] as HTMLButtonElement[]
    const zoomOut = buttons.find((b) => b.getAttribute('aria-label') === 'Zoom out')!
    const zoomIn = buttons.find((b) => b.getAttribute('aria-label') === 'Zoom in')!
    const fit = buttons.find((b) => b.textContent === 'Fit')!

    act(() => {
      zoomIn.click()
    })
    expect(zoomLabel()).toBe('75%')

    act(() => {
      zoomOut.click()
    })
    expect(zoomLabel()).toBe('50%')

    // Drive scale to max via repeated zoom-in.
    for (let i = 0; i < 20; i++) {
      act(() => {
        zoomIn.click()
      })
    }
    expect(zoomLabel()).toBe('400%')

    for (let i = 0; i < 20; i++) {
      act(() => {
        zoomOut.click()
      })
    }
    expect(zoomLabel()).toBe('50%')

    act(() => {
      zoomIn.click()
      zoomIn.click()
    })
    const beforePan = img.style.transform

    act(() => {
      viewport.dispatchEvent(
        new PointerEvent('pointerdown', {
          button: 0,
          clientX: 40,
          clientY: 40,
          pointerId: 1,
          bubbles: true,
        }),
      )
      viewport.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 70,
          clientY: 55,
          pointerId: 1,
          bubbles: true,
        }),
      )
      viewport.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 1,
          bubbles: true,
        }),
      )
    })
    expect(img.style.transform).not.toBe(beforePan)
    expect(img.style.transform).toMatch(/translate\(/)

    act(() => {
      fit.click()
    })
    expect(zoomLabel()).toBe('50%')

    expect(getComputedStyle(viewport).overflow).not.toBe('auto')
    expect(viewport.className).toContain('svg-preview__viewport')

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg-preview')
  })
})

describe('Timeline label + horizontal overflow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows one-line timeline labels and keeps playlist from growing horizontally', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:timeline-svg'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })

    const long = 'L'.repeat(400)
    const logs = [
      createDailyLog('2026-09-05', '```svg\n<svg xmlns="http://www.w3.org/2000/svg"/>\n```'),
      createDailyLog('2026-09-04', `# Title\n\n${long}`),
      createDailyLog('2026-09-03', long),
    ]
    const view = mount(
      <NotableLogViewer
        open
        x={20}
        y={20}
        nodeLabel="Drill"
        markdown="summary"
        logs={logs}
        onClose={() => undefined}
      />,
    )

    const memos = [...view.host.querySelectorAll('.notable-log-viewer__memo')] as HTMLElement[]
    expect(memos[0]?.textContent).toBe('SVG')
    expect(memos[1]?.textContent).toBe('Title')
    expect(memos[2]?.textContent).toBe(long)
    expect(memos[2]?.textContent).not.toContain('\n')

    // Detail still shows full markdown body for the selected (SVG) log.
    expect(view.host.querySelector('[data-testid="markdown-svg-block"]')).toBeTruthy()

    view.unmount()
  })

  it('playlist CSS forbids horizontal scroll and uses single-line ellipsis', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'NotableLogViewer.css'), 'utf8')
    expect(css).toMatch(/\.notable-log-viewer__playlist\s*\{[^}]*overflow-x:\s*hidden/s)
    expect(css).toMatch(/\.notable-log-viewer__playlist\s*\{[^}]*overflow-y:\s*auto/s)
    expect(css).toMatch(/\.notable-log-viewer__memo\s*\{[^}]*white-space:\s*nowrap/s)
    expect(css).toMatch(/\.notable-log-viewer__memo\s*\{[^}]*text-overflow:\s*ellipsis/s)
    expect(css).not.toMatch(/-webkit-line-clamp:\s*2/)
  })
})

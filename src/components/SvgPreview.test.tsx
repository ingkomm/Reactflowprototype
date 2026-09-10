/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  SVG_LIGHTBOX_MAX_SCALE,
  SVG_LIGHTBOX_MIN_SCALE,
  SVG_LIGHTBOX_SCALE_STEP,
  clampSvgPan,
  computeFitScale,
} from '../svgLightboxMath'
import { SvgPreview } from './SvgPreview'
import { SvgLightbox } from './SvgLightbox'
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
    expect(SVG_LIGHTBOX_MIN_SCALE).toBe(0.5)
    expect(SVG_LIGHTBOX_MAX_SCALE).toBe(4)
    expect(SVG_LIGHTBOX_SCALE_STEP).toBe(0.25)
  })
})

describe('SvgPreview simple preview + lightbox entry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.querySelectorAll('[data-testid="svg-lightbox"]').forEach((el) => el.remove())
  })

  it('renders intrinsic preview without inline zoom controls', () => {
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

    const view = mount(<SvgPreview svg={SIMPLE_SVG} />)
    expect(view.host.querySelector('[data-testid="svg-preview"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="markdown-svg-image"]')).toBeTruthy()
    expect(view.host.querySelector('.svg-preview__controls')).toBeNull()
    expect(view.host.querySelector('[aria-label="Zoom in"]')).toBeNull()
    expect(view.host.querySelector('.svg-preview__expand')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="svg-lightbox"]')).toBeNull()
    view.unmount()
  })

  it('opens lightbox on expand click and double-click; Esc closes', () => {
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

    const view = mount(<SvgPreview svg={SIMPLE_SVG} />)
    const expand = view.host.querySelector('[data-testid="svg-preview-expand"]') as HTMLButtonElement
    act(() => {
      expand.click()
    })
    expect(document.body.querySelector('[data-testid="svg-lightbox"]')).toBeTruthy()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(document.body.querySelector('[data-testid="svg-lightbox"]')).toBeNull()

    const preview = view.host.querySelector('[data-testid="svg-preview"]') as HTMLElement
    act(() => {
      preview.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(document.body.querySelector('[data-testid="svg-lightbox"]')).toBeTruthy()

    act(() => {
      ;(document.body.querySelector('[data-testid="svg-lightbox-close"]') as HTMLButtonElement).click()
    })
    expect(document.body.querySelector('[data-testid="svg-lightbox"]')).toBeNull()
    view.unmount()
  })
})

describe('SvgLightbox zoom / pan', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.querySelectorAll('[data-testid="svg-lightbox"]').forEach((el) => el.remove())
  })

  it('starts fitted, zooms with +/- and Fit, pans via pointer drag, revokes blob URL', () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:svg-lightbox'),
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

    const onClose = vi.fn()
    const view = mount(<SvgLightbox svg={SIMPLE_SVG} onClose={onClose} />)
    const lightbox = document.body.querySelector('[data-testid="svg-lightbox"]') as HTMLElement
    const viewport = lightbox.querySelector('.svg-lightbox__viewport') as HTMLDivElement
    const img = lightbox.querySelector('[data-testid="svg-lightbox-image"]') as HTMLImageElement
    expect(viewport).toBeTruthy()
    expect(img).toBeTruthy()

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 200 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 100 })
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 400 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 200 })

    act(() => {
      img.dispatchEvent(new Event('load'))
    })

    const zoomLabel = () => lightbox.querySelector('.svg-lightbox__zoom')?.textContent
    expect(zoomLabel()).toBe('50%')

    const zoomOut = lightbox.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement
    const zoomIn = lightbox.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement
    const fit = [...lightbox.querySelectorAll('.svg-lightbox__btn')].find(
      (b) => b.textContent === 'Fit',
    ) as HTMLButtonElement

    act(() => {
      zoomIn.click()
    })
    expect(zoomLabel()).toBe('75%')

    act(() => {
      zoomOut.click()
    })
    expect(zoomLabel()).toBe('50%')

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

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg-lightbox')
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
    expect(view.host.querySelector('[data-testid="markdown-svg-block"]')).toBeTruthy()
    expect(view.host.querySelector('.svg-preview__controls')).toBeNull()
    expect(view.host.querySelector('[aria-label="Zoom in"]')).toBeNull()

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

  it('non-pinned preview CSS centers and caps size like Daily Log editor modal', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const notable = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'NotableLogViewer.css'),
      'utf8',
    )
    const shard = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ShardMarkdownPreview.css'),
      'utf8',
    )
    for (const css of [notable, shard]) {
      expect(css).toMatch(/:not\(\.is-pinned\)\s*\{[^}]*left:\s*50%/s)
      expect(css).toMatch(/:not\(\.is-pinned\)\s*\{[^}]*top:\s*50%/s)
      expect(css).toMatch(/:not\(\.is-pinned\)\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)/s)
      expect(css).toMatch(/width:\s*min\(800px,\s*calc\(100vw - 32px\)\)/)
      expect(css).toMatch(/max-height:\s*calc\(100vh - 32px\)/)
    }
    expect(notable).toMatch(/\.is-pinned\s*\{[^}]*transform:\s*none/s)
    expect(shard).toMatch(/\.is-pinned\s*\{[^}]*transform:\s*none/s)
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { NotableLogViewer } from './NotableLogViewer'
import { createDailyLog } from '../dailyLog'
import { kindUsesDailyLogs } from '../dailyLogNode'
import { canPinNodeVideos } from '../videoMedia'
import { ShardMarkdownPreview } from './ShardMarkdownPreview'

function mount(ui: React.ReactNode) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(ui)
  })
  return {
    host,
    rerender(next: React.ReactNode) {
      act(() => {
        root.render(next)
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

const sampleLogs = [
  createDailyLog('2026-08-01', 'older note'),
  createDailyLog('2026-09-05', '## newest\n\nbody', [
    {
      id: 'vid-a',
      url: 'https://youtu.be/aaaaaaaaaaa',
      title: 'First clip',
    },
    {
      id: 'vid-b',
      url: 'https://youtu.be/bbbbbbbbbbb',
      title: 'Second clip',
    },
  ]),
  createDailyLog('2026-09-01', 'mid note'),
]

describe('Mastery contentless gates', () => {
  it('disables Daily Log and video pin for Mastery kinds', () => {
    expect(kindUsesDailyLogs('mastery')).toBe(false)
    expect(kindUsesDailyLogs('voidMastery')).toBe(false)
    expect(kindUsesDailyLogs('notable')).toBe(true)
    expect(canPinNodeVideos('mastery')).toBe(false)
    expect(canPinNodeVideos('voidMastery')).toBe(false)
    expect(canPinNodeVideos('notable')).toBe(true)
  })
})

describe('ShardMarkdownPreview', () => {
  it('renders read-only markdown without an editor control', () => {
    const view = mount(
      <ShardMarkdownPreview
        open
        x={20}
        y={20}
        nodeLabel="Shard A"
        markdown={'## Hello\n\nworld'}
        onClose={() => undefined}
      />,
    )
    expect(view.host.textContent).toContain('Shard A')
    expect(view.host.textContent).toContain('Hello')
    expect(view.host.querySelector('textarea')).toBeNull()
    view.unmount()
  })
})

describe('NotableLogViewer interactions', () => {
  it('shows Summary markdown and timeline newest-first with short notes (not log markdown viewer)', () => {
    const view = mount(
      <NotableLogViewer
        open
        x={40}
        y={40}
        nodeLabel="Drill"
        markdown={'## Current understanding\n\nOverview body'}
        logs={sampleLogs}
        onClose={() => undefined}
      />,
    )

    expect(view.host.querySelector('[data-testid="notable-log-viewer"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="notable-summary"]')?.textContent).toContain(
      'Current understanding',
    )
    expect(view.host.querySelector('[data-testid="notable-mode-note"]')).toBeNull()
    expect(view.host.querySelector('[data-testid="notable-mode-video"]')).toBeNull()

    const items = [
      ...view.host.querySelectorAll('[data-testid^="notable-log-item-"]'),
    ] as HTMLElement[]
    expect(items[0]?.textContent).toContain('2026-09-05')
    expect(items[0]?.textContent).toContain('newest')

    expect(view.host.querySelector('[data-testid="notable-short-note"]')?.textContent).toContain(
      'newest',
    )
    // Daily Log note is plain text, not rendered as markdown headings from the log body.
    expect(
      view.host.querySelector('[data-testid="notable-log-detail"] h2'),
    ).toBeNull()

    const older = view.host.querySelector(
      '[data-testid="notable-log-item-' + sampleLogs[0]!.id + '"]',
    ) as HTMLButtonElement
    act(() => {
      older.click()
    })
    expect(view.host.querySelector('[data-testid="notable-short-note"]')?.textContent).toContain(
      'older note',
    )
    expect(view.host.querySelector('[data-testid="notable-video-pane"]')).toBeNull()
    expect(view.host.textContent).not.toContain('No video')

    const newest = view.host.querySelector(
      '[data-testid="notable-log-item-' + sampleLogs[1]!.id + '"]',
    ) as HTMLButtonElement
    act(() => {
      newest.click()
    })
    const detail = view.host.querySelector('[data-testid="notable-log-detail"]') as HTMLElement
    const videoPane = detail.querySelector('[data-testid="notable-video-pane"]') as HTMLElement
    const shortNote = detail.querySelector('[data-testid="notable-short-note"]') as HTMLElement
    expect(videoPane).toBeTruthy()
    expect(shortNote).toBeTruthy()
    // Video must render above Simple Memo.
    expect(
      Boolean(
        videoPane.compareDocumentPosition(shortNote) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(view.host.querySelector('[data-testid="notable-video-player"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="notable-video-resize"]')).toBeTruthy()

    act(() => {
      ;(
        view.host.querySelector(
          '[data-testid="notable-video-item-vid-b"]',
        ) as HTMLButtonElement
      ).click()
    })
    expect(
      view.host
        .querySelector('[data-testid="notable-video-item-vid-b"]')
        ?.className.includes('is-active'),
    ).toBe(true)

    // No new media.note input UI in the viewer.
    expect(view.host.textContent).not.toContain('영상 짧은 메모')
    expect(view.host.querySelector('textarea')).toBeNull()

    view.unmount()
  })

  it('exposes no edit callbacks and remounts clean session via key', () => {
    let closed = 0
    const view = mount(
      <NotableLogViewer
        key="node-a"
        open
        x={10}
        y={10}
        nodeLabel="A"
        markdown={'summary A'}
        logs={sampleLogs}
        onClose={() => {
          closed += 1
        }}
      />,
    )
    expect(view.host.querySelector('textarea')).toBeNull()
    expect(view.host.querySelector('input')).toBeNull()
    expect(view.host.querySelector('[data-testid="notable-summary"]')?.textContent).toContain(
      'summary A',
    )

    view.rerender(
      <NotableLogViewer
        key="node-b"
        open
        x={10}
        y={10}
        nodeLabel="B"
        markdown={'summary B'}
        logs={sampleLogs}
        onClose={() => {
          closed += 1
        }}
      />,
    )
    expect(view.host.querySelector('[data-testid="notable-summary"]')?.textContent).toContain(
      'summary B',
    )
    expect(closed).toBe(0)
    view.unmount()
  })

  it('moves on header drag, ignores close button, resizes video, and reclamps after grow', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const view = mount(
      <NotableLogViewer
        open
        x={40}
        y={50}
        nodeLabel="Drill"
        markdown={'## Sum'}
        logs={sampleLogs}
        onClose={() => undefined}
      />,
    )

    const panel = view.host.querySelector('[data-testid="notable-log-viewer"]') as HTMLElement
    const head = view.host.querySelector('[data-testid="notable-log-viewer-head"]') as HTMLElement
    const close = head.querySelector('button') as HTMLButtonElement

    const leftBefore = panel.style.left
    const topBefore = panel.style.top

    act(() => {
      close.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 80,
          clientY: 60,
          button: 0,
          pointerId: 1,
        }),
      )
      close.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 220,
          clientY: 180,
          pointerId: 1,
        }),
      )
    })
    expect(panel.style.left).toBe(leftBefore)
    expect(panel.style.top).toBe(topBefore)

    act(() => {
      head.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 80,
          clientY: 60,
          button: 0,
          pointerId: 2,
        }),
      )
      head.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 200,
          clientY: 140,
          pointerId: 2,
        }),
      )
      head.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 200,
          clientY: 140,
          pointerId: 2,
        }),
      )
    })
    expect(panel.style.left).not.toBe(leftBefore)
    expect(panel.style.top).not.toBe(topBefore)

    const newest = view.host.querySelector(
      '[data-testid="notable-log-item-' + sampleLogs[1]!.id + '"]',
    ) as HTMLButtonElement
    act(() => {
      newest.click()
    })

    const player = view.host.querySelector('[data-testid="notable-video-player"]') as HTMLElement
    const resize = view.host.querySelector(
      '[data-testid="notable-video-resize"]',
    ) as HTMLButtonElement
    expect(player.style.width).toBe('480px')
    expect(player.style.height).toBe('270px')

    // Place panel near the right edge, then grow player so ResizeObserver reclamps.
    act(() => {
      head.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 1200,
          clientY: 100,
          button: 0,
          pointerId: 4,
        }),
      )
      head.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 1300,
          clientY: 100,
          pointerId: 4,
        }),
      )
      head.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 1300,
          clientY: 100,
          pointerId: 4,
        }),
      )
    })
    const leftNearEdge = parseFloat(panel.style.left)

    act(() => {
      resize.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 500,
          clientY: 300,
          button: 0,
          pointerId: 3,
        }),
      )
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 900,
          clientY: 500,
          pointerId: 3,
        }),
      )
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 900,
          clientY: 500,
          pointerId: 3,
        }),
      )
    })
    expect(parseFloat(player.style.width)).toBeGreaterThan(480)
    expect(parseFloat(player.style.height)).toBeGreaterThan(270)
    // After growth, panel should remain within viewport (clamped).
    const leftAfterGrow = parseFloat(panel.style.left)
    const width = panel.offsetWidth || 600
    expect(leftAfterGrow + width).toBeLessThanOrEqual(window.innerWidth - 8 + 1)
    expect(leftAfterGrow).toBeLessThanOrEqual(leftNearEdge + 1)

    view.unmount()
  })
})

describe('ShardMarkdownPreview header drag', () => {
  it('moves panel from header drag and does not start drag from close', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const view = mount(
      <ShardMarkdownPreview
        open
        x={30}
        y={40}
        nodeLabel="Shard A"
        markdown={'## Hello'}
        onClose={() => undefined}
      />,
    )
    const panel = view.host.querySelector('[data-testid="shard-markdown-preview"]') as HTMLElement
    const head = view.host.querySelector(
      '[data-testid="shard-markdown-preview-head"]',
    ) as HTMLElement
    const close = head.querySelector('button') as HTMLButtonElement
    const leftBefore = panel.style.left

    act(() => {
      close.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 50,
          clientY: 50,
          button: 0,
          pointerId: 1,
        }),
      )
      close.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 180,
          clientY: 120,
          pointerId: 1,
        }),
      )
    })
    expect(panel.style.left).toBe(leftBefore)

    act(() => {
      head.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 50,
          clientY: 50,
          button: 0,
          pointerId: 2,
        }),
      )
      head.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 160,
          clientY: 110,
          pointerId: 2,
        }),
      )
    })
    expect(panel.style.left).not.toBe(leftBefore)
    view.unmount()
  })
})

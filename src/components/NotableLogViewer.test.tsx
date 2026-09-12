/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { NotableLogViewer } from './NotableLogViewer'
import { createDailyLog } from '../dailyLog'
import { kindUsesDailyLogs } from '../dailyLogNode'
import { canFloatNodeVideos } from '../videoMedia'
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
  it('disables Daily Log and floating video for Mastery kinds', () => {
    expect(kindUsesDailyLogs('mastery')).toBe(false)
    expect(kindUsesDailyLogs('voidMastery')).toBe(false)
    expect(kindUsesDailyLogs('notable')).toBe(true)
    expect(canFloatNodeVideos('mastery')).toBe(false)
    expect(canFloatNodeVideos('voidMastery')).toBe(false)
    expect(canFloatNodeVideos('notable')).toBe(true)
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
  it('shows Summary markdown and timeline newest-first; selected log note uses MarkdownView', () => {
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
    // Selected Daily Log note body is Markdown (heading from log note).
    expect(
      view.host.querySelector('[data-testid="notable-log-detail"] h2')?.textContent,
    ).toBe('newest')
    expect(view.host.querySelector('[data-testid="notable-log-detail"] .markdown-view')).toBeTruthy()

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
    // Video must render above log note.
    expect(
      Boolean(
        videoPane.compareDocumentPosition(shortNote) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(view.host.querySelector('[data-testid="notable-video-player"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="notable-video-resize"]')).toBeNull()
    const player = view.host.querySelector(
      '[data-testid="notable-video-player"]',
    ) as HTMLElement
    // Video follows content width (no fixed px player size).
    expect(player.style.width).toBe('')
    expect(player.style.height).toBe('')
    expect(player.className).toContain('notable-log-viewer__player')

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

  it('shows 수정 for selected log and calls onEditLog with selected id', () => {
    const onEditLog = vi.fn()
    const view = mount(
      <NotableLogViewer
        open
        x={10}
        y={10}
        nodeLabel="Drill"
        markdown={'summary'}
        logs={sampleLogs}
        onClose={() => undefined}
        onEditLog={onEditLog}
      />,
    )
    const edit = view.host.querySelector('[data-testid="notable-log-edit"]') as HTMLButtonElement
    expect(edit).toBeTruthy()
    expect(edit.className.split(/\s+/)).toContain('btn')
    expect(edit.className.split(/\s+/)).not.toContain('btn--ghost')
    act(() => {
      edit.click()
    })
    // Default selection is newest-first timeline[0] = sampleLogs[1]
    expect(onEditLog).toHaveBeenCalledWith(sampleLogs[1]!.id)

    const older = view.host.querySelector(
      '[data-testid="notable-log-item-' + sampleLogs[0]!.id + '"]',
    ) as HTMLButtonElement
    act(() => {
      older.click()
    })
    act(() => {
      ;(view.host.querySelector('[data-testid="notable-log-edit"]') as HTMLButtonElement).click()
    })
    expect(onEditLog).toHaveBeenLastCalledWith(sampleLogs[0]!.id)
    view.unmount()
  })

  it('edit button works when pinned=true on same viewer path', () => {
    const onEditLog = vi.fn()
    const view = mount(
      <NotableLogViewer
        open
        pinned
        modal={false}
        closeOnEscape={false}
        x={10}
        y={10}
        nodeLabel="Pinned"
        markdown={'summary'}
        logs={sampleLogs}
        onClose={() => undefined}
        onEditLog={onEditLog}
      />,
    )
    act(() => {
      ;(view.host.querySelector('[data-testid="notable-log-edit"]') as HTMLButtonElement).click()
    })
    expect(onEditLog).toHaveBeenCalledWith(sampleLogs[1]!.id)
    view.unmount()
  })

  it('hides 수정 when onEditLog is omitted', () => {
    const view = mount(
      <NotableLogViewer
        open
        x={10}
        y={10}
        nodeLabel="A"
        markdown={'summary A'}
        logs={sampleLogs}
        onClose={() => undefined}
      />,
    )
    expect(view.host.querySelector('[data-testid="notable-log-edit"]')).toBeNull()
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

  it('non-pinned preview does not drag; pinned moves from header and has no video resize handle', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const transient = mount(
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
    const transientPanel = transient.host.querySelector(
      '[data-testid="notable-log-viewer"]',
    ) as HTMLElement
    expect(transientPanel.className).toContain('is-preview')
    expect(transientPanel.style.left).toBe('')
    expect(transientPanel.style.top).toBe('')
    const transientHead = transient.host.querySelector(
      '[data-testid="notable-log-viewer-head"]',
    ) as HTMLElement
    act(() => {
      transientHead.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 80,
          clientY: 60,
          button: 0,
          pointerId: 1,
        }),
      )
      transientHead.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 200,
          clientY: 140,
          pointerId: 1,
        }),
      )
    })
    expect(transientPanel.style.left).toBe('')
    transient.unmount()

    const view = mount(
      <NotableLogViewer
        open
        pinned
        modal={false}
        closeOnEscape={false}
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

    expect(view.host.querySelector('[data-testid="notable-video-player"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="notable-video-resize"]')).toBeNull()
    expect(view.host.textContent).not.toContain('영상 크기 조절')
    expect(panel.getAttribute('data-resizable')).toBe('false')

    view.unmount()
  })

  it('pinned Notable reports bounds after size change and is not user-resizable', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const onBoundsChange = vi.fn()
    const view = mount(
      <NotableLogViewer
        open
        pinned
        modal={false}
        closeOnEscape={false}
        x={40}
        y={50}
        nodeLabel="Drill"
        markdown={'## Sum'}
        logs={sampleLogs}
        onClose={() => undefined}
        onBoundsChange={onBoundsChange}
      />,
    )
    const panel = view.host.querySelector('[data-testid="notable-log-viewer"]') as HTMLElement
    expect(panel.getAttribute('data-resizable')).toBe('false')
    expect(view.host.querySelector('[data-testid="notable-video-resize"]')).toBeNull()

    act(() => {
      Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 640 })
      Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 480 })
      Object.defineProperty(panel, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          x: 40,
          y: 50,
          left: 40,
          top: 50,
          width: 640,
          height: 480,
          right: 680,
          bottom: 530,
          toJSON() {
            return {}
          },
        }),
      })
      window.dispatchEvent(new Event('resize'))
    })

    expect(onBoundsChange).toHaveBeenCalled()
    const last = onBoundsChange.mock.calls.at(-1)?.[0] as {
      width: number
      height: number
    }
    expect(last.width).toBe(640)
    expect(last.height).toBe(480)
    view.unmount()
  })
})

describe('ShardMarkdownPreview header drag', () => {
  it('non-pinned preview stays centered without drag; pinned moves from header', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const transient = mount(
      <ShardMarkdownPreview
        open
        x={30}
        y={40}
        nodeLabel="Shard A"
        markdown={'## Hello'}
        onClose={() => undefined}
      />,
    )
    const transientPanel = transient.host.querySelector(
      '[data-testid="shard-markdown-preview"]',
    ) as HTMLElement
    expect(transientPanel.className).toContain('is-preview')
    expect(transientPanel.style.left).toBe('')
    const transientHead = transient.host.querySelector(
      '[data-testid="shard-markdown-preview-head"]',
    ) as HTMLElement
    act(() => {
      transientHead.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 50,
          clientY: 50,
          button: 0,
          pointerId: 1,
        }),
      )
      transientHead.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 160,
          clientY: 110,
          pointerId: 1,
        }),
      )
    })
    expect(transientPanel.style.left).toBe('')
    transient.unmount()

    const view = mount(
      <ShardMarkdownPreview
        open
        pinned
        modal={false}
        closeOnEscape={false}
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

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import {
  bringPinnedViewerToFront,
  closePinnedViewer,
  findPinnedViewer,
  pinOrFocusViewer,
  prunePinnedViewers,
  prunePinnedViewersByKindMismatch,
  viewerPanelCenter,
  type PinnedViewerEntry,
} from './pinnedViewer'
import { ShardMarkdownPreview } from './components/ShardMarkdownPreview'
import { NotableLogViewer } from './components/NotableLogViewer'
import { createDailyLog } from './dailyLog'

function mount(ui: ReactNode) {
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

describe('pinnedViewer helpers', () => {
  it('pins multiple nodes and rejects duplicate pin for the same node', () => {
    let entries: PinnedViewerEntry[] = []
    entries = pinOrFocusViewer(entries, { nodeId: 'a', kind: 'shard', x: 10, y: 20 }, 1)
    entries = pinOrFocusViewer(entries, { nodeId: 'b', kind: 'notable', x: 30, y: 40 }, 2)
    expect(entries).toHaveLength(2)

    const again = pinOrFocusViewer(entries, { nodeId: 'a', kind: 'shard', x: 99, y: 99 }, 3)
    expect(again).toHaveLength(2)
    expect(findPinnedViewer(again, 'a')?.zIndex).toBe(3)
    // Duplicate pin keeps the existing coordinates and only bumps z-order.
    expect(findPinnedViewer(again, 'a')?.x).toBe(10)
  })

  it('bring to front / close one without affecting others', () => {
    let entries = pinOrFocusViewer([], { nodeId: 'a', kind: 'shard', x: 0, y: 0 }, 1)
    entries = pinOrFocusViewer(entries, { nodeId: 'b', kind: 'notable', x: 1, y: 1 }, 2)
    entries = bringPinnedViewerToFront(entries, 'a', 5)
    expect(findPinnedViewer(entries, 'a')?.zIndex).toBe(5)
    expect(findPinnedViewer(entries, 'b')?.zIndex).toBe(2)

    entries = closePinnedViewer(entries, 'a')
    expect(findPinnedViewer(entries, 'a')).toBeUndefined()
    expect(entries).toHaveLength(1)
  })

  it('prunes pinned viewers when source nodes disappear', () => {
    let entries = pinOrFocusViewer([], { nodeId: 'a', kind: 'shard', x: 0, y: 0 }, 1)
    entries = pinOrFocusViewer(entries, { nodeId: 'b', kind: 'notable', x: 1, y: 1 }, 2)
    entries = prunePinnedViewers(entries, ['b'])
    expect(entries.map((e) => e.nodeId)).toEqual(['b'])
  })

  it('tether panel endpoint is bounds center (not nearest edge)', () => {
    const bounds = { x: 100, y: 100, width: 400, height: 300 }
    expect(viewerPanelCenter(bounds)).toEqual({ x: 300, y: 250 })

    const wider = { ...bounds, width: 600 }
    expect(viewerPanelCenter(wider).x).toBe(400)
    expect(viewerPanelCenter(wider).y).toBe(250)

    const taller = { ...bounds, height: 500 }
    expect(viewerPanelCenter(taller).x).toBe(300)
    expect(viewerPanelCenter(taller).y).toBe(350)

    const resized = { x: 100, y: 100, width: 600, height: 500 }
    expect(viewerPanelCenter(resized)).toEqual({ x: 400, y: 350 })
  })
})

describe('transient vs pinned viewer chrome', () => {
  it('shows Pin + backdrop for transient Shard, and hides them when pinned', () => {
    const onPin = vi.fn()
    const onClose = vi.fn()
    const view = mount(
      <ShardMarkdownPreview
        open
        x={40}
        y={50}
        nodeLabel="Shard A"
        markdown="# hi"
        onClose={onClose}
        onPin={onPin}
      />,
    )
    expect(view.host.querySelector('.shard-markdown-preview__backdrop')).toBeTruthy()
    const pin = view.host.querySelector('[data-testid="viewer-pin"]') as HTMLButtonElement
    expect(pin).toBeTruthy()
    act(() => {
      pin.click()
    })
    expect(onPin).toHaveBeenCalledWith({ x: expect.any(Number), y: expect.any(Number) })
    view.unmount()

    const pinned = mount(
      <ShardMarkdownPreview
        open
        pinned
        modal={false}
        closeOnEscape={false}
        x={40}
        y={50}
        nodeLabel="Shard A"
        markdown="# hi"
        onClose={onClose}
      />,
    )
    expect(pinned.host.querySelector('.shard-markdown-preview__backdrop')).toBeNull()
    expect(pinned.host.querySelector('[data-testid="viewer-pin"]')).toBeNull()
    expect(
      pinned.host.querySelector('[data-testid="shard-markdown-preview"]')?.getAttribute('data-pinned'),
    ).toBe('true')
    expect(
      pinned.host
        .querySelector('[data-testid="shard-markdown-preview"]')
        ?.getAttribute('data-resizable'),
    ).toBe('true')
    pinned.unmount()
  })

  it('marks pinned Notable as resizable and transient viewers as not', () => {
    const transientShard = mount(
      <ShardMarkdownPreview
        open
        x={40}
        y={50}
        nodeLabel="Shard A"
        markdown="# hi"
        onClose={() => {}}
      />,
    )
    expect(
      transientShard.host
        .querySelector('[data-testid="shard-markdown-preview"]')
        ?.getAttribute('data-resizable'),
    ).toBe('false')
    transientShard.unmount()

    const transientNotable = mount(
      <NotableLogViewer
        open
        x={10}
        y={10}
        nodeLabel="N"
        logs={[createDailyLog('2026-09-01', 'memo')]}
        onClose={() => {}}
      />,
    )
    expect(
      transientNotable.host
        .querySelector('[data-testid="notable-log-viewer"]')
        ?.getAttribute('data-resizable'),
    ).toBe('false')
    transientNotable.unmount()

    const pinnedNotable = mount(
      <NotableLogViewer
        open
        pinned
        modal={false}
        closeOnEscape={false}
        x={10}
        y={10}
        nodeLabel="N"
        logs={[createDailyLog('2026-09-01', 'memo')]}
        onClose={() => {}}
      />,
    )
    expect(
      pinnedNotable.host
        .querySelector('[data-testid="notable-log-viewer"]')
        ?.getAttribute('data-resizable'),
    ).toBe('true')
    pinnedNotable.unmount()
  })

  it('reports new width/height via onBoundsChange after panel size change', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const onBoundsChange = vi.fn()
    const view = mount(
      <ShardMarkdownPreview
        open
        pinned
        modal={false}
        closeOnEscape={false}
        x={40}
        y={50}
        nodeLabel="Shard A"
        markdown="# hi"
        onClose={() => {}}
        onBoundsChange={onBoundsChange}
      />,
    )
    const panel = view.host.querySelector(
      '[data-testid="shard-markdown-preview"]',
    ) as HTMLElement

    act(() => {
      Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 500 })
      Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 400 })
      Object.defineProperty(panel, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          x: 40,
          y: 50,
          left: 40,
          top: 50,
          width: 500,
          height: 400,
          right: 540,
          bottom: 450,
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
    expect(last.width).toBe(500)
    expect(last.height).toBe(400)
    view.unmount()
  })

  it('does not close pinned Notable on Escape, but closes transient on Escape', () => {
    const onClose = vi.fn()
    const transient = mount(
      <NotableLogViewer
        open
        x={10}
        y={10}
        nodeLabel="N"
        logs={[createDailyLog('2026-09-01', 'memo')]}
        onClose={onClose}
      />,
    )
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    transient.unmount()

    const pinnedClose = vi.fn()
    const pinned = mount(
      <NotableLogViewer
        open
        pinned
        modal={false}
        closeOnEscape={false}
        x={10}
        y={10}
        nodeLabel="N"
        logs={[createDailyLog('2026-09-01', 'memo')]}
        onClose={pinnedClose}
      />,
    )
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(pinnedClose).not.toHaveBeenCalled()
    expect(pinned.host.querySelector('.notable-log-viewer__backdrop')).toBeNull()
    pinned.unmount()
  })

  it('reports current floating position when Pin is clicked', () => {
    const onPin = vi.fn()
    const view = mount(
      <ShardMarkdownPreview
        open
        x={120}
        y={140}
        nodeLabel="Shard B"
        markdown="x"
        onClose={() => {}}
        onPin={onPin}
      />,
    )
    const panel = view.host.querySelector('[data-testid="shard-markdown-preview"]') as HTMLElement
    // Non-pinned preview is CSS-centered; cursor coords are not applied as left/top.
    expect(panel.className).toContain('is-preview')
    expect(panel.style.left).toBe('')
    expect(panel.style.top).toBe('')
    const pin = view.host.querySelector('[data-testid="viewer-pin"]') as HTMLButtonElement
    act(() => {
      pin.click()
    })
    const pos = onPin.mock.calls[0]![0] as { x: number; y: number }
    expect(pos.x).toBeTypeOf('number')
    expect(pos.y).toBeTypeOf('number')
    view.unmount()
  })
})

describe('pinned viewer kind mismatch', () => {
  it('closes only the mismatched pinned viewer (no shard↔notable auto-convert)', () => {
    let entries = pinOrFocusViewer([], { nodeId: 'a', kind: 'shard', x: 0, y: 0 }, 1)
    entries = pinOrFocusViewer(entries, { nodeId: 'b', kind: 'notable', x: 1, y: 1 }, 2)
    entries = prunePinnedViewersByKindMismatch(entries, [
      { id: 'a', kind: 'notable' },
      { id: 'b', kind: 'notable' },
    ])
    expect(entries.map((e) => e.nodeId)).toEqual(['b'])
  })
})

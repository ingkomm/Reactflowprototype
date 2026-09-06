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
  nearestPointOnRectEdge,
  pinOrFocusViewer,
  prunePinnedViewers,
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

  it('computes nearest rect edge for tether endpoints', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 }
    expect(nearestPointOnRectEdge(rect, { x: 50, y: 150 })).toEqual({ x: 100, y: 150 })
    expect(nearestPointOnRectEdge(rect, { x: 200, y: 50 })).toEqual({ x: 200, y: 100 })
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
    pinned.unmount()
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
    expect(panel.style.left).toMatch(/px/)
    expect(panel.style.top).toMatch(/px/)
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

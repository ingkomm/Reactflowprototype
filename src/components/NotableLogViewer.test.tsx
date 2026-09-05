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
  it('defaults to newest log in Note mode and switches content on log/mode changes', () => {
    const view = mount(
      <NotableLogViewer
        open
        x={40}
        y={40}
        nodeLabel="Drill"
        logs={sampleLogs}
        onClose={() => undefined}
      />,
    )

    expect(view.host.querySelector('[data-testid="notable-log-viewer"]')).toBeTruthy()
    expect(view.host.textContent).toContain('2026-09-05')
    expect(view.host.querySelector('[data-testid="notable-note-pane"]')?.textContent).toContain(
      'newest',
    )

    const older = view.host.querySelector(
      '[data-testid="notable-log-item-' + sampleLogs[0]!.id + '"]',
    ) as HTMLButtonElement
    act(() => {
      older.click()
    })
    expect(view.host.querySelector('[data-testid="notable-note-pane"]')?.textContent).toContain(
      'older note',
    )

    act(() => {
      ;(view.host.querySelector('[data-testid="notable-mode-video"]') as HTMLButtonElement).click()
    })
    expect(view.host.querySelector('[data-testid="notable-video-pane"]')?.textContent).toContain(
      'No video',
    )

    const newest = view.host.querySelector(
      '[data-testid="notable-log-item-' + sampleLogs[1]!.id + '"]',
    ) as HTMLButtonElement
    act(() => {
      newest.click()
    })
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
        logs={sampleLogs}
        onClose={() => {
          closed += 1
        }}
      />,
    )
    expect(view.host.querySelector('textarea')).toBeNull()
    expect(view.host.querySelector('input')).toBeNull()

    act(() => {
      ;(view.host.querySelector('[data-testid="notable-mode-video"]') as HTMLButtonElement).click()
    })
    expect(view.host.querySelector('[data-testid="notable-video-pane"]')).toBeTruthy()

    view.rerender(
      <NotableLogViewer
        key="node-b"
        open
        x={10}
        y={10}
        nodeLabel="B"
        logs={sampleLogs}
        onClose={() => {
          closed += 1
        }}
      />,
    )
    // Remount resets to Note mode
    expect(view.host.querySelector('[data-testid="notable-note-pane"]')).toBeTruthy()
    expect(view.host.querySelector('[data-testid="notable-video-pane"]')).toBeNull()
    expect(closed).toBe(0)
    view.unmount()
  })
})

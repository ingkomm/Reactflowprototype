/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act, type ReactNode } from 'react'
import { VideoEmbed } from './VideoEmbed'

vi.mock('../platform/localVideo', () => ({
  resolveLocalVideoPlaybackUrl: (path: string) =>
    path.trim() ? `asset://localhost/${encodeURIComponent(path)}` : null,
}))

function mount(ui: ReactNode) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(ui)
  })
  return {
    host,
    rerender(next: ReactNode) {
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

describe('VideoEmbed media identity state reset', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('resets localError when media.id changes to another local video', () => {
    const mediaA = {
      id: 'local-a',
      url: '/videos/a.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
      title: 'A',
    }
    const mediaB = {
      id: 'local-b',
      url: '/videos/b.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
      title: 'B',
    }

    const view = mount(<VideoEmbed media={mediaA} />)
    const video = view.host.querySelector('video') as HTMLVideoElement
    expect(video).toBeTruthy()

    act(() => {
      video.dispatchEvent(new Event('error'))
    })
    expect(view.host.querySelector('[data-testid="video-embed-local-error"]')).toBeTruthy()
    expect(view.host.querySelector('video')).toBeNull()

    view.rerender(<VideoEmbed media={mediaB} />)
    expect(view.host.querySelector('[data-testid="video-embed-local-error"]')).toBeNull()
    const nextVideo = view.host.querySelector('video') as HTMLVideoElement
    expect(nextVideo).toBeTruthy()
    expect(nextVideo.getAttribute('src')).toContain(encodeURIComponent('/videos/b.mp4'))

    view.unmount()
  })

  it('resets YouTube loaded state when media.id changes', () => {
    const mediaA = {
      id: 'yt-a',
      url: 'https://youtu.be/aaaaaaaaaaa',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    const mediaB = {
      id: 'yt-b',
      url: 'https://youtu.be/bbbbbbbbbbb',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }

    const view = mount(<VideoEmbed media={mediaA} />)
    expect(view.host.textContent).toContain('YouTube 재생')
    expect(view.host.querySelector('iframe')).toBeNull()

    act(() => {
      ;(view.host.querySelector('.video-embed__load-btn') as HTMLButtonElement).click()
    })
    expect(view.host.querySelector('iframe')).toBeTruthy()
    expect(view.host.textContent).not.toContain('YouTube 재생')

    view.rerender(<VideoEmbed media={mediaB} />)
    expect(view.host.querySelector('iframe')).toBeNull()
    expect(view.host.textContent).toContain('YouTube 재생')

    view.unmount()
  })
})

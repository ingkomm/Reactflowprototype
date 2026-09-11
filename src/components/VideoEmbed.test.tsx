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

  it('updates local container aspect-ratio from video metadata', () => {
    const media = {
      id: 'local-ratio',
      url: '/videos/ipad.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    const view = mount(<VideoEmbed media={media} />)
    const frame = view.host.querySelector('[data-testid="video-embed-local"]') as HTMLElement
    expect(Number(frame.getAttribute('data-aspect-ratio'))).toBeCloseTo(16 / 9, 5)

    const video = view.host.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1668 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 2388 })
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    const updated = view.host.querySelector('[data-testid="video-embed-local"]') as HTMLElement
    expect(Number(updated.getAttribute('data-aspect-ratio'))).toBeCloseTo(1668 / 2388, 5)

    view.unmount()
  })

  it('resets local aspect-ratio when media.id changes', () => {
    const mediaA = {
      id: 'local-a',
      url: '/videos/a.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    const mediaB = {
      id: 'local-b',
      url: '/videos/b.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    const view = mount(<VideoEmbed media={mediaA} />)
    const video = view.host.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1080 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 1920 })
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    const frameA = view.host.querySelector('[data-testid="video-embed-local"]') as HTMLElement
    expect(Number(frameA.getAttribute('data-aspect-ratio'))).toBeCloseTo(1080 / 1920, 5)

    view.rerender(<VideoEmbed media={mediaB} />)
    const frameB = view.host.querySelector('[data-testid="video-embed-local"]') as HTMLElement
    expect(Number(frameB.getAttribute('data-aspect-ratio'))).toBeCloseTo(16 / 9, 5)

    view.unmount()
  })

  it('keeps YouTube on the fixed 16:9 embed path', () => {
    const media = {
      id: 'yt-ratio',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    const view = mount(<VideoEmbed media={media} />)
    expect(view.host.querySelector('.video-embed--placeholder')).toBeTruthy()
    act(() => {
      ;(view.host.querySelector('.video-embed__load-btn') as HTMLButtonElement).click()
    })
    const frame = view.host.querySelector('[data-testid="video-embed-youtube"]') as HTMLElement
    expect(frame).toBeTruthy()
    expect(frame.className).toContain('video-embed')
    expect(frame.className).not.toContain('video-embed--local')
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(16 / 9, 5)
    expect(view.host.querySelector('iframe')).toBeTruthy()

    view.unmount()
  })

  it('reports local aspect ratio through onAspectRatioChange', () => {
    const media = {
      id: 'local-cb',
      url: '/videos/portrait.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    const seen: Array<number | null> = []
    const view = mount(
      <VideoEmbed
        media={media}
        onAspectRatioChange={(ratio) => {
          seen.push(ratio)
        }}
      />,
    )
    expect(seen.at(-1)).toBeCloseTo(16 / 9, 5)

    const video = view.host.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1080 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 1920 })
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    expect(seen.at(-1)).toBeCloseTo(1080 / 1920, 5)

    view.rerender(
      <VideoEmbed
        media={{
          id: 'local-cb-2',
          url: '/videos/other.mp4',
          kind: 'local',
          provider: 'local',
        }}
        onAspectRatioChange={(ratio) => {
          seen.push(ratio)
        }}
      />,
    )
    expect(seen.at(-1)).toBeCloseTo(16 / 9, 5)

    view.unmount()
  })

  it('YouTube Shorts uses 9:16 outer frame', () => {
    const media = {
      id: 'shorts-1',
      url: 'https://www.youtube.com/shorts/abcdefghijk',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    const view = mount(<VideoEmbed media={media} />)
    const frame = view.host.querySelector('[data-testid="video-embed-youtube-placeholder"]') as HTMLElement
    expect(Number(frame.getAttribute('data-aspect-ratio'))).toBeCloseTo(9 / 16, 5)
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(9 / 16, 5)
    act(() => {
      ;(view.host.querySelector('.video-embed__load-btn') as HTMLButtonElement).click()
    })
    const embed = view.host.querySelector('[data-testid="video-embed-youtube"]') as HTMLElement
    expect(Number(embed.getAttribute('data-aspect-ratio'))).toBeCloseTo(9 / 16, 5)
    expect(parseFloat(embed.style.aspectRatio)).toBeCloseTo(9 / 16, 5)
    view.unmount()
  })

  it('local metadata updates outer frame away from 16:9', () => {
    const media = {
      id: 'local-ipad',
      url: '/videos/ipad.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    const view = mount(<VideoEmbed media={media} />)
    const frame = view.host.querySelector('[data-testid="video-embed-local"]') as HTMLElement
    expect(Number(frame.getAttribute('data-aspect-ratio'))).toBeCloseTo(16 / 9, 5)
    const video = view.host.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 2360 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 1640 })
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    const updated = view.host.querySelector('[data-testid="video-embed-local"]') as HTMLElement
    expect(Number(updated.getAttribute('data-aspect-ratio'))).toBeCloseTo(2360 / 1640, 5)
    expect(parseFloat(updated.style.aspectRatio)).toBeCloseTo(2360 / 1640, 5)
    view.unmount()
  })

})

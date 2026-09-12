/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { VideoEmbed } from '../components/VideoEmbed'
import {
  isLocalVideoSupported,
  localVideoDisplayName,
  resolveLocalVideoPlaybackUrl,
} from './localVideo'
import { createLocalVideoMedia } from '../videoMedia'

describe('platform/localVideo browser behavior', () => {
  it('reports unsupported outside Tauri', () => {
    expect(isLocalVideoSupported()).toBe(false)
  })

  it('does not resolve playback URLs in the browser', () => {
    expect(resolveLocalVideoPlaybackUrl('/tmp/a.mp4')).toBeNull()
  })

  it('formats display names from paths', () => {
    expect(localVideoDisplayName('/home/u/Videos/clip.mp4')).toBe('clip.mp4')
    expect(localVideoDisplayName('D:\\Videos\\clip.mp4')).toBe('clip.mp4')
  })
})

describe('VideoEmbed local fallback', () => {
  it('shows desktop-only fallback without crashing', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const media = createLocalVideoMedia('/tmp/missing.mp4')!
    act(() => {
      root.render(<VideoEmbed media={media} />)
    })
    expect(host.querySelector('[data-testid="video-embed-local-unavailable"]')).toBeTruthy()
    expect(host.querySelector('video')).toBeNull()
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('keeps YouTube placeholder path', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <VideoEmbed
          media={{
            id: 'yt',
            url: 'https://youtu.be/dQw4w9WgXcQ',
            kind: 'youtube',
            provider: 'youtube',
          }}
        />,
      )
    })
    expect(host.textContent).toContain('YouTube 재생')
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})

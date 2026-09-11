import { describe, expect, it } from 'vitest'
import {
  classifyVideoUrl,
  collectNodeVideos,
  createLocalVideoMedia,
  createVideoMedia,
  extractYouTubeId,
  isLocalVideoMedia,
  isSafeHttpUrl,
  isValidLocalVideoPath,
  validateVideoMedia,
  canPinNodeVideos,
  isYouTubeShortsUrl,
  resolveVideoAspectRatio,
  DEFAULT_VIDEO_ASPECT,
  YOUTUBE_SHORTS_ASPECT,
} from './videoMedia'

describe('videoMedia', () => {
  it('extracts YouTube ids safely', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://example.com/video')).toBeNull()
  })

  it('classifies providers', () => {
    expect(classifyVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(classifyVideoUrl('https://example.com/tutorial')).toBe('external')
  })

  it('rejects data urls and invalid protocols', () => {
    expect(isSafeHttpUrl('data:text/plain,hello')).toBe(false)
    expect(isSafeHttpUrl('ftp://example.com')).toBe(false)
    expect(isSafeHttpUrl('https://example.com')).toBe(true)
  })

  it('creates media references without binary data', () => {
    const media = createVideoMedia('https://youtu.be/dQw4w9WgXcQ', { title: 'Demo' })
    expect(media?.kind).toBe('youtube')
    expect(media?.provider).toBe('youtube')
    expect(validateVideoMedia({ ...media!, url: 'data:video/mp4;base64,abc' })).toBeNull()
  })

  it('creates and validates local path references', () => {
    const media = createLocalVideoMedia('/home/user/Videos/clip.mp4')
    expect(media?.kind).toBe('local')
    expect(media?.provider).toBe('local')
    expect(media?.url).toBe('/home/user/Videos/clip.mp4')
    expect(media?.title).toBe('clip.mp4')
    expect(isLocalVideoMedia(media!)).toBe(true)
    expect(validateVideoMedia(media)).toEqual(media)
    expect(createLocalVideoMedia('')).toBeNull()
    expect(createLocalVideoMedia('   ')).toBeNull()
  })

  it('rejects disguised schemes as local paths', () => {
    expect(isValidLocalVideoPath('data:video/mp4;base64,aaa')).toBe(false)
    expect(isValidLocalVideoPath('javascript:alert(1)')).toBe(false)
    expect(isValidLocalVideoPath('http://example.com/a.mp4')).toBe(false)
    expect(isValidLocalVideoPath('https://example.com/a.mp4')).toBe(false)
    expect(
      validateVideoMedia({
        id: 'x',
        url: 'https://example.com/a.mp4',
        kind: 'local',
        provider: 'local',
      }),
    ).toBeNull()
    expect(
      validateVideoMedia({
        id: 'x',
        url: 'data:video/mp4;base64,abc',
        kind: 'local',
        provider: 'local',
      }),
    ).toBeNull()
  })

  it('keeps remote validate path for unmarked http media', () => {
    const media = validateVideoMedia({
      id: 'r1',
      url: 'https://example.com/x.mp4',
    })
    expect(media?.kind).toBe('external')
    expect(media?.provider).toBe('link')
  })

  it('collects stage-log videos without duplicates', () => {
    const media = collectNodeVideos({
      stages: [
        {
          logs: [
            {
              media: [
                { id: 'a', url: 'https://youtu.be/aaaaaaaaaaa', kind: 'youtube', provider: 'youtube' },
                { id: 'b', url: 'https://example.com/x', kind: 'external', provider: 'link' },
              ],
            },
            {
              media: [
                { id: 'a', url: 'https://youtu.be/aaaaaaaaaaa', kind: 'youtube', provider: 'youtube' },
              ],
            },
          ],
        },
      ],
    })
    expect(media.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('canPinNodeVideos', () => {
  it('allows Notable only (Mastery is contentless)', () => {
    expect(canPinNodeVideos('notable')).toBe(true)
    expect(canPinNodeVideos('mastery')).toBe(false)
    expect(canPinNodeVideos('voidMastery')).toBe(false)
    expect(canPinNodeVideos('shard')).toBe(false)
    expect(canPinNodeVideos('connect')).toBe(false)
  })
})


describe('resolveVideoAspectRatio', () => {
  it('uses 16:9 for standard YouTube and unknown local metadata', () => {
    const yt = {
      id: 'yt1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    expect(resolveVideoAspectRatio(yt)).toBe(DEFAULT_VIDEO_ASPECT)
    const local = {
      id: 'loc1',
      url: '/videos/a.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    expect(resolveVideoAspectRatio(local, null)).toBe(DEFAULT_VIDEO_ASPECT)
  })

  it('uses 9:16 for YouTube Shorts URLs', () => {
    const shorts = {
      id: 's1',
      url: 'https://www.youtube.com/shorts/abcdefghijk',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    expect(isYouTubeShortsUrl(shorts.url)).toBe(true)
    expect(resolveVideoAspectRatio(shorts)).toBe(YOUTUBE_SHORTS_ASPECT)
  })

  it('uses measured local intrinsic ratio when provided', () => {
    const local = {
      id: 'loc2',
      url: '/videos/ipad.mp4',
      kind: 'local' as const,
      provider: 'local' as const,
    }
    expect(resolveVideoAspectRatio(local, 2360 / 1640)).toBeCloseTo(2360 / 1640)
  })
})

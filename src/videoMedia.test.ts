import { describe, expect, it } from 'vitest'
import {
  classifyVideoUrl,
  collectNodeVideos,
  createVideoMedia,
  extractYouTubeId,
  isSafeHttpUrl,
  validateVideoMedia,
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

  it('collects node and stage-log videos without duplicates', () => {
    const media = collectNodeVideos({
      media: [{ id: 'a', url: 'https://youtu.be/aaaaaaaaaaa', kind: 'youtube', provider: 'youtube' }],
      stages: [
        {
          logs: [
            {
              media: [
                { id: 'a', url: 'https://youtu.be/aaaaaaaaaaa', kind: 'youtube', provider: 'youtube' },
                { id: 'b', url: 'https://example.com/x', kind: 'external', provider: 'link' },
              ],
            },
          ],
        },
      ],
    })
    expect(media.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

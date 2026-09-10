import { describe, expect, it } from 'vitest'
import { resolveDailyLogMediaEdit } from './components/DailyLogPanel'
import { createDailyLog } from './dailyLog'
import type { VideoMedia } from './types'

function media(
  id: string,
  url: string,
  extras: Partial<Pick<VideoMedia, 'title' | 'note'>> = {},
): VideoMedia {
  return {
    id,
    url,
    provider: 'youtube',
    kind: 'youtube',
    ...extras,
  }
}

describe('Daily Log multiple media preservation on edit', () => {
  const three: VideoMedia[] = [
    media('m0', 'https://youtu.be/aaaaaaaaaaa', { title: 'first', note: 'legacy caption' }),
    media('m1', 'https://youtu.be/bbbbbbbbbbb', { title: 'second' }),
    media('m2', 'https://example.com/third.mp4', { title: 'third', note: 'keep me' }),
  ]

  it('keeps all three media when only memo/date change (URL unchanged)', () => {
    const next = resolveDailyLogMediaEdit(three, three[0]!.url)
    expect(next).toHaveLength(3)
    expect(next?.[0]?.id).toBe('m0')
    expect(next?.[0]?.note).toBe('legacy caption')
    expect(next?.[1]?.id).toBe('m1')
    expect(next?.[2]?.id).toBe('m2')
    expect(next?.[2]?.note).toBe('keep me')
  })

  it('replaces only media[0] when first URL changes and keeps the rest', () => {
    const next = resolveDailyLogMediaEdit(three, 'https://youtu.be/ccccccccccc')
    expect(next).toHaveLength(3)
    expect(next?.[0]?.url).toBe('https://youtu.be/ccccccccccc')
    expect(next?.[0]?.id).not.toBe('m0')
    expect(next?.[0]?.note).toBeUndefined()
    expect(next?.[1]).toEqual(three[1])
    expect(next?.[2]).toEqual(three[2])
  })

  it('removes only media[0] when first URL is cleared', () => {
    const next = resolveDailyLogMediaEdit(three, '')
    expect(next).toHaveLength(2)
    expect(next?.[0]?.id).toBe('m1')
    expect(next?.[1]?.id).toBe('m2')
  })

  it('preserves legacy media.note when URL is unchanged through createDailyLog edit path', () => {
    const log = createDailyLog('2026-09-06', 'memo', three)
    const mediaNext = resolveDailyLogMediaEdit(log.media, videoUrl(log))
    const saved = createDailyLog('2026-09-07', 'memo edited', mediaNext ?? undefined)
    saved.id = log.id
    expect(saved.media).toHaveLength(3)
    expect(saved.media?.[0]?.note).toBe('legacy caption')
    expect(saved.media?.[0]?.id).toBe('m0')
    expect(saved.date).toBe('2026-09-07')
    expect(saved.note).toBe('memo edited')
  })
})

function videoUrl(log: { media?: VideoMedia[] }) {
  return log.media?.[0]?.url ?? ''
}

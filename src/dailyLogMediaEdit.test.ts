import { describe, expect, it } from 'vitest'
import {
  mediaFromDraft,
  resolveDailyLogMediaEdit,
} from './components/DailyLogPanel'
import { createDailyLog } from './dailyLog'
import type { VideoMedia } from './types'
import { createLocalVideoMedia } from './videoMedia'

function media(
  id: string,
  url: string,
  extras: Partial<Pick<VideoMedia, 'title' | 'note' | 'kind' | 'provider'>> = {},
): VideoMedia {
  return {
    id,
    url,
    provider: extras.provider ?? 'youtube',
    kind: extras.kind ?? 'youtube',
    title: extras.title,
    note: extras.note,
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

describe('Daily Log local video media edit', () => {
  const localPath = '/home/user/Videos/practice.mp4'
  const otherLocal = 'D:\\Videos\\other.mp4'
  const withRest: VideoMedia[] = [
    createLocalVideoMedia(localPath, { id: 'loc0', title: 'practice.mp4' })!,
    media('m1', 'https://youtu.be/bbbbbbbbbbb', { title: 'second' }),
  ]

  it('adds local video as media[0]', () => {
    const created = mediaFromDraft({ videoUrl: '', localVideoPath: localPath })
    expect(created).toHaveLength(1)
    expect(created?.[0]?.kind).toBe('local')
    expect(created?.[0]?.provider).toBe('local')
    expect(created?.[0]?.url).toBe(localPath)
  })

  it('edits local → local and keeps media[1+]', () => {
    const next = resolveDailyLogMediaEdit(withRest, '', otherLocal)
    expect(next).toHaveLength(2)
    expect(next?.[0]?.kind).toBe('local')
    expect(next?.[0]?.url).toBe(otherLocal)
    expect(next?.[0]?.id).not.toBe('loc0')
    expect(next?.[1]).toEqual(withRest[1])
  })

  it('edits local → URL and keeps media[1+]', () => {
    const next = resolveDailyLogMediaEdit(withRest, 'https://youtu.be/ccccccccccc', '')
    expect(next).toHaveLength(2)
    expect(next?.[0]?.kind).toBe('youtube')
    expect(next?.[0]?.url).toBe('https://youtu.be/ccccccccccc')
    expect(next?.[1]).toEqual(withRest[1])
  })

  it('edits URL → local and keeps media[1+]', () => {
    const remoteFirst: VideoMedia[] = [
      media('m0', 'https://youtu.be/aaaaaaaaaaa'),
      media('m1', 'https://example.com/x'),
    ]
    const next = resolveDailyLogMediaEdit(remoteFirst, '', localPath)
    expect(next).toHaveLength(2)
    expect(next?.[0]?.kind).toBe('local')
    expect(next?.[0]?.url).toBe(localPath)
    expect(next?.[1]).toEqual(remoteFirst[1])
  })

  it('keeps same local path identity when unchanged', () => {
    const next = resolveDailyLogMediaEdit(withRest, '', localPath)
    expect(next?.[0]?.id).toBe('loc0')
    expect(next?.[1]).toEqual(withRest[1])
  })
})

function videoUrl(log: { media?: VideoMedia[] }) {
  return log.media?.[0]?.url ?? ''
}

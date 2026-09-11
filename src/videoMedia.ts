import type { VideoMedia } from './types'
import { createMediaId } from './ids'

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.*&v=)([\w-]{11})/i,
  /youtu\.be\/([\w-]{11})/i,
  /youtube\.com\/embed\/([\w-]{11})/i,
  /youtube\.com\/shorts\/([\w-]{11})/i,
]

export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim()
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export function classifyVideoUrl(url: string): 'youtube' | 'external' {
  return extractYouTubeId(url) ? 'youtube' : 'external'
}

export function createVideoMediaId() {
  return createMediaId()
}

export function createVideoMedia(
  url: string,
  extras: Partial<Pick<VideoMedia, 'id' | 'title' | 'note'>> = {},
): VideoMedia | null {
  const trimmed = url.trim()
  if (!trimmed || !isSafeHttpUrl(trimmed)) return null
  const kind = classifyVideoUrl(trimmed)
  return {
    id: extras.id ?? createVideoMediaId(),
    url: trimmed,
    title: extras.title?.trim() || undefined,
    note: extras.note?.trim() || undefined,
    provider: kind === 'youtube' ? 'youtube' : 'link',
    kind,
  }
}

/** Local file path reference — never copies or embeds video bytes. */
export function createLocalVideoMedia(
  path: string,
  extras: Partial<Pick<VideoMedia, 'id' | 'title' | 'note'>> = {},
): VideoMedia | null {
  const trimmed = path.trim()
  if (!isValidLocalVideoPath(trimmed)) return null
  const nameFromPath = trimmed.split(/[/\\]/).pop()?.trim()
  return {
    id: extras.id ?? createVideoMediaId(),
    url: trimmed,
    title: extras.title?.trim() || nameFromPath || undefined,
    note: extras.note?.trim() || undefined,
    provider: 'local',
    kind: 'local',
  }
}

export function isLocalVideoMedia(media: Pick<VideoMedia, 'kind' | 'provider'>): boolean {
  return media.kind === 'local' || media.provider === 'local'
}

/**
 * Absolute path sanity check only — not a filesystem permission grant.
 * Rejects URL schemes that must never be treated as local references.
 */
export function isValidLocalVideoPath(path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed) return false
  if (/^(data:|javascript:|blob:|http:|https:|vbscript:)/i.test(trimmed)) return false
  // Reject pure scheme-like tokens without a path body.
  if (/^[a-z][a-z0-9+.-]*:$/i.test(trimmed)) return false
  return true
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (/^data:/i.test(url)) return false
    return true
  } catch {
    return false
  }
}

export function validateVideoMedia(value: unknown): VideoMedia | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<VideoMedia>
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (typeof raw.url !== 'string' || !raw.url.trim()) return null
  if (/^data:/i.test(raw.url)) return null

  const markedLocal = raw.kind === 'local' || raw.provider === 'local'
  if (markedLocal) {
    const path = raw.url.trim()
    if (!isValidLocalVideoPath(path)) return null
    const nameFromPath = path.split(/[/\\]/).pop()?.trim()
    return {
      id: raw.id.trim(),
      url: path,
      title:
        typeof raw.title === 'string' && raw.title.trim()
          ? raw.title.trim()
          : nameFromPath || undefined,
      note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : undefined,
      provider: 'local',
      kind: 'local',
    }
  }

  if (!isSafeHttpUrl(raw.url.trim())) return null
  const kind = classifyVideoUrl(raw.url)
  return {
    id: raw.id.trim(),
    url: raw.url.trim(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : undefined,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : undefined,
    provider: kind === 'youtube' ? 'youtube' : 'link',
    kind,
  }
}

export function validateVideoMediaList(value: unknown): VideoMedia[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const list: VideoMedia[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const media = validateVideoMedia(item)
    if (!media) return null
    if (seen.has(media.id)) return null
    seen.add(media.id)
    list.push(media)
  }
  return list
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0`
}

/** All videos on a node from daily logs (deduped by id). */
export function collectNodeVideos(data: {
  stages?: { logs?: { media?: VideoMedia[] }[] }[]
}): VideoMedia[] {
  const seen = new Set<string>()
  const list: VideoMedia[] = []
  const push = (items?: VideoMedia[]) => {
    for (const item of items ?? []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      list.push(item)
    }
  }
  for (const stage of data.stages ?? []) {
    for (const log of stage.logs ?? []) {
      push(log.media)
    }
  }
  return list
}

/** Video pin is Notable-only. Mastery no longer exposes content/pin UI. */
export function canPinNodeVideos(kind: string): boolean {
  return kind === 'notable'
}

/** Landscape fallback before local metadata / for standard YouTube. */
export const DEFAULT_VIDEO_ASPECT = 16 / 9
/** YouTube Shorts URL path → portrait frame. */
export const YOUTUBE_SHORTS_ASPECT = 9 / 16

/** True when the URL is a YouTube Shorts path (not inferred from id alone). */
export function isYouTubeShortsUrl(url: string): boolean {
  return /youtube\.com\/shorts\//i.test(url.trim())
}

/**
 * Width/height ratio for the embed outer frame.
 * Local uses measured metadata when provided; otherwise 16:9 fallback.
 * Shorts URLs use 9:16; other YouTube uses 16:9.
 */
export function resolveVideoAspectRatio(
  media: Pick<VideoMedia, 'url' | 'kind' | 'provider'>,
  localAspect: number | null = null,
): number {
  if (isLocalVideoMedia(media)) {
    if (localAspect != null && localAspect > 0) return localAspect
    return DEFAULT_VIDEO_ASPECT
  }
  if (extractYouTubeId(media.url)) {
    return isYouTubeShortsUrl(media.url) ? YOUTUBE_SHORTS_ASPECT : DEFAULT_VIDEO_ASPECT
  }
  return DEFAULT_VIDEO_ASPECT
}


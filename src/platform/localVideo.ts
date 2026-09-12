/**
 * Native local-video boundary.
 * Only this module may import @tauri-apps/* for Local Video Reference.
 * Safe to import from the browser target (no throw on module load).
 */
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'

const FORBIDDEN_AS_LOCAL = /^(data:|javascript:|blob:|http:|https:|vbscript:)/i

/** True when running inside a Tauri WebView. */
export function isLocalVideoSupported(): boolean {
  try {
    return isTauri()
  } catch {
    return false
  }
}

/** Basename for UI hints (path reference only — never copies bytes). */
export function localVideoDisplayName(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/[/\\]/)
  return parts[parts.length - 1] || trimmed
}

/**
 * Native file dialog → absolute local path, or null if cancelled / unsupported.
 * Does not copy the file into the app.
 */
export async function pickLocalVideo(): Promise<string | null> {
  if (!isLocalVideoSupported()) return null
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      multiple: false,
      directory: false,
      title: '로컬 동영상 선택',
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'webm', 'm4v', 'mov'],
        },
      ],
    })
    if (typeof selected !== 'string') return null
    const path = selected.trim()
    if (!path || FORBIDDEN_AS_LOCAL.test(path)) return null
    return path
  } catch {
    return null
  }
}

/**
 * Convert absolute path to a WebView-playable asset URL.
 * Browser / unsupported → null (caller shows fallback).
 */
export function resolveLocalVideoPlaybackUrl(path: string): string | null {
  const trimmed = path.trim()
  if (!trimmed || FORBIDDEN_AS_LOCAL.test(trimmed)) return null
  if (!isLocalVideoSupported()) return null
  try {
    return convertFileSrc(trimmed)
  } catch {
    return null
  }
}

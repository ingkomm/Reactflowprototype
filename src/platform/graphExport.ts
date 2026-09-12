/**
 * Desktop GraphDocument JSON file boundary.
 * Only this module may import @tauri-apps/* for JSON save/open.
 * Safe to import from the browser target (no throw on module load).
 * Does not parse or validate GraphDocument — caller supplies/consumes text.
 */
import { isTauri } from '@tauri-apps/api/core'

export type DesktopGraphSaveResult =
  | { status: 'saved'; path: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export type DesktopGraphOpenResult =
  | { status: 'opened'; path: string; text: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/** @deprecated Prefer DesktopGraphSaveResult; kept for older call sites. */
export type DesktopGraphExportResult =
  | { status: 'saved' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/** True when running inside a Tauri WebView. */
export function isDesktopGraphExportSupported(): boolean {
  try {
    return isTauri()
  } catch {
    return false
  }
}

/**
 * Native Save Dialog → write UTF-8 JSON text → return chosen path.
 * Cancel → cancelled; write/dialog failure → error (no throw).
 */
export async function saveGraphJsonAsDesktop(
  jsonText: string,
  defaultFilename = 'skill-tree.json',
): Promise<DesktopGraphSaveResult> {
  if (!isDesktopGraphExportSupported()) {
    return {
      status: 'error',
      message: 'Desktop JSON 저장은 Desktop 앱에서만 사용할 수 있습니다.',
    }
  }
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({
      defaultPath: defaultFilename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!path) return { status: 'cancelled' }
    await writeTextFile(path, jsonText)
    return { status: 'saved', path }
  } catch {
    return { status: 'error', message: 'JSON 저장에 실패했습니다.' }
  }
}

/**
 * Write UTF-8 JSON to an existing absolute path (no dialog).
 * Failure does not clear caller Active JSON identity.
 */
export async function saveGraphJsonToPathDesktop(
  path: string,
  jsonText: string,
): Promise<DesktopGraphSaveResult> {
  if (!isDesktopGraphExportSupported()) {
    return {
      status: 'error',
      message: 'Desktop JSON 저장은 Desktop 앱에서만 사용할 수 있습니다.',
    }
  }
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, jsonText)
    return { status: 'saved', path }
  } catch {
    return { status: 'error', message: 'JSON 저장에 실패했습니다.' }
  }
}

/**
 * Native Open Dialog → read UTF-8 text. No JSON parse/validate here.
 */
export async function openGraphJsonDesktop(): Promise<DesktopGraphOpenResult> {
  if (!isDesktopGraphExportSupported()) {
    return {
      status: 'error',
      message: 'Desktop JSON 불러오기는 Desktop 앱에서만 사용할 수 있습니다.',
    }
  }
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (typeof selected !== 'string' || !selected) return { status: 'cancelled' }
    const text = await readTextFile(selected)
    return { status: 'opened', path: selected, text }
  } catch {
    return { status: 'error', message: 'JSON 파일을 열 수 없습니다.' }
  }
}

/**
 * Legacy Save Dialog export (no path returned). Prefer saveGraphJsonAsDesktop.
 */
export async function saveGraphJsonDesktop(
  jsonText: string,
  defaultFilename = 'skill-tree.json',
): Promise<DesktopGraphExportResult> {
  const result = await saveGraphJsonAsDesktop(jsonText, defaultFilename)
  if (result.status === 'saved') return { status: 'saved' }
  return result
}

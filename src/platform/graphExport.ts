/**
 * Desktop GraphDocument JSON export boundary.
 * Only this module may import @tauri-apps/* for JSON save.
 * Safe to import from the browser target (no throw on module load).
 */
import { isTauri } from '@tauri-apps/api/core'

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
 * Native Save Dialog → write UTF-8 JSON text to the chosen path.
 * Does not alter GraphDocument serialization — caller supplies the JSON string.
 * Cancel → cancelled; write/dialog failure → error (no throw).
 */
export async function saveGraphJsonDesktop(
  jsonText: string,
  defaultFilename = 'skill-tree.json',
): Promise<DesktopGraphExportResult> {
  if (!isDesktopGraphExportSupported()) {
    return {
      status: 'error',
      message: 'Desktop JSON 내보내기는 Desktop 앱에서만 사용할 수 있습니다.',
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
    return { status: 'saved' }
  } catch {
    return { status: 'error', message: 'JSON 내보내기에 실패했습니다.' }
  }
}

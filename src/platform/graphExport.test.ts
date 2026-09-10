/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  isDesktopGraphExportSupported,
  saveGraphJsonDesktop,
} from './graphExport'

describe('platform/graphExport browser behavior', () => {
  it('reports unsupported outside Tauri', () => {
    expect(isDesktopGraphExportSupported()).toBe(false)
  })

  it('saveGraphJsonDesktop does not throw and returns error when unsupported', async () => {
    const result = await saveGraphJsonDesktop('{"schemaVersion":"0.1"}', 'skill-tree.json')
    expect(result).toEqual({
      status: 'error',
      message: 'Desktop JSON 내보내기는 Desktop 앱에서만 사용할 수 있습니다.',
    })
  })
})

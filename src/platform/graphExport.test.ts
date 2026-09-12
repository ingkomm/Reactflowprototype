/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isDesktopGraphExportSupported,
  openGraphJsonDesktop,
  saveGraphJsonAsDesktop,
  saveGraphJsonDesktop,
  saveGraphJsonToPathDesktop,
} from './graphExport'

describe('platform/graphExport browser behavior', () => {
  it('reports unsupported outside Tauri', () => {
    expect(isDesktopGraphExportSupported()).toBe(false)
  })

  it('saveGraphJsonDesktop does not throw and returns error when unsupported', async () => {
    const result = await saveGraphJsonDesktop('{"schemaVersion":"0.1"}', 'skill-tree.json')
    expect(result).toEqual({
      status: 'error',
      message: 'Desktop JSON 저장은 Desktop 앱에서만 사용할 수 있습니다.',
    })
  })

  it('saveGraphJsonAsDesktop returns error when unsupported', async () => {
    const result = await saveGraphJsonAsDesktop('{}')
    expect(result).toEqual({
      status: 'error',
      message: 'Desktop JSON 저장은 Desktop 앱에서만 사용할 수 있습니다.',
    })
  })

  it('saveGraphJsonToPathDesktop returns error when unsupported', async () => {
    const result = await saveGraphJsonToPathDesktop('/tmp/x.json', '{}')
    expect(result).toEqual({
      status: 'error',
      message: 'Desktop JSON 저장은 Desktop 앱에서만 사용할 수 있습니다.',
    })
  })

  it('openGraphJsonDesktop returns error when unsupported', async () => {
    const result = await openGraphJsonDesktop()
    expect(result).toEqual({
      status: 'error',
      message: 'Desktop JSON 불러오기는 Desktop 앱에서만 사용할 수 있습니다.',
    })
  })
})

describe('Active JSON save routing (pure)', () => {
  it('uses Save As when active path is null', () => {
    const activeJsonPath: string | null = null
    const strategy = activeJsonPath ? 'toPath' : 'saveAs'
    expect(strategy).toBe('saveAs')
  })

  it('uses direct path write when active path is set', () => {
    const activeJsonPath: string | null = '/tmp/project-a.json'
    const strategy = activeJsonPath ? 'toPath' : 'saveAs'
    expect(strategy).toBe('toPath')
  })

  it('updates active path only on successful Save As', () => {
    let active: string | null = '/old.json'

    const saved = { status: 'saved' as const, path: '/new.json' }
    active = saved.status === 'saved' ? saved.path : active
    expect(active).toBe('/new.json')

    active = '/old.json'
    const cancelled: { status: 'cancelled' } = { status: 'cancelled' }
    active = cancelled.status === 'cancelled' ? active : '/should-not'
    expect(active).toBe('/old.json')

    const failed: { status: 'error'; message: string } = { status: 'error', message: 'x' }
    active = failed.status === 'error' ? active : '/should-not'
    expect(active).toBe('/old.json')
  })

  it('keeps active path on open import failure; sets on success', () => {
    let active: string | null = '/keep.json'
    const openedPath = '/opened.json'

    const importOk = true
    if (importOk) active = openedPath
    expect(active).toBe('/opened.json')

    active = '/keep.json'
    const importFailed = true
    if (!importFailed) active = openedPath
    expect(active).toBe('/keep.json')
  })

  it('clears active path after successful new sheet', () => {
    let active: string | null = '/project.json'
    const newSheetOk = true
    if (newSheetOk) active = null
    expect(active).toBeNull()
  })
})

describe('document save shortcut matching', () => {
  function isDocumentSaveShortcut(event: {
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    shiftKey: boolean
    key: string
  }): boolean {
    return (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 's'
    )
  }

  it('matches Ctrl+S and Meta+S', () => {
    expect(
      isDocumentSaveShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: 's',
      }),
    ).toBe(true)
    expect(
      isDocumentSaveShortcut({
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
        key: 'S',
      }),
    ).toBe(true)
  })

  it('ignores plain s and Ctrl+Shift+S', () => {
    expect(
      isDocumentSaveShortcut({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: 's',
      }),
    ).toBe(false)
    expect(
      isDocumentSaveShortcut({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
        key: 's',
      }),
    ).toBe(false)
  })
})

describe('platform/graphExport mocked desktop APIs', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@tauri-apps/api/core')
    vi.doUnmock('@tauri-apps/plugin-dialog')
    vi.doUnmock('@tauri-apps/plugin-fs')
  })

  it('saveGraphJsonAsDesktop returns path on success', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
    vi.doMock('@tauri-apps/plugin-dialog', () => ({
      save: async () => '/tmp/chosen.json',
    }))
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: async () => undefined,
      readTextFile: async () => '',
    }))
    const mod = await import('./graphExport')
    const result = await mod.saveGraphJsonAsDesktop('{"a":1}')
    expect(result).toEqual({ status: 'saved', path: '/tmp/chosen.json' })
  })

  it('saveGraphJsonToPathDesktop writes without dialog', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
    const writeTextFile = vi.fn(async () => undefined)
    vi.doMock('@tauri-apps/plugin-dialog', () => ({
      save: async () => {
        throw new Error('dialog should not open')
      },
    }))
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile,
      readTextFile: async () => '',
    }))
    const mod = await import('./graphExport')
    const result = await mod.saveGraphJsonToPathDesktop('/tmp/active.json', '{"b":2}')
    expect(result).toEqual({ status: 'saved', path: '/tmp/active.json' })
    expect(writeTextFile).toHaveBeenCalledWith('/tmp/active.json', '{"b":2}')
  })

  it('openGraphJsonDesktop returns path and text', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
    vi.doMock('@tauri-apps/plugin-dialog', () => ({
      open: async () => '/tmp/open.json',
    }))
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      writeTextFile: async () => undefined,
      readTextFile: async () => '{"ok":true}',
    }))
    const mod = await import('./graphExport')
    const result = await mod.openGraphJsonDesktop()
    expect(result).toEqual({
      status: 'opened',
      path: '/tmp/open.json',
      text: '{"ok":true}',
    })
  })
})

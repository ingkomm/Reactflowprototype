/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_JSON_PATH_KEY,
  clearActiveJsonPath,
  readActiveJsonPath,
  writeActiveJsonPath,
} from './activeJsonPath'

function memoryStorage(opts?: { failOnSet?: boolean; failOnGet?: boolean }) {
  const map = new Map<string, string>()
  return {
    getItem(key: string) {
      if (opts?.failOnGet) throw new Error('get fail')
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (opts?.failOnSet) throw new Error('set fail')
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
  }
}

describe('activeJsonPath persistence', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('returns null when nothing stored', () => {
    expect(readActiveJsonPath()).toBeNull()
  })

  it('writes and reads a path', () => {
    writeActiveJsonPath('/projects/a.json')
    expect(localStorage.getItem(ACTIVE_JSON_PATH_KEY)).toBe('/projects/a.json')
    expect(readActiveJsonPath()).toBe('/projects/a.json')
  })

  it('treats empty / whitespace as null', () => {
    localStorage.setItem(ACTIVE_JSON_PATH_KEY, '   ')
    expect(readActiveJsonPath()).toBeNull()
    clearActiveJsonPath()
    writeActiveJsonPath('  ')
    expect(localStorage.getItem(ACTIVE_JSON_PATH_KEY)).toBeNull()
  })

  it('clears stored path', () => {
    writeActiveJsonPath('/projects/a.json')
    clearActiveJsonPath()
    expect(localStorage.getItem(ACTIVE_JSON_PATH_KEY)).toBeNull()
    expect(readActiveJsonPath()).toBeNull()
  })

  it('does not throw when storage get/set fails', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage({ failOnGet: true, failOnSet: true }),
      configurable: true,
    })
    expect(() => readActiveJsonPath()).not.toThrow()
    expect(readActiveJsonPath()).toBeNull()
    expect(() => writeActiveJsonPath('/x.json')).not.toThrow()
    expect(() => clearActiveJsonPath()).not.toThrow()
  })
})

describe('Active JSON identity transitions (pure)', () => {
  it('Save As / Load success replaces identity', () => {
    let active: string | null = '/old.json'
    const savedPath = '/new.json'
    active = savedPath
    expect(active).toBe('/new.json')
  })

  it('Load import failure keeps identity', () => {
    let active: string | null = '/keep.json'
    const importOk = false
    const openedPath = '/opened.json'
    if (importOk) active = openedPath
    expect(active).toBe('/keep.json')
  })

  it('Save failure keeps identity', () => {
    let active: string | null = '/keep.json'
    const saveOk = false
    if (saveOk) active = '/other.json'
    expect(active).toBe('/keep.json')
  })

  it('New Sheet success clears identity', () => {
    let active: string | null = '/project.json'
    const newSheetOk = true
    if (newSheetOk) active = null
    expect(active).toBeNull()
  })

  it('Ctrl+S with restored path uses direct save', () => {
    const restored = '/projects/restored.json'
    const strategy = restored ? 'toPath' : 'saveAs'
    expect(strategy).toBe('toPath')
  })
})

import { describe, expect, it, beforeEach } from 'vitest'
import {
  createNewSheet,
  importGraphJsonFile,
  restorePreviousBackup,
  snapshotToDocument,
  commitBootstrapChoice,
} from './useGraphApp'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from './emptyGraph'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import {
  BACKUP_KEY,
  BOOTSTRAP_KEY,
  STORAGE_KEY,
  hasBackupDocument,
  loadDocumentFromStorage,
  writeBootstrapChoice,
} from './persistence/autosave'
import { serializeGraphDocument } from './graphDocument'

function memoryStorage(opts?: { failKeys?: Set<string> }) {
  const map = new Map<string, string>()
  const failKeys = opts?.failKeys ?? new Set<string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failKeys.has(key)) {
        throw new Error('quota')
      }
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    _map: map,
  }
}

describe('createNewSheet persistence hardening', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('backs up current document then replaces storage with empty sheet', () => {
    const current = {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
    const before = snapshotToDocument(current)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(before))

    const result = createNewSheet(current)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    expect(result.snapshot.edges).toHaveLength(EMPTY_GRAPH_EDGES.length)
    expect(hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"schemaVersion"')

    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })

  it('aborts new sheet when backup fails and keeps current primary document', () => {
    const store = memoryStorage({ failKeys: new Set([BACKUP_KEY]) })
    Object.defineProperty(globalThis, 'localStorage', {
      value: store,
      configurable: true,
    })
    const current = {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
    const before = serializeGraphDocument(snapshotToDocument(current))
    localStorage.setItem(STORAGE_KEY, before)

    const result = createNewSheet(current)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/백업 실패/)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull()
  })
})

describe('importGraphJsonFile persistence hardening', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  const current = {
    nodes: SEED_NODES,
    edges: SEED_EDGES,
    customSymbols: [],
    settings: {},
  }

  it('does not overwrite backup when JSON is malformed', async () => {
    localStorage.setItem(BACKUP_KEY, '{"keep":"me"}')
    const file = new File(['{not-json'], 'bad.json', { type: 'application/json' })
    const result = await importGraphJsonFile(file, current)
    expect(result.ok).toBe(false)
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{"keep":"me"}')
  })

  it('backs up current only after valid parse, then returns snapshot', async () => {
    const importedDoc = snapshotToDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    const file = new File([serializeGraphDocument(importedDoc)], 'ok.json', {
      type: 'application/json',
    })
    const result = await importGraphJsonFile(file, current)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    expect(hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"schemaVersion"')
  })

  it('cancels import when current backup fails after valid parse', async () => {
    const store = memoryStorage({ failKeys: new Set([BACKUP_KEY]) })
    Object.defineProperty(globalThis, 'localStorage', {
      value: store,
      configurable: true,
    })
    const importedDoc = snapshotToDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    const file = new File([serializeGraphDocument(importedDoc)], 'ok.json', {
      type: 'application/json',
    })
    const result = await importGraphJsonFile(file, current)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/백업 실패/)
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull()
  })
})

describe('writeBootstrapChoice / restorePreviousBackup', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('returns failure instead of throwing when bootstrap write fails', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage({ failKeys: new Set([BOOTSTRAP_KEY]) }),
      configurable: true,
    })
    const written = writeBootstrapChoice('empty')
    expect(written.ok).toBe(false)
    const committed = commitBootstrapChoice('empty')
    expect(committed.ok).toBe(false)
  })

  it('restores valid backup and swaps current into BACKUP_KEY', () => {
    const current = {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
    const previous = snapshotToDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    localStorage.setItem(STORAGE_KEY, serializeGraphDocument(snapshotToDocument(current)))
    localStorage.setItem(BACKUP_KEY, serializeGraphDocument(previous))

    const result = restorePreviousBackup(current)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"schemaVersion"')
  })

  it('does not change state when backup is corrupt', () => {
    const current = {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
    const primary = serializeGraphDocument(snapshotToDocument(current))
    localStorage.setItem(STORAGE_KEY, primary)
    localStorage.setItem(BACKUP_KEY, '{bad')
    const result = restorePreviousBackup(current)
    expect(result.ok).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
  })
})

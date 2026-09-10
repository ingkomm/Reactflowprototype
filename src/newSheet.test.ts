import { describe, expect, it, beforeEach } from 'vitest'
import {
  createNewSheet,
  importGraphJsonFile,
  snapshotToDocument,
  commitBootstrapChoice,
  resolveInitialGraphState,
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

  it('does not change BACKUP or PRIMARY when JSON is malformed', async () => {
    const primary = serializeGraphDocument(snapshotToDocument(current))
    localStorage.setItem(STORAGE_KEY, primary)
    localStorage.setItem(BACKUP_KEY, '{"keep":"me"}')
    const file = new File(['{not-json'], 'bad.json', { type: 'application/json' })
    const result = await importGraphJsonFile(file, current)
    expect(result.ok).toBe(false)
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{"keep":"me"}')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
  })

  it('backs up current then immediately saves imported document to PRIMARY', async () => {
    const currentSerialized = serializeGraphDocument(snapshotToDocument(current))
    localStorage.setItem(STORAGE_KEY, currentSerialized)

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

    // Success does not wait for autosave — PRIMARY is already imported.
    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)

    expect(hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"schemaVersion"')
    // BACKUP holds pre-import current (seed graph), not empty imported sheet.
    expect(localStorage.getItem(BACKUP_KEY)).toContain(SEED_NODES[0]!.id)
  })

  it('cancels import when current backup fails after valid parse', async () => {
    const store = memoryStorage({ failKeys: new Set([BACKUP_KEY]) })
    Object.defineProperty(globalThis, 'localStorage', {
      value: store,
      configurable: true,
    })
    const primary = serializeGraphDocument(snapshotToDocument(current))
    localStorage.setItem(STORAGE_KEY, primary)

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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
  })

  it('cancels import when PRIMARY save fails after backup; keeps existing PRIMARY', async () => {
    const store = memoryStorage({ failKeys: new Set([STORAGE_KEY]) })
    Object.defineProperty(globalThis, 'localStorage', {
      value: store,
      configurable: true,
    })
    // Pre-seed PRIMARY before enabling fail-on-set for STORAGE_KEY by writing via map.
    const primary = serializeGraphDocument(snapshotToDocument(current))
    store._map.set(STORAGE_KEY, primary)

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
    expect(result.message).toMatch(/가져온 문서 저장 실패/)
    // Existing PRIMARY untouched (setItem failed without clearing).
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
    // BACKUP still has current document from successful backup step.
    expect(localStorage.getItem(BACKUP_KEY)).toContain(SEED_NODES[0]!.id)
  })
})

describe('writeBootstrapChoice / startup recovery', () => {
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

  it('auto-recovers corrupt PRIMARY from valid BACKUP on startup', () => {
    const backupDoc = snapshotToDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    localStorage.setItem(STORAGE_KEY, '{corrupt')
    localStorage.setItem(BACKUP_KEY, serializeGraphDocument(backupDoc))

    const initial = resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(false)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot?.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)

    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)
  })

  it('does not export restorePreviousBackup manual swap API', async () => {
    const mod = await import('./useGraphApp')
    expect('restorePreviousBackup' in mod).toBe(false)
  })
})

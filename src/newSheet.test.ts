import { describe, expect, it, beforeEach } from 'vitest'
import {
  createNewSheet,
  importGraphJsonFile,
  importGraphJsonText,
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
  WORLD_BACKUP_STORAGE_KEY,
  WORLD_CURRENT_KEY,
  hasBackupDocument,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  writeBootstrapChoice,
} from './persistence/autosave'
import { serializeGraphDocument } from './graphDocument'
import { MAX_PORTABLE_JSON_BYTES } from './limits'
import { resetWorkspaceStoreSingleton } from './persistence/workspaceStore'
import { resetWorldStoreSingleton } from './persistence/worldStore'

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
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
    _map: map,
  }
}

describe('createNewSheet persistence hardening', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('backs up current document then replaces storage with empty sheet', async () => {
    const current = {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
    const before = snapshotToDocument(current)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(before))

    const result = await createNewSheet(current)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    expect(result.snapshot.edges).toHaveLength(EMPTY_GRAPH_EDGES.length)
    expect(await hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toContain('"schemaVersion"')

    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })

  it('aborts new sheet when backup fails and keeps current primary document', async () => {
    const store = memoryStorage({ failKeys: new Set([WORLD_BACKUP_STORAGE_KEY]) })
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

    const result = await createNewSheet(current)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/백업 실패/)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toBeNull()
  })
})

describe('importGraphJsonFile persistence hardening', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
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
    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)

    expect(await hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toContain('"schemaVersion"')
    // BACKUP holds pre-import current (seed graph), not empty imported sheet.
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toContain(SEED_NODES[0]!.id)
  })

  it('cancels import when current backup fails after valid parse', async () => {
    const store = memoryStorage({ failKeys: new Set([WORLD_BACKUP_STORAGE_KEY]) })
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
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
  })

  it('cancels import when PRIMARY save fails after backup; keeps existing PRIMARY', async () => {
    // Establish v0.3 current first, then block further current writes.
    const primaryDoc = snapshotToDocument(current)
    const initialStore = memoryStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      value: initialStore,
      configurable: true,
    })
    expect((await saveDocumentToStorage(primaryDoc)).ok).toBe(true)
    const worldPrimaryBefore = localStorage.getItem(WORLD_CURRENT_KEY)
    expect(worldPrimaryBefore).toBeTruthy()

    const store = memoryStorage({ failKeys: new Set([WORLD_CURRENT_KEY]) })
    for (const [k, v] of initialStore._map) store._map.set(k, v)
    Object.defineProperty(globalThis, 'localStorage', {
      value: store,
      configurable: true,
    })
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()

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
    expect(localStorage.getItem(WORLD_CURRENT_KEY)).toBe(worldPrimaryBefore)
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toContain(SEED_NODES[0]!.id)
  })
})

describe('writeBootstrapChoice / startup recovery', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('returns failure instead of throwing when bootstrap write fails', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage({ failKeys: new Set([BOOTSTRAP_KEY]) }),
      configurable: true,
    })
    const written = writeBootstrapChoice('empty')
    expect(written.ok).toBe(false)
    const committed = await commitBootstrapChoice('empty')
    expect(committed.ok).toBe(false)
  })

  it('corrupt v0.2 PRIMARY fails closed (no empty/demo bootstrap)', async () => {
    const backupDoc = snapshotToDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    localStorage.setItem(STORAGE_KEY, '{corrupt')
    localStorage.setItem(BACKUP_KEY, serializeGraphDocument(backupDoc))

    const initial = await resolveInitialGraphState()
    expect(initial.storageCorrupt).toBe(true)
    expect(initial.needsBootstrap).toBe(false)
    expect(initial.snapshot).toBeNull()
    // v0.2 source preserved
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{corrupt')
    expect(localStorage.getItem(BACKUP_KEY)).toBe(serializeGraphDocument(backupDoc))
  })

  it('does not export restorePreviousBackup manual swap API', async () => {
    const mod = await import('./useGraphApp')
    expect('restorePreviousBackup' in mod).toBe(false)
  })
})


describe('importGraphJsonText shared core', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
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

  it('accepts valid JSON text', async () => {
    const importedDoc = snapshotToDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    localStorage.setItem(STORAGE_KEY, serializeGraphDocument(snapshotToDocument(current)))
    const result = await importGraphJsonText(serializeGraphDocument(importedDoc), current)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid JSON text without mutating storage', async () => {
    const primary = serializeGraphDocument(snapshotToDocument(current))
    localStorage.setItem(STORAGE_KEY, primary)
    localStorage.setItem(BACKUP_KEY, '{"keep":"me"}')
    const result = await importGraphJsonText('{not-json', current)
    expect(result.ok).toBe(false)
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{"keep":"me"}')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
  })

  it('rejects oversized text', async () => {
    const huge = 'x'.repeat(MAX_PORTABLE_JSON_BYTES + 1)
    const result = await importGraphJsonText(huge, current)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/너무 큽니다/)
  })

  it('aborts when current backup fails', async () => {
    const store = memoryStorage({ failKeys: new Set([WORLD_BACKUP_STORAGE_KEY]) })
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
    const result = await importGraphJsonText(serializeGraphDocument(importedDoc), current)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/백업/)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(primary)
  })

  it('File import uses the same text core', async () => {
    localStorage.setItem(STORAGE_KEY, serializeGraphDocument(snapshotToDocument(current)))
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
    expect(result.ok).toBe(true)
  })
})

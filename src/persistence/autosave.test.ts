import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildGraphDocument } from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import {
  hasBackupDocument,
  loadDocumentFromStorage,
  restoreBackupFromStorage,
  saveDocumentToStorage,
  writeBootstrapChoice,
  STORAGE_KEY,
  BACKUP_KEY,
  BOOTSTRAP_KEY,
} from '../persistence/autosave'
import { resetWorkspaceStoreSingleton } from '../persistence/workspaceStore'

describe('autosave persistence', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    resetWorkspaceStoreSingleton()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    })
  })

  it('round-trips document through workspace store', async () => {
    const doc = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    const result = await saveDocumentToStorage(doc)
    expect(result.ok).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })

  it('reports corrupt stored data without throwing', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('corrupt')
  })

  it('restores backup document', async () => {
    const doc = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    localStorage.setItem(BACKUP_KEY, JSON.stringify(doc))
    expect(await hasBackupDocument()).toBe(true)
    const restored = await restoreBackupFromStorage()
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })

  it('writeBootstrapChoice returns ok/false without throwing', () => {
    expect(writeBootstrapChoice('demo')).toEqual({ ok: true })
    expect(localStorage.getItem(BOOTSTRAP_KEY)).toBe('demo')

    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    })
    expect(writeBootstrapChoice('empty')).toEqual({ ok: false, reason: 'quota' })
  })
})

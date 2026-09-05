import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildGraphDocument } from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import {
  hasBackupDocument,
  loadDocumentFromStorage,
  restoreBackupFromStorage,
  saveDocumentToStorage,
  STORAGE_KEY,
  BACKUP_KEY,
} from '../persistence/autosave'

describe('autosave persistence', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
    })
  })

  it('round-trips document through localStorage', () => {
    const doc = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    const result = saveDocumentToStorage(doc)
    expect(result.ok).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })

  it('reports corrupt stored data without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('corrupt')
  })

  it('restores backup document', () => {
    const doc = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    localStorage.setItem(BACKUP_KEY, JSON.stringify(doc))
    expect(hasBackupDocument()).toBe(true)
    const restored = restoreBackupFromStorage()
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })
})

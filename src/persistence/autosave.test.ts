import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildGraphDocument } from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import {
  loadDocumentFromStorage,
  saveDocumentToStorage,
  STORAGE_KEY,
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
    saveDocumentToStorage(doc)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
    const loaded = loadDocumentFromStorage()
    expect(loaded?.settings?.gridSnapEnabled).toBe(true)
    expect(loaded?.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })
})

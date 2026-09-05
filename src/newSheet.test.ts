import { describe, expect, it, beforeEach } from 'vitest'
import { createNewSheet, snapshotToDocument } from './useGraphApp'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from './emptyGraph'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  hasBackupDocument,
  loadDocumentFromStorage,
} from './persistence/autosave'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
}

describe('createNewSheet', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('backs up the current document and replaces storage with an empty sheet', () => {
    const current = {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
    const before = snapshotToDocument(current)
    // Seed storage with a non-empty document first
    localStorage.setItem(STORAGE_KEY, JSON.stringify(before))

    const next = createNewSheet(current)

    expect(next.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
    expect(next.edges).toHaveLength(EMPTY_GRAPH_EDGES.length)
    expect(hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(BACKUP_KEY)).toContain('"schemaVersion"')

    const loaded = loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })
})

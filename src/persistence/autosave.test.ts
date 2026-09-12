import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildGraphDocument } from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import {
  backupDocumentToStorage,
  hasBackupDocument,
  loadDocumentFromStorage,
  restoreBackupFromStorage,
  saveDocumentToStorage,
  writeBootstrapChoice,
  WORLD_CURRENT_KEY,
  WORLD_BACKUP_STORAGE_KEY,
  BOOTSTRAP_KEY,
  STORAGE_KEY,
} from '../persistence/autosave'
import { resetWorkspaceStoreSingleton } from '../persistence/workspaceStore'
import { resetWorldStoreSingleton, WorldStoreInitError } from '../persistence/worldStore'

describe('autosave persistence', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    resetWorkspaceStoreSingleton()
    resetWorldStoreSingleton()
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

  it('round-trips document through world store', async () => {
    const doc = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    const result = await saveDocumentToStorage(doc)
    expect(result.ok).toBe(true)
    expect(localStorage.getItem(WORLD_CURRENT_KEY)).toBeTruthy()
    const loaded = await loadDocumentFromStorage()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.settings?.gridSnapEnabled).toBe(true)
    expect(loaded.document.nodes).toHaveLength(EMPTY_GRAPH_NODES.length)
  })

  it('reports corrupt world payload without throwing', async () => {
    const doc = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    expect((await saveDocumentToStorage(doc)).ok).toBe(true)
    localStorage.setItem(WORLD_CURRENT_KEY, '{not json')
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
    expect((await backupDocumentToStorage(doc)).ok).toBe(true)
    expect(await hasBackupDocument()).toBe(true)
    expect(localStorage.getItem(WORLD_BACKUP_STORAGE_KEY)).toBeTruthy()
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

  it('corrupt v0.2 source fails closed (no empty bootstrap)', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    await expect(loadDocumentFromStorage()).rejects.toBeInstanceOf(WorldStoreInitError)
  })
})

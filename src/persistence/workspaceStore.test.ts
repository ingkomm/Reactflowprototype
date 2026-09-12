import { beforeEach, describe, expect, it } from 'vitest'
import { buildMaskedImageMarkup } from '../customSymbol'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import {
  MAX_BROWSER_AUTOSAVE_BYTES,
  MAX_PORTABLE_JSON_BYTES,
  utf8ByteLength,
} from '../limits'
import { createMemoryFsBackend } from './fsBackend'
import { buildManifestFromDocument, hydrateManifest } from './symbolAssets'
import {
  CURRENT_MANIFEST_PATH,
  installMemoryWorkspaceStore,
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  migrateLegacyLocalStorageIfNeeded,
  resetWorkspaceStoreSingleton,
  setWorkspaceStoreTestHooks,
  WorkspaceStoreInitError,
  getWorkspaceStore,
} from './workspaceStore'
import { WORKSPACE_STORAGE_VERSION } from './workspaceTypes'

const DEMO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const MARKUP = buildMaskedImageMarkup(DEMO_PNG, 24, 24)
const RASTER_MARKUP = buildMaskedImageMarkup(DEMO_PNG, 32, 32)

function docWithSymbols(markups: string[]) {
  return buildGraphDocument({
    nodes: EMPTY_GRAPH_NODES,
    edges: EMPTY_GRAPH_EDGES,
    customSymbols: markups.map((markup, i) => ({
      id: `sym-${i}`,
      name: `Symbol ${i}`,
      viewBox: markup.includes('width="32"') ? '0 0 32 32' : '0 0 24 24',
      width: markup.includes('width="32"') ? 32 : 24,
      height: markup.includes('width="32"') ? 32 : 24,
      markup,
    })),
    settings: {},
  })
}

describe('workspace store foundation', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
  })

  it('memory/desktop store is not capped by the old 2MB document limit', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const hugeMarkdown = '한'.repeat(800_000) // >> 2MB UTF-8
    const nodes = structuredClone(EMPTY_GRAPH_NODES)
    nodes[0] = {
      ...nodes[0]!,
      data: { ...nodes[0]!.data, markdown: hugeMarkdown },
    }
    const doc = buildGraphDocument({
      nodes,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    const serialized = serializeGraphDocument(doc)
    expect(utf8ByteLength(serialized)).toBeGreaterThan(MAX_BROWSER_AUTOSAVE_BYTES)
    expect(utf8ByteLength(serialized)).toBeLessThan(MAX_PORTABLE_JSON_BYTES)

    const saved = await store.saveCurrent(doc)
    expect(saved.ok).toBe(true)
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes[0]?.data.markdown).toBe(hugeMarkdown)
  })

  it('portable import limit uses real UTF-8 byte length', () => {
    const text = '한'.repeat(Math.floor(MAX_PORTABLE_JSON_BYTES / 3) + 10)
    expect(utf8ByteLength(text)).toBeGreaterThan(MAX_PORTABLE_JSON_BYTES)
    expect(text.length).toBeLessThan(MAX_PORTABLE_JSON_BYTES)
    const parsed = parseGraphDocumentJson(text)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toMatch(/너무 큽니다/)
  })

  it('migrates legacy primary + backup without deleting legacy keys', async () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v)
        },
        removeItem: (k: string) => {
          memory.delete(k)
        },
        clear: () => memory.clear(),
        key: (i: number) => [...memory.keys()][i] ?? null,
        get length() {
          return memory.size
        },
      },
    })

    const primary = docWithSymbols([MARKUP])
    const backup = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    memory.set(LEGACY_STORAGE_KEY, serializeGraphDocument(primary))
    memory.set(LEGACY_BACKUP_KEY, serializeGraphDocument(backup))

    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const migrated = await migrateLegacyLocalStorageIfNeeded(store)
    expect(migrated.migrated).toBe(true)

    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.customSymbols[0]?.markup).toBe(MARKUP)

    const backupLoaded = await store.loadBackup()
    expect(backupLoaded.ok).toBe(true)

    expect(memory.get(LEGACY_STORAGE_KEY)).toBeTruthy()
    expect(memory.get(LEGACY_BACKUP_KEY)).toBeTruthy()
  })

  it('does not overwrite existing v0.2 store with stale legacy data', async () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v)
        },
        removeItem: (k: string) => {
          memory.delete(k)
        },
        clear: () => memory.clear(),
        key: (i: number) => [...memory.keys()][i] ?? null,
        get length() {
          return memory.size
        },
      },
    })

    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    await store.saveCurrent(docWithSymbols([MARKUP]))

    const stale = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true },
    })
    memory.set(LEGACY_STORAGE_KEY, serializeGraphDocument(stale))

    const migrated = await migrateLegacyLocalStorageIfNeeded(store)
    expect(migrated.migrated).toBe(false)

    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.customSymbols).toHaveLength(1)
  })

  it('keeps legacy keys intact when migration save fails', async () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v)
        },
        removeItem: (k: string) => {
          memory.delete(k)
        },
        clear: () => memory.clear(),
        key: (i: number) => [...memory.keys()][i] ?? null,
        get length() {
          return memory.size
        },
      },
    })

    const primary = docWithSymbols([MARKUP])
    const legacyRaw = serializeGraphDocument(primary)
    memory.set(LEGACY_STORAGE_KEY, legacyRaw)
    memory.set(LEGACY_BACKUP_KEY, legacyRaw)

    const fs = createMemoryFsBackend()
    const store = installMemoryWorkspaceStore(fs)
    const originalWrite = fs.writeTextFile.bind(fs)
    fs.writeTextFile = async () => {
      throw new Error('forced migration write failure')
    }

    const migrated = await migrateLegacyLocalStorageIfNeeded(store)
    expect(migrated.migrated).toBe(false)
    expect(memory.get(LEGACY_STORAGE_KEY)).toBe(legacyRaw)
    expect(memory.get(LEGACY_BACKUP_KEY)).toBe(legacyRaw)
    expect(await store.hasCurrent()).toBe(false)

    // Restore writes so the suite can continue using the same fs helper.
    fs.writeTextFile = originalWrite
  })

  it('keeps latest state under concurrent autosave races', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const writes = Array.from({ length: 8 }, (_, i) => {
      const nodes = structuredClone(EMPTY_GRAPH_NODES)
      nodes[0] = {
        ...nodes[0]!,
        data: { ...nodes[0]!.data, markdown: `gen-${i}` },
      }
      return store.saveCurrent(
        buildGraphDocument({
          nodes,
          edges: EMPTY_GRAPH_EDGES,
          customSymbols: [],
          settings: {},
        }),
      )
    })
    await Promise.all(writes)
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.nodes[0]?.data.markdown).toBe('gen-7')
  })

  it('failed write does not destroy last good current', async () => {
    const fs = createMemoryFsBackend()
    const store = installMemoryWorkspaceStore(fs)
    const good = docWithSymbols([MARKUP])
    expect((await store.saveCurrent(good)).ok).toBe(true)

    const originalWrite = fs.writeTextFile.bind(fs)
    let failOnce = true
    fs.writeTextFile = async (path, contents) => {
      if (failOnce && String(path).endsWith('.tmp')) {
        failOnce = false
        throw new Error('disk full')
      }
      return originalWrite(path, contents)
    }

    const badNodes = structuredClone(EMPTY_GRAPH_NODES)
    badNodes[0] = {
      ...badNodes[0]!,
      data: { ...badNodes[0]!.data, markdown: 'should-not-persist' },
    }
    const failed = await store.saveCurrent(
      buildGraphDocument({
        nodes: badNodes,
        edges: EMPTY_GRAPH_EDGES,
        customSymbols: [],
        settings: {},
      }),
    )
    expect(failed.ok).toBe(false)

    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.customSymbols[0]?.markup).toBe(MARKUP)
    expect(loaded.document.nodes[0]?.data.markdown).not.toBe('should-not-persist')
  })
})

describe('asset store + custom symbol externalize', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
  })

  it('put/get round-trips and hydrates custom symbols including raster markup', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const doc = docWithSymbols([MARKUP, RASTER_MARKUP])
    expect((await store.saveCurrent(doc)).ok).toBe(true)
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.document.customSymbols).toHaveLength(2)
    expect(loaded.document.customSymbols[0]?.markup).toBe(MARKUP)
    expect(loaded.document.customSymbols[1]?.markup).toBe(RASTER_MARKUP)

    const listed = await store.assets.list()
    expect(listed.length).toBeGreaterThanOrEqual(2)
  })

  it('reports missing assets instead of silently dropping markup', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const doc = docWithSymbols([MARKUP])
    const manifest = await buildManifestFromDocument(doc, store.assets)
    const assetId = manifest.document.customSymbols[0]!.assetId
    await store.assets.delete(assetId)
    const hydrated = await hydrateManifest(manifest, store.assets)
    expect(hydrated.issues.some((i) => i.code === 'missing_asset')).toBe(true)
  })

  it('GC keeps assets referenced by current or backup only', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const current = docWithSymbols([MARKUP])
    const backup = docWithSymbols([RASTER_MARKUP])
    expect((await store.saveCurrent(current)).ok).toBe(true)
    expect((await store.saveBackup(backup)).ok).toBe(true)

    const empty = buildGraphDocument({
      nodes: EMPTY_GRAPH_NODES,
      edges: EMPTY_GRAPH_EDGES,
      customSymbols: [],
      settings: {},
    })
    expect((await store.saveCurrent(empty)).ok).toBe(true)

    const backupLoaded = await store.loadBackup()
    expect(backupLoaded.ok).toBe(true)
    if (!backupLoaded.ok) return
    expect(backupLoaded.document.customSymbols[0]?.markup).toBe(RASTER_MARKUP)

    expect((await store.saveBackup(empty)).ok).toBe(true)
    const listed = await store.assets.list()
    expect(listed).toHaveLength(0)
  })

  it('portable export stays self-contained without AppData paths', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const doc = docWithSymbols([MARKUP, RASTER_MARKUP])
    await store.saveCurrent(doc)
    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const portable = serializeGraphDocument(loaded.document)
    expect(portable).not.toMatch(/storage-v02/)
    expect(portable).not.toMatch(/AppData/i)
    expect(portable).not.toMatch(/"assetId"/)
    const reparsed = parseGraphDocumentJson(portable)
    expect(reparsed.ok).toBe(true)
    if (!reparsed.ok) return
    expect(reparsed.document.customSymbols[0]?.markup).toBe(MARKUP)
    expect(reparsed.document.customSymbols[1]?.markup).toBe(RASTER_MARKUP)
  })
})


describe('workspace store integrity regressions', () => {
  beforeEach(() => {
    resetWorkspaceStoreSingleton()
  })

  it('A: markup change does not overwrite committed asset when manifest commit fails', async () => {
    const fs = createMemoryFsBackend()
    const store = installMemoryWorkspaceStore(fs)
    const original = docWithSymbols([MARKUP])
    expect((await store.saveCurrent(original)).ok).toBe(true)

    const before = await store.loadCurrent()
    expect(before.ok).toBe(true)
    if (!before.ok) return
    const oldMarkup = before.document.customSymbols[0]!.markup
    const assetsBefore = await store.assets.list()
    expect(assetsBefore.length).toBe(1)
    const oldAssetId = assetsBefore[0]!.assetId
    const oldPayload = await store.assets.get(oldAssetId)
    expect(oldPayload?.text).toBe(oldMarkup)

    const originalWrite = fs.writeTextFile.bind(fs)
    fs.writeTextFile = async (path, contents) => {
      if (String(path).endsWith('current.json.tmp')) {
        throw new Error('forced manifest temp write failure')
      }
      return originalWrite(path, contents)
    }

    const changed = docWithSymbols([RASTER_MARKUP])
    // Keep the same symbol id so this is an in-place symbol update.
    changed.customSymbols[0] = {
      ...changed.customSymbols[0]!,
      id: original.customSymbols[0]!.id,
      name: original.customSymbols[0]!.name,
    }
    const failed = await store.saveCurrent(changed)
    expect(failed.ok).toBe(false)

    const after = await store.loadCurrent()
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.document.customSymbols[0]?.markup).toBe(oldMarkup)

    const stillOld = await store.assets.get(oldAssetId)
    expect(stillOld?.text).toBe(oldMarkup)

    fs.writeTextFile = originalWrite
  })

  it('B: overlapping saveCurrent/saveBackup keep both assets; GC does not drop the other slot', async () => {
    const store = installMemoryWorkspaceStore(createMemoryFsBackend())
    const currentDoc = docWithSymbols([MARKUP])
    const backupDoc = docWithSymbols([RASTER_MARKUP])
    // Distinct symbol ids so each slot owns a distinct asset.
    backupDoc.customSymbols[0] = {
      ...backupDoc.customSymbols[0]!,
      id: 'sym-backup',
      name: 'Backup Symbol',
    }

    const [currentResult, backupResult] = await Promise.all([
      store.saveCurrent(currentDoc),
      store.saveBackup(backupDoc),
    ])
    expect(currentResult.ok).toBe(true)
    expect(backupResult.ok).toBe(true)

    const currentLoaded = await store.loadCurrent()
    const backupLoaded = await store.loadBackup()
    expect(currentLoaded.ok).toBe(true)
    expect(backupLoaded.ok).toBe(true)
    if (!currentLoaded.ok || !backupLoaded.ok) return
    expect(currentLoaded.document.customSymbols[0]?.markup).toBe(MARKUP)
    expect(backupLoaded.document.customSymbols[0]?.markup).toBe(RASTER_MARKUP)

    const listed = await store.assets.list()
    expect(listed.length).toBeGreaterThanOrEqual(2)
    for (const entry of listed) {
      const got = await store.assets.get(entry.assetId)
      expect(got?.text).toBeTruthy()
    }
  })

  it('C: desktop AppData init failure does not fall back to browser localStorage store', async () => {
    resetWorkspaceStoreSingleton()
    setWorkspaceStoreTestHooks({
      isDesktop: true,
      createDesktopFs: async () => {
        throw new Error('simulated AppData init failure')
      },
    })

    await expect(getWorkspaceStore()).rejects.toBeInstanceOf(WorkspaceStoreInitError)

    // Second call stays failed — still no silent browser fallback.
    await expect(getWorkspaceStore()).rejects.toBeInstanceOf(WorkspaceStoreInitError)
  })

  it('D: hydrated manifest that fails GraphDocument validation is corrupt, not ok', async () => {
    const fs = createMemoryFsBackend()
    const store = installMemoryWorkspaceStore(fs)
    // First create a valid store so directories exist, then overwrite manifest with broken shape.
    expect((await store.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)

    const brokenManifest = {
      storageVersion: WORKSPACE_STORAGE_VERSION,
      document: {
        schemaVersion: '999.0',
        nodes: [],
        edges: 'not-an-array',
        customSymbols: [],
      },
      assets: [],
    }
    await fs.writeTextFile(CURRENT_MANIFEST_PATH, `${JSON.stringify(brokenManifest)}\n`)

    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('corrupt')
  })

  it('asset metadata byteLength mismatch is treated as corrupt_asset', async () => {
    const fs = createMemoryFsBackend()
    const store = installMemoryWorkspaceStore(fs)
    expect((await store.saveCurrent(docWithSymbols([MARKUP]))).ok).toBe(true)

    const listed = await store.assets.list()
    expect(listed.length).toBe(1)
    const assetId = listed[0]!.assetId
    const metaPath = `storage-v02/assets/${assetId}.meta.json`
    const raw = await fs.readTextFile(metaPath)
    const meta = JSON.parse(raw) as Record<string, unknown>
    meta.byteLength = 1
    await fs.writeTextFile(metaPath, JSON.stringify(meta))

    const loaded = await store.loadCurrent()
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.reason).toBe('missing_asset')
    expect(loaded.issues?.some((i) => i.code === 'corrupt_asset')).toBe(true)
  })
})

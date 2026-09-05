import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  graphDocumentsEqual,
  parseGraphDocumentJson,
  serializeGraphDocument,
  validateGraphDocument,
} from './graphDocument'
import { DEFAULT_SYMBOL_ID } from './librarySymbols'
import { buildMaskedImageMarkup } from './customSymbol'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import { createVideoMediaId } from './videoMedia'
import { INITIAL_NODE_ID } from './types'

const DEMO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('graphDocument', () => {
  it('round-trips seed graph JSON', () => {
    const doc = buildGraphDocument({
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true, voidHighlightEnabled: false },
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(graphDocumentsEqual(doc, parsed.document)).toBe(true)
  })

  it('rejects unsupported schema versions without mutating parse state', () => {
    const bad = { schemaVersion: '9.9', nodes: [], edges: [], customSymbols: [] }
    const result = validateGraphDocument(bad)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('schemaVersion')
  })

  it('ignores legacy classes/customIcons and migrates classId to default symbolId', () => {
    const legacy = {
      schemaVersion: '0.1',
      nodes: SEED_NODES.map((n) => ({
        id: n.id,
        type: 'passive',
        position: n.position,
        data: {
          ...n.data,
          classId: 'm-dance',
          customIconId: 'ci-old',
        },
      })),
      edges: SEED_EDGES,
      classes: [{ id: 'm-dance', kind: 'mastery', label: 'Legacy', iconId: 'da-disco', iconColor: '#AD1A72' }],
      customIcons: [{ id: 'ci-old', name: 'Legacy', width: 16, height: 16, pixels: [] }],
    }
    const result = validateGraphDocument(legacy)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.customSymbols).toEqual([])
    const node = result.document.nodes.find((n) => n.id === 'mastery-dance')
    expect(node?.data.symbolId).toBe(DEFAULT_SYMBOL_ID)
    expect(node?.data.classId).toBeUndefined()
  })

  it('migrates node-level media into daily logs on import', () => {
    const markup = buildMaskedImageMarkup(DEMO_PNG, 24, 24)
    const customSymbols = [
      {
        id: 'cs-star',
        name: 'Star',
        viewBox: '0 0 24 24',
        width: 24,
        height: 24,
        markup,
        kind: 'notable' as const,
      },
    ]
    const nodes = structuredClone(SEED_NODES)
    const notable = nodes.find((n) => n.id === 'notable-hiphop')
    if (notable) {
      const data = notable.data
      data.symbolId = customSymbols[0]!.id
      data.media = [
        {
          id: createVideoMediaId(),
          url: 'https://youtu.be/dQw4w9WgXcQ',
          title: 'Practice',
          kind: 'youtube',
          provider: 'youtube',
        },
      ]
    }

    const doc = buildGraphDocument({
      nodes,
      edges: SEED_EDGES,
      customSymbols,
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.customSymbols).toHaveLength(1)
    const restored = parsed.document.nodes.find((n) => n.id === 'notable-hiphop')
    expect(restored?.data.symbolId).toBe(customSymbols[0]!.id)
    expect(restored?.data.media).toBeUndefined()
    const logs = restored?.data.stages?.[0]?.logs ?? []
    expect(logs.some((log) => log.media?.[0]?.url === 'https://youtu.be/dQw4w9WgXcQ')).toBe(true)
  })

  it('preserves Mastery legacy stages and media through parse/export round-trip', () => {
    const media = {
      id: createVideoMediaId(),
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'Legacy mastery clip',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    const stages = [
      {
        id: 'mastery-stage-1',
        index: 1,
        label: '기록',
        goal: 9999,
        completedManually: false,
        logs: [{ id: 'ml-1', date: '2025-03-01', note: 'legacy note' }],
      },
    ]
    const raw = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
        {
          id: 'mastery-legacy',
          type: 'passive',
          position: { x: 10, y: 20 },
          data: {
            label: 'Legacy Mastery',
            kind: 'mastery',
            symbolId: DEFAULT_SYMBOL_ID,
            stages,
            media: [media],
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }
    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const loaded = parsed.document.nodes.find((n) => n.id === 'mastery-legacy')?.data
    expect(loaded?.kind).toBe('mastery')
    expect(loaded?.stages).toHaveLength(1)
    expect(loaded?.stages?.[0]?.logs?.[0]?.note).toBe('legacy note')
    expect(loaded?.media?.[0]?.url).toBe(media.url)

    const exported = buildGraphDocument({
      nodes: parsed.document.nodes,
      edges: parsed.document.edges,
      customSymbols: [],
    })
    expect(exported.schemaVersion).toBe('0.1')
    const out = exported.nodes.find((n) => n.id === 'mastery-legacy')?.data
    expect(out?.stages?.[0]?.id).toBe('mastery-stage-1')
    expect(out?.stages?.[0]?.logs?.[0]?.note).toBe('legacy note')
    expect(out?.media?.[0]?.url).toBe(media.url)

    const reparsed = parseGraphDocumentJson(serializeGraphDocument(exported))
    expect(reparsed.ok).toBe(true)
    if (!reparsed.ok) return
    const again = reparsed.document.nodes.find((n) => n.id === 'mastery-legacy')?.data
    expect(again?.stages?.[0]?.logs?.[0]?.note).toBe('legacy note')
    expect(again?.media?.[0]?.url).toBe(media.url)
  })
})

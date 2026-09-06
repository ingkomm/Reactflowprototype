import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  documentToFlowState,
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

  it('preserves Notable summary markdown and Daily Log note/media through parse/export', () => {
    const media = {
      id: createVideoMediaId(),
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'Clip',
      note: 'media caption',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
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
          id: 'notable-keep',
          type: 'passive',
          position: { x: 40, y: 40 },
          data: {
            label: 'Drill',
            kind: 'notable',
            symbolId: DEFAULT_SYMBOL_ID,
            markdown: '## Summary\n\nstays',
            stages: [
              {
                id: 'stage-keep',
                index: 1,
                label: '연습',
                goal: 3,
                completedManually: false,
                logs: [
                  {
                    id: 'log-keep',
                    date: '2026-09-01',
                    note: 'short note',
                    media: [media],
                  },
                ],
              },
              {
                id: 'stage-keep-2',
                index: 2,
                label: '숙련',
                goal: 5,
                completedManually: false,
                logs: [],
              },
              {
                id: 'stage-keep-3',
                index: 3,
                label: '완성',
                goal: 7,
                completedManually: false,
                logs: [],
              },
            ],
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }
    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const loaded = parsed.document.nodes.find((n) => n.id === 'notable-keep')?.data
    expect(loaded?.markdown).toContain('Summary')
    expect(loaded?.stages?.[0]?.logs?.[0]?.id).toBe('log-keep')
    expect(loaded?.stages?.[0]?.logs?.[0]?.note).toBe('short note')
    expect(loaded?.stages?.[0]?.logs?.[0]?.media?.[0]?.note).toBe('media caption')
    expect(loaded?.stages?.map((s) => s.goal)).toEqual([3, 5, 7])

    const exported = buildGraphDocument({
      nodes: parsed.document.nodes,
      edges: parsed.document.edges,
      customSymbols: [],
    })
    expect(exported.schemaVersion).toBe('0.1')
    const out = exported.nodes.find((n) => n.id === 'notable-keep')?.data
    expect(out?.markdown).toContain('stays')
    expect(out?.stages?.[0]?.logs?.[0]?.id).toBe('log-keep')
    expect(out?.stages?.[0]?.logs?.[0]?.media?.[0]?.url).toContain('youtu.be')
  })



  it('persists Root rename (label only) across save/load', () => {
    const nodes = SEED_NODES.map((n) =>
      n.id === INITIAL_NODE_ID
        ? { ...n, data: { ...n.data, label: 'Renamed Root' } }
        : n,
    )
    const doc = buildGraphDocument({
      nodes,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const root = parsed.document.nodes.find((n) => n.id === INITIAL_NODE_ID)
    expect(root?.data.label).toBe('Renamed Root')
    expect(root?.id).toBe(INITIAL_NODE_ID)
    expect(root?.data.kind).toBe('initial')
  })

  it('migrates legacy notable edges to center and never exports type notable', () => {
    const raw = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: -100, y: -100 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
        {
          id: 'n1',
          type: 'passive',
          position: { x: 0, y: 0 },
          data: {
            label: 'A',
            kind: 'notable',
            stages: [],
            symbolId: DEFAULT_SYMBOL_ID,
            rootOrbitTier: 1,
            rootOrbitSlot: 0,
          },
        },
        {
          id: 'n2',
          type: 'passive',
          position: { x: 80, y: 0 },
          data: { label: 'B', kind: 'notable', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
      ],
      edges: [
        {
          id: 'e-notable',
          type: 'notable',
          source: 'n1',
          target: 'n2',
          sourceHandle: 'center',
          targetHandle: 'center-target',
          data: { active: true },
        },
        {
          id: 'e-power',
          type: 'center',
          source: INITIAL_NODE_ID,
          target: 'n1',
          sourceHandle: 'center',
          targetHandle: 'center-target',
        },
      ],
      customSymbols: [],
    }
    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.edges.every((e) => e.type !== 'notable')).toBe(true)
    const imported = documentToFlowState(parsed.document)
    const notableEdge = imported.edges.find((e) => e.id === 'e-notable')
    expect(notableEdge?.type).toBe('center')
    const power = imported.edges.find((e) => e.id === 'e-power')
    expect(power?.sourceHandle).toBe('root-power')
    expect(power?.targetHandle).toBe('center-target')

    const exported = buildGraphDocument({
      nodes: imported.nodes,
      edges: imported.edges,
      customSymbols: [],
    })
    expect(exported.edges.every((e) => e.type !== 'notable')).toBe(true)
  })

  it('repairs Root↔Connect from initialSlot and drops irreparable Root center edges', () => {
    const raw = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: -100, y: -100 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
        {
          id: 'c1',
          type: 'passive',
          position: { x: 200, y: 0 },
          data: {
            label: 'C',
            kind: 'connect',
            stages: [],
            symbolId: DEFAULT_SYMBOL_ID,
            connectEnabled: true,
            initialSlot: 2,
          },
        },
        {
          id: 'orphan',
          type: 'passive',
          position: { x: 40, y: 40 },
          data: { label: 'S', kind: 'shard', stages: [], symbolId: DEFAULT_SYMBOL_ID },
        },
      ],
      edges: [
        {
          id: 'e-connect',
          type: 'center',
          source: INITIAL_NODE_ID,
          target: 'c1',
          sourceHandle: 'center',
          targetHandle: 'center-target',
        },
        {
          id: 'e-bad',
          type: 'center',
          source: INITIAL_NODE_ID,
          target: 'orphan',
          sourceHandle: null,
          targetHandle: 'center-target',
        },
      ],
      customSymbols: [],
    }
    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const imported = documentToFlowState(parsed.document)
    expect(imported.edges.find((e) => e.id === 'e-bad')).toBeUndefined()
    const repaired = imported.edges.find((e) => e.id === 'e-connect')
    expect(repaired?.sourceHandle).toBe('socket-2')
  })
})

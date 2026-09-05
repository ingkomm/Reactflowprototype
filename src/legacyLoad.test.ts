import { describe, expect, it } from 'vitest'
import {
  parseGraphDocumentJson,
  buildGraphDocument,
  serializeGraphDocument,
} from './graphDocument'
import { SEED_NODES, SEED_EDGES } from './seedGraph'
import { INITIAL_NODE_ID, GRAPH_SCHEMA_VERSION } from './types'
import { buildMaskedImageMarkup } from './customSymbol'

const DEMO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('legacy save recovery', () => {
  it('loads small nodes + customSymbols.kind=small + colors.small', () => {
    const markup = buildMaskedImageMarkup(DEMO_PNG, 24, 24)
    const legacy = {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: 'default' },
        },
        {
          id: 'small-1',
          type: 'passive',
          position: { x: 10, y: 10 },
          data: {
            label: 'S',
            kind: 'small',
            stages: [
              {
                id: 'st1',
                index: 1,
                label: '연습',
                goal: 9999,
                completedManually: false,
                logs: [
                  {
                    id: 'l1',
                    date: '2025-01-01',
                    note: 'memo',
                    media: [{ id: 'bad', url: 'not-a-url' }],
                  },
                ],
              },
            ],
            symbolId: 'cs-1',
            customSymbolId: 'cs-1',
          },
        },
      ],
      edges: [{ id: 'e-orphan', type: 'center', source: 'missing', target: INITIAL_NODE_ID }],
      customSymbols: [
        {
          id: 'cs-1',
          name: 'Star',
          viewBox: '0 0 24 24',
          width: 24,
          height: 24,
          markup,
          kind: 'small',
        },
        {
          id: 'cs-bad',
          name: 'Broken',
          viewBox: '0 0 10 10',
          width: 10,
          height: 10,
          markup: '<script>alert(1)</script>',
        },
      ],
      settings: {
        gridSnapEnabled: true,
        defaultSymbolColors: { small: '#AABBCC', mastery: '#112233' },
      },
    }

    const parsed = parseGraphDocumentJson(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const shard = parsed.document.nodes.find((n) => n.id === 'small-1')
    expect(shard?.data.kind).toBe('shard')
    expect(shard?.data.markdown).toContain('2025-01-01')
    expect(shard?.data.markdown).toContain('memo')
    expect(parsed.document.customSymbols).toHaveLength(1)
    expect(parsed.document.customSymbols[0]?.kind).toBe('shard')
    expect(parsed.document.settings?.defaultSymbolColors?.shard).toBe('#AABBCC')
    expect(parsed.document.edges.find((e) => e.id === 'e-orphan')).toBeUndefined()
  })

  it('round-trips current seed', () => {
    const doc = buildGraphDocument({ nodes: SEED_NODES, edges: SEED_EDGES, customSymbols: [] })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
  })
})

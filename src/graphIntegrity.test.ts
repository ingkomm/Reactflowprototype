import { describe, expect, it } from 'vitest'
import { validateGraphIntegrity } from './graphIntegrity'
import { buildGraphDocument, parseGraphDocumentJson } from './graphDocument'
import { SEED_EDGES, SEED_NODES } from './seedGraph'

describe('graph integrity & import limits', () => {
  it('accepts valid seed graph', () => {
    const doc = buildGraphDocument({ nodes: SEED_NODES, edges: SEED_EDGES, customSymbols: [] })
    const parsed = parseGraphDocumentJson(JSON.stringify(doc))
    expect(parsed.ok).toBe(true)
  })

  it('rejects duplicate root nodes', () => {
    const bad = {
      schemaVersion: '0.1',
      nodes: [
        { id: 'initial-main', type: 'passive', position: { x: 0, y: 0 }, data: { label: 'A', kind: 'initial', stages: [], symbolId: 'default' } },
        { id: 'initial-copy', type: 'passive', position: { x: 1, y: 1 }, data: { label: 'B', kind: 'initial', stages: [], symbolId: 'default' } },
      ],
      edges: [],
      customSymbols: [],
    }
    const result = validateGraphIntegrity(bad.nodes as never, bad.edges)
    expect(result?.message).toContain('Root')
  })

  it('rejects orbit capacity outside 1-24', () => {
    const bad = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: 'initial-main',
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: 'default' },
        },
        {
          id: 'mastery-a',
          type: 'passive',
          position: { x: 100, y: 0 },
          data: {
            label: 'M',
            kind: 'mastery',
            stages: [],
            symbolId: 'default',
            orbitCapacityByTier: { 1: 30 },
            orbitTierCount: 1,
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }
    const result = validateGraphIntegrity(bad.nodes as never, bad.edges)
    expect(result?.message).toContain('용량')
  })

  it('rejects negative orbit slots', () => {
    const bad = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: 'initial-main',
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: 'default' },
        },
        {
          id: 'mastery-a',
          type: 'passive',
          position: { x: 100, y: 0 },
          data: {
            label: 'M',
            kind: 'mastery',
            stages: [],
            symbolId: 'default',
            orbitCapacityByTier: { 1: 6 },
            orbitTierCount: 1,
          },
        },
        {
          id: 'shard-a',
          type: 'passive',
          position: { x: 200, y: 0 },
          data: {
            label: 'S',
            kind: 'shard',
            stages: [],
            symbolId: 'default',
            masteryId: 'mastery-a',
            orbitSlot: -1,
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }
    const result = validateGraphIntegrity(bad.nodes as never, bad.edges)
    expect(result?.message).toContain('슬롯')
  })

  it('rejects oversized JSON', () => {
    const huge = 'x'.repeat(3 * 1024 * 1024)
    const result = parseGraphDocumentJson(huge)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('너무 큽')
  })
})

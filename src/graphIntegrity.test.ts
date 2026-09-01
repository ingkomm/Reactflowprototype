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

  it('rejects oversized JSON', () => {
    const huge = 'x'.repeat(3 * 1024 * 1024)
    const result = parseGraphDocumentJson(huge)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('너무 큽')
  })
})

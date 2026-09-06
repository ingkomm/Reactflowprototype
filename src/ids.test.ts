import { describe, expect, it } from 'vitest'
import {
  createEdgeId,
  createLogId,
  createMediaId,
  createNodeId,
  createStageId,
  createSymbolId,
} from './ids'

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('createEntityId', () => {
  it('uses full UUID suffixes with entity prefixes (no kind names)', () => {
    const samples = [
      ['node', createNodeId()],
      ['log', createLogId()],
      ['media', createMediaId()],
      ['edge', createEdgeId()],
      ['symbol', createSymbolId()],
      ['stage', createStageId()],
    ] as const
    for (const [prefix, id] of samples) {
      expect(id.startsWith(`${prefix}_`)).toBe(true)
      const uuid = id.slice(prefix.length + 1)
      expect(uuid).toMatch(FULL_UUID)
      expect(id).not.toMatch(/shard|notable|mastery|connect|void/i)
    }
  })
})

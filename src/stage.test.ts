import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from './graphDocument'
import { createPassiveData } from './graphFactory'
import { INITIAL_NODE_ID } from './types'
import { addPracticeSession, formatPracticeDate, totalRawLoggedAcrossStages } from './stage'
import type { PassiveFlowNode } from './components/PassiveNode'

function smallNode(id: string, stages = createPassiveData('small', id).stages): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x: 0, y: 0 },
    data: createPassiveData('small', id, { stages }),
  }
}

describe('small practice logs', () => {
  it('uses local calendar date for practice logs', () => {
    const date = new Date(2025, 0, 15, 23, 30)
    expect(formatPracticeDate(date)).toBe('2025-01-15')
  })

  it('preserves logs through JSON save and reload', () => {
    let node = smallNode('small-a')
    const withLog = {
      ...node,
      data: {
        ...node.data,
        stages: addPracticeSession(node.data.stages ?? [], 'small'),
      },
    }
    expect(totalRawLoggedAcrossStages(withLog.data.stages ?? [])).toBe(1)

    const doc = buildGraphDocument({
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: 0, y: 0 },
          data: createPassiveData('initial', 'Root'),
        },
        withLog,
      ],
      edges: [],
      customSymbols: [],
    })

    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const restored = parsed.document.nodes.find((n) => n.id === 'small-a')
    expect(restored?.data.stages?.[0]?.logs).toHaveLength(1)
    expect(restored?.data.stages?.[0]?.logs[0]?.count).toBe(1)
    expect(totalRawLoggedAcrossStages(restored?.data.stages ?? [])).toBe(1)
  })
})

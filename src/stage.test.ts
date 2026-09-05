import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from './graphDocument'
import { createPassiveData } from './graphFactory'
import { INITIAL_NODE_ID } from './types'
import { createDailyLog, formatPracticeDate } from './stage'
import type { PassiveFlowNode } from './components/PassiveNode'

function shardNode(id: string, extras: Partial<ReturnType<typeof createPassiveData>> = {}): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x: 0, y: 0 },
    data: createPassiveData('shard', id, extras),
  }
}

describe('daily practice logs', () => {
  it('uses local calendar date for new logs', () => {
    const date = new Date(2025, 0, 15, 23, 30)
    expect(formatPracticeDate(date)).toBe('2025-01-15')
  })

  it('migrates legacy Small logs into Shard markdown on reload', () => {
    const log = createDailyLog('2025-06-01', 'stretch')
    const withLog = shardNode('shard-a', {
      stages: [
        {
          id: 'stage-1',
          index: 1,
          label: '연습',
          goal: 9999,
          completedManually: false,
          logs: [log],
        },
      ],
    })

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

    // Force legacy small kind into serialized payload
    const raw = JSON.parse(serializeGraphDocument(doc)) as {
      nodes: Array<{ id: string; data: Record<string, unknown> }>
    }
    const target = raw.nodes.find((n) => n.id === 'shard-a')!
    target.data.kind = 'small'
    target.data.stages = [
      {
        id: 'stage-1',
        index: 1,
        label: '연습',
        goal: 9999,
        completedManually: false,
        logs: [log],
      },
    ]
    delete target.data.markdown

    const parsed = parseGraphDocumentJson(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const restored = parsed.document.nodes.find((n) => n.id === 'shard-a')
    expect(restored?.data.kind).toBe('shard')
    expect(restored?.data.stages).toEqual([])
    expect(restored?.data.markdown).toContain('2025-06-01')
    expect(restored?.data.markdown).toContain('stretch')
  })

  it('migrates legacy count logs into Shard markdown', () => {
    const legacy = {
      schemaVersion: '0.1',
      nodes: [
        {
          id: INITIAL_NODE_ID,
          type: 'passive',
          position: { x: 0, y: 0 },
          data: { label: 'Root', kind: 'initial', stages: [], symbolId: 'default' },
        },
        {
          id: 'shard-a',
          type: 'passive',
          position: { x: 10, y: 10 },
          data: {
            label: 'Small',
            kind: 'small',
            symbolId: 'default',
            stages: [
              {
                id: 'stage-1',
                index: 1,
                label: '연습',
                goal: 9999,
                completedManually: false,
                logs: [
                  {
                    id: 'log-1',
                    label: '2025-05-10',
                    count: 3,
                    date: '2025-05-10',
                    note: 'legacy memo',
                  },
                ],
              },
            ],
          },
        },
      ],
      edges: [],
      customSymbols: [],
    }

    const parsed = parseGraphDocumentJson(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const restored = parsed.document.nodes.find((n) => n.id === 'shard-a')
    expect(restored?.data.kind).toBe('shard')
    expect(restored?.data.stages).toEqual([])
    expect(restored?.data.markdown).toContain('legacy memo')
    expect(restored?.data.markdown).toContain('2025-05-')
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from './graphDocument'
import { createPassiveData } from './graphFactory'
import { INITIAL_NODE_ID } from './types'
import { createDailyLog, countPracticeDaysInStages, formatPracticeDate } from './stage'
import type { PassiveFlowNode } from './components/PassiveNode'

function smallNode(id: string, stages = createPassiveData('small', id).stages): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x: 0, y: 0 },
    data: createPassiveData('small', id, { stages }),
  }
}

describe('daily practice logs', () => {
  it('uses local calendar date for new logs', () => {
    const date = new Date(2025, 0, 15, 23, 30)
    expect(formatPracticeDate(date)).toBe('2025-01-15')
  })

  it('preserves daily logs through JSON save and reload', () => {
    const log = createDailyLog('2025-06-01', 'stretch')
    const withLog = smallNode('small-a', [{ ...createPassiveData('small', 'small-a').stages[0]!, logs: [log] }])

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
    expect(restored?.data.stages?.[0]?.logs[0]?.date).toBe('2025-06-01')
    expect(restored?.data.stages?.[0]?.logs[0]?.note).toBe('stretch')
    expect(countPracticeDaysInStages(restored?.data.stages ?? [])).toBe(1)
  })

  it('migrates legacy count logs into consecutive practice days', () => {
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
          id: 'small-a',
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
    const logs = parsed.document.nodes.find((n) => n.id === 'small-a')?.data.stages?.[0]?.logs ?? []
    expect(logs).toHaveLength(3)
    expect(countPracticeDaysInStages(parsed.document.nodes.find((n) => n.id === 'small-a')?.data.stages ?? [])).toBe(3)
    expect(logs.some((log) => log.note === 'legacy memo')).toBe(true)
  })
})

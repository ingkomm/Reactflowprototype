import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
  serializeGraphDocument,
} from './graphDocument'
import { createPassiveData } from './graphFactory'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  computeDynamicNotableBands,
  createNotableStages,
  ensureNotableStages,
  notableBandFills,
  notableBandGoalsForCount,
  totalRawLoggedAcrossStages,
} from './stage'
import { countPracticeEntries, createDailyLog } from './dailyLog'

describe('dynamic Notable bands', () => {
  it('counts each same-date log as its own entry for band fills', () => {
    const logs = [
      createDailyLog('2026-01-01', 'a'),
      createDailyLog('2026-01-01', 'b'),
      createDailyLog('2026-01-01', 'c'),
      createDailyLog('2026-01-02', 'd'),
    ]
    const stages = ensureNotableStages(createNotableStages(0, logs))
    expect(stages[0]?.logs).toHaveLength(4)
    expect(countPracticeEntries(stages[0]!.logs)).toBe(4)
    expect(totalRawLoggedAcrossStages(stages)).toBe(4)
    expect(notableBandGoalsForCount(totalRawLoggedAcrossStages(stages))).toEqual([3, 5, 7])
    expect(notableBandFills(4)).toEqual([3, 1, 0])
  })

  it('extends goals only when prior bands are full and progress continues', () => {
    expect(computeDynamicNotableBands(15)).toEqual({
      goals: [3, 5, 7],
      fills: [3, 5, 7],
    })
    expect(computeDynamicNotableBands(16)).toEqual({
      goals: [3, 5, 7, 9],
      fills: [3, 5, 7, 1],
    })
    expect(computeDynamicNotableBands(24)).toEqual({
      goals: [3, 5, 7, 9],
      fills: [3, 5, 7, 9],
    })
    expect(computeDynamicNotableBands(25)).toEqual({
      goals: [3, 5, 7, 9, 11],
      fills: [3, 5, 7, 9, 1],
    })
  })

  it('keeps persisted stages at exactly 3/5/7 after 25+ practice entries round-trip', () => {
    const logs = Array.from({ length: 25 }, (_, i) =>
      createDailyLog(`2026-01-${String(i + 1).padStart(2, '0')}`),
    )
    const stages = ensureNotableStages(createNotableStages(0, logs))
    expect(stages).toHaveLength(3)
    expect(stages.map((s) => s.goal)).toEqual([3, 5, 7])
    expect(totalRawLoggedAcrossStages(stages)).toBe(25)

    const nodes: PassiveFlowNode[] = [
      {
        id: INITIAL_NODE_ID,
        type: 'passive',
        position: { x: 0, y: 0 },
        data: createPassiveData('initial', 'Root'),
      },
      {
        id: 'notable-25',
        type: 'passive',
        position: { x: 10, y: 10 },
        data: createPassiveData('notable', 'Long', {
          stages,
          markdown: '## Summary\n\nkeep',
        }),
      },
    ]
    const doc = buildGraphDocument({ nodes, edges: [], customSymbols: [] })
    const exported = doc.nodes.find((n) => n.id === 'notable-25')?.data
    expect(exported?.stages).toHaveLength(3)
    expect(exported?.stages?.map((s) => s.goal)).toEqual([3, 5, 7])
    expect(exported?.markdown).toContain('Summary')

    const raw = JSON.parse(serializeGraphDocument(doc)) as {
      nodes: Array<{ id: string; data: { stages: unknown[] } }>
    }
    expect(raw.nodes.find((n) => n.id === 'notable-25')?.data.stages).toHaveLength(3)

    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const restored = parsed.document.nodes.find((n) => n.id === 'notable-25')?.data
    expect(restored?.stages).toHaveLength(3)
    expect(restored?.stages?.map((s) => s.goal)).toEqual([3, 5, 7])
    const entries = totalRawLoggedAcrossStages(restored?.stages ?? [])
    expect(entries).toBe(25)
    expect(computeDynamicNotableBands(entries)).toEqual({
      goals: [3, 5, 7, 9, 11],
      fills: [3, 5, 7, 9, 1],
    })
  })

  it('does not invent 9/11 stage rows when seeding many practice entries', () => {
    const stages = createNotableStages(30)
    expect(stages).toHaveLength(3)
    expect(stages.map((s) => s.goal)).toEqual([3, 5, 7])
    expect(totalRawLoggedAcrossStages(stages)).toBe(30)
    expect(notableBandGoalsForCount(30)).toEqual([3, 5, 7, 9, 11])
    expect(notableBandFills(30)).toEqual([3, 5, 7, 9, 6])
  })
})

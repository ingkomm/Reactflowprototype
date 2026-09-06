import { describe, expect, it } from 'vitest'
import {
  countPracticeDays,
  createDailyLog,
  dailyLogSummary,
  hasDateConflict,
  memoPreview,
  mergeLogsByDate,
  migrateLegacyTrainingLogs,
  normalizeDailyLogs,
  recentDailyLogs,
  sortedDailyLogs,
  upsertDailyLog,
} from './dailyLog'
import { canNotableTransmit, createNotableStages, ensureNotableStages } from './stage'
import {
  buildGraphDocument,
  parseGraphDocumentJson,
} from './graphDocument'
import { DEFAULT_SYMBOL_ID } from './librarySymbols'
import { INITIAL_NODE_ID } from './types'
import { createVideoMediaId } from './videoMedia'

describe('dailyLog duplicate dates', () => {
  it('keeps three same-date logs as separate entries through normalize/upsert', () => {
    const a = createDailyLog('2026-09-06', 'morning', [
      {
        id: createVideoMediaId(),
        url: 'https://youtu.be/aaaaaaaaaaa',
        title: 'A',
      },
    ])
    const b = createDailyLog('2026-09-06', 'evening', [
      {
        id: createVideoMediaId(),
        url: 'https://youtu.be/bbbbbbbbbbb',
        title: 'B',
      },
    ])
    const c = createDailyLog('2026-09-06', 'next memo')

    let logs = normalizeDailyLogs([a, b, c])
    expect(logs).toHaveLength(3)
    expect(new Set(logs.map((log) => log.id)).size).toBe(3)
    expect(logs.map((log) => log.note)).toEqual(['morning', 'evening', 'next memo'])
    expect(countPracticeDays(logs)).toBe(1)

    const added = upsertDailyLog(logs, createDailyLog('2026-09-06', 'fourth'))
    expect(added.error).toBeUndefined()
    expect(added.logs).toHaveLength(4)
    expect(countPracticeDays(added.logs)).toBe(1)
    expect(hasDateConflict(added.logs, '2026-09-06')).toBe(false)
  })

  it('sorts by newest date while keeping same-date relative order', () => {
    const first = createDailyLog('2026-09-06', 'first')
    const second = createDailyLog('2026-09-06', 'second')
    const older = createDailyLog('2026-09-05', 'older')
    const sorted = sortedDailyLogs([first, second, older])
    expect(sorted.map((log) => log.note)).toEqual(['first', 'second', 'older'])
  })

  it('counts practice days by unique date for power threshold', () => {
    const base = [
      createDailyLog('2026-09-01', 'd1'),
      createDailyLog('2026-09-02', 'd2'),
      createDailyLog('2026-09-03', 'd3'),
    ]
    expect(countPracticeDays(base)).toBe(3)
    const withDupes = [
      ...base,
      createDailyLog('2026-09-01', 'd1-extra'),
      createDailyLog('2026-09-02', 'd2-extra'),
    ]
    expect(countPracticeDays(withDupes)).toBe(3)

    const stages = ensureNotableStages(createNotableStages(0, withDupes))
    expect(canNotableTransmit(stages)).toBe(true)
    expect(stages[0]?.logs).toHaveLength(5)
  })
})

describe('dailyLog legacy helpers', () => {
  it('still exposes explicit mergeLogsByDate for opt-in merge', () => {
    const merged = mergeLogsByDate([
      createDailyLog('2025-01-01', 'morning'),
      { ...createDailyLog('2025-01-01', 'evening'), id: 'log-b' },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.note).toContain('morning')
    expect(merged[0]?.note).toContain('evening')
  })

  it('expands legacy count into multiple dates', () => {
    const logs = migrateLegacyTrainingLogs({
      id: 'log-legacy',
      label: '2025-03-10',
      count: 2,
      date: '2025-03-10',
      note: 'old',
    })
    expect(logs).toHaveLength(2)
    expect(logs.map((log) => log.date)).toEqual(['2025-03-09', '2025-03-10'])
    expect(logs[1]?.note).toBe('old')
  })

  it('returns recent daily logs and summaries', () => {
    const logs = [
      createDailyLog('2025-01-01'),
      createDailyLog('2025-01-03', 'memo a'),
      createDailyLog('2025-01-02', 'memo b'),
      createDailyLog('2025-01-04'),
      createDailyLog('2025-01-05', 'memo c'),
      createDailyLog('2025-01-06'),
      createDailyLog('2025-01-07', 'memo d'),
    ]
    expect(recentDailyLogs(logs, 5).map((log) => log.date)).toEqual([
      '2025-01-07',
      '2025-01-06',
      '2025-01-05',
      '2025-01-04',
      '2025-01-03',
    ])
    expect(dailyLogSummary(createDailyLog('2025-01-08', 'hello'))).toBe('hello')
    expect(memoPreview('x'.repeat(80), 10)).toContain('…')
  })
})

describe('duplicate-date parse/export round-trip', () => {
  it('preserves three same-date logs and legacy media.note', () => {
    const mediaNote = 'legacy media caption'
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
          id: 'notable-dup',
          type: 'passive',
          position: { x: 10, y: 10 },
          data: {
            label: 'Drill',
            kind: 'notable',
            symbolId: DEFAULT_SYMBOL_ID,
            markdown: '## Summary\n\nstays',
            stages: [
              {
                id: 'stage-1',
                index: 1,
                label: '밴드 3',
                goal: 3,
                completedManually: false,
                logs: [
                  {
                    id: 'log-a',
                    date: '2026-09-06',
                    note: 'morning',
                    media: [
                      {
                        id: 'media-a',
                        url: 'https://youtu.be/aaaaaaaaaaa',
                        note: mediaNote,
                      },
                    ],
                  },
                  {
                    id: 'log-b',
                    date: '2026-09-06',
                    note: 'evening',
                    media: [{ id: 'media-b', url: 'https://youtu.be/bbbbbbbbbbb' }],
                  },
                  { id: 'log-c', date: '2026-09-06', note: 'next memo' },
                ],
              },
              {
                id: 'stage-2',
                index: 2,
                label: '밴드 5',
                goal: 5,
                completedManually: false,
                logs: [],
              },
              {
                id: 'stage-3',
                index: 3,
                label: '밴드 7',
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
    const loaded = parsed.document.nodes.find((n) => n.id === 'notable-dup')?.data
    expect(loaded?.markdown).toContain('Summary')
    expect(loaded?.stages?.[0]?.logs).toHaveLength(3)
    expect(loaded?.stages?.[0]?.logs?.map((l) => l.id)).toEqual(['log-a', 'log-b', 'log-c'])
    expect(loaded?.stages?.[0]?.logs?.[0]?.media?.[0]?.note).toBe(mediaNote)
    expect(loaded?.stages?.map((s) => s.goal)).toEqual([3, 5, 7])
    expect(countPracticeDays(loaded?.stages?.[0]?.logs ?? [])).toBe(1)

    const exported = buildGraphDocument({
      nodes: parsed.document.nodes,
      edges: parsed.document.edges,
      customSymbols: [],
    })
    expect(exported.schemaVersion).toBe('0.1')
    const out = exported.nodes.find((n) => n.id === 'notable-dup')?.data
    expect(out?.stages?.[0]?.logs).toHaveLength(3)
    expect(out?.stages?.[0]?.logs?.[0]?.media?.[0]?.note).toBe(mediaNote)
    expect(out?.stages?.[0]?.logs?.map((l) => l.note)).toEqual([
      'morning',
      'evening',
      'next memo',
    ])
  })
})

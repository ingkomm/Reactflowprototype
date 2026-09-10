import { describe, expect, it } from 'vitest'
import {
  countPracticeEntries,
  createDailyLog,
  dailyLogSummary,
  dailyLogTimelineLabel,
  memoPreview,
  migrateLegacyTrainingLogs,
  normalizeDailyLogs,
  recentDailyLogs,
  sortedDailyLogs,
  upsertDailyLog,
} from './dailyLog'
import { createNotableStages, ensureNotableStages } from './stage'
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
    expect(countPracticeEntries(logs)).toBe(3)

    const added = upsertDailyLog(logs, createDailyLog('2026-09-06', 'fourth'))
    expect(added.error).toBeUndefined()
    expect(added.logs).toHaveLength(4)
    expect(countPracticeEntries(added.logs)).toBe(4)
  })

  it('sorts by newest date while keeping same-date relative order', () => {
    const first = createDailyLog('2026-09-06', 'first')
    const second = createDailyLog('2026-09-06', 'second')
    const older = createDailyLog('2026-09-05', 'older')
    const sorted = sortedDailyLogs([first, second, older])
    expect(sorted.map((log) => log.note)).toEqual(['first', 'second', 'older'])
  })

  it('counts practice progression by entry count (not unique dates)', () => {
    const base = [
      createDailyLog('2026-09-01', 'd1'),
      createDailyLog('2026-09-02', 'd2'),
      createDailyLog('2026-09-03', 'd3'),
    ]
    expect(countPracticeEntries(base)).toBe(3)
    const withDupes = [
      ...base,
      createDailyLog('2026-09-01', 'd1-extra'),
      createDailyLog('2026-09-02', 'd2-extra'),
    ]
    expect(countPracticeEntries(withDupes)).toBe(5)

    const stages = ensureNotableStages(createNotableStages(0, withDupes))
    expect(stages[0]?.logs).toHaveLength(5)
  })
})

describe('dailyLog legacy helpers', () => {
  it('expands legacy count into same-date entries', () => {
    const logs = migrateLegacyTrainingLogs({
      id: 'log-legacy',
      label: '2025-03-10',
      count: 3,
      date: '2025-03-10',
      note: 'old',
      media: [{ id: 'm1', url: 'https://youtu.be/aaaaaaaaaaa' }],
    })
    expect(logs).toHaveLength(3)
    expect(logs.every((log) => log.date === '2025-03-10')).toBe(true)
    expect(logs[0]?.id).toBe('log-legacy')
    expect(logs[0]?.note).toBe('old')
    expect(logs[0]?.media?.[0]?.url).toContain('youtu.be')
    expect(logs[1]?.note).toBeUndefined()
    expect(logs[2]?.note).toBeUndefined()
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

describe('dailyLogTimelineLabel', () => {
  it('returns first meaningful line and strips heading/bullet prefixes', () => {
    expect(
      dailyLogTimelineLabel(createDailyLog('2026-01-01', 'first line\n\nsecond line')),
    ).toBe('first line')
    expect(
      dailyLogTimelineLabel(createDailyLog('2026-01-01', '\n\n  meaningful  \nmore')),
    ).toBe('meaningful')
    expect(dailyLogTimelineLabel(createDailyLog('2026-01-01', '# 제목\nbody'))).toBe('제목')
    expect(dailyLogTimelineLabel(createDailyLog('2026-01-01', '## Heading'))).toBe('Heading')
    expect(dailyLogTimelineLabel(createDailyLog('2026-01-01', '- 항목\n- other'))).toBe('항목')
    expect(dailyLogTimelineLabel(createDailyLog('2026-01-01', '* item'))).toBe('item')
  })

  it('labels SVG fence / raw svg opening as SVG', () => {
    expect(
      dailyLogTimelineLabel(
        createDailyLog('2026-01-01', '```svg\n<svg xmlns="http://www.w3.org/2000/svg"/>\n```'),
      ),
    ).toBe('SVG')
    expect(
      dailyLogTimelineLabel(
        createDailyLog('2026-01-01', '\n\n<svg xmlns="http://www.w3.org/2000/svg" width="10"/>'),
      ),
    ).toBe('SVG')
  })

  it('falls back to dailyLogSummary when note is missing', () => {
    const withVideo = createDailyLog('2026-01-01', undefined, [
      { id: 'v1', url: 'https://youtu.be/aaaaaaaaaaa', title: 'Clip' },
    ])
    expect(dailyLogTimelineLabel(withVideo)).toBe('Clip')
    expect(dailyLogTimelineLabel(createDailyLog('2026-01-01'))).toBe('날짜 기록')
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
    expect(countPracticeEntries(loaded?.stages?.[0]?.logs ?? [])).toBe(3)

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

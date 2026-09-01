import { describe, expect, it } from 'vitest'
import {
  createDailyLog,
  dailyLogSummary,
  hasDateConflict,
  memoPreview,
  mergeLogsByDate,
  migrateLegacyTrainingLogs,
  recentDailyLogs,
  upsertDailyLog,
} from './dailyLog'

describe('dailyLog', () => {
  it('merges duplicate dates and keeps memo/media', () => {
    const merged = mergeLogsByDate([
      createDailyLog('2025-01-01', 'morning'),
      { ...createDailyLog('2025-01-01', 'evening'), id: 'log-b' },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.note).toContain('morning')
    expect(merged[0]?.note).toContain('evening')
  })

  it('rejects duplicate dates on upsert', () => {
    const logs = [createDailyLog('2025-02-01')]
    const result = upsertDailyLog(logs, createDailyLog('2025-02-01'))
    expect(result.error).toContain('같은 날짜')
    expect(hasDateConflict(logs, '2025-02-01')).toBe(true)
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

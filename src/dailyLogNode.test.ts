import { describe, expect, it } from 'vitest'
import {
  absorbNodeMediaIntoDailyLogs,
  extractDailyLogsFromNodeData,
  kindUsesDailyLogs,
  trainingLogsToMarkdown,
} from './dailyLogNode'
import { createVideoMediaId } from './videoMedia'
import { DEFAULT_SYMBOL_ID } from './librarySymbols'
import type { PassiveNodeData } from './types'

describe('dailyLogNode', () => {
  it('extracts logs from notable and mastery, not shard', () => {
    const shard: PassiveNodeData = {
      label: 'Shard',
      kind: 'shard',
      symbolId: DEFAULT_SYMBOL_ID,
      stages: [],
      markdown: '## hello',
    }
    expect(extractDailyLogsFromNodeData(shard)).toHaveLength(0)

    const mastery: PassiveNodeData = {
      label: 'Mastery',
      kind: 'mastery',
      symbolId: DEFAULT_SYMBOL_ID,
      stages: [
        {
          id: 's1',
          index: 1,
          label: '기록',
          goal: 9999,
          completedManually: false,
          logs: [{ id: 'l2', date: '2025-02-01', note: 'memo' }],
        },
      ],
    }
    expect(extractDailyLogsFromNodeData(mastery)[0]?.note).toBe('memo')
  })

  it('migrates orphan node media into daily logs and clears duplicate storage', () => {
    const media = {
      id: createVideoMediaId(),
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'Practice clip',
      kind: 'youtube' as const,
      provider: 'youtube' as const,
    }
    const notable: PassiveNodeData = {
      label: 'Notable',
      kind: 'notable',
      symbolId: DEFAULT_SYMBOL_ID,
      stages: [],
      media: [media],
    }
    const migrated = absorbNodeMediaIntoDailyLogs(notable)
    expect(migrated.media).toBeUndefined()
    const logs = extractDailyLogsFromNodeData(migrated)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.media?.[0]?.url).toBe(media.url)
    expect(logs[0]?.note).toBe('Practice clip')
  })

  it('flattens legacy training logs into markdown for shard migration', () => {
    const md = trainingLogsToMarkdown([
      { id: 'a', date: '2025-01-02', note: 'second' },
      { id: 'b', date: '2025-01-01', note: 'first' },
    ])
    expect(md).toContain('## 2025-01-01')
    expect(md).toContain('first')
    expect(md).toContain('## 2025-01-02')
  })

  it('flags kinds that use daily logs (Notable only; Mastery is contentless)', () => {
    expect(kindUsesDailyLogs('shard')).toBe(false)
    expect(kindUsesDailyLogs('notable')).toBe(true)
    expect(kindUsesDailyLogs('mastery')).toBe(false)
    expect(kindUsesDailyLogs('voidMastery')).toBe(false)
    expect(kindUsesDailyLogs('connect')).toBe(false)
  })
})

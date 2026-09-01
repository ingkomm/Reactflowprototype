import { describe, expect, it } from 'vitest'
import {
  absorbNodeMediaIntoDailyLogs,
  extractDailyLogsFromNodeData,
  kindUsesDailyLogs,
} from './dailyLogNode'
import { createVideoMediaId } from './videoMedia'
import { DEFAULT_SYMBOL_ID } from './librarySymbols'
import type { PassiveNodeData } from './types'

describe('dailyLogNode', () => {
  it('extracts logs from small, notable, and mastery nodes', () => {
    const small: PassiveNodeData = {
      label: 'Small',
      kind: 'small',
      symbolId: DEFAULT_SYMBOL_ID,
      stages: [{ id: 's1', index: 1, label: '연습', goal: 9999, completedManually: false, logs: [{ id: 'l1', date: '2025-01-01' }] }],
    }
    expect(extractDailyLogsFromNodeData(small)).toHaveLength(1)

    const mastery: PassiveNodeData = {
      label: 'Mastery',
      kind: 'mastery',
      symbolId: DEFAULT_SYMBOL_ID,
      stages: [{ id: 's1', index: 1, label: '기록', goal: 9999, completedManually: false, logs: [{ id: 'l2', date: '2025-02-01', note: 'memo' }] }],
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

  it('flags kinds that use daily logs', () => {
    expect(kindUsesDailyLogs('small')).toBe(true)
    expect(kindUsesDailyLogs('notable')).toBe(true)
    expect(kindUsesDailyLogs('mastery')).toBe(true)
    expect(kindUsesDailyLogs('connect')).toBe(false)
  })
})

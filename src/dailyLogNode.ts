import type { PassiveKind, PassiveNodeData } from './types'
import {
  createDailyLog,
  formatPracticeDate,
  normalizeDailyLogs,
  sortedDailyLogs,
  upsertDailyLog,
} from './dailyLog'
import { ensureNotableStages, ensureSmallPracticeStages, uid } from './stage'

function offsetPracticeDate(daysFromToday: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  return formatPracticeDate(date)
}

export function extractDailyLogsFromNodeData(data: PassiveNodeData) {
  if (data.kind === 'small') {
    return sortedDailyLogs(ensureSmallPracticeStages(data.stages ?? [])[0]?.logs ?? [])
  }
  if (data.kind === 'notable') {
    return sortedDailyLogs(ensureNotableStages(data.stages ?? [])[0]?.logs ?? [])
  }
  if (data.kind === 'mastery' || data.kind === 'voidMastery') {
    return sortedDailyLogs((data.stages ?? []).flatMap((stage) => stage.logs))
  }
  return []
}

/** Move legacy node-level videos into daily logs and clear duplicate storage. */
export function absorbNodeMediaIntoDailyLogs(data: PassiveNodeData): PassiveNodeData {
  const orphanMedia = data.media ?? []
  const canStore =
    data.kind === 'small' ||
    data.kind === 'notable' ||
    data.kind === 'mastery' ||
    data.kind === 'voidMastery'

  if (!canStore) return data

  let logs = extractDailyLogsFromNodeData(data)
  let changed = orphanMedia.length > 0

  for (let i = 0; i < orphanMedia.length; i++) {
    const item = orphanMedia[i]!
    const note = item.note?.trim() || item.title?.trim()
    let placed = false
    for (let offset = -i; offset >= -i - orphanMedia.length && !placed; offset--) {
      const candidate = createDailyLog(offsetPracticeDate(offset), note, [item])
      const result = upsertDailyLog(logs, candidate)
      if (!result.error) {
        logs = result.logs
        placed = true
      }
    }
    if (!placed) {
      logs = normalizeDailyLogs([...logs, createDailyLog(formatPracticeDate(), note, [item])])
    }
  }

  if (!changed) return data

  const next: PassiveNodeData = { ...data, media: undefined }

  if (data.kind === 'small') {
    const stages = ensureSmallPracticeStages(data.stages ?? [])
    next.stages = [{ ...stages[0]!, logs }]
    return next
  }

  if (data.kind === 'notable') {
    const stages = ensureNotableStages(data.stages ?? [])
    next.stages = stages.map((stage, index) => (index === 0 ? { ...stage, logs } : stage))
    return next
  }

  const existing = data.stages?.[0]
  next.stages = [
    {
      id: existing?.id ?? uid('stage'),
      index: 1,
      label: existing?.label ?? '기록',
      goal: existing?.goal ?? 9999,
      completedManually: false,
      logs,
    },
  ]
  return next
}

export function nodeHasDailyLogs(data: PassiveNodeData): boolean {
  return extractDailyLogsFromNodeData(data).length > 0
}

export function kindUsesDailyLogs(kind: PassiveKind): boolean {
  return kind === 'small' || kind === 'notable' || kind === 'mastery' || kind === 'voidMastery'
}

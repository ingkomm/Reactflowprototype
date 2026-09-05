import type { PassiveKind, PassiveNodeData, TrainingLog, VideoMedia } from './types'
import {
  createDailyLog,
  formatPracticeDate,
  normalizeDailyLogs,
  sortedDailyLogs,
  upsertDailyLog,
} from './dailyLog'
import { ensureNotableStages } from './stage'

function offsetPracticeDate(daysFromToday: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  return formatPracticeDate(date)
}

export function extractDailyLogsFromNodeData(data: PassiveNodeData) {
  if (data.kind === 'notable') {
    return sortedDailyLogs(ensureNotableStages(data.stages ?? [])[0]?.logs ?? [])
  }
  if (data.kind === 'mastery' || data.kind === 'voidMastery') {
    return sortedDailyLogs((data.stages ?? []).flatMap((stage) => stage.logs))
  }
  return []
}

/** Flatten legacy training logs into a single markdown document (Small → Shard migration). */
export function trainingLogsToMarkdown(logs: TrainingLog[]): string {
  const blocks: string[] = []
  for (const log of sortedDailyLogs(logs)) {
    const parts: string[] = [`## ${log.date}`]
    if (log.note?.trim()) parts.push(log.note.trim())
    for (const media of log.media ?? []) {
      const label = media.title?.trim() || media.url
      parts.push(`- [${label}](${media.url})`)
    }
    blocks.push(parts.join('\n\n'))
  }
  return blocks.join('\n\n').trim()
}

function appendMediaToMarkdown(markdown: string | undefined, media: VideoMedia[]): string {
  const lines = media.map((item) => {
    const label = item.title?.trim() || item.note?.trim() || item.url
    return `- [${label}](${item.url})`
  })
  const chunk = lines.join('\n')
  if (!chunk) return markdown?.trim() ?? ''
  if (!markdown?.trim()) return chunk
  return `${markdown.trim()}\n\n${chunk}`
}

/** Move legacy node-level videos into daily logs (or Shard markdown) and clear duplicate storage. */
export function absorbNodeMediaIntoDailyLogs(data: PassiveNodeData): PassiveNodeData {
  const orphanMedia = data.media ?? []
  if (orphanMedia.length === 0) {
    if (data.kind === 'shard') {
      return { ...data, stages: [], media: undefined }
    }
    return data
  }

  if (data.kind === 'shard') {
    return {
      ...data,
      stages: [],
      media: undefined,
      markdown: appendMediaToMarkdown(data.markdown, orphanMedia),
    }
  }

  // Mastery stays contentless in the UI, but never convert or clear legacy media/stages.
  if (data.kind === 'mastery' || data.kind === 'voidMastery') {
    return data
  }

  if (data.kind !== 'notable') return { ...data, media: undefined }

  let logs = extractDailyLogsFromNodeData(data)

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

  const stages = ensureNotableStages(data.stages ?? [])
  return {
    ...data,
    media: undefined,
    stages: stages.map((stage, index) => (index === 0 ? { ...stage, logs } : stage)),
  }
}

export function nodeHasDailyLogs(data: PassiveNodeData): boolean {
  return extractDailyLogsFromNodeData(data).length > 0
}

/** Runtime Daily Log editing/viewing is Notable-only. Mastery is a contentless center. */
export function kindUsesDailyLogs(kind: PassiveKind): boolean {
  return kind === 'notable'
}

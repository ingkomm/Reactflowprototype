import type { StageData, TrainingLog, VideoMedia } from './types'
import { createLogId } from './ids'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/


export function formatPracticeDate(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isValidPracticeDate(value: string): boolean {
  return DATE_RE.test(value.trim())
}

export function createDailyLog(
  date: string = formatPracticeDate(),
  note?: string,
  media?: VideoMedia[],
): TrainingLog {
  const log: TrainingLog = {
    id: createLogId(),
    date: date.trim(),
  }
  const trimmedNote = note?.trim()
  if (trimmedNote) log.note = trimmedNote
  if (media?.length) log.media = media
  return log
}

function legacyDateFromLog(raw: Record<string, unknown>): string | null {
  if (typeof raw.date === 'string' && isValidPracticeDate(raw.date)) {
    return raw.date.trim()
  }
  if (typeof raw.label === 'string' && isValidPracticeDate(raw.label)) {
    return raw.label.trim()
  }
  return null
}

function legacyNoteFromLog(raw: Record<string, unknown>, resolvedDate: string): string | undefined {
  if (typeof raw.note === 'string' && raw.note.trim()) return raw.note.trim()
  if (typeof raw.label === 'string') {
    const label = raw.label.trim()
    if (label && label !== resolvedDate && !isValidPracticeDate(label)) return label
  }
  return undefined
}

/** Convert one legacy log entry into daily logs without dropping memo, media, or day count. */
export function migrateLegacyTrainingLogs(value: unknown): TrainingLog[] {
  if (!value || typeof value !== 'object') return []
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !raw.id.trim()) return []

  const date = legacyDateFromLog(raw) ?? formatPracticeDate()
  const note = legacyNoteFromLog(raw, date)
  const media = Array.isArray(raw.media) ? (raw.media as VideoMedia[]) : undefined
  const count =
    typeof raw.count === 'number' && Number.isFinite(raw.count)
      ? Math.max(1, Math.floor(raw.count))
      : 1

  if (count <= 1) {
    const log = createDailyLog(date, note, media)
    log.id = raw.id.trim()
    return [log]
  }

  const end = new Date(`${date}T12:00:00`)
  const logs: TrainingLog[] = []
  for (let i = 0; i < count; i++) {
    const day = new Date(end)
    day.setDate(day.getDate() - (count - 1 - i))
    const dayStr = formatPracticeDate(day)
    logs.push({
      id: i === count - 1 ? raw.id.trim() : createLogId(),
      date: dayStr,
      ...(i === count - 1 && note ? { note } : {}),
      ...(i === count - 1 && media?.length ? { media } : {}),
    })
  }
  return logs
}

/** @deprecated Use migrateLegacyTrainingLogs */
export function migrateLegacyTrainingLog(value: unknown): TrainingLog | null {
  return migrateLegacyTrainingLogs(value)[0] ?? null
}

/**
 * @deprecated Same-date logs are kept as separate entries. Do not use for normalize/import.
 * Kept only for older call sites/tests that explicitly request merge behavior.
 */
export function mergeLogsByDate(logs: TrainingLog[]): TrainingLog[] {
  const byDate = new Map<string, TrainingLog>()
  for (const log of logs) {
    const existing = byDate.get(log.date)
    if (!existing) {
      byDate.set(log.date, log)
      continue
    }
    const notes = [existing.note, log.note].filter(Boolean) as string[]
    const mergedNote = notes.length > 0 ? [...new Set(notes)].join('\n') : undefined
    const media = [...(existing.media ?? []), ...(log.media ?? [])]
    const seen = new Set<string>()
    const mergedMedia = media.filter((item) => {
      const key = item.url
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    byDate.set(log.date, {
      id: existing.id,
      date: existing.date,
      ...(mergedNote ? { note: mergedNote } : {}),
      ...(mergedMedia.length > 0 ? { media: mergedMedia } : {}),
    })
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/** Trim dates and sort; never merges same-date logs. */
export function normalizeDailyLogs(logs: TrainingLog[]): TrainingLog[] {
  return sortedDailyLogs(logs.map((log) => ({ ...log, date: log.date.trim() })))
}

/** Practice days = unique calendar dates (not log count). */
export function countPracticeDays(logs: TrainingLog[]): number {
  return new Set(logs.map((log) => log.date)).size
}

export function countPracticeDaysInStages(stages: StageData[]): number {
  return countPracticeDays(stages.flatMap((stage) => stage.logs))
}

/** @deprecated Same-date logs are allowed; always returns false. */
export function hasDateConflict(
  _logs: TrainingLog[],
  _date: string,
  _excludeId?: string,
): boolean {
  return false
}

/** Newest date first; same-date entries keep their relative input order. */
export function sortedDailyLogs(logs: TrainingLog[]): TrainingLog[] {
  return logs
    .map((log, index) => ({ log, index }))
    .sort((a, b) => {
      const byDate = b.log.date.localeCompare(a.log.date)
      return byDate !== 0 ? byDate : a.index - b.index
    })
    .map(({ log }) => log)
}

export function upsertDailyLog(
  logs: TrainingLog[],
  entry: TrainingLog,
): { logs: TrainingLog[]; error?: string } {
  if (!isValidPracticeDate(entry.date)) {
    return { logs, error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).' }
  }
  const next = logs.some((log) => log.id === entry.id)
    ? logs.map((log) => (log.id === entry.id ? entry : log))
    : [...logs, entry]
  return { logs: normalizeDailyLogs(next) }
}

export function removeDailyLog(logs: TrainingLog[], logId: string): TrainingLog[] {
  return logs.filter((log) => log.id !== logId)
}

export function memoPreview(note: string, maxLength = 72): string {
  const trimmed = note.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1)}…`
}

export function recentDailyLogs(logs: TrainingLog[], limit = 5): TrainingLog[] {
  return sortedDailyLogs(logs).slice(0, limit)
}

/** @deprecated Use recentDailyLogs */
export function recentPracticeLogs(logs: TrainingLog[], limit = 5): TrainingLog[] {
  return recentDailyLogs(logs, limit)
}

export function dailyLogSummary(log: TrainingLog): string {
  if (log.note?.trim()) return memoPreview(log.note)
  if (log.media?.[0]?.url) return log.media[0].title || '동영상 기록'
  return '날짜 기록'
}

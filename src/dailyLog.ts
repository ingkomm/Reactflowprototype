import type { StageData, TrainingLog, VideoMedia } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

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
    id: uid('log'),
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
      id: i === count - 1 ? raw.id.trim() : uid('log'),
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

function mergeTwoLogs(a: TrainingLog, b: TrainingLog): TrainingLog {
  const notes = [a.note, b.note].filter(Boolean) as string[]
  const mergedNote = notes.length > 0 ? [...new Set(notes)].join('\n') : undefined
  const media = [...(a.media ?? []), ...(b.media ?? [])]
  const seen = new Set<string>()
  const mergedMedia = media.filter((item) => {
    const key = item.url
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    id: a.id,
    date: a.date,
    ...(mergedNote ? { note: mergedNote } : {}),
    ...(mergedMedia.length > 0 ? { media: mergedMedia } : {}),
  }
}

/** One log per date; later entries merge memo/media into the first. */
export function mergeLogsByDate(logs: TrainingLog[]): TrainingLog[] {
  const byDate = new Map<string, TrainingLog>()
  for (const log of logs) {
    const existing = byDate.get(log.date)
    byDate.set(log.date, existing ? mergeTwoLogs(existing, log) : log)
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function normalizeDailyLogs(logs: TrainingLog[]): TrainingLog[] {
  return mergeLogsByDate(logs.map((log) => ({ ...log, date: log.date.trim() })))
}

export function countPracticeDays(logs: TrainingLog[]): number {
  return new Set(logs.map((log) => log.date)).size
}

export function countPracticeDaysInStages(stages: StageData[]): number {
  return countPracticeDays(stages.flatMap((stage) => stage.logs))
}

export function hasDateConflict(logs: TrainingLog[], date: string, excludeId?: string): boolean {
  const target = date.trim()
  return logs.some((log) => log.date === target && log.id !== excludeId)
}

export function sortedDailyLogs(logs: TrainingLog[]): TrainingLog[] {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date))
}

export function upsertDailyLog(
  logs: TrainingLog[],
  entry: TrainingLog,
): { logs: TrainingLog[]; error?: string } {
  if (!isValidPracticeDate(entry.date)) {
    return { logs, error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).' }
  }
  if (hasDateConflict(logs, entry.date, entry.id)) {
    return { logs, error: '같은 날짜의 기록이 이미 있습니다.' }
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

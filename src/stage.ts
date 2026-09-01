import type { PassiveKind, PassiveNodeData, StageData, TrainingLog } from './types'
import { DEFAULT_STAGE_GOAL } from './types'

export function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function formatPracticeDate(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function createTrainingLog(label = 'Session', count = 1, date?: string): TrainingLog {
  const sessionDate = date ?? formatPracticeDate()
  return {
    id: uid('log'),
    label: label === 'Session' ? sessionDate : label,
    count: Math.max(0, count),
    date: sessionDate,
  }
}

/** One practice session log with today's date. */
export function createPracticeSessionLog(count = 1): TrainingLog {
  const date = formatPracticeDate()
  return createTrainingLog(date, count, date)
}

export function kindUsesPracticeLogs(kind: PassiveKind): boolean {
  return kind === 'small' || kind === 'notable'
}

/** Small nodes use a single open-ended practice stage. */
export function ensureSmallPracticeStages(stages: StageData[]): StageData[] {
  if (stages.length > 0) {
    return stages.map(withNormalizedStage)
  }
  return [createStage(1, '연습', 9999, [])]
}

/** Append one practice session (+1) for Small or Notable nodes. */
export function addPracticeSession(stages: StageData[], kind: PassiveKind): StageData[] {
  if (kind === 'notable') {
    const next = ensureNotableStages(stages)
    const pool = next[0]!
    return next.map((s, i) =>
      i === 0 ? { ...pool, logs: [...pool.logs, createPracticeSessionLog(1)] } : s,
    )
  }
  if (kind === 'small') {
    const next = ensureSmallPracticeStages(stages)
    const pool = next[0]!
    return [{ ...pool, logs: [...pool.logs, createPracticeSessionLog(1)] }]
  }
  return stages
}

export function createStage(
  index: number,
  label?: string,
  goal = DEFAULT_STAGE_GOAL,
  logs: TrainingLog[] = [],
): StageData {
  return {
    id: uid('stage'),
    index,
    label: label ?? `단계 ${index}`,
    goal: Math.max(1, Math.floor(goal)),
    completedManually: false,
    logs: logs.map((log) => ({
      ...log,
      count: Math.max(0, Number.isFinite(log.count) ? log.count : 0),
    })),
  }
}

/** Notable cumulative band sizes (inner → outer): 3 → 5 → 7. */
export const NOTABLE_BAND_GOALS = [3, 5, 7] as const

export function kindUsesTrainingBands(kind: PassiveKind): boolean {
  return kind === 'notable'
}

/** Uncapped sum of all log counts (logs are never trimmed by the goal). */
export function stageRawLoggedCount(stage: StageData): number {
  return stage.logs.reduce(
    (sum, log) => sum + (Number.isFinite(log.count) ? Math.max(0, log.count) : 0),
    0,
  )
}

/** Progress toward the band fill — capped at the stage goal. */
export function stageLoggedCount(stage: StageData): number {
  return Math.min(stageRawLoggedCount(stage), Math.max(1, stage.goal))
}

export function isStageComplete(stage: StageData): boolean {
  return stage.completedManually || stageRawLoggedCount(stage) >= stage.goal
}

/** Normalize goal only; keep every training log intact. */
export function withNormalizedStage(stage: StageData): StageData {
  const goal = Math.max(1, Math.floor(stage.goal))
  return {
    ...stage,
    goal,
    logs: stage.logs.map((log) => ({
      ...log,
      count: Math.max(0, Number.isFinite(log.count) ? log.count : 0),
    })),
  }
}

/** @deprecated Use withNormalizedStage — logs are no longer clamped away. */
export function withClampedStage(stage: StageData): StageData {
  return withNormalizedStage(stage)
}

export function sortedStages(stages: StageData[]): StageData[] {
  return [...stages].sort((a, b) => a.index - b.index)
}

export function completedStageCount(stages: StageData[]): number {
  return stages.filter(isStageComplete).length
}

/** Total training count across all stage logs (Notable cumulative pool). */
export function totalRawLoggedAcrossStages(stages: StageData[]): number {
  return stages.reduce((sum, s) => sum + stageRawLoggedCount(s), 0)
}

export function totalLoggedAcrossStages(stages: StageData[]): number {
  return stages.reduce((sum, s) => sum + stageLoggedCount(s), 0)
}

/**
 * Build Notable's fixed 3/5/7 bands from a single cumulative total.
 * All session logs are kept on band 1; fill amounts are derived from the sum.
 */
export function createNotableStages(totalLogged = 0, logs: TrainingLog[] = []): StageData[] {
  const safeTotal = Math.max(0, Math.floor(totalLogged))
  const poolLogs =
    logs.length > 0
      ? logs
      : safeTotal > 0
        ? [createTrainingLog('Session', safeTotal)]
        : []

  return NOTABLE_BAND_GOALS.map((goal, i) =>
    createStage(i + 1, `밴드 ${goal}`, goal, i === 0 ? poolLogs : []),
  )
}

/** Ensure Notable always has exactly the 3/5/7 band scaffold; logs stay in the pool (band 1). */
export function ensureNotableStages(stages: StageData[]): StageData[] {
  const ordered = sortedStages(stages)
  const poolLogs = ordered.flatMap((s) => s.logs)
  const total = poolLogs.reduce(
    (sum, log) => sum + (Number.isFinite(log.count) ? Math.max(0, log.count) : 0),
    0,
  )
  if (
    ordered.length === NOTABLE_BAND_GOALS.length &&
    ordered.every((s, i) => s.goal === NOTABLE_BAND_GOALS[i])
  ) {
    return ordered.map((s, i) =>
      i === 0
        ? { ...s, logs: poolLogs, goal: NOTABLE_BAND_GOALS[0]!, completedManually: false }
        : { ...s, logs: [], goal: NOTABLE_BAND_GOALS[i]!, completedManually: false },
    )
  }
  return createNotableStages(total, poolLogs)
}

/** Per-band filled segment counts from cumulative total (never a solid ring). */
export function notableBandFills(totalLogged: number): number[] {
  let remaining = Math.max(0, totalLogged)
  return NOTABLE_BAND_GOALS.map((goal) => {
    const fill = Math.min(goal, remaining)
    remaining = Math.max(0, remaining - goal)
    return fill
  })
}

/** How many Notable band rings to render (hide outer until inner is full). */
export function visibleNotableBandCount(totalLogged: number): number {
  const fills = notableBandFills(totalLogged)
  for (let i = 0; i < NOTABLE_BAND_GOALS.length; i++) {
    if (fills[i]! < NOTABLE_BAND_GOALS[i]!) return i + 1
  }
  return NOTABLE_BAND_GOALS.length
}

export function isNotableBandComplete(totalLogged: number, bandIndex0: number): boolean {
  const fills = notableBandFills(totalLogged)
  const goal = NOTABLE_BAND_GOALS[bandIndex0]
  if (goal == null) return false
  return fills[bandIndex0]! >= goal
}

/** First Notable band (3) complete → can relay power. */
export function canNotableTransmit(stages: StageData[]): boolean {
  return totalRawLoggedAcrossStages(stages) >= NOTABLE_BAND_GOALS[0]!
}

/** Fractional glow level from stage completion + in-progress fill. */
export function stageBandLevel(stages: StageData[]): number {
  if (stages.length === 0) return 0
  const total = totalRawLoggedAcrossStages(stages)
  if (stages.length === NOTABLE_BAND_GOALS.length && stages.every((s, i) => s.goal === NOTABLE_BAND_GOALS[i])) {
    const fills = notableBandFills(total)
    return fills.reduce((sum, fill, i) => sum + fill / NOTABLE_BAND_GOALS[i]!, 0)
  }
  let level = 0
  for (const stage of stages) {
    if (isStageComplete(stage)) {
      level += 1
    } else {
      level += stageLoggedCount(stage) / Math.max(1, stage.goal)
    }
  }
  return level
}

export function defaultStagesForSeed(
  entries: { label: string; goal: number; logged: number }[],
): StageData[] {
  return entries.map((entry, i) => {
    const logs: TrainingLog[] = []
    let remaining = entry.logged
    let n = 1
    while (remaining > 0) {
      const chunk = Math.min(remaining, Math.max(1, Math.ceil(entry.goal / 3)))
      logs.push(createTrainingLog(`${entry.label} #${n}`, chunk))
      remaining -= chunk
      n += 1
    }
    return createStage(i + 1, entry.label, entry.goal, logs)
  })
}

/** Seed helper: one cumulative total → Notable 3/5/7 bands. */
export function notableStagesFromTotal(totalLogged: number): StageData[] {
  return createNotableStages(totalLogged)
}

export function stagesForKind(kind: PassiveKind, existing?: StageData[]): StageData[] {
  if (!kindUsesTrainingBands(kind)) return []
  return ensureNotableStages(existing ?? [])
}

export function nodeHasVisibleBands(data: PassiveNodeData, nodePowered: boolean): boolean {
  if (!nodePowered) return false
  if (!kindUsesTrainingBands(data.kind)) return false
  return (data.stages?.length ?? 0) > 0
}

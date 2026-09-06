import type { PassiveKind, PassiveNodeData, StageData, TrainingLog } from './types'
import { DEFAULT_STAGE_GOAL } from './types'
import {
  countPracticeEntriesInStages,
  createDailyLog,
  normalizeDailyLogs,
} from './dailyLog'
import { createStageId } from './ids'

export { formatPracticeDate } from './dailyLog'
export { createDailyLog, countPracticeEntriesInStages } from './dailyLog'

export function uid(_prefix?: string) {
  return createStageId()
}

export function kindUsesPracticeLogs(kind: PassiveKind): boolean {
  return kind === 'notable'
}

function normalizeStageLogs(logs: TrainingLog[]): TrainingLog[] {
  return normalizeDailyLogs(logs)
}


export function createStage(
  index: number,
  label?: string,
  goal = DEFAULT_STAGE_GOAL,
  logs: TrainingLog[] = [],
): StageData {
  return {
    id: createStageId(),
    index,
    label: label ?? `단계 ${index}`,
    goal: Math.max(1, Math.floor(goal)),
    completedManually: false,
    logs: normalizeStageLogs(logs),
  }
}

/** Persisted Notable band scaffold (inner → outer). Runtime may show 9,11,... as UI-only rings. */
export const NOTABLE_BAND_GOALS = [3, 5, 7] as const

export function kindUsesTrainingBands(kind: PassiveKind): boolean {
  return kind === 'notable'
}

/** Log entries in this stage (not log entry counts). */
export function stageRawLoggedCount(stage: StageData): number {
  return stage.logs.length
}

/** Progress toward the band fill — capped at the stage goal. */
export function stageLoggedCount(stage: StageData): number {
  return Math.min(stageRawLoggedCount(stage), Math.max(1, stage.goal))
}

export function isStageComplete(stage: StageData): boolean {
  return stage.completedManually || stageRawLoggedCount(stage) >= stage.goal
}

/** Normalize goal only; keep every daily log intact. */
export function withNormalizedStage(stage: StageData): StageData {
  const goal = Math.max(1, Math.floor(stage.goal))
  return {
    ...stage,
    goal,
    logs: normalizeStageLogs(stage.logs),
  }
}


export function sortedStages(stages: StageData[]): StageData[] {
  return [...stages].sort((a, b) => a.index - b.index)
}

export function completedStageCount(stages: StageData[]): number {
  return stages.filter(isStageComplete).length
}

/** Total practice entries across all stage logs (Notable cumulative pool). */
export function totalRawLoggedAcrossStages(stages: StageData[]): number {
  return countPracticeEntriesInStages(stages)
}

export function totalLoggedAcrossStages(stages: StageData[]): number {
  return stages.reduce((sum, s) => sum + stageLoggedCount(s), 0)
}

/**
 * Build Notable's fixed 3/5/7 bands from practice entry logs.
 * All logs are kept on band 1; fill amounts are derived from the entry count.
 */
export function createNotableStages(entryCount = 0, logs: TrainingLog[] = []): StageData[] {
  const poolLogs = normalizeStageLogs(
    logs.length > 0
      ? logs
      : entryCount > 0
        ? Array.from({ length: entryCount }, (_, i) =>
            createDailyLog(`1970-01-${String(i + 1).padStart(2, '0')}`),
          )
        : [],
  )

  return NOTABLE_BAND_GOALS.map((goal, i) =>
    createStage(i + 1, `밴드 ${goal}`, goal, i === 0 ? poolLogs : []),
  )
}

/** Ensure Notable always has exactly the 3/5/7 band scaffold; logs stay in the pool (band 1). */
export function ensureNotableStages(stages: StageData[]): StageData[] {
  const ordered = sortedStages(stages)
  const poolLogs = normalizeStageLogs(ordered.flatMap((s) => s.logs))
  const total = poolLogs.length
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

/** Persisted Notable scaffold goals remain [3,5,7]. Runtime/UI may extend 9,11,13,... */
export function notableBandGoalAt(index: number): number {
  return 3 + 2 * index
}

export type DynamicNotableBands = {
  goals: number[]
  fills: number[]
}

/**
 * Dynamic Notable bands from practice entry count.
 * Persisted StageData stays [3,5,7]; extended rings are UI-only.
 * Next ring appears only after previous rings are full and progress continues.
 */
export function computeDynamicNotableBands(entryCount: number): DynamicNotableBands {
  let remaining = Math.max(0, Math.floor(entryCount))
  const goals: number[] = []
  const fills: number[] = []
  let i = 0
  while (true) {
    const goal = notableBandGoalAt(i)
    const fill = Math.min(goal, remaining)
    remaining -= fill
    if (i < NOTABLE_BAND_GOALS.length) {
      goals.push(goal)
      fills.push(fill)
      i += 1
      continue
    }
    if (fill <= 0) break
    goals.push(goal)
    fills.push(fill)
    i += 1
    if (fill < goal) break
  }
  return { goals, fills }
}

/** Per-band filled segment counts from cumulative practice entries (never a solid ring). */
export function notableBandFills(totalLogged: number): number[] {
  return computeDynamicNotableBands(totalLogged).fills
}

export function notableBandGoalsForCount(totalLogged: number): number[] {
  return computeDynamicNotableBands(totalLogged).goals
}

/** How many Notable band rings to render (hide outer until inner is full). */
export function visibleNotableBandCount(totalLogged: number): number {
  const { goals, fills } = computeDynamicNotableBands(totalLogged)
  for (let i = 0; i < fills.length; i++) {
    if (fills[i]! < goals[i]!) return i + 1
  }
  return fills.length
}

export function isNotableBandComplete(totalLogged: number, bandIndex0: number): boolean {
  const { goals, fills } = computeDynamicNotableBands(totalLogged)
  const goal = goals[bandIndex0]
  if (goal == null) return false
  return fills[bandIndex0]! >= goal
}


/** Fractional glow level from stage completion + in-progress fill. */
export function stageBandLevel(stages: StageData[]): number {
  if (stages.length === 0) return 0
  const total = totalRawLoggedAcrossStages(stages)
  if (stages.length === NOTABLE_BAND_GOALS.length && stages.every((s, i) => s.goal === NOTABLE_BAND_GOALS[i])) {
    const { goals, fills } = computeDynamicNotableBands(total)
    return fills.reduce((sum, fill, i) => sum + fill / goals[i]!, 0)
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
    const logs = Array.from({ length: Math.max(0, entry.logged) }, (_, n) =>
      createDailyLog(`2024-01-${String(n + 1).padStart(2, '0')}`, entry.label),
    )
    return createStage(i + 1, entry.label, entry.goal, logs)
  })
}

/** Seed helper: practice entry total → Notable 3/5/7 bands. */
export function notableStagesFromTotal(totalLogged: number): StageData[] {
  return createNotableStages(totalLogged)
}

export function stagesForKind(kind: PassiveKind, existing?: StageData[]): StageData[] {
  if (kind === 'shard') return []
  if (kindUsesTrainingBands(kind)) return ensureNotableStages(existing ?? [])
  // Mastery is contentless at runtime, but preserve legacy stages on load/import.
  if (kind === 'mastery' || kind === 'voidMastery') return existing ?? []
  return []
}

export function nodeHasVisibleBands(data: PassiveNodeData, nodePowered: boolean): boolean {
  if (!nodePowered) return false
  if (!kindUsesTrainingBands(data.kind)) return false
  return (data.stages?.length ?? 0) > 0
}


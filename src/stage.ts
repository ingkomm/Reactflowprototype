import type { StageData, TrainingLog } from './types'
import { DEFAULT_STAGE_GOAL } from './types'

export function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function createTrainingLog(label = 'Session', count = 1): TrainingLog {
  return { id: uid('log'), label, count: Math.max(0, count) }
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

export function totalLoggedAcrossStages(stages: StageData[]): number {
  return stages.reduce((sum, s) => sum + stageLoggedCount(s), 0)
}

/** Fractional glow level from stage completion + in-progress fill. */
export function stageBandLevel(stages: StageData[]): number {
  if (stages.length === 0) return 0
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

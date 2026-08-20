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
    logs: clampStageLogs(logs, Math.max(1, Math.floor(goal))),
  }
}

/** Sum of log counts, never exceeding the stage goal. */
export function stageLoggedCount(stage: StageData): number {
  const raw = stage.logs.reduce(
    (sum, log) => sum + (Number.isFinite(log.count) ? Math.max(0, log.count) : 0),
    0,
  )
  return Math.min(raw, Math.max(1, stage.goal))
}

export function isStageComplete(stage: StageData): boolean {
  return stage.completedManually || stageLoggedCount(stage) >= stage.goal
}

/** Drop / trim logs so total recorded count never exceeds goal. */
export function clampStageLogs(logs: TrainingLog[], goal: number): TrainingLog[] {
  const cap = Math.max(1, goal)
  const next: TrainingLog[] = []
  let used = 0
  for (const log of logs) {
    if (used >= cap) break
    const count = Math.max(0, Number.isFinite(log.count) ? log.count : 0)
    if (count <= 0) {
      next.push({ ...log, count: 0 })
      continue
    }
    const allowed = Math.min(count, cap - used)
    next.push({ ...log, count: allowed })
    used += allowed
  }
  return next
}

export function withClampedStage(stage: StageData): StageData {
  const goal = Math.max(1, Math.floor(stage.goal))
  return {
    ...stage,
    goal,
    logs: clampStageLogs(stage.logs, goal),
  }
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
    let remaining = Math.min(entry.logged, entry.goal)
    let n = 1
    while (remaining > 0) {
      const chunk = Math.min(remaining, Math.max(1, Math.ceil(entry.goal / 3)))
      logs.push(createTrainingLog(`${entry.label} #${n}`, chunk))
      remaining -= chunk
      n += 1
    }
    const stage = createStage(i + 1, entry.label, entry.goal, logs)
    if (entry.logged >= entry.goal) {
      return { ...stage, completedManually: false }
    }
    return stage
  })
}

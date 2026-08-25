import type { PassiveFlowNode } from '../components/PassiveNode'
import { createPassiveData } from './nodeData'
import { uid } from '../stage'
import type { PassiveNodeData, StageData } from '../types'
import { isMasteryKind } from '../kinds'
import { DEFAULT_ORBIT_START_ANGLE } from '../orbit'

export type NodeClipboard = {
  data: PassiveNodeData
  position: { x: number; y: number }
}

export function cloneStagesWithNewIds(stages: StageData[]): StageData[] {
  return stages.map((stage) => ({
    ...stage,
    id: uid('stage'),
    logs: stage.logs.map((log) => ({ ...log, id: uid('log') })),
  }))
}

/** Append `_N` using the next free number for this exact title stem. */
export function nextCopyLabel(baseLabel: string, existingLabels: Iterable<string>): string {
  const escaped = baseLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}_(\\d+)$`)
  let max = 0
  for (const label of existingLabels) {
    const match = label.match(re)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${baseLabel}_${max + 1}`
}

export function buildPastedNode(
  clipboard: NodeClipboard,
  label: string,
  offsetIndex: number,
): PassiveFlowNode {
  const source = clipboard.data
  const kind = source.kind
  const stages = cloneStagesWithNewIds(source.stages ?? [])
  const data = createPassiveData(kind, label, {
    stages,
    classId: source.classId,
    ...(isMasteryKind(kind)
      ? {
          orbitStartAngle: source.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitOrder: [],
          orbitTierCount: source.orbitTierCount ?? 1,
        }
      : kind === 'connect'
        ? { connectEnabled: source.connectEnabled ?? true }
        : { masteryId: null, orbitTier: 1 }),
  })

  return {
    id: uid(kind),
    type: 'passive',
    position: {
      x: clipboard.position.x + offsetIndex * 36,
      y: clipboard.position.y + offsetIndex * 36,
    },
    dragHandle: '.node-drag-handle',
    draggable: true,
    data,
  }
}

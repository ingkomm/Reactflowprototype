import type { Edge } from '@xyflow/react'
import type { PassiveKind, PassiveNodeData } from './types'
import { DEFAULT_CLASS_ID_BY_KIND } from './passiveClass'
import { createStage } from './stage'
import {
  DEFAULT_ORBIT_START_ANGLE,
  isMasteryKind,
  isStealthPassiveKind,
} from './orbit'

/** Build default `PassiveNodeData` for a new node. */
export function createPassiveData(
  kind: PassiveKind,
  label: string,
  extras: Partial<
    Pick<
      PassiveNodeData,
      | 'orbitTierCount'
      | 'orbitStartAngle'
      | 'orbitStartAngleByTier'
      | 'orbitOrder'
      | 'orbitOrderByTier'
      | 'orbitLocked'
      | 'masteryId'
      | 'orbitTier'
      | 'voidPassing'
      | 'classId'
      | 'stages'
    >
  > = {},
): PassiveNodeData {
  return {
    label,
    kind,
    stages:
      extras.stages ??
      (kind === 'initial' || isStealthPassiveKind(kind) ? [] : [createStage(1)]),
    classId: extras.classId ?? DEFAULT_CLASS_ID_BY_KIND[kind],
    ...(isMasteryKind(kind)
      ? {
          orbitStartAngle: extras.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitStartAngleByTier: extras.orbitStartAngleByTier,
          orbitOrder: extras.orbitOrder ?? [],
          orbitOrderByTier: extras.orbitOrderByTier,
          orbitLocked: extras.orbitLocked ?? false,
          orbitTierCount: extras.orbitTierCount ?? 1,
        }
      : kind === 'void'
        ? {
            masteryId: extras.masteryId ?? null,
            voidPassing: extras.voidPassing ?? false,
            orbitTier: extras.orbitTier ?? 1,
          }
        : kind === 'initial'
          ? {}
          : {
              masteryId: extras.masteryId ?? null,
              orbitTier: extras.orbitTier ?? 1,
            }),
  }
}

export function passiveLinkEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `link-${sourceId}-${targetId}`,
    type: 'center',
    source: sourceId,
    target: targetId,
    sourceHandle: 'center',
    targetHandle: 'center-target',
  }
}

export function orbitLinkEdge(sourceId: string, targetId: string, masteryId: string): Edge {
  return {
    id: `orbit-${sourceId}-${targetId}`,
    type: 'orbit',
    source: sourceId,
    target: targetId,
    data: { masteryId },
    zIndex: 1,
  }
}

/** Clockwise ring links between adjacent ids in `order`. */
export function orbitAdjacentEdges(order: string[], masteryId: string): Edge[] {
  if (order.length < 2) return []
  return order.map((id, i) => {
    const next = order[(i + 1) % order.length]!
    return orbitLinkEdge(id, next, masteryId)
  })
}

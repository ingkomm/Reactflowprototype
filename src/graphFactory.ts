import type { Edge } from '@xyflow/react'
import type { PassiveKind, PassiveNodeData } from './types'
import { DEFAULT_SYMBOL_ID_BY_KIND } from './librarySymbols'
import { stagesForKind } from './stage'
import {
  DEFAULT_ORBIT_START_ANGLE,
  DEFAULT_ORBIT_TIER_CAPACITY,
  isMasteryKind,
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
      | 'orbitCapacityByTier'
      | 'orbitLocked'
      | 'masteryId'
      | 'orbitTier'
      | 'orbitSlot'
      | 'voidPassing'
      | 'initialSlot'
      | 'connectEnabled'
      | 'symbolId'
      | 'stages'
    >
  > = {},
): PassiveNodeData {
  const resolvedKind = kind === 'voidMastery' ? 'mastery' : kind
  return {
    label,
    kind: resolvedKind,
    stages: extras.stages ?? stagesForKind(resolvedKind),
    symbolId: extras.symbolId ?? DEFAULT_SYMBOL_ID_BY_KIND[resolvedKind],
    ...(isMasteryKind(resolvedKind)
      ? {
          orbitStartAngle: extras.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitStartAngleByTier: extras.orbitStartAngleByTier,
          orbitOrder: extras.orbitOrder ?? [],
          orbitOrderByTier: extras.orbitOrderByTier,
          orbitCapacityByTier: extras.orbitCapacityByTier ?? {
            1: DEFAULT_ORBIT_TIER_CAPACITY,
          },
          orbitLocked: extras.orbitLocked ?? false,
          orbitTierCount: extras.orbitTierCount ?? 1,
        }
      : resolvedKind === 'void'
        ? {
            masteryId: extras.masteryId ?? null,
            voidPassing: extras.voidPassing ?? false,
            orbitTier: extras.orbitTier ?? 1,
          }
        : resolvedKind === 'initial'
          ? {}
          : resolvedKind === 'connect'
            ? {
                connectEnabled: extras.connectEnabled ?? true,
                initialSlot: extras.initialSlot,
              }
            : {
                masteryId: extras.masteryId ?? null,
                orbitTier: extras.orbitTier ?? 1,
                orbitSlot: extras.orbitSlot,
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

export function notableLinkEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `notable-${sourceId}-${targetId}`,
    type: 'notable',
    source: sourceId,
    target: targetId,
    sourceHandle: 'center',
    targetHandle: 'center-target',
    zIndex: 0,
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

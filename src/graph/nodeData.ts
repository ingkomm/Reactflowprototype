import type { PassiveKind, PassiveNodeData } from '../types'
import { DEFAULT_CLASS_ID_BY_KIND } from '../passiveClass'
import { stagesForKind } from '../stage'
import { isMasteryKind, isOrbitMemberKind } from '../kinds'
import { DEFAULT_ORBIT_START_ANGLE, DEFAULT_ORBIT_TIER_CAPACITY } from '../orbit'

type NodeDataExtras = Partial<
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
    | 'connectEnabled'
    | 'classId'
    | 'stages'
  >
>

/** Kind-specific fields. Adding a kind should only require a new branch here. */
function fieldsForKind(kind: PassiveKind, extras: NodeDataExtras): Partial<PassiveNodeData> {
  if (isMasteryKind(kind)) {
    return {
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
  }
  if (kind === 'connect') {
    return { connectEnabled: extras.connectEnabled ?? true }
  }
  if (kind === 'initial') {
    return {}
  }
  return {
    masteryId: extras.masteryId ?? null,
    orbitTier: extras.orbitTier ?? 1,
    orbitSlot: extras.orbitSlot,
  }
}

/** Build default `PassiveNodeData` for a new or remapped node. */
export function createPassiveData(
  kind: PassiveKind,
  label: string,
  extras: NodeDataExtras = {},
): PassiveNodeData {
  return {
    label,
    kind,
    stages: extras.stages ?? stagesForKind(kind),
    classId: extras.classId ?? DEFAULT_CLASS_ID_BY_KIND[kind],
    ...fieldsForKind(kind, extras),
  }
}

/**
 * Remap an existing node's data to another kind, preserving label and
 * compatible orbit/connect fields.
 */
export function remapNodeDataToKind(
  prev: PassiveNodeData,
  nextKind: PassiveKind,
  classId: string,
): PassiveNodeData {
  const keepMasteryOrbit = isMasteryKind(prev.kind) && isMasteryKind(nextKind)
  const keepSatelliteOrbit =
    isOrbitMemberKind(nextKind) && isOrbitMemberKind(prev.kind)

  return createPassiveData(nextKind, prev.label, {
    stages: stagesForKind(nextKind, prev.stages),
    classId,
    orbitStartAngle: prev.orbitStartAngle,
    orbitStartAngleByTier: keepMasteryOrbit ? prev.orbitStartAngleByTier : undefined,
    orbitOrder: keepMasteryOrbit ? (prev.orbitOrder ?? []) : [],
    orbitOrderByTier: keepMasteryOrbit ? prev.orbitOrderByTier : undefined,
    orbitCapacityByTier: keepMasteryOrbit ? prev.orbitCapacityByTier : undefined,
    orbitLocked: prev.orbitLocked,
    orbitTierCount: keepMasteryOrbit ? prev.orbitTierCount : 1,
    masteryId: keepSatelliteOrbit ? (prev.masteryId ?? null) : null,
    orbitTier: prev.orbitTier,
    orbitSlot: keepSatelliteOrbit ? prev.orbitSlot : undefined,
    connectEnabled:
      prev.kind === 'connect' && nextKind === 'connect'
        ? (prev.connectEnabled ?? true)
        : true,
  })
}

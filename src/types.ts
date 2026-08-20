export type PassiveKind = 'small' | 'notable' | 'mastery'

export type TrainingEntry = {
  id: string
  label: string
  count: number
  note?: string
}

export type PassiveNodeData = {
  label: string
  kind: PassiveKind
  trainings: TrainingEntry[]
  /** Mastery only: radius of the circular orbit for attached passives. */
  orbitRadius?: number
  /**
   * Mastery only: starting angle in degrees for orbit slot #1.
   * Snapped to 30° steps. Default -90 (top). Clockwise from there.
   */
  orbitStartAngle?: number
  /** Mastery only: satellite node ids in clockwise orbit order (1-based UI). */
  orbitOrder?: string[]
  /** Small/Notable only: the single Mastery this passive belongs to. */
  masteryId?: string | null
}

export const PASSIVE_KIND_LABEL: Record<PassiveKind, string> = {
  small: 'Small Passive',
  notable: 'Notable Passive',
  mastery: 'Mastery',
}

/** Trainings needed to complete one outer band. */
export const TRAININGS_PER_BAND = 3

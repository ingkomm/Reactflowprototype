export type PassiveKind = 'initial' | 'small' | 'notable' | 'mastery'

/** One training log entry within a stage. Counts are capped by the stage goal. */
export type TrainingLog = {
  id: string
  label: string
  count: number
  note?: string
}

/** A progression stage with its own band, goal, and training log. */
export type StageData = {
  id: string
  /** 1-based stage number; band order is inner (1) → outer (n). */
  index: number
  label: string
  /** Target training count (= segment count on the ring). */
  goal: number
  /** Manual completion override (also completes when logged ≥ goal). */
  completedManually: boolean
  logs: TrainingLog[]
}

/** Notion-like solid icon palette (16). */
export const NODE_ICON_COLORS = [
  '#9B9A97',
  '#64473A',
  '#D9730D',
  '#DFAB01',
  '#0F7B6C',
  '#0B6E99',
  '#6940A5',
  '#AD1A72',
  '#E03E3E',
  '#D3D1CB',
  '#C4A484',
  '#FFA344',
  '#FFE066',
  '#4DAB9A',
  '#6CB6EA',
  '#B395EB',
] as const

export type NodeIconColor = (typeof NODE_ICON_COLORS)[number]

export const DEFAULT_ICON_BY_KIND: Record<PassiveKind, NodeIconColor> = {
  initial: '#FFE066',
  small: '#9B9A97',
  notable: '#D9730D',
  mastery: '#0F7B6C',
}

export type PassiveNodeData = {
  label: string
  kind: PassiveKind
  /** Ordered stages; each owns a ring and its training log. */
  stages: StageData[]
  /**
   * Passive class id for this node's kind.
   * Icon + color come from the class catalog (not stored per-node).
   */
  classId: string
  /** Mastery only: radius of the circular orbit for attached passives. */
  orbitRadius?: number
  /**
   * Mastery only: starting angle in degrees for orbit slot #1.
   * Snapped to 15° steps. Default -90 (top). Clockwise from there.
   */
  orbitStartAngle?: number
  /** Mastery only: satellite node ids in clockwise orbit order (1-based UI). */
  orbitOrder?: string[]
  /** Small/Notable only: the single Mastery this passive belongs to. */
  masteryId?: string | null
}

export const PASSIVE_KIND_LABEL: Record<PassiveKind, string> = {
  initial: 'Initial Node',
  small: 'Small Passive',
  notable: 'Notable Passive',
  mastery: 'Mastery',
}

export const DEFAULT_STAGE_GOAL = 3

export type PassiveKind = 'small' | 'notable' | 'mastery'

export type TrainingEntry = {
  id: string
  label: string
  count: number
  note?: string
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
  small: '#9B9A97',
  notable: '#D9730D',
  mastery: '#0F7B6C',
}

export type PassiveNodeData = {
  label: string
  kind: PassiveKind
  trainings: TrainingEntry[]
  /** Solid Notion-style icon color shown at node center. */
  iconColor: NodeIconColor
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

export type PassiveKind = 'initial' | 'connect' | 'small' | 'notable' | 'mastery'

/** Fixed singleton Initial node id — not creatable or deletable. */
export const INITIAL_NODE_ID = 'initial-main'

export type OrbitTier = 1 | 2 | 3
export type OrbitTierCount = 1 | 2 | 3

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
  connect: '#4DAB9A',
  small: '#9B9A97',
  notable: '#D9730D',
  mastery: '#0F7B6C',
}

export type PassiveNodeData = {
  label: string
  kind: PassiveKind
  /** Ordered stages; Notable only uses cumulative 3/5/7 bands. Master/Small have none. */
  stages: StageData[]
  /**
   * Passive class id for this node's kind.
   * Icon + color come from the class catalog (not stored per-node).
   */
  classId: string
  /** Mastery: number of concentric orbit tiers (1–3). */
  orbitTierCount?: OrbitTierCount
  /**
   * Mastery: starting angle in degrees for orbit slot #1 on tier 1.
   * Snapped to 15° steps. Default -90 (top). Clockwise from there.
   * Fallback when `orbitStartAngleByTier` has no tier-1 value.
   */
  orbitStartAngle?: number
  /** Mastery: per-tier starting angles (independent rotation per ring). */
  orbitStartAngleByTier?: Partial<Record<OrbitTier, number>>
  /** Mastery: satellite node ids in clockwise orbit order (1-based UI). */
  orbitOrder?: string[]
  /** Mastery: per-tier clockwise order (independent spacing per ring). */
  orbitOrderByTier?: Partial<Record<OrbitTier, string[]>>
  /**
   * Mastery: max members per tier. Unfilled slots are empty spacers
   * (visual dots only — not nodes).
   */
  orbitCapacityByTier?: Partial<Record<OrbitTier, number>>
  /** Mastery: when true, orbit membership count/order cannot change (rotation still allowed). */
  orbitLocked?: boolean
  /** Small/Notable only: the single Mastery this passive belongs to. */
  masteryId?: string | null
  /** Small/Notable on an orbit: which tier ring (1 = innermost). */
  orbitTier?: OrbitTier
  /** Satellite slot index (0-based) within tier capacity; empty slots = spacing. */
  orbitSlot?: number
  /** Connect only: circuit breaker — when false, blocks power from Initial. */
  connectEnabled?: boolean
}

export const PASSIVE_KIND_LABEL: Record<PassiveKind, string> = {
  initial: 'Initial',
  connect: 'Connect',
  small: 'Small',
  notable: 'Notable',
  mastery: 'Mastery',
}

/** Kinds the user can add from the toolbar. */
export const ADDABLE_PASSIVE_KINDS: PassiveKind[] = [
  'connect',
  'small',
  'notable',
  'mastery',
]

/** Kinds that appear in the class manager. */
export const CLASS_MANAGED_KINDS: PassiveKind[] = [
  'initial',
  'connect',
  'mastery',
  'notable',
  'small',
]

export const DEFAULT_STAGE_GOAL = 3

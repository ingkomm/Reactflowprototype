export type InitialConnectSlot = 0 | 1 | 2

export type PassiveKind =
  | 'initial'
  | 'connect'
  | 'small'
  | 'notable'
  | 'mastery'
  | 'voidMastery'
  | 'void'

/** Fixed singleton Root node id — not creatable or deletable. */
export const INITIAL_NODE_ID = 'initial-main'

export type OrbitTier = 1 | 2 | 3
export type OrbitTierCount = 1 | 2 | 3

/** One training log entry — one calendar day of practice. */
export type TrainingLog = {
  id: string
  /** Local calendar date YYYY-MM-DD */
  date: string
  /** Freeform practice memo */
  note?: string
  /** Optional external video links for this practice day. */
  media?: VideoMedia[]
}

/** External video reference (URL only — no binary upload). */
export type VideoMedia = {
  id: string
  url: string
  title?: string
  note?: string
  /** Parsed provider hint (e.g. youtube). */
  provider?: 'youtube' | 'link'
  /** Alias for provider-style classification. */
  kind?: 'youtube' | 'external'
}

/** User-imported SVG symbol (stored once, referenced by id on nodes). */
export type CustomSymbol = {
  id: string
  name: string
  viewBox: string
  width: number
  height: number
  /** Sanitized inner SVG markup (without outer svg wrapper). */
  markup: string
  /** Which library branch this symbol belongs to. */
  kind?: 'mastery' | 'notable' | 'small'
  /** Optional tint for ring + default-style previews. */
  color?: string
  /** Vector/raster glyph zoom relative to node face (1 = 100%). */
  scale?: number
}

export const GRAPH_SCHEMA_VERSION = '0.1' as const
export type GraphSchemaVersion = typeof GRAPH_SCHEMA_VERSION

export type GraphDocumentSettings = {
  gridSnapEnabled?: boolean
  voidHighlightEnabled?: boolean
  /** Default symbol color per library branch (built-in Default shape). */
  defaultSymbolColors?: Partial<Record<'mastery' | 'notable' | 'small', string>>
}

/** Edge payload persisted in graph documents. */
export type GraphEdgeData = {
  masteryId?: string
  /** When false, link is kept but excluded from power propagation. */
  active?: boolean
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
  connect: '#4DAB9A',
  small: '#9B9A97',
  notable: '#D9730D',
  mastery: '#0F7B6C',
  voidMastery: '#0F7B6C',
  void: '#6CB6EA',
}

export type PassiveNodeData = {
  label: string
  kind: PassiveKind
  /** Ordered stages; Notable only uses cumulative 3/5/7 bands. Master/Small have none. */
  stages: StageData[]
  /** Library symbol id — icon + color come from the built-in catalog. */
  symbolId: string
  /** Mastery: radius of the circular orbit for attached passives. */
  orbitRadius?: number
  /** Mastery: number of concentric orbit tiers (1–3). */
  orbitTierCount?: OrbitTierCount
  /**
   * Mastery: starting angle in degrees for orbit slot #1 on tier 1.
   * Snapped to 15° steps. Default -90 (top). Clockwise from there.
   * @deprecated Prefer orbitStartAngleByTier for per-tier rotation.
   */
  orbitStartAngle?: number
  /** Mastery: per-tier starting angles (independent rotation per ring). */
  orbitStartAngleByTier?: Partial<Record<OrbitTier, number>>
  /** Mastery: satellite node ids in clockwise orbit order (1-based UI). */
  orbitOrder?: string[]
  /** Mastery: per-tier clockwise order (independent spacing per ring). */
  orbitOrderByTier?: Partial<Record<OrbitTier, string[]>>
  /**
   * Mastery: max members per tier. Unfilled slots are conceptual voids
   * (no separate Void Master node).
   */
  orbitCapacityByTier?: Partial<Record<OrbitTier, number>>
  /** Mastery: when true, orbit membership count/order cannot change (rotation still allowed). */
  orbitLocked?: boolean
  /** Small/Notable/Void only: the single Mastery this passive belongs to. */
  masteryId?: string | null
  /** Small/Notable on an orbit: which tier ring (1 = innermost). */
  orbitTier?: OrbitTier
  /** Satellite slot index (0-based) within tier capacity; empty slots = void spacing. */
  orbitSlot?: number
  /** Void only: when true, skipped for orbit adjacency (bridges neighbors on the ring). */
  voidPassing?: boolean
  /** Connect only: socket index on the Root hub (0=top, 1=bottom-right, 2=bottom-left). */
  initialSlot?: InitialConnectSlot
  /** Connect only: circuit breaker — when false, blocks power from Root. */
  connectEnabled?: boolean
  /** Optional user SVG symbol id (overrides library icon when set). */
  customSymbolId?: string | null
  /** @deprecated Migrated to symbolId on import. */
  classId?: string
  /** @deprecated Ignored — legacy dot icon reference. */
  customIconId?: string | null
  /** Optional external videos attached to this node. */
  media?: VideoMedia[]
}

export const PASSIVE_KIND_LABEL: Record<PassiveKind, string> = {
  initial: 'Root',
  connect: 'Connect',
  small: 'Small',
  notable: 'Notable',
  mastery: 'Mastery',
  voidMastery: 'Void Master (retired)',
  void: 'Void spacer',
}

/** Kinds the user can add from the Library tree. */
export const ADDABLE_PASSIVE_KINDS: PassiveKind[] = ['small', 'notable', 'mastery', 'connect']

export const DEFAULT_STAGE_GOAL = 3

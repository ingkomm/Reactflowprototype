import type { NodeIconColor, PassiveKind } from './types'
import { DEFAULT_ICON_BY_KIND, NODE_ICON_COLORS } from './types'
import { DEFAULT_ICON_ID_BY_KIND } from './icons'

/** Built-in library symbol: icon + color scoped to one node kind. */
export type LibrarySymbol = {
  id: string
  kind: PassiveKind
  label: string
  iconId: string
  iconColor: NodeIconColor
}

export type LibraryBranch = {
  kind: PassiveKind
  label: string
  /** When false, branch is a single leaf row (Connector). */
  expandable: boolean
  symbols: LibrarySymbol[]
}

const masterySymbols: LibrarySymbol[] = [
  { id: 'm-1', kind: 'mastery', label: 'Symbol 1', iconId: 'tr-shield', iconColor: DEFAULT_ICON_BY_KIND.mastery },
  { id: 'm-2', kind: 'mastery', label: 'Symbol 2', iconId: 'da-disco', iconColor: NODE_ICON_COLORS[7] },
  { id: 'm-3', kind: 'mastery', label: 'Symbol 3', iconId: 'fi-dumbbell', iconColor: NODE_ICON_COLORS[0] },
  { id: 'm-4', kind: 'mastery', label: 'Symbol 4', iconId: 'tr-star', iconColor: NODE_ICON_COLORS[8] },
]

const notableSymbols: LibrarySymbol[] = [
  { id: 'n-a', kind: 'notable', label: 'Symbol A', iconId: 'tr-star', iconColor: DEFAULT_ICON_BY_KIND.notable },
  { id: 'n-b', kind: 'notable', label: 'Symbol B', iconId: 'da-headphones', iconColor: NODE_ICON_COLORS[5] },
  { id: 'n-c', kind: 'notable', label: 'Symbol C', iconId: 'da-note', iconColor: NODE_ICON_COLORS[4] },
  { id: 'n-d', kind: 'notable', label: 'Symbol D', iconId: 'fi-kettle', iconColor: NODE_ICON_COLORS[8] },
]

const smallSymbols: LibrarySymbol[] = [
  { id: 's-a', kind: 'small', label: 'Symbol a', iconId: 'tr-target', iconColor: DEFAULT_ICON_BY_KIND.small },
  { id: 's-b', kind: 'small', label: 'Symbol b', iconId: 'da-spark', iconColor: NODE_ICON_COLORS[2] },
  { id: 's-c', kind: 'small', label: 'Symbol c', iconId: 'da-shoe', iconColor: NODE_ICON_COLORS[8] },
  { id: 's-d', kind: 'small', label: 'Symbol d', iconId: 'fi-stretch', iconColor: NODE_ICON_COLORS[1] },
]

const connectorSymbol: LibrarySymbol = {
  id: 'c-1',
  kind: 'connect',
  label: 'Connector',
  iconId: DEFAULT_ICON_ID_BY_KIND.connect,
  iconColor: DEFAULT_ICON_BY_KIND.connect,
}

/** Internal symbols for kinds not shown in the palette tree. */
const internalSymbols: LibrarySymbol[] = [
  {
    id: 'i-1',
    kind: 'initial',
    label: 'Initial',
    iconId: DEFAULT_ICON_ID_BY_KIND.initial,
    iconColor: DEFAULT_ICON_BY_KIND.initial,
  },
  {
    id: 'v-1',
    kind: 'void',
    label: 'Void',
    iconId: DEFAULT_ICON_ID_BY_KIND.void,
    iconColor: DEFAULT_ICON_BY_KIND.void,
  },
]

export const ALL_LIBRARY_SYMBOLS: LibrarySymbol[] = [
  ...internalSymbols,
  connectorSymbol,
  ...masterySymbols,
  ...notableSymbols,
  ...smallSymbols,
]

/** Left sidebar tree: Mastery / Notable / Small / Connector. */
export const LIBRARY_BRANCHES: LibraryBranch[] = [
  { kind: 'mastery', label: 'Mastery', expandable: true, symbols: masterySymbols },
  { kind: 'notable', label: 'Notable', expandable: true, symbols: notableSymbols },
  { kind: 'small', label: 'Small', expandable: true, symbols: smallSymbols },
  { kind: 'connect', label: 'Connector', expandable: false, symbols: [connectorSymbol] },
]

export const DEFAULT_SYMBOL_ID_BY_KIND: Record<PassiveKind, string> = {
  initial: 'i-1',
  connect: 'c-1',
  mastery: 'm-1',
  notable: 'n-a',
  small: 's-a',
  voidMastery: 'm-1',
  void: 'v-1',
}

/** Legacy class ids from pre-symbol graphs → new symbol ids. */
const LEGACY_CLASS_TO_SYMBOL: Record<string, string> = {
  'i-default': 'i-1',
  'c-default': 'c-1',
  'm-default': 'm-1',
  'm-dance': 'm-2',
  'm-gym': 'm-3',
  'n-default': 'n-a',
  'n-hiphop': 'n-b',
  'n-kpop': 'n-c',
  'n-strength': 'n-d',
  'n-cardio': 'n-d',
  's-default': 's-a',
  's-basic': 's-a',
  's-footwork': 's-b',
  's-stretch': 's-c',
  's-legs': 's-d',
  's-back': 's-d',
  's-run': 's-d',
  's-core': 's-d',
  'vm-default': 'm-1',
  'v-default': 'v-1',
}

export function symbolsForKind(kind: PassiveKind): LibrarySymbol[] {
  return ALL_LIBRARY_SYMBOLS.filter((s) => s.kind === kind)
}

export function getLibrarySymbol(id: string | undefined | null): LibrarySymbol | undefined {
  if (!id) return undefined
  return ALL_LIBRARY_SYMBOLS.find((s) => s.id === id)
}

export function resolveLibrarySymbol(
  symbolId: string | undefined | null,
  kind: PassiveKind,
): LibrarySymbol {
  const resolvedKind = kind === 'voidMastery' ? 'mastery' : kind
  const exact = getLibrarySymbol(symbolId)
  if (exact && exact.kind === resolvedKind) return exact
  const fallbackId = DEFAULT_SYMBOL_ID_BY_KIND[resolvedKind]
  return getLibrarySymbol(fallbackId) ?? symbolsForKind(resolvedKind)[0]!
}

export function migrateLegacyClassId(classId: string | undefined | null, kind: PassiveKind): string {
  if (classId && LEGACY_CLASS_TO_SYMBOL[classId]) return LEGACY_CLASS_TO_SYMBOL[classId]!
  if (classId && getLibrarySymbol(classId)) return classId
  return resolveLibrarySymbol(null, kind).id
}

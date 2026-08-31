import type { CustomSymbol, PassiveKind } from './types'

export const DEFAULT_SYMBOL_ID = 'default'

export const LIBRARY_KINDS = ['mastery', 'notable', 'small'] as const satisfies PassiveKind[]

export type LibraryKind = (typeof LIBRARY_KINDS)[number]

export const LIBRARY_KIND_LABEL: Record<LibraryKind, string> = {
  mastery: 'Mastery',
  notable: 'Notable',
  small: 'Small',
}

export const DEFAULT_SYMBOL_ID_BY_KIND: Record<PassiveKind, string> = {
  initial: DEFAULT_SYMBOL_ID,
  connect: DEFAULT_SYMBOL_ID,
  mastery: DEFAULT_SYMBOL_ID,
  notable: DEFAULT_SYMBOL_ID,
  small: DEFAULT_SYMBOL_ID,
  voidMastery: DEFAULT_SYMBOL_ID,
  void: DEFAULT_SYMBOL_ID,
}

const LEGACY_TO_DEFAULT = new Set([
  'i-1',
  'c-1',
  'm-1',
  'm-2',
  'm-3',
  'm-4',
  'n-a',
  'n-b',
  'n-c',
  'n-d',
  's-a',
  's-b',
  's-c',
  's-d',
  'i-default',
  'c-default',
  'm-default',
  'm-dance',
  'm-gym',
  'n-default',
  'n-hiphop',
  'n-kpop',
  'n-strength',
  'n-cardio',
  's-default',
  's-basic',
  's-footwork',
  's-stretch',
  's-legs',
  's-back',
  's-run',
  's-core',
  'vm-default',
  'v-default',
])

export function isDefaultSymbolId(symbolId: string | undefined | null): boolean {
  return !symbolId || symbolId === DEFAULT_SYMBOL_ID || LEGACY_TO_DEFAULT.has(symbolId)
}

export function normalizeSymbolId(
  symbolId: string | undefined | null,
  customSymbols: CustomSymbol[],
  kind: PassiveKind,
): string {
  if (isDefaultSymbolId(symbolId)) return DEFAULT_SYMBOL_ID
  const custom = customSymbols.find((s) => s.id === symbolId)
  if (custom && symbolMatchesKind(custom, kind)) return custom.id
  return DEFAULT_SYMBOL_ID
}

export function symbolMatchesKind(symbol: CustomSymbol, kind: PassiveKind): boolean {
  const resolved = kind === 'voidMastery' ? 'mastery' : kind
  return !symbol.kind || symbol.kind === resolved
}

export function customSymbolsForKind(customSymbols: CustomSymbol[], kind: PassiveKind): CustomSymbol[] {
  return customSymbols.filter((s) => symbolMatchesKind(s, kind))
}

export function resolveSymbolLabel(
  symbolId: string | undefined | null,
  customSymbols: CustomSymbol[],
): string {
  if (isDefaultSymbolId(symbolId)) return 'Default'
  return customSymbols.find((s) => s.id === symbolId)?.name ?? 'Default'
}

export function migrateLegacyClassId(classId: string | undefined | null, _kind: PassiveKind): string {
  if (!classId || isDefaultSymbolId(classId)) return DEFAULT_SYMBOL_ID
  return classId
}

/** @deprecated Use normalizeSymbolId */
export function resolveLibrarySymbol(symbolId: string | undefined | null, kind: PassiveKind) {
  return {
    id: isDefaultSymbolId(symbolId) ? DEFAULT_SYMBOL_ID : symbolId!,
    kind,
    label: 'Default',
    iconId: '',
    iconColor: '#ffffff' as const,
  }
}

/** @deprecated */
export function symbolsForKind(_kind: PassiveKind) {
  return [{ id: DEFAULT_SYMBOL_ID, kind: _kind, label: 'Default', iconId: '', iconColor: '#ffffff' as const }]
}

/** @deprecated */
export function getLibrarySymbol(_id: string | undefined | null) {
  return undefined
}

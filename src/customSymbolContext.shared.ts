import { createContext, useContext } from 'react'
import type { CustomSymbol, PassiveKind } from './types'
import { type SymbolEditorKind } from './librarySymbols'

export type CustomSymbolContextValue = {
  customSymbols: CustomSymbol[]
  defaultSymbolColors: Partial<Record<SymbolEditorKind, string>>
  getCustomSymbol: (id: string | null | undefined) => CustomSymbol | null
  resolveSymbolColor: (symbolId: string | undefined | null, kind: PassiveKind) => string
}

export const CustomSymbolContext = createContext<CustomSymbolContextValue>({
  customSymbols: [],
  defaultSymbolColors: {},
  getCustomSymbol: () => null,
  resolveSymbolColor: () => '#9B9A97',
})

export function useCustomSymbols() {
  return useContext(CustomSymbolContext)
}

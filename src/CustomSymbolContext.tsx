import { createContext, useContext, type ReactNode } from 'react'
import type { CustomSymbol, PassiveKind } from './types'
import { resolveSymbolColor as resolveSymbolColorImpl, type SymbolEditorKind } from './librarySymbols'

export type CustomSymbolContextValue = {
  customSymbols: CustomSymbol[]
  defaultSymbolColors: Partial<Record<SymbolEditorKind, string>>
  getCustomSymbol: (id: string | null | undefined) => CustomSymbol | null
  resolveSymbolColor: (symbolId: string | undefined | null, kind: PassiveKind) => string
}

const CustomSymbolContext = createContext<CustomSymbolContextValue>({
  customSymbols: [],
  defaultSymbolColors: {},
  getCustomSymbol: () => null,
  resolveSymbolColor: () => '#9B9A97',
})

export function CustomSymbolProvider({
  customSymbols,
  defaultSymbolColors,
  children,
}: {
  customSymbols: CustomSymbol[]
  defaultSymbolColors: Partial<Record<SymbolEditorKind, string>>
  children: ReactNode
}) {
  const value: CustomSymbolContextValue = {
    customSymbols,
    defaultSymbolColors,
    getCustomSymbol: (id) => {
      if (!id) return null
      return customSymbols.find((symbol) => symbol.id === id) ?? null
    },
    resolveSymbolColor: (symbolId, kind) =>
      resolveSymbolColorImpl(symbolId, kind, customSymbols, defaultSymbolColors),
  }
  return <CustomSymbolContext.Provider value={value}>{children}</CustomSymbolContext.Provider>
}

export function useCustomSymbols() {
  return useContext(CustomSymbolContext)
}

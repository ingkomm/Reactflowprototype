import type { ReactNode } from 'react'
import { resolveSymbolColor as resolveSymbolColorImpl, type SymbolEditorKind } from './librarySymbols'
import type { CustomSymbol } from './types'
import { CustomSymbolContext, type CustomSymbolContextValue } from './customSymbolContext.shared'

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

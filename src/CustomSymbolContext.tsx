import { createContext, useContext, type ReactNode } from 'react'
import type { CustomSymbol } from './types'

export type CustomSymbolContextValue = {
  customSymbols: CustomSymbol[]
  getCustomSymbol: (id: string | null | undefined) => CustomSymbol | null
}

const CustomSymbolContext = createContext<CustomSymbolContextValue>({
  customSymbols: [],
  getCustomSymbol: () => null,
})

export function CustomSymbolProvider({
  customSymbols,
  children,
}: {
  customSymbols: CustomSymbol[]
  children: ReactNode
}) {
  const value: CustomSymbolContextValue = {
    customSymbols,
    getCustomSymbol: (id) => {
      if (!id) return null
      return customSymbols.find((symbol) => symbol.id === id) ?? null
    },
  }
  return <CustomSymbolContext.Provider value={value}>{children}</CustomSymbolContext.Provider>
}

export function useCustomSymbols() {
  return useContext(CustomSymbolContext)
}

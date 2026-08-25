import { createContext, useContext, type ReactNode } from 'react'

const EmptySlotHighlightContext = createContext(false)

export function EmptySlotHighlightProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  return (
    <EmptySlotHighlightContext.Provider value={enabled}>
      {children}
    </EmptySlotHighlightContext.Provider>
  )
}

export function useEmptySlotHighlight() {
  return useContext(EmptySlotHighlightContext)
}

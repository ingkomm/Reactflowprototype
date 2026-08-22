import { createContext, useContext, type ReactNode } from 'react'

const VoidHighlightContext = createContext(false)

export function VoidHighlightProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  return (
    <VoidHighlightContext.Provider value={enabled}>{children}</VoidHighlightContext.Provider>
  )
}

export function useVoidHighlight() {
  return useContext(VoidHighlightContext)
}

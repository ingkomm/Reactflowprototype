import type { ReactNode } from 'react'
import { VoidHighlightContext } from './voidHighlightContext.shared'

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

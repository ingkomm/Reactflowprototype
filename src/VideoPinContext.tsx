import type { ReactNode } from 'react'
import { VideoPinContext } from './videoPinContext.shared'

export function VideoPinProvider({
  pinnedNodeIds,
  children,
}: {
  pinnedNodeIds: readonly string[]
  children: ReactNode
}) {
  return (
    <VideoPinContext.Provider value={new Set(pinnedNodeIds)}>
      {children}
    </VideoPinContext.Provider>
  )
}

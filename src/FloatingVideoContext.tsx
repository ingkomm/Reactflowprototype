import type { ReactNode } from 'react'
import { FloatingVideoContext } from './floatingVideoContext.shared'

export function FloatingVideoProvider({
  floatingNodeIds,
  children,
}: {
  floatingNodeIds: readonly string[]
  children: ReactNode
}) {
  return (
    <FloatingVideoContext.Provider value={new Set(floatingNodeIds)}>
      {children}
    </FloatingVideoContext.Provider>
  )
}

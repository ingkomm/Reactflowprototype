import type { ReactNode } from 'react'
import { PowerContext } from './powerContext.shared'

export function PowerProvider({
  poweredIds,
  flowMeta,
  children,
}: {
  poweredIds: Set<string>
  flowMeta: import('./power').PowerFlowMeta
  children: ReactNode
}) {
  return (
    <PowerContext.Provider value={{ poweredIds, flowMeta }}>{children}</PowerContext.Provider>
  )
}

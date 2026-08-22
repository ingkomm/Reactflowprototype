import { createContext, useContext, type ReactNode } from 'react'

type GraphActions = {
  toggleOrbitLock: (masteryId: string) => void
}

const GraphActionsContext = createContext<GraphActions | null>(null)

export function GraphActionsProvider({
  toggleOrbitLock,
  children,
}: {
  toggleOrbitLock: (masteryId: string) => void
  children: ReactNode
}) {
  return (
    <GraphActionsContext.Provider value={{ toggleOrbitLock }}>
      {children}
    </GraphActionsContext.Provider>
  )
}

export function useGraphActions() {
  return useContext(GraphActionsContext)
}

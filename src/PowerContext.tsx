import { createContext, useContext, type ReactNode } from 'react'

const PowerContext = createContext<Set<string>>(new Set())

export function PowerProvider({
  poweredIds,
  children,
}: {
  poweredIds: Set<string>
  children: ReactNode
}) {
  return <PowerContext.Provider value={poweredIds}>{children}</PowerContext.Provider>
}

export function useNodePowered(nodeId: string) {
  const powered = useContext(PowerContext)
  return powered.has(nodeId)
}

export function usePowerSet() {
  return useContext(PowerContext)
}

import { createContext, useContext, type ReactNode } from 'react'
import type { PowerFlowMeta } from './power'

type PowerContextValue = {
  poweredIds: Set<string>
  flowMeta: PowerFlowMeta
}

const EMPTY_FLOW: PowerFlowMeta = { depth: new Map(), parent: new Map() }

const PowerContext = createContext<PowerContextValue>({
  poweredIds: new Set(),
  flowMeta: EMPTY_FLOW,
})

export function PowerProvider({
  poweredIds,
  flowMeta,
  children,
}: {
  poweredIds: Set<string>
  flowMeta: PowerFlowMeta
  children: ReactNode
}) {
  return (
    <PowerContext.Provider value={{ poweredIds, flowMeta }}>{children}</PowerContext.Provider>
  )
}

export function useNodePowered(nodeId: string) {
  const { poweredIds } = useContext(PowerContext)
  return poweredIds.has(nodeId)
}

export function usePowerSet() {
  const { poweredIds } = useContext(PowerContext)
  return poweredIds
}

export function usePowerFlowMeta() {
  const { flowMeta } = useContext(PowerContext)
  return flowMeta
}

import { createContext, useContext } from 'react'
import type { PowerFlowMeta } from './power'

export type PowerContextValue = {
  poweredIds: Set<string>
  flowMeta: PowerFlowMeta
}

export const EMPTY_POWER_FLOW: PowerFlowMeta = { depth: new Map(), parent: new Map() }

export const PowerContext = createContext<PowerContextValue>({
  poweredIds: new Set(),
  flowMeta: EMPTY_POWER_FLOW,
})

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

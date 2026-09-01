import { createContext, useContext } from 'react'

export const VideoPinContext = createContext<ReadonlySet<string>>(new Set())

export function usePinnedVideoNodeIds() {
  return useContext(VideoPinContext)
}

export function useIsVideoPinned(nodeId: string) {
  return useContext(VideoPinContext).has(nodeId)
}

import { createContext, useContext } from 'react'

export const FloatingVideoContext = createContext<ReadonlySet<string>>(new Set())

export function useFloatingVideoNodeIds() {
  return useContext(FloatingVideoContext)
}

export function useIsFloatingVideo(nodeId: string) {
  return useContext(FloatingVideoContext).has(nodeId)
}

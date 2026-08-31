import { createContext, useContext, type ReactNode } from 'react'

const VideoPinContext = createContext<ReadonlySet<string>>(new Set())

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

export function usePinnedVideoNodeIds() {
  return useContext(VideoPinContext)
}

export function useIsVideoPinned(nodeId: string) {
  return useContext(VideoPinContext).has(nodeId)
}

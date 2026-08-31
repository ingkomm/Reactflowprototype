import { createContext, useContext, type ReactNode } from 'react'

const VideoPinContext = createContext<string | null>(null)

export function VideoPinProvider({
  pinnedNodeId,
  children,
}: {
  pinnedNodeId: string | null
  children: ReactNode
}) {
  return <VideoPinContext.Provider value={pinnedNodeId}>{children}</VideoPinContext.Provider>
}

export function usePinnedVideoNodeId() {
  return useContext(VideoPinContext)
}

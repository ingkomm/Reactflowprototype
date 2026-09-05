import { createContext, useContext } from 'react'

export const VoidHighlightContext = createContext(false)

export function useVoidHighlight() {
  return useContext(VoidHighlightContext)
}

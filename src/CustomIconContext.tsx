import { createContext, useContext, type ReactNode } from 'react'
import type { CustomIcon } from './types'

export type CustomIconContextValue = {
  customIcons: CustomIcon[]
  getCustomIcon: (id: string | null | undefined) => CustomIcon | null
}

const CustomIconContext = createContext<CustomIconContextValue>({
  customIcons: [],
  getCustomIcon: () => null,
})

export function CustomIconProvider({
  customIcons,
  children,
}: {
  customIcons: CustomIcon[]
  children: ReactNode
}) {
  const value: CustomIconContextValue = {
    customIcons,
    getCustomIcon: (id) => {
      if (!id) return null
      return customIcons.find((icon) => icon.id === id) ?? null
    },
  }
  return <CustomIconContext.Provider value={value}>{children}</CustomIconContext.Provider>
}

export function useCustomIcons() {
  return useContext(CustomIconContext)
}

export function nodeSupportsCustomIcon(kind: string): boolean {
  return kind === 'small' || kind === 'notable' || kind === 'mastery'
}

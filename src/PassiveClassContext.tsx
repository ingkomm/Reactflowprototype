import { createContext, useContext, type ReactNode } from 'react'
import type { PassiveKind } from './types'
import {
  buildDefaultClass,
  resolvePassiveClass,
  type PassiveClass,
} from './passiveClass'

export type PassiveClassContextValue = {
  classes: PassiveClass[]
  resolve: (classId: string | undefined | null, kind: PassiveKind) => PassiveClass
}

const PassiveClassContext = createContext<PassiveClassContextValue>({
  classes: [],
  resolve: (_id, kind) => buildDefaultClass(kind),
})

export function PassiveClassProvider({
  classes,
  children,
}: {
  classes: PassiveClass[]
  children: ReactNode
}) {
  const value: PassiveClassContextValue = {
    classes,
    resolve: (classId, kind) => resolvePassiveClass(classes, classId, kind),
  }
  return (
    <PassiveClassContext.Provider value={value}>{children}</PassiveClassContext.Provider>
  )
}

export function usePassiveClasses() {
  return useContext(PassiveClassContext)
}

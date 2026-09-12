import { useCallback, useEffect, useRef } from 'react'
import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'

export type GraphSnapshot = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
}

const MAX_HISTORY = 80

function cloneSnapshot(nodes: PassiveFlowNode[], edges: Edge[]): GraphSnapshot {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
  }
}

type Options = {
  getState: () => GraphSnapshot
  setState: (snap: GraphSnapshot) => void
}

/** Ctrl/Cmd+Z undo and Ctrl/Cmd+Y (or Shift+Z) redo for graph edits. */
export function useGraphHistory({ getState, setState }: Options) {
  const pastRef = useRef<GraphSnapshot[]>([])
  const futureRef = useRef<GraphSnapshot[]>([])
  const applyingRef = useRef(false)

  const commit = useCallback(() => {
    if (applyingRef.current) return
    const snap = cloneSnapshot(getState().nodes, getState().edges)
    pastRef.current.push(snap)
    if (pastRef.current.length > MAX_HISTORY) {
      pastRef.current.shift()
    }
    futureRef.current = []
  }, [getState])

  const undo = useCallback(() => {
    const past = pastRef.current
    if (past.length === 0) return
    const current = cloneSnapshot(getState().nodes, getState().edges)
    const prev = past.pop()!
    futureRef.current.push(current)
    applyingRef.current = true
    setState(prev)
    queueMicrotask(() => {
      applyingRef.current = false
    })
  }, [getState, setState])

  const redo = useCallback(() => {
    const future = futureRef.current
    if (future.length === 0) return
    const current = cloneSnapshot(getState().nodes, getState().edges)
    const next = future.pop()!
    pastRef.current.push(current)
    applyingRef.current = true
    setState(next)
    queueMicrotask(() => {
      applyingRef.current = false
    })
  }, [getState, setState])

  const reset = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

      const mod = event.ctrlKey || event.metaKey
      if (!mod) return

      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  return { commit, undo, redo, reset, applyingRef }
}

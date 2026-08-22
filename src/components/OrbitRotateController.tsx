import { useEffect, useRef } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import {
  DEFAULT_ORBIT_START_ANGLE,
  findMasteryOrbitRingAt,
  layoutMasteryOrbit,
  nodeCenter,
  normalizeAngleDelta,
  pointerAngleDeg,
  snapOrbitAngle,
} from '../orbit'
import type { PassiveFlowNode } from './PassiveNode'
import type { PassiveNodeData } from '../types'

type Props = {
  commit: () => void
  setNodes: (updater: (nds: PassiveFlowNode[]) => PassiveFlowNode[]) => void
  stack: (nds: PassiveFlowNode[]) => PassiveFlowNode[]
}

/**
 * Drag empty mastery orbit ring (pane space, not node faces) to rotate orbitStartAngle.
 * Angle snaps every ORBIT_ANGLE_STEP degrees.
 */
export function OrbitRotateController({ commit, setNodes, stack }: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const dragRef = useRef<{
    pointerId: number
    masteryId: string
    originPointerDeg: number
    originStartDeg: number
  } | null>(null)

  useEffect(() => {
    const pane = document.querySelector('.react-flow__pane')
    if (!pane) return

    const applyAngle = (masteryId: string, angleDeg: number) => {
      const snapped = snapOrbitAngle(angleDeg)
      setNodes((nds) => {
        const mastery = nds.find((n) => n.id === masteryId)
        if (!mastery || mastery.type === 'frame') return nds
        const data = mastery.data as PassiveNodeData
        if (data.kind !== 'mastery') return nds
        if ((data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE) === snapped) {
          return nds
        }
        const next = nds.map((n) => {
          if (n.id !== masteryId || n.type === 'frame') return n
          const d = n.data as PassiveNodeData
          return {
            ...n,
            data: { ...d, orbitStartAngle: snapped },
          } as PassiveFlowNode
        })
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    }

    const angleFromPointer = (masteryId: string, clientX: number, clientY: number) => {
      const mastery = nodesRef.current.find((n) => n.id === masteryId)
      if (!mastery) return null
      const flow = screenToFlowPosition({ x: clientX, y: clientY })
      const c = nodeCenter(mastery, nodesRef.current as PassiveFlowNode[])
      return pointerAngleDeg(c.x, c.y, flow.x, flow.y)
    }

    const onPointerDown = (event: Event) => {
      const e = event as PointerEvent
      if (e.button !== 0) return
      if (dragRef.current) return

      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const hit = findMasteryOrbitRingAt(nodesRef.current, flow)
      if (!hit) return

      const mastery = nodesRef.current.find((n) => n.id === hit.masteryId)
      if (!mastery || mastery.type === 'frame') return
      const masteryData = mastery.data as { kind?: string; orbitStartAngle?: number }
      if (masteryData.kind !== 'mastery') return

      e.preventDefault()
      e.stopPropagation()

      dragRef.current = {
        pointerId: e.pointerId,
        masteryId: hit.masteryId,
        originPointerDeg: hit.pointerDeg,
        originStartDeg: masteryData.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
      }
      commit()
      pane.classList.add('is-orbit-rotating')
    }

    const onPointerMove = (event: Event) => {
      const e = event as PointerEvent
      const drag = dragRef.current

      if (!drag || drag.pointerId !== e.pointerId) {
        if (dragRef.current) return
        const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const hit = findMasteryOrbitRingAt(nodesRef.current, flow)
        pane.classList.toggle('is-orbit-hover', Boolean(hit))
        return
      }

      e.preventDefault()
      const pointerDeg = angleFromPointer(drag.masteryId, e.clientX, e.clientY)
      if (pointerDeg == null) return
      const delta = normalizeAngleDelta(pointerDeg - drag.originPointerDeg)
      applyAngle(drag.masteryId, drag.originStartDeg + delta)
    }

    const endDrag = (event: Event) => {
      const e = event as PointerEvent
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      dragRef.current = null
      pane.classList.remove('is-orbit-rotating')

      const pointerDeg = angleFromPointer(drag.masteryId, e.clientX, e.clientY)
      if (pointerDeg == null) return
      const delta = normalizeAngleDelta(pointerDeg - drag.originPointerDeg)
      applyAngle(drag.masteryId, drag.originStartDeg + delta)
    }

    pane.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)

    return () => {
      pane.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      pane.classList.remove('is-orbit-rotating', 'is-orbit-hover')
    }
  }, [commit, screenToFlowPosition, setNodes, stack])

  return null
}

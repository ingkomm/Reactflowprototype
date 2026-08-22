import { useEffect, useRef } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import {
  findMasteryOrbitRingAt,
  getTierStartAngle,
  isMasteryKind,
  layoutMasteryOrbit,
  nodeCenter,
  normalizeAngleDelta,
  pointerAngleDeg,
  setMasteryTierStartAngle,
  snapOrbitAngle,
} from '../orbit'
import type { PassiveFlowNode } from './PassiveNode'
import type { OrbitTier, PassiveNodeData } from '../types'

type Props = {
  commit: () => void
  setNodes: (updater: (nds: PassiveFlowNode[]) => PassiveFlowNode[]) => void
  stack: (nds: PassiveFlowNode[]) => PassiveFlowNode[]
}

/**
 * Drag empty mastery orbit ring (pane space, not node faces) to rotate that tier's start angle.
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
    tier: OrbitTier
    originPointerDeg: number
    originStartDeg: number
  } | null>(null)

  useEffect(() => {
    const pane = document.querySelector('.react-flow__pane')
    if (!pane) return

    const applyAngle = (masteryId: string, tier: OrbitTier, angleDeg: number) => {
      const snapped = snapOrbitAngle(angleDeg)
      setNodes((nds) => {
        const mastery = nds.find((n) => n.id === masteryId)
        if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) return nds
        const data = mastery.data as PassiveNodeData
        if (getTierStartAngle(data, tier) === snapped) return nds
        const next = nds.map((n) =>
          n.id === masteryId
            ? { ...n, data: setMasteryTierStartAngle(data, tier, snapped) }
            : n,
        )
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    }

    const angleFromPointer = (masteryId: string, clientX: number, clientY: number) => {
      const mastery = nodesRef.current.find((n) => n.id === masteryId)
      if (!mastery) return null
      const flow = screenToFlowPosition({ x: clientX, y: clientY })
      const c = nodeCenter(mastery, nodesRef.current)
      return pointerAngleDeg(c.x, c.y, flow.x, flow.y)
    }

    const onPointerDown = (event: Event) => {
      const e = event as PointerEvent
      if (e.button !== 0) return
      if (dragRef.current) return

      const target = e.target as Element | null
      if (target?.closest?.('.react-flow__node, .passive-node')) return

      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const hit = findMasteryOrbitRingAt(nodesRef.current, flow)
      if (!hit) return

      const mastery = nodesRef.current.find((n) => n.id === hit.masteryId)
      if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) return

      e.preventDefault()
      e.stopPropagation()

      const md = mastery.data as PassiveNodeData
      dragRef.current = {
        pointerId: e.pointerId,
        masteryId: hit.masteryId,
        tier: hit.tier,
        originPointerDeg: hit.pointerDeg,
        originStartDeg: getTierStartAngle(md, hit.tier),
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
      applyAngle(drag.masteryId, drag.tier, drag.originStartDeg + delta)
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
      applyAngle(drag.masteryId, drag.tier, drag.originStartDeg + delta)
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

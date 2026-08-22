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
  rotateAllMasteryTiersByDelta,
  setMasteryTierStartAngle,
  snapshotMasteryTierAngles,
  snapOrbitAngle,
} from '../orbit'
import {
  beginOrbitRotateDrag,
  endOrbitRotateDrag,
  orbitInteractionGuard,
} from '../orbitInteractionGuard'
import type { PassiveFlowNode } from './PassiveNode'
import type { OrbitTier, PassiveNodeData } from '../types'

type Props = {
  commit: () => void
  selectedIdRef: React.RefObject<string | null>
  setNodes: (updater: (nds: PassiveFlowNode[]) => PassiveFlowNode[]) => void
  stack: (nds: PassiveFlowNode[]) => PassiveFlowNode[]
  restoreSelection: (nodeId: string) => void
}

/**
 * Drag empty mastery orbit ring to rotate.
 * Unlocked: per-tier start angle. Locked: all tiers rotate together; only linked rings hit-test.
 */
export function OrbitRotateController({ commit, selectedIdRef, setNodes, stack, restoreSelection }: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const dragRef = useRef<{
    pointerId: number
    masteryId: string
    tier: OrbitTier
    locked: boolean
    originPointerDeg: number
    originStartDeg: number
    originAnglesByTier?: Partial<Record<OrbitTier, number>>
  } | null>(null)

  useEffect(() => {
    const pane = document.querySelector('.react-flow__pane')
    if (!pane) return

    const applyPerTierAngle = (masteryId: string, tier: OrbitTier, angleDeg: number) => {
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

    const applyLockedDelta = (
      masteryId: string,
      originByTier: Partial<Record<OrbitTier, number>>,
      deltaDeg: number,
    ) => {
      setNodes((nds) => {
        const mastery = nds.find((n) => n.id === masteryId)
        if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) return nds
        const data = mastery.data as PassiveNodeData
        const next = nds.map((n) =>
          n.id === masteryId
            ? { ...n, data: rotateAllMasteryTiersByDelta(data, originByTier, deltaDeg) }
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
      if (target?.closest?.('.react-flow__node, .passive-node, .react-flow__edge')) return

      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const hit = findMasteryOrbitRingAt(nodesRef.current, flow)
      if (!hit) return

      const mastery = nodesRef.current.find((n) => n.id === hit.masteryId)
      if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) return

      e.preventDefault()
      e.stopPropagation()

      const md = mastery.data as PassiveNodeData
      const locked = Boolean(md.orbitLocked)
      try {
        pane.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      beginOrbitRotateDrag(selectedIdRef.current ?? hit.masteryId)
      dragRef.current = {
        pointerId: e.pointerId,
        masteryId: hit.masteryId,
        tier: hit.tier,
        locked,
        originPointerDeg: hit.pointerDeg,
        originStartDeg: getTierStartAngle(md, hit.tier),
        originAnglesByTier: locked ? snapshotMasteryTierAngles(md) : undefined,
      }
      commit()
      pane.classList.add('is-orbit-rotating')
    }

    const applyDragDelta = (drag: NonNullable<typeof dragRef.current>, clientX: number, clientY: number) => {
      const pointerDeg = angleFromPointer(drag.masteryId, clientX, clientY)
      if (pointerDeg == null) return
      const delta = normalizeAngleDelta(pointerDeg - drag.originPointerDeg)
      if (drag.locked && drag.originAnglesByTier) {
        applyLockedDelta(drag.masteryId, drag.originAnglesByTier, delta)
      } else {
        applyPerTierAngle(drag.masteryId, drag.tier, drag.originStartDeg + delta)
      }
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
      applyDragDelta(drag, e.clientX, e.clientY)
    }

    const finishDrag = (e: PointerEvent, drag: NonNullable<typeof dragRef.current>) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        pane.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      dragRef.current = null
      pane.classList.remove('is-orbit-rotating')
      applyDragDelta(drag, e.clientX, e.clientY)
      endOrbitRotateDrag()
      const preserveId = orbitInteractionGuard.preserveSelectionId
      if (preserveId) restoreSelection(preserveId)
    }

    const endDrag = (event: Event) => {
      const e = event as PointerEvent
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      finishDrag(e, drag)
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
  }, [commit, restoreSelection, screenToFlowPosition, selectedIdRef, setNodes, stack])

  return null
}

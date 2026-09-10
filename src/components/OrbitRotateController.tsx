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
import type { PassiveFlowNode } from './PassiveNode'
import type { OrbitTier, PassiveNodeData } from '../types'

import {
  beginOrbitRotateDrag,
  endOrbitRotateDrag,
  getOrbitPreserveSelectionId,
} from '../orbitInteractionGuard'

type Props = {
  commit: () => void
  selectedIdRef: React.RefObject<string | null>
  setNodes: (updater: (nds: PassiveFlowNode[]) => PassiveFlowNode[]) => void
  stack: (nds: PassiveFlowNode[]) => PassiveFlowNode[]
  restoreSelection: (nodeId: string) => void
}

type OrbitHit = { masteryId: string; tier: OrbitTier; pointerDeg: number }

const DRAG_THRESHOLD_PX = 6

/** Ignore clicks on node chrome; mastery orbit ring clicks are allowed. */
function shouldIgnoreRotateTarget(target: Element | null): boolean {
  if (!target) return true
  if (
    target.closest(
      '.node-drag-handle, .passive-node__handle, .passive-node__ring, .passive-node__glyph, .passive-node__title, .passive-node__tooltip',
    )
  ) {
    return true
  }

  const flowNode = target.closest('.react-flow__node')
  if (!flowNode) return false

  const isMasteryNode = Boolean(
    flowNode.querySelector('.passive-node--mastery, .passive-node--voidMastery'),
  )
  if (isMasteryNode) {
    return !target.closest('.passive-node__orbit')
  }

  return true
}

/**
 * Drag mastery orbit ring to rotate.
 * Single click + drag rotates; double-click on a link still deletes (deferred start on edges).
 */
export function OrbitRotateController({ commit, selectedIdRef, setNodes, stack, restoreSelection }: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const dragRef = useRef<{
    pointerId: number
    masteryId: string
    tier: OrbitTier
    locked: boolean
    originPointerDeg: number
    originStartDeg: number
    originAnglesByTier?: Partial<Record<OrbitTier, number>>
  } | null>(null)

  const pendingRef = useRef<{
    pointerId: number
    originX: number
    originY: number
    hit: OrbitHit
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

    const beginRotate = (e: PointerEvent, hit: OrbitHit) => {
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

    const onPointerDown = (event: Event) => {
      const e = event as PointerEvent
      if (e.button !== 0) return
      if (dragRef.current) return

      const target = e.target as Element | null
      if (shouldIgnoreRotateTarget(target)) return

      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const hit = findMasteryOrbitRingAt(nodesRef.current, flow)
      if (!hit) return

      const onEdge = Boolean(target?.closest?.('.react-flow__edge'))
      if (onEdge) {
        pendingRef.current = {
          pointerId: e.pointerId,
          originX: e.clientX,
          originY: e.clientY,
          hit,
        }
        return
      }

      beginRotate(e, hit)
    }

    const onPointerMove = (event: Event) => {
      const e = event as PointerEvent
      const drag = dragRef.current
      const pending = pendingRef.current

      if (pending && pending.pointerId === e.pointerId && !drag) {
        const moved = Math.hypot(e.clientX - pending.originX, e.clientY - pending.originY)
        if (moved >= DRAG_THRESHOLD_PX) {
          pendingRef.current = null
          beginRotate(e, pending.hit)
          if (dragRef.current) applyDragDelta(dragRef.current, e.clientX, e.clientY)
        }
        return
      }

      if (!drag || drag.pointerId !== e.pointerId) {
        if (dragRef.current || pendingRef.current) return
        const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const ringHit = findMasteryOrbitRingAt(nodesRef.current, flow)
        pane.classList.toggle('is-orbit-hover', Boolean(ringHit))
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
      const preserveId = getOrbitPreserveSelectionId()
      if (preserveId) restoreSelection(preserveId)
    }

    const endDrag = (event: Event) => {
      const e = event as PointerEvent
      if (pendingRef.current?.pointerId === e.pointerId) {
        pendingRef.current = null
      }
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
      pendingRef.current = null
      pane.classList.remove('is-orbit-rotating', 'is-orbit-hover')
    }
  }, [commit, restoreSelection, screenToFlowPosition, selectedIdRef, setNodes, stack])

  return null
}

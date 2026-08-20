import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import {
  useCallback,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PassiveNodeData } from '../types'
import { DEFAULT_ICON_BY_KIND, PASSIVE_KIND_LABEL } from '../types'
import { DEFAULT_ICON_ID_BY_KIND } from '../icons'
import {
  completedStageCount,
  isStageComplete,
  sortedStages,
  stageBandLevel,
  stageLoggedCount,
} from '../stage'
import {
  DEFAULT_ORBIT_RADIUS,
  DEFAULT_ORBIT_START_ANGLE,
  NODE_SIZE,
  normalizeAngleDelta,
  pointerAngleDeg,
  snapOrbitAngle,
} from '../orbit'
import { dispatchMasteryOrbitRotate } from '../orbitEvents'
import { IconGlyph } from './IconGlyph'
import {
  TrainingBands,
  labelBelowBandOffset,
  outermostBandRadius,
} from './TrainingBands'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

export function PassiveNode({ id, data, selected }: NodeProps<PassiveFlowNode>) {
  const stages = data.stages ?? []
  const bandLevel = stageBandLevel(stages)
  const bandCount = stages.length
  const orbitRadius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = data.iconColor ?? DEFAULT_ICON_BY_KIND[data.kind]
  const iconId = data.iconId ?? DEFAULT_ICON_ID_BY_KIND[data.kind]
  const outerBandR = outermostBandRadius(bandCount, nodeSize)
  const labelOffset = labelBelowBandOffset(bandCount, nodeSize)

  const glowBlur = bandCount === 0 ? 0 : 12 + bandLevel * 10
  const glowAlpha =
    bandCount === 0 ? 0 : Math.min(0.95, 0.28 + bandLevel * 0.16)
  const haloStrength =
    bandCount === 0 ? 0 : Math.min(0.92, 0.28 + bandLevel * 0.18)

  const ordered = sortedStages(stages)
  const done = completedStageCount(stages)
  const active = ordered.find((s) => !isStageComplete(s))

  const orbitRotateRef = useRef<{
    pointerId: number
    originPointerDeg: number
    originStartDeg: number
  } | null>(null)

  const onOrbitPointerDown = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>) => {
      if (data.kind !== 'mastery') return
      event.preventDefault()
      event.stopPropagation()

      const svg = event.currentTarget.ownerSVGElement
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const originPointerDeg = pointerAngleDeg(cx, cy, event.clientX, event.clientY)
      const originStartDeg = data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE
      const pointerId = event.pointerId

      orbitRotateRef.current = {
        pointerId,
        originPointerDeg,
        originStartDeg,
      }
      dispatchMasteryOrbitRotate({
        nodeId: id,
        angleDeg: originStartDeg,
        phase: 'start',
      })

      const centerFromEvent = () => {
        const box = svg.getBoundingClientRect()
        return {
          cx: box.left + box.width / 2,
          cy: box.top + box.height / 2,
        }
      }

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const state = orbitRotateRef.current
        if (!state) return
        moveEvent.preventDefault()
        const { cx: mx, cy: my } = centerFromEvent()
        const pointerDeg = pointerAngleDeg(mx, my, moveEvent.clientX, moveEvent.clientY)
        const delta = normalizeAngleDelta(pointerDeg - state.originPointerDeg)
        const next = snapOrbitAngle(state.originStartDeg + delta)
        dispatchMasteryOrbitRotate({
          nodeId: id,
          angleDeg: next,
          phase: 'move',
        })
      }

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        const state = orbitRotateRef.current
        orbitRotateRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (!state) return
        const { cx: ux, cy: uy } = centerFromEvent()
        const pointerDeg = pointerAngleDeg(ux, uy, upEvent.clientX, upEvent.clientY)
        const delta = normalizeAngleDelta(pointerDeg - state.originPointerDeg)
        const next = snapOrbitAngle(state.originStartDeg + delta)
        dispatchMasteryOrbitRotate({
          nodeId: id,
          angleDeg: next,
          phase: 'end',
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [data.kind, data.orbitStartAngle, id],
  )

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}${
        bandCount > 0 ? ' has-bands' : ''
      }`}
      style={
        {
          '--glow-blur': `${glowBlur}px`,
          '--glow-alpha': String(glowAlpha),
          '--halo-strength': String(haloStrength),
          '--band-level': String(bandLevel),
          '--band-count': String(bandCount),
          '--outer-band-r': `${outerBandR}px`,
          '--icon-color': iconColor,
          '--label-offset': `${labelOffset}px`,
          '--orbit-r': `${orbitRadius}px`,
        } as CSSProperties
      }
    >
      {data.kind === 'mastery' && (
        <>
          <div
            className="passive-node__orbit"
            style={{ width: orbitRadius * 2, height: orbitRadius * 2 }}
            aria-hidden
          />
          <svg
            className="passive-node__orbit-hit nodrag nopan"
            width={orbitRadius * 2}
            height={orbitRadius * 2}
            viewBox={`0 0 ${orbitRadius * 2} ${orbitRadius * 2}`}
            aria-label="오르빗 회전"
          >
            <circle
              className="passive-node__orbit-hit-ring nodrag nopan"
              cx={orbitRadius}
              cy={orbitRadius}
              r={orbitRadius}
              fill="none"
              stroke="transparent"
              strokeWidth={32}
              onPointerDown={onOrbitPointerDown}
            />
          </svg>
        </>
      )}

      <div className="passive-node__halo" aria-hidden />
      <TrainingBands stages={stages} nodeSize={nodeSize} />

      <Handle
        id="center"
        type="source"
        position={Position.Top}
        className="passive-node__handle"
        isConnectable
      />
      <Handle
        id="center-target"
        type="target"
        position={Position.Top}
        className="passive-node__handle"
        isConnectable
      />

      <div className="passive-node__ring" aria-hidden>
        <IconGlyph iconId={iconId} className="passive-node__glyph" />
      </div>

      <div className="passive-node__hit node-drag-handle" />

      <p className="passive-node__title">{data.label}</p>

      <div className="passive-node__tooltip" role="tooltip">
        <p className="passive-node__tooltip-title">{data.label}</p>
        <p className="passive-node__tooltip-meta">{PASSIVE_KIND_LABEL[data.kind]}</p>
        <p className="passive-node__tooltip-meta">
          숙련도 {data.proficiency} · 파워 {data.power}
        </p>
        <p className="passive-node__tooltip-meta">
          단계 {done}/{stages.length} 완료
        </p>
        {active && (
          <p className="passive-node__tooltip-meta">
            {active.label}: {stageLoggedCount(active)}/{active.goal}
          </p>
        )}
      </div>
    </div>
  )
}

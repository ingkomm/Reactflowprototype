import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
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
import { DEFAULT_ORBIT_RADIUS, NODE_SIZE } from '../orbit'
import { IconGlyph } from './IconGlyph'
import { TrainingBands, labelBelowBandOffset } from './TrainingBands'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

export function PassiveNode({ data, selected }: NodeProps<PassiveFlowNode>) {
  const stages = data.stages ?? []
  const bandLevel = stageBandLevel(stages)
  const orbitRadius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = data.iconColor ?? DEFAULT_ICON_BY_KIND[data.kind]
  const iconId = data.iconId ?? DEFAULT_ICON_ID_BY_KIND[data.kind]
  const labelOffset = labelBelowBandOffset(stages.length, nodeSize)

  const glowBlur = 16 + bandLevel * 10
  const glowAlpha = Math.min(0.92, 0.22 + bandLevel * 0.14)
  const haloStrength = Math.min(0.85, bandLevel * 0.16)

  const ordered = sortedStages(stages)
  const done = completedStageCount(stages)
  const active = ordered.find((s) => !isStageComplete(s))

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}${
        stages.length > 0 ? ' has-bands' : ''
      }`}
      style={
        {
          '--glow-blur': `${glowBlur}px`,
          '--glow-alpha': String(glowAlpha),
          '--halo-strength': String(haloStrength),
          '--band-level': String(bandLevel),
          '--icon-color': iconColor,
          '--label-offset': `${labelOffset}px`,
        } as CSSProperties
      }
    >
      {data.kind === 'mastery' && (
        <div
          className="passive-node__orbit"
          style={{ width: orbitRadius * 2, height: orbitRadius * 2 }}
          aria-hidden
        />
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

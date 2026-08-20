import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { PassiveNodeData } from '../types'
import { DEFAULT_ICON_BY_KIND, PASSIVE_KIND_LABEL } from '../types'
import {
  DEFAULT_ORBIT_RADIUS,
  NODE_SIZE,
  totalTrainingCount,
  trainingBandLevel,
} from '../orbit'
import { TrainingBands } from './TrainingBands'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

export function PassiveNode({ data, selected }: NodeProps<PassiveFlowNode>) {
  const total = totalTrainingCount(data.trainings)
  const bandLevel = trainingBandLevel(total)
  const orbitRadius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = data.iconColor ?? DEFAULT_ICON_BY_KIND[data.kind]

  const glowBlur = 16 + bandLevel * 14
  const glowAlpha = Math.min(0.92, 0.22 + bandLevel * 0.2)
  const haloStrength = Math.min(0.85, bandLevel * 0.22)

  const topSessions = [...data.trainings]
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}${
        bandLevel > 0 ? ' has-bands' : ''
      }`}
      style={
        {
          '--glow-blur': `${glowBlur}px`,
          '--glow-alpha': String(glowAlpha),
          '--halo-strength': String(haloStrength),
          '--band-level': String(bandLevel),
          '--icon-color': iconColor,
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
      <TrainingBands total={total} nodeSize={nodeSize} />

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

      <div className="passive-node__ring" aria-hidden />
      <div className="passive-node__hit node-drag-handle" />

      <div className="passive-node__tooltip" role="tooltip">
        <p className="passive-node__tooltip-title">{data.label}</p>
        <p className="passive-node__tooltip-meta">{PASSIVE_KIND_LABEL[data.kind]}</p>
        <p className="passive-node__tooltip-meta">총 트레이닝 {total}회</p>
        {topSessions.length > 0 && (
          <ul className="passive-node__tooltip-list">
            {topSessions.map((t) => (
              <li key={t.id}>
                {t.label} · {t.count}
              </li>
            ))}
          </ul>
        )}
      </div>

      <span className="passive-node__trainings">{total}</span>
      <span className="passive-node__connect-dot" aria-hidden />
    </div>
  )
}

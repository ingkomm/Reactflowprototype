import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import { DEFAULT_ORBIT_RADIUS, NODE_SIZE, totalTrainingCount, trainingProgressLabel } from '../orbit'
import { TrainingBands } from './TrainingBands'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

export function PassiveNode({ data, selected }: NodeProps<PassiveFlowNode>) {
  const total = totalTrainingCount(data.trainings)
  const orbitRadius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const nodeSize = NODE_SIZE[data.kind]

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}`}
      title={`${data.label} · ${PASSIVE_KIND_LABEL[data.kind]}`}
    >
      {data.kind === 'mastery' && (
        <div
          className="passive-node__orbit"
          style={{ width: orbitRadius * 2, height: orbitRadius * 2 }}
          aria-hidden
        />
      )}

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
      <div className="passive-node__core node-drag-handle">
        <span className="passive-node__kind">{PASSIVE_KIND_LABEL[data.kind]}</span>
        <strong className="passive-node__label">{data.label}</strong>
        <span className="passive-node__trainings">
          {total}× · {trainingProgressLabel(total)}
        </span>
      </div>
      <span className="passive-node__connect-dot" aria-hidden />
    </div>
  )
}

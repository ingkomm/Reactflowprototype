import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { PassiveNodeData } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

function totalTrainings(trainings: PassiveNodeData['trainings']) {
  return trainings.reduce((sum, t) => sum + (Number.isFinite(t.count) ? t.count : 0), 0)
}

export function PassiveNode({ data, selected }: NodeProps<PassiveFlowNode>) {
  const total = totalTrainings(data.trainings)

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}`}
      title={`${data.label} · ${PASSIVE_KIND_LABEL[data.kind]}`}
    >
      {/* Full-node target/source so edges always meet at the geometric center */}
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
        <span className="passive-node__trainings">{total}× training</span>
      </div>
      <span className="passive-node__connect-dot" aria-hidden />
    </div>
  )
}

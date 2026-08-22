import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'
import type { FrameNodeData } from '../types'
import './FrameNode.css'

export type FrameFlowNode = Node<FrameNodeData, 'frame'>

export function FrameNode({ data, selected }: NodeProps<FrameFlowNode>) {
  return (
    <div className={`frame-node${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={selected}
        lineClassName="frame-node__resize-line"
        handleClassName="frame-node__resize-handle"
      />
      <div className="frame-node__label">{data.label}</div>
    </div>
  )
}

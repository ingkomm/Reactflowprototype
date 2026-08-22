import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { type CSSProperties } from 'react'
import type { FrameNodeData, PassiveNodeData } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import {
  completedStageCount,
  isStageComplete,
  sortedStages,
  stageBandLevel,
  stageLoggedCount,
} from '../stage'
import { DEFAULT_ORBIT_RADIUS, NODE_SIZE } from '../orbit'
import { usePassiveClasses } from '../PassiveClassContext'
import { IconGlyph } from './IconGlyph'
import {
  TrainingBands,
  labelBelowBandOffset,
  outermostBandRadius,
} from './TrainingBands'
import './PassiveNode.css'

export type PassiveFlowNode =
  | Node<PassiveNodeData, 'passive'>
  | Node<FrameNodeData, 'frame'>

export function isPassiveNode(
  node: PassiveFlowNode,
): node is Node<PassiveNodeData, 'passive'> {
  return node.type !== 'frame' && 'kind' in (node.data as object)
}

export function PassiveNode({ data, selected }: NodeProps<Node<PassiveNodeData, 'passive'>>) {
  const { resolve } = usePassiveClasses()
  const passiveClass = resolve(data.classId, data.kind)
  const stages = data.stages ?? []
  const bandLevel = stageBandLevel(stages)
  const bandCount = stages.length
  const orbitRadius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = passiveClass.iconColor
  const iconId = passiveClass.iconId
  const outerBandR = outermostBandRadius(bandCount, nodeSize)
  const labelOffset = labelBelowBandOffset(bandCount, nodeSize)
  /** Connect hit lives on the stage-band annulus (or a rim just outside the face). */
  const connectR = Math.max(outerBandR + 8, nodeSize / 2 + 16)

  const glowBlur = bandCount === 0 ? 0 : 12 + bandLevel * 10
  const glowAlpha =
    bandCount === 0 ? 0 : Math.min(0.95, 0.28 + bandLevel * 0.16)
  const haloStrength =
    bandCount === 0 ? 0 : Math.min(0.92, 0.28 + bandLevel * 0.18)

  const ordered = sortedStages(stages)
  const done = completedStageCount(stages)
  const active = ordered.find((s) => !isStageComplete(s))

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
          '--connect-r': `${connectR}px`,
          '--icon-color': iconColor,
          '--label-offset': `${labelOffset}px`,
          '--orbit-r': `${orbitRadius}px`,
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
        <p className="passive-node__tooltip-meta">클래스 · {passiveClass.label}</p>
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

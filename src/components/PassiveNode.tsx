import { Handle, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { useMemo, type CSSProperties } from 'react'
import type { PassiveNodeData } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import {
  completedStageCount,
  isStageComplete,
  sortedStages,
  stageBandLevel,
  stageLoggedCount,
} from '../stage'
import {
  getOrderedOrbitSatellites,
  isMasteryKind,
  isStealthPassiveKind,
  normalizeOrbitTierCount,
  NODE_SIZE,
  nodeInteractRadius,
  orbitTierRadius,
} from '../orbit'
import type { OrbitTier } from '../types'
import { usePassiveClasses } from '../PassiveClassContext'
import { useNodePowered } from '../PowerContext'
import { canTransmitPower } from '../power'
import { IconGlyph } from './IconGlyph'
import {
  TrainingBands,
  labelBelowBandOffset,
  outermostBandRadius,
} from './TrainingBands'
import { useVoidHighlight } from '../VoidHighlightContext'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

const UNPOWERED_ICON = '#4a5560'
const UNPOWERED_GLOW = 'rgba(90, 100, 112, 0.12)'

export function PassiveNode({ id, data, selected }: NodeProps<PassiveFlowNode>) {
  const { resolve } = usePassiveClasses()
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const voidHighlight = useVoidHighlight()
  const isStealth = isStealthPassiveKind(data.kind)
  const isMastery = isMasteryKind(data.kind)
  const showVoidHighlight = voidHighlight && isStealth
  const orbitSatelliteCount = useMemo(() => {
    if (data.kind !== 'voidMastery') return 0
    return getOrderedOrbitSatellites(nodes, id).length
  }, [nodes, id, data.kind])
  const isAmbientVisible =
    (data.kind === 'void' && !data.masteryId) ||
    (data.kind === 'voidMastery' && orbitSatelliteCount === 0)
  const powered = !isStealth && (useNodePowered(id) || data.kind === 'initial')
  const showOrbitHighlight =
    voidHighlight && data.kind === 'mastery' && !powered && !data.orbitLocked
  const canRelay = powered && canTransmitPower(data)
  const passiveClass = resolve(data.classId, data.kind)
  const stages = data.stages ?? []
  const bandLevel = stageBandLevel(stages)
  const bandCount = stages.length
  const orbitTierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const showOrbitRings = isMastery && !data.orbitLocked
  const outerOrbitR = orbitTierRadius(orbitTierCount, orbitTierCount)
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = powered ? passiveClass.iconColor : UNPOWERED_ICON
  const iconId = passiveClass.iconId
  const outerBandR = outermostBandRadius(bandCount, nodeSize)
  const labelOffset = labelBelowBandOffset(bandCount, nodeSize)
  const connectR = nodeInteractRadius(data)

  const glowBlur = powered && bandCount > 0 ? 12 + bandLevel * 10 : 0
  const glowAlpha =
    powered && bandCount > 0 ? Math.min(0.95, 0.28 + bandLevel * 0.16) : 0
  const haloStrength =
    powered && bandCount > 0 ? Math.min(0.92, 0.28 + bandLevel * 0.18) : 0

  const ordered = sortedStages(stages)
  const done = completedStageCount(stages)
  const active = ordered.find((s) => !isStageComplete(s))

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}${
        powered ? '' : ' is-unpowered'
      }${bandCount > 0 && powered ? ' has-bands' : ''}${
        isStealth ? ' is-stealth' : ''
      }${isAmbientVisible ? ' is-ambient-visible' : ''}${
        showVoidHighlight ? ' is-void-highlighted' : ''
      }${
        showOrbitHighlight ? ' is-orbit-highlighted' : ''
      }${
        data.kind === 'void' && data.voidPassing ? ' is-void-passing' : ''
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
          '--orbit-r': `${outerOrbitR}px`,
          '--unpowered-glow': UNPOWERED_GLOW,
        } as CSSProperties
      }
    >
      {showOrbitRings && (
        <>
          {Array.from({ length: orbitTierCount }, (_, index) => {
            const tier = (index + 1) as OrbitTier
            const tierR = orbitTierRadius(orbitTierCount, tier)
            return (
              <div
                key={tier}
                className="passive-node__orbit"
                style={{ width: tierR * 2, height: tierR * 2 }}
                aria-hidden
              />
            )
          })}
        </>
      )}

      <div className="passive-node__halo" aria-hidden />
      {powered && bandCount > 0 && !isStealth && (
        <TrainingBands stages={stages} nodeSize={nodeSize} />
      )}

      {!isStealth && (
        <>
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
        </>
      )}

      <div className="passive-node__ring" aria-hidden>
        {!isStealth && <IconGlyph iconId={iconId} className="passive-node__glyph" />}
      </div>

      <div className="passive-node__hit node-drag-handle" />

      <p className="passive-node__title">{data.label}</p>

      {!isStealth && (
        <div className="passive-node__tooltip" role="tooltip">
          <p className="passive-node__tooltip-title">{data.label}</p>
          <p className="passive-node__tooltip-meta">{PASSIVE_KIND_LABEL[data.kind]}</p>
          {!powered && data.kind !== 'initial' && (
            <p className="passive-node__tooltip-meta">파워 미공급</p>
          )}
          {powered && !canRelay && data.kind !== 'initial' && bandCount > 0 && (
            <p className="passive-node__tooltip-meta">1단계 미완료 — 파워 전달 불가</p>
          )}
          {data.kind !== 'initial' && (
            <p className="passive-node__tooltip-meta">클래스 · {passiveClass.label}</p>
          )}
          {bandCount > 0 && (
            <p className="passive-node__tooltip-meta">
              단계 {done}/{stages.length} 완료
            </p>
          )}
          {active && powered && (
            <p className="passive-node__tooltip-meta">
              {active.label}: {stageLoggedCount(active)}/{active.goal}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

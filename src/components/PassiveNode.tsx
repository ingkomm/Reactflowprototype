import { Handle, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { useMemo, type CSSProperties } from 'react'
import type { PassiveNodeData } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import {
  kindUsesTrainingBands,
  notableBandFills,
  NOTABLE_BAND_GOALS,
  stageBandLevel,
  totalRawLoggedAcrossStages,
  visibleNotableBandCount,
} from '../stage'
import {
  getOrderedOrbitSatellites,
  getOrbitTierCapacity,
  getOrderedTierSatellites,
  getSatelliteOrbitSlot,
  getTierStartAngle,
  isConnectKind,
  isMasteryKind,
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
  masteryNeonLabelOffset,
  masteryNeonOuterRadius,
  outermostBandRadius,
} from './TrainingBands'
import { useEmptySlotHighlight } from '../EmptySlotHighlightContext'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

const UNPOWERED_ICON = '#4a5560'
const UNPOWERED_GLOW = 'rgba(90, 100, 112, 0.12)'

export function PassiveNode({ id, data, selected }: NodeProps<PassiveFlowNode>) {
  const { resolve } = usePassiveClasses()
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const emptySlotHighlight = useEmptySlotHighlight()
  const isMastery = isMasteryKind(data.kind)
  const isInitialNode = data.kind === 'initial'
  const isConnectNode = isConnectKind(data.kind)
  const connectOn = data.connectEnabled !== false
  const orbitSatelliteCount = useMemo(() => {
    if (!isMastery) return 0
    return getOrderedOrbitSatellites(nodes, id).length
  }, [nodes, id, isMastery])
  const isAmbientVisible = isMastery && orbitSatelliteCount === 0
  const nodePowered = useNodePowered(id)
  const powered = nodePowered || isInitialNode
  const showOrbitHighlight = emptySlotHighlight && data.kind === 'mastery' && !powered
  const canRelay = powered && canTransmitPower(data)
  const passiveClass = resolve(data.classId, data.kind)
  const stages = data.stages ?? []
  const totalLogged = totalRawLoggedAcrossStages(stages)
  const visibleBandCount =
    powered && kindUsesTrainingBands(data.kind)
      ? visibleNotableBandCount(totalLogged)
      : 0
  const showBands = visibleBandCount > 0
  const bandLevel = showBands ? stageBandLevel(stages) : 0
  const bandCount = showBands ? visibleBandCount : 0
  const orbitTierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const showOrbitRings = isMastery
  const orbitRingsUnlocked = isMastery && !data.orbitLocked
  const orbitRingsLocked = isMastery && Boolean(data.orbitLocked) && !emptySlotHighlight
  const orbitRingsForced = isMastery && Boolean(data.orbitLocked) && emptySlotHighlight
  const outerOrbitR = orbitTierRadius(orbitTierCount, orbitTierCount)
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = powered ? passiveClass.iconColor : UNPOWERED_ICON
  const iconId = passiveClass.iconId
  /** Powered mastery: thin rotating neon rim + Notable-like halo (no training bands). */
  const masteryNeonLit = isMastery && powered
  const outerBandR = masteryNeonLit
    ? masteryNeonOuterRadius(nodeSize)
    : outermostBandRadius(bandCount, nodeSize)
  const labelOffset = masteryNeonLit
    ? masteryNeonLabelOffset(nodeSize)
    : labelBelowBandOffset(bandCount, nodeSize)
  const connectR = nodeInteractRadius(data)

  const glowBlur = masteryNeonLit ? 24 : showBands ? 12 + bandLevel * 10 : 0
  const glowAlpha = masteryNeonLit
    ? 0.48
    : showBands
      ? Math.min(0.95, 0.28 + bandLevel * 0.16)
      : 0
  const haloStrength = masteryNeonLit
    ? 0.62
    : showBands
      ? Math.min(0.92, 0.28 + bandLevel * 0.18)
      : 0

  const fills = kindUsesTrainingBands(data.kind) ? notableBandFills(totalLogged) : []
  const done = fills.filter((f, i) => f >= (NOTABLE_BAND_GOALS[i] ?? 0)).length
  const activeFill = fills.findIndex((f, i) => f < (NOTABLE_BAND_GOALS[i] ?? 1))

  const connectGlowClass = isConnectNode
    ? powered
      ? connectOn
        ? ' is-connect-on'
        : ' is-connect-off'
      : ' is-connect-unpowered'
    : ''

  return (
    <div
      className={`passive-node passive-node--${data.kind}${selected ? ' is-selected' : ''}${
        powered ? '' : ' is-unpowered'
      }${showBands || masteryNeonLit ? ' has-bands' : ''}${
        isAmbientVisible ? ' is-ambient-visible' : ''
      }${
        showOrbitHighlight ? ' is-orbit-highlighted' : ''
      }${orbitRingsUnlocked ? ' has-orbit-rings-visible' : ''}${
        orbitRingsLocked ? ' has-orbit-rings-locked' : ''
      }${orbitRingsForced ? ' is-orbit-forced-visible' : ''}${
        masteryNeonLit ? ' is-mastery-powered' : ''
      }${connectGlowClass}`}
      style={
        {
          '--glow-blur': `${glowBlur}px`,
          '--glow-alpha': String(glowAlpha),
          '--halo-strength': String(haloStrength),
          '--band-level': String(masteryNeonLit ? 1.2 : bandLevel),
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
            const capacity = getOrbitTierCapacity(data, tier)
            const tierSats = getOrderedTierSatellites(nodes, id, tier)
            const occupied = new Set(
              tierSats.map((sat) => getSatelliteOrbitSlot(nodes, id, sat.id)),
            )
            const emptySlots = Array.from({ length: capacity }, (_, slot) => slot).filter(
              (slot) => !occupied.has(slot),
            )
            const startRad = (getTierStartAngle(data, tier) * Math.PI) / 180
            const showEmptySlots = !data.orbitLocked
            return (
              <div
                key={tier}
                className="passive-node__orbit-wrap"
                style={{ width: tierR * 2, height: tierR * 2 }}
              >
                <div
                  className="passive-node__orbit"
                  style={{ width: tierR * 2, height: tierR * 2 }}
                  aria-hidden
                />
                {showEmptySlots &&
                  emptySlots.map((slotIndex) => {
                  const angle = startRad + (2 * Math.PI * slotIndex) / capacity
                  const x = tierR + tierR * Math.cos(angle)
                  const y = tierR + tierR * Math.sin(angle)
                  return (
                    <div
                      key={`empty-${tier}-${slotIndex}`}
                      className={`passive-node__empty-slot${emptySlotHighlight ? ' is-highlighted' : ''}`}
                      style={{ left: x, top: y }}
                      aria-hidden
                    />
                  )
                })}
              </div>
            )
          })}
        </>
      )}

      <div className="passive-node__halo" aria-hidden />
      {masteryNeonLit && <div className="passive-node__neon-rim" aria-hidden />}
      {showBands && <TrainingBands stages={stages} nodeSize={nodeSize} />}

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
        {!isConnectNode && (
          <IconGlyph iconId={iconId} className="passive-node__glyph" />
        )}
      </div>

      <div className="passive-node__hit node-drag-handle" />

      <p className="passive-node__title">{data.label}</p>

      <div className="passive-node__tooltip" role="tooltip">
          <p className="passive-node__tooltip-title">{data.label}</p>
          <p className="passive-node__tooltip-meta">{PASSIVE_KIND_LABEL[data.kind]}</p>
          {!powered && !isInitialNode && (
            <p className="passive-node__tooltip-meta">파워 미공급</p>
          )}
          {isConnectNode && powered && !connectOn && (
            <p className="passive-node__tooltip-meta">Connect Off — 회로 차단</p>
          )}
          {powered && !canRelay && data.kind === 'notable' && (
            <p className="passive-node__tooltip-meta">1밴드(3) 미완료 — 파워 전달 불가</p>
          )}
          {!isInitialNode && !isConnectNode && (
            <p className="passive-node__tooltip-meta">클래스 · {passiveClass.label}</p>
          )}
          {showBands && (
            <p className="passive-node__tooltip-meta">
              로그 {totalLogged} · 밴드 {done}/{visibleBandCount}
              {activeFill >= 0 && activeFill < visibleBandCount
                ? ` · ${fills[activeFill]}/${NOTABLE_BAND_GOALS[activeFill]}`
                : ''}
            </p>
          )}
        </div>
    </div>
  )
}

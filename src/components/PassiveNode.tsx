import { Handle, Position, useStore, type Node, type NodeProps } from '@xyflow/react'
import { useMemo, type CSSProperties } from 'react'
import type { PassiveNodeData } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import {
  kindUsesTrainingBands,
  notableBandFills,
  notableBandGoalsForCount,
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
  isStealthPassiveKind,
  normalizeOrbitTierCount,
  NODE_SIZE,
  nodeInteractRadius,
  orbitTierRadius,
} from '../orbit'
import type { OrbitTier } from '../types'
import { isDefaultSymbolId, resolveSymbolLabel } from '../librarySymbols'
import { useNodePowered } from '../powerContext.shared'
import { DefaultNodeShape } from './DefaultNodeShape'
import { CustomSymbolGlyph } from './CustomSymbolGlyph'
import { useCustomSymbols } from '../customSymbolContext.shared'
import { useIsVideoPinned } from '../videoPinContext.shared'
import {
  labelBelowBandOffset,
  masteryNeonLabelOffset,
  masteryNeonOuterRadius,
  outermostBandRadius,
} from '../orbitGeometry'
import { TrainingBands } from './TrainingBands'
import {
  INITIAL_CONNECT_SLOT_COUNT,
  initialSocketOffset,
  ROOT_POWER_HANDLE_ID,
  rootSocketSourceHandle,
} from '../initialHub'
import { rootOrbitRingPercent } from '../rootOrbit'
import { useVoidHighlight } from '../voidHighlightContext.shared'
import './PassiveNode.css'

export type PassiveFlowNode = Node<PassiveNodeData, 'passive'>

const UNPOWERED_ICON = '#4a5560'
const UNPOWERED_GLOW = 'rgba(90, 100, 112, 0.12)'

export function PassiveNode({ id, data, selected }: NodeProps<PassiveFlowNode>) {
  const { customSymbols, getCustomSymbol, resolveSymbolColor } = useCustomSymbols()
  const pinnedVideo = useIsVideoPinned(id)
  const nodes = useStore((s) => s.nodes) as PassiveFlowNode[]
  const zoom = useStore((s) => s.transform[2])
  const voidHighlight = useVoidHighlight()
  const isStealth = isStealthPassiveKind(data.kind)
  const isMastery = isMasteryKind(data.kind)
  const isInitialNode = data.kind === 'initial'
  const isConnectNode = isConnectKind(data.kind)
  const connectOn = data.connectEnabled !== false
  const showVoidHighlight = voidHighlight && isStealth
  const orbitSatelliteCount = useMemo(() => {
    if (!isMastery) return 0
    return getOrderedOrbitSatellites(nodes, id).length
  }, [nodes, id, isMastery])
  const isAmbientVisible =
    (data.kind === 'void' && !data.masteryId) ||
    (isMastery && orbitSatelliteCount === 0)
  const nodePowered = useNodePowered(id)
  const powered = !isStealth && (nodePowered || isInitialNode)
  const showOrbitHighlight = voidHighlight && data.kind === 'mastery' && !powered
  const symbolLabel = resolveSymbolLabel(data.symbolId, customSymbols)
  const symbolColor = resolveSymbolColor(data.symbolId, data.kind)
  const useDefaultShape = isDefaultSymbolId(data.symbolId)
  const customSymbol = !useDefaultShape ? getCustomSymbol(data.symbolId) : null
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
  const orbitRingsLocked = isMastery && Boolean(data.orbitLocked) && !voidHighlight
  const orbitRingsForced = isMastery && Boolean(data.orbitLocked) && voidHighlight
  const outerOrbitR = orbitTierRadius(orbitTierCount, orbitTierCount)
  const nodeSize = NODE_SIZE[data.kind]
  const iconColor = powered ? symbolColor : UNPOWERED_ICON
  /** Powered mastery: thin rotating neon rim + Notable-like halo (no training bands). */
  const masteryNeonLit = isMastery && powered
  const outerBandR = masteryNeonLit
    ? masteryNeonOuterRadius(nodeSize)
    : outermostBandRadius(bandCount, nodeSize)
  const labelOffset = masteryNeonLit
    ? masteryNeonLabelOffset(nodeSize)
    : labelBelowBandOffset(bandCount, nodeSize)
  const connectR = nodeInteractRadius(data)

  const glowBlur = masteryNeonLit ? 10 : showBands ? 5 + bandLevel * 4 : 0
  const glowAlpha = masteryNeonLit
    ? 0.28
    : showBands
      ? Math.min(0.55, 0.16 + bandLevel * 0.1)
      : 0
  const haloStrength = masteryNeonLit
    ? 0.32
    : showBands
      ? Math.min(0.5, 0.14 + bandLevel * 0.1)
      : 0

  const bandGoals = kindUsesTrainingBands(data.kind)
    ? notableBandGoalsForCount(totalLogged)
    : []
  const fills = kindUsesTrainingBands(data.kind) ? notableBandFills(totalLogged) : []
  const done = fills.filter((f, i) => f >= (bandGoals[i] ?? 0)).length
  const activeFill = fills.findIndex((f, i) => f < (bandGoals[i] ?? 1))

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
        isStealth ? ' is-stealth' : ''
      }${isAmbientVisible ? ' is-ambient-visible' : ''}${
        showVoidHighlight ? ' is-void-highlighted' : ''
      }${
        showOrbitHighlight ? ' is-orbit-highlighted' : ''
      }${orbitRingsUnlocked ? ' has-orbit-rings-visible' : ''}${
        orbitRingsLocked ? ' has-orbit-rings-locked' : ''
      }${orbitRingsForced ? ' is-orbit-forced-visible' : ''}${
        masteryNeonLit ? ' is-mastery-powered' : ''
      }${
        data.kind === 'void' && data.voidPassing ? ' is-void-passing' : ''
      }${customSymbol ? ' has-custom-symbol' : ''}${
        pinnedVideo ? ' is-video-pinned' : ''
      }${connectGlowClass}`}
      style={
        {
          '--node-size': `${nodeSize}px`,
          '--glow-blur': `${glowBlur}px`,
          '--glow-alpha': String(glowAlpha),
          '--halo-strength': String(haloStrength),
          '--band-level': String(masteryNeonLit ? 1.2 : bandLevel),
          '--band-count': String(bandCount),
          '--outer-band-r': `${outerBandR}px`,
          '--connect-r': `${connectR}px`,
          '--icon-color': iconColor,
          '--label-offset': `${isInitialNode ? 0 : labelOffset}px`,
          '--orbit-r': `${outerOrbitR}px`,
          '--unpowered-glow': UNPOWERED_GLOW,
          '--tooltip-scale': String(1 / Math.max(zoom, 0.05)),
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
            const voidSlots = Array.from({ length: capacity }, (_, slot) => slot).filter(
              (slot) => !occupied.has(slot),
            )
            const startRad = (getTierStartAngle(data, tier) * Math.PI) / 180
            const showVoidSlots = !data.orbitLocked
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
                {showVoidSlots &&
                  voidSlots.map((slotIndex) => {
                  const angle = startRad + (2 * Math.PI * slotIndex) / capacity
                  const x = tierR + tierR * Math.cos(angle)
                  const y = tierR + tierR * Math.sin(angle)
                  return (
                    <div
                      key={`void-${tier}-${slotIndex}`}
                      className={`passive-node__void-slot${voidHighlight ? ' is-highlighted' : ''}`}
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

      {!isStealth && !isInitialNode && (
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

      {isInitialNode &&
        Array.from({ length: INITIAL_CONNECT_SLOT_COUNT }, (_, slotIndex) => {
          const slot = slotIndex as 0 | 1 | 2 | 3 | 4 | 5
          const pos = initialSocketOffset(slot)
          const handleStyle = {
            ['--root-socket-left' as string]: `${pos.left}px`,
            ['--root-socket-top' as string]: `${pos.top}px`,
            left: pos.left,
            top: pos.top,
          } as CSSProperties
          return (
            <span key={slot}>
              {/* Loose connectionMode: one source Handle per socket (in/out UX). */}
              <Handle
                id={rootSocketSourceHandle(slot)}
                type="source"
                position={Position.Top}
                className="passive-node__handle passive-node__handle--root-socket"
                style={handleStyle}
                isConnectable
              />
              <span
                className="passive-node__initial-socket"
                style={{ left: pos.left, top: pos.top }}
                aria-hidden
              />
            </span>
          )
        })}

      {isInitialNode && (
        <>
          {/* Power Core = source-only power start (drag must begin here). */}
          <Handle
            id={ROOT_POWER_HANDLE_ID}
            type="source"
            position={Position.Top}
            className="passive-node__handle passive-node__handle--root-power"
            isConnectable
          />
          <span className="passive-node__power-core" aria-hidden />
        </>
      )}

      <div className="passive-node__ring" aria-hidden>
        {isInitialNode && (
          <div className="passive-node__initial-arena">
            {([1, 2, 3] as const).map((tier) => (
              <span
                key={tier}
                className="passive-node__initial-orbit-ring"
                style={{
                  width: `${rootOrbitRingPercent(tier)}%`,
                  height: `${rootOrbitRingPercent(tier)}%`,
                }}
                aria-hidden
              />
            ))}
          </div>
        )}
        {!isStealth && !isConnectNode && !isInitialNode && (
          customSymbol ? (
            <CustomSymbolGlyph
              symbol={customSymbol}
              className="passive-node__glyph passive-node__glyph--symbol"
            />
          ) : (
            <DefaultNodeShape
              kind={data.kind}
              powered={powered}
              color={symbolColor}
              className="passive-node__glyph passive-node__glyph--default"
            />
          )
        )}
      </div>

      <div className="passive-node__hit node-drag-handle" />

      {!isInitialNode && <p className="passive-node__title">{data.label}</p>}
      {isInitialNode && <p className="passive-node__title passive-node__title--initial">{data.label}</p>}

      {!isStealth && (
        <div className="passive-node__tooltip" role="tooltip">
          <p className="passive-node__tooltip-title">{data.label}</p>
          <p className="passive-node__tooltip-meta">{PASSIVE_KIND_LABEL[data.kind]}</p>
          {!powered && !isInitialNode && (
            <p className="passive-node__tooltip-meta">파워 미공급</p>
          )}
          {isConnectNode && powered && !connectOn && (
            <p className="passive-node__tooltip-meta">Connect Off — 회로 차단</p>
          )}
          {!isInitialNode && !isConnectNode && (
            <p className="passive-node__tooltip-meta">Symbol · {symbolLabel}</p>
          )}
          {showBands && (
            <p className="passive-node__tooltip-meta">
              연습 {totalLogged}회 · 밴드 {done}/{visibleBandCount}
              {activeFill >= 0 && activeFill < visibleBandCount
                ? ` · ${fills[activeFill]}/${bandGoals[activeFill]}`
                : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

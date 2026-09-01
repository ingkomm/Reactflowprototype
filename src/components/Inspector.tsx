import { useState } from 'react'
import type {
  PassiveKind,
  PassiveNodeData,
  OrbitTier,
  OrbitTierCount,
  StageData,
  VideoMedia,
} from '../types'
import { ADDABLE_PASSIVE_KINDS, INITIAL_NODE_ID, PASSIVE_KIND_LABEL } from '../types'
import {
  ensureNotableStages,
  ensureSmallPracticeStages,
  kindUsesPracticeLogs,
  sortedStages,
} from '../stage'
import {
  getOrbitTierCapacity,
  getTierStartAngle,
  isMasteryKind,
  isStealthPassiveKind,
  normalizeOrbitTierCount,
  orbitAngleOptions,
} from '../orbit'
import {
  DEFAULT_SYMBOL_ID,
  customSymbolsForKind,
  isDefaultSymbolId,
} from '../librarySymbols'
import { useCustomSymbols } from '../customSymbolContext.shared'
import { DefaultNodeShape } from './DefaultNodeShape'
import { CustomSymbolGlyph } from './CustomSymbolGlyph'
import { VideoMediaPanel } from './VideoMediaPanel'
import { DailyLogPanel } from './DailyLogPanel'
import './Inspector.css'

export type OrbitMember = {
  id: string
  label: string
  kind: PassiveKind
  order: number
  tier: OrbitTier
  tierSize: number
}

export type LinkCandidate = {
  id: string
  label: string
  kind: PassiveKind
  linkKind: 'notable'
}

export type SelectedLink = {
  edgeId: string
  peerId: string
  peerLabel: string
  peerKind: PassiveKind
  linkKind: 'notable'
}

type Props = {
  nodeId: string | null
  data: PassiveNodeData | null
  masteryLabel?: string | null
  masteryTierCount?: OrbitTierCount | null
  orbitMembers?: OrbitMember[]
  selectedLinks?: SelectedLink[]
  linkCandidates?: LinkCandidate[]
  onRename: (nodeId: string, label: string) => void
  onChangeKind: (nodeId: string, kind: PassiveKind) => void
  onChangeSymbolId: (nodeId: string, symbolId: string) => void
  onChangeNodeMedia: (nodeId: string, media: VideoMedia[]) => void
  onChangeStages: (nodeId: string, stages: StageData[]) => void
  onChangeConnectEnabled: (nodeId: string, enabled: boolean) => void
  onChangeOrbitTierCount: (masteryId: string, tierCount: OrbitTierCount) => void
  onChangeSatelliteOrbitTier: (satelliteId: string, tier: OrbitTier) => void
  onChangeOrbitStartAngle: (masteryId: string, tier: OrbitTier, degrees: number) => void
  onChangeOrbitOrder: (masteryId: string, satelliteId: string, order1Based: number) => void
  onChangeOrbitLocked: (masteryId: string, locked: boolean) => void
  onChangeOrbitCapacity: (masteryId: string, tier: OrbitTier, capacity: number) => void
  onDetachFromMastery: (nodeId: string) => void
  onAddLink: (peerId: string) => void
  onDeleteNode: (nodeId: string) => void
}

export function Inspector({
  nodeId,
  data,
  masteryLabel,
  masteryTierCount = null,
  orbitMembers = [],
  selectedLinks = [],
  linkCandidates = [],
  onRename,
  onChangeKind,
  onChangeSymbolId,
  onChangeNodeMedia,
  onChangeStages,
  onChangeConnectEnabled,
  onChangeOrbitTierCount,
  onChangeSatelliteOrbitTier,
  onChangeOrbitStartAngle,
  onChangeOrbitOrder,
  onChangeOrbitLocked,
  onChangeOrbitCapacity,
  onDetachFromMastery,
  onAddLink,
  onDeleteNode,
}: Props) {
  const { customSymbols, resolveSymbolColor } = useCustomSymbols()
  const [addPeerId, setAddPeerId] = useState('')

  if (!nodeId || !data) {
    return (
      <aside className="inspector">
        <h2 className="inspector__title">Node Inspector</h2>
        <p className="inspector__empty">
          노드를 선택하면 심볼·단계별 띠와 트레이닝 로그를 편집할 수 있습니다.
        </p>
      </aside>
    )
  }

  const angleOptions = orbitAngleOptions()
  const orbitTierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const stages = sortedStages(data.stages ?? [])
  const kindCustomSymbols =
    data.kind === 'mastery' || data.kind === 'notable' || data.kind === 'small'
      ? customSymbolsForKind(customSymbols, data.kind)
      : []
  const currentSymbolId = isDefaultSymbolId(data.symbolId) ? DEFAULT_SYMBOL_ID : data.symbolId
  const isFixedInitial = nodeId === INITIAL_NODE_ID

  const patchStages = (next: StageData[]) => {
    if (data.kind === 'small') {
      onChangeStages(nodeId, ensureSmallPracticeStages(next))
      return
    }
    onChangeStages(nodeId, ensureNotableStages(next))
  }

  const practiceLogs =
    data.kind === 'small'
      ? ensureSmallPracticeStages(stages)[0]?.logs ?? []
      : ensureNotableStages(stages)[0]?.logs ?? []

  const handleLogsChange = (logs: typeof practiceLogs) => {
    if (data.kind === 'small') {
      const next = ensureSmallPracticeStages(stages)
      patchStages([{ ...next[0]!, logs }])
      return
    }
    const next = ensureNotableStages(stages)
    patchStages(next.map((stage, index) => (index === 0 ? { ...stage, logs } : stage)))
  }

  return (
    <aside className="inspector">
      <div className="inspector__header">
        <h2 className="inspector__title">
          {isMasteryKind(data.kind) ? 'Mastery Edit' : 'Node Inspector'}
        </h2>
        <div className="inspector__header-actions">
          {isMasteryKind(data.kind) && (
            <button
              type="button"
              className={`btn btn--ghost inspector__orbit-lock${data.orbitLocked ? ' is-active' : ''}`}
              aria-pressed={data.orbitLocked ?? false}
              onClick={() => onChangeOrbitLocked(nodeId, !(data.orbitLocked ?? false))}
            >
              {data.orbitLocked ? '🔒 오르빗 잠김' : '🔓 오르빗 잠금'}
            </button>
          )}
          <button type="button" className="btn btn--danger" onClick={() => onDeleteNode(nodeId)} disabled={isFixedInitial}>
            Delete
          </button>
        </div>
      </div>

      <label className="field">
        <span>Name</span>
        <input
          value={data.label}
          onChange={(e) => onRename(nodeId, e.target.value)}
          placeholder="Passive name"
          disabled={isFixedInitial}
        />
      </label>

      {isFixedInitial ? (
        <p className="inspector__empty">
          Root Node — 전원 소스. 생성·삭제·종류 변경 불가. 3개 소켓에서 Connect 노드에만
          링크로 전원을 공급합니다.
        </p>
      ) : (
      <label className="field">
        <span>Kind</span>
        <select
          value={data.kind}
          onChange={(e) => onChangeKind(nodeId, e.target.value as PassiveKind)}
        >
          {ADDABLE_PASSIVE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {PASSIVE_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </label>
      )}

      {data.kind === 'connect' && (
        <div className="field">
          <span>Connect</span>
          <div className="inspector__passing-toggle" role="group" aria-label="Connect circuit">
            <button
              type="button"
              className={`btn btn--ghost${data.connectEnabled !== false ? ' is-active' : ''}`}
              aria-pressed={data.connectEnabled !== false}
              onClick={() => onChangeConnectEnabled(nodeId, true)}
            >
              On
            </button>
            <button
              type="button"
              className={`btn btn--ghost${data.connectEnabled === false ? ' is-active' : ''}`}
              aria-pressed={data.connectEnabled === false}
              onClick={() => onChangeConnectEnabled(nodeId, false)}
            >
              Off
            </button>
          </div>
          <p className="field-hint">
            On = 초록 광원(회로 닫힘) · Off = 빨간 광원(회로 차단) · Root에서 전원 수신
          </p>
        </div>
      )}

      <div className="field">
        <span>Symbol</span>
        {data.kind !== 'initial' && data.kind !== 'void' && !isStealthPassiveKind(data.kind) ? (
          <>
            <div className="class-pick-grid" role="listbox" aria-label="Library symbol">
              <button
                type="button"
                role="option"
                aria-selected={currentSymbolId === DEFAULT_SYMBOL_ID}
                className={`class-pick${currentSymbolId === DEFAULT_SYMBOL_ID ? ' is-selected' : ''}`}
                title="Default"
                onClick={() => onChangeSymbolId(nodeId, DEFAULT_SYMBOL_ID)}
              >
                <span className="class-pick__icon class-pick__icon--default">
                  <DefaultNodeShape
                    kind={data.kind}
                    size={28}
                    color={resolveSymbolColor(DEFAULT_SYMBOL_ID, data.kind)}
                  />
                </span>
                <span className="class-pick__label">Default</span>
              </button>
              {kindCustomSymbols.map((symbol) => {
                const selected = currentSymbolId === symbol.id
                return (
                  <button
                    key={symbol.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`class-pick${selected ? ' is-selected' : ''}`}
                    title={symbol.name}
                    onClick={() => onChangeSymbolId(nodeId, symbol.id)}
                  >
                    <span className="class-pick__icon class-pick__icon--custom">
                      <CustomSymbolGlyph
                        symbol={symbol}
                        color={resolveSymbolColor(symbol.id, data.kind)}
                      />
                    </span>
                    <span className="class-pick__label">{symbol.name}</span>
                  </button>
                )
              })}
            </div>
            <p className="field-hint">왼쪽 Nodes의 ⚙ 버튼에서 색상·이미지 심볼을 설정할 수 있습니다.</p>
          </>
        ) : (
          <p className="inspector__empty">이 종류는 심볼을 선택할 수 없습니다.</p>
        )}
      </div>

      {(data.kind === 'notable' || data.kind === 'mastery') && (
        <div className="inspector__section">
          <VideoMediaPanel
            title="노드 동영상"
            media={data.media ?? []}
            onChange={(media) => onChangeNodeMedia(nodeId, media)}
          />
        </div>
      )}

      {isMasteryKind(data.kind) && (
        <>
          <p className="inspector__empty">
            Mastery — 띠·개인 링크 없음. 오르빗 위성에 파워가 도달하면 Mastery가 켜집니다. 용량
            미달 빈 슬롯은 자동 void 스페이싱.
          </p>
          <label className="field field--row">
            <span>Orbit lock</span>
            <input
              type="checkbox"
              checked={data.orbitLocked ?? false}
              onChange={(e) => onChangeOrbitLocked(nodeId, e.target.checked)}
            />
          </label>
          <p className="field-hint">
            {data.orbitLocked
              ? 'Lock 시 멤버 추가/제거·순서 변경 불가 · 오르빗 궤도 숨김 · 1~3단 함께 회전'
              : 'Lock 시 멤버 추가/제거·순서 변경만 불가합니다. 빈 오르빗 링을 드래그하면 해당 단만 회전합니다.'}
          </p>

          <label className="field">
            <span>Orbit tiers</span>
            <select
              value={orbitTierCount}
              onChange={(e) =>
                onChangeOrbitTierCount(nodeId, Number(e.target.value) as OrbitTierCount)
              }
            >
              <option value={1}>1단</option>
              <option value={2}>2단</option>
              <option value={3}>3단</option>
            </select>
          </label>
          <p className="field-hint">
            1단 직경 고정 · 2·3단은 바깥으로 추가 · 단별 용량 초과 시 추가 불가 · 빈 슬롯 = 자동
            void
          </p>

          {Array.from({ length: orbitTierCount }, (_, index) => {
            const tier = (index + 1) as OrbitTier
            const capacity = getOrbitTierCapacity(data, tier)
            const memberCount = orbitMembers.filter((m) => m.tier === tier).length
            const minCapacity = Math.max(1, memberCount)
            return (
              <label key={`cap-${tier}`} className="field">
                <span>{tier}단 용량</span>
                <input
                  type="number"
                  min={minCapacity}
                  max={24}
                  value={capacity}
                  onChange={(e) => {
                    const value = Math.max(minCapacity, Math.min(24, Number(e.target.value) || minCapacity))
                    onChangeOrbitCapacity(nodeId, tier, value)
                  }}
                />
              </label>
            )
          })}

          {data.orbitLocked ? (
            <>
              <label className="field">
                <span>오르빗 회전 각도</span>
                <select
                  value={getTierStartAngle(data, 1)}
                  onChange={(e) => onChangeOrbitStartAngle(nodeId, 1, Number(e.target.value))}
                >
                  {angleOptions.map((deg) => (
                    <option key={deg} value={deg}>
                      {deg}°
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">잠금 중 · 1~3단 동시 회전 · 오르빗 궤도는 표시되지 않음</p>
            </>
          ) : (
            <>
              {Array.from({ length: orbitTierCount }, (_, index) => {
                const tier = (index + 1) as OrbitTier
                const startAngle = getTierStartAngle(data, tier)
                return (
                  <label key={tier} className="field">
                    <span>{tier}단 시작 각도</span>
                    <select
                      value={startAngle}
                      onChange={(e) =>
                        onChangeOrbitStartAngle(nodeId, tier, Number(e.target.value))
                      }
                    >
                      {angleOptions.map((deg) => (
                        <option key={deg} value={deg}>
                          {deg}°
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })}
              <p className="field-hint">각 단은 독립 각도 · 캔버스에서 해당 단 링 드래그로 회전</p>
            </>
          )}

          <div className="inspector__section">
            <div className="inspector__section-head">
              <h3>Orbit slots (clockwise)</h3>
            </div>
            {orbitMembers.length === 0 ? (
              <p className="inspector__empty">No passives on this orbit yet.</p>
            ) : (
              <ul className="orbit-list">
                {orbitMembers.map((member) => (
                  <li key={member.id} className="orbit-item">
                    <span className="orbit-item__label">
                      {member.label}
                      <small>{PASSIVE_KIND_LABEL[member.kind]}</small>
                    </span>
                    <select
                      aria-label={`Slot for ${member.label}`}
                      value={member.order}
                      disabled={data.orbitLocked}
                      onChange={(e) =>
                        onChangeOrbitOrder(nodeId, member.id, Number(e.target.value))
                      }
                    >
                      {Array.from({ length: member.tierSize }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          슬롯 {i + 1}
                        </option>
                      ))}
                    </select>
                    {orbitTierCount > 1 && (
                      <select
                        aria-label={`Tier for ${member.label}`}
                        value={member.tier}
                        disabled={data.orbitLocked}
                        onChange={(e) =>
                          onChangeSatelliteOrbitTier(
                            member.id,
                            Number(e.target.value) as OrbitTier,
                          )
                        }
                      >
                        {Array.from({ length: orbitTierCount }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}단
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {data.kind === 'notable' && (
        <div className="inspector__section">
          <div className="inspector__section-head">
            <h3>Notable links</h3>
          </div>
          <p className="inspector__empty">
            다른 Notable 노드와만 연결 가능 · 매우 연한 직선 affinity 링크 (파워 경로와 무관)
          </p>

          {selectedLinks.length > 0 && (
            <ul className="orbit-list">
              {selectedLinks.map((link) => (
                <li key={link.edgeId} className="orbit-item">
                  <span className="orbit-item__label">{link.peerLabel}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="link-add">
            <select
              value={addPeerId}
              onChange={(e) => setAddPeerId(e.target.value)}
              disabled={linkCandidates.length === 0}
            >
              <option value="">
                {linkCandidates.length === 0 ? '연결 가능한 Notable 없음' : 'Notable 선택…'}
              </option>
              {linkCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!addPeerId}
              onClick={() => {
                if (!addPeerId) return
                onAddLink(addPeerId)
                setAddPeerId('')
              }}
            >
              + Link
            </button>
          </div>
        </div>
      )}

      {(data.kind === 'small' || data.kind === 'notable') && (
        <>
          <div className="inspector__section">
            <div className="inspector__section-head">
              <h3>Mastery orbit</h3>
              {data.masteryId && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onDetachFromMastery(nodeId)}
                >
                  Detach
                </button>
              )}
            </div>
            <p className="inspector__empty">
              {data.masteryId
                ? `Orbit of: ${masteryLabel ?? data.masteryId}`
                : 'Not on an orbit. Connect to a Mastery (membership only).'}
            </p>
            {data.masteryId && masteryTierCount !== null && masteryTierCount > 1 && (
              <label className="field">
                <span>Orbit tier</span>
                <select
                  value={data.orbitTier ?? 1}
                  onChange={(e) =>
                    onChangeSatelliteOrbitTier(nodeId, Number(e.target.value) as OrbitTier)
                  }
                >
                  {Array.from({ length: masteryTierCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}단
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </>
      )}

      {kindUsesPracticeLogs(data.kind) && (
        <DailyLogPanel logs={practiceLogs} onChangeLogs={handleLogsChange} />
      )}
    </aside>
  )
}

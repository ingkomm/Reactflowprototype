import { useEffect, useState } from 'react'
import type {
  PassiveKind,
  PassiveNodeData,
  OrbitTier,
  OrbitTierCount,
  StageData,
} from '../types'
import { ADDABLE_PASSIVE_KINDS, PASSIVE_KIND_LABEL } from '../types'
import {
  createTrainingLog,
  ensureNotableStages,
  kindUsesTrainingBands,
  notableBandFills,
  NOTABLE_BAND_GOALS,
  sortedStages,
  totalRawLoggedAcrossStages,
} from '../stage'
import {
  getOrbitTierCapacity,
  getTierStartAngle,
  isMasteryKind,
  isStealthPassiveKind,
  normalizeOrbitTierCount,
  orbitAngleOptions,
} from '../orbit'
import { classesForKind } from '../passiveClass'
import { usePassiveClasses } from '../PassiveClassContext'
import { IconGlyph } from './IconGlyph'
import './Inspector.css'

export type OrbitMember = {
  id: string
  label: string
  kind: PassiveKind
  order: number
  tier: OrbitTier
  tierSize: number
}

export type LinkItem = {
  edgeId: string
  peerId: string
  peerLabel: string
  peerKind: PassiveKind
  linkKind: 'center' | 'orbit'
}

export type LinkCandidate = {
  id: string
  label: string
  kind: PassiveKind
  linkKind: 'center' | 'orbit'
}

type Props = {
  nodeId: string | null
  data: PassiveNodeData | null
  masteryLabel?: string | null
  masteryTierCount?: OrbitTierCount | null
  orbitMembers?: OrbitMember[]
  links?: LinkItem[]
  linkCandidates?: LinkCandidate[]
  onRename: (nodeId: string, label: string) => void
  onChangeKind: (nodeId: string, kind: PassiveKind) => void
  onChangeClassId: (nodeId: string, classId: string) => void
  onChangeStages: (nodeId: string, stages: StageData[]) => void
  onChangeOrbitTierCount: (masteryId: string, tierCount: OrbitTierCount) => void
  onChangeSatelliteOrbitTier: (satelliteId: string, tier: OrbitTier) => void
  onChangeOrbitStartAngle: (masteryId: string, tier: OrbitTier, degrees: number) => void
  onChangeOrbitOrder: (masteryId: string, satelliteId: string, order1Based: number) => void
  onChangeOrbitLocked: (masteryId: string, locked: boolean) => void
  onChangeOrbitCapacity: (masteryId: string, tier: OrbitTier, capacity: number) => void
  onChangeVoidPassing: (nodeId: string, passing: boolean) => void
  onDetachFromMastery: (nodeId: string) => void
  onRemoveLink: (edgeId: string) => void
  onAddLink: (peerId: string) => void
  onDeleteNode: (nodeId: string) => void
}


export function Inspector({
  nodeId,
  data,
  masteryLabel,
  masteryTierCount = null,
  orbitMembers = [],
  links = [],
  linkCandidates = [],
  onRename,
  onChangeKind,
  onChangeClassId,
  onChangeStages,
  onChangeOrbitTierCount,
  onChangeSatelliteOrbitTier,
  onChangeOrbitStartAngle,
  onChangeOrbitOrder,
  onChangeOrbitLocked,
  onChangeOrbitCapacity,
  onChangeVoidPassing,
  onDetachFromMastery,
  onRemoveLink,
  onAddLink,
  onDeleteNode,
}: Props) {
  const { classes, resolve } = usePassiveClasses()
  const [addPeerId, setAddPeerId] = useState('')
  const [expandedStageIds, setExpandedStageIds] = useState<string[]>([])

  useEffect(() => {
    setExpandedStageIds([])
  }, [nodeId])

  if (!nodeId || !data) {
    return (
      <aside className="inspector">
        <h2 className="inspector__title">Node Inspector</h2>
        <p className="inspector__empty">
          노드를 선택하면 클래스·단계별 띠와 트레이닝 로그를 편집할 수 있습니다.
        </p>
      </aside>
    )
  }

  const angleOptions = orbitAngleOptions()
  const orbitTierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const stages = sortedStages(data.stages ?? [])
  const kindClasses = classesForKind(classes, data.kind)
  const currentClass = resolve(data.classId, data.kind)

  const patchStages = (next: StageData[]) => {
    onChangeStages(nodeId, ensureNotableStages(next))
  }

  const toggleStageExpanded = (stageId: string) => {
    setExpandedStageIds((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId],
    )
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
          <button type="button" className="btn btn--danger" onClick={() => onDeleteNode(nodeId)}>
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
        />
      </label>

      <label className="field">
        <span>Kind</span>
        <select
          value={data.kind}
          onChange={(e) => onChangeKind(nodeId, e.target.value as PassiveKind)}
        >
          {(ADDABLE_PASSIVE_KINDS).map((kind) => (
            <option key={kind} value={kind}>
              {PASSIVE_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>클래스</span>
        {data.kind !== 'initial' && !isStealthPassiveKind(data.kind) ? (
          <>
            <div className="class-pick-grid" role="listbox" aria-label="패시브 클래스">
              {kindClasses.map((cls) => {
                const selected = currentClass.id === cls.id
                return (
                  <button
                    key={cls.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`class-pick${selected ? ' is-selected' : ''}`}
                    title={cls.label}
                    onClick={() => onChangeClassId(nodeId, cls.id)}
                  >
                    <span className="class-pick__icon" style={{ color: cls.iconColor }}>
                      <IconGlyph iconId={cls.iconId} />
                    </span>
                    <span className="class-pick__label">{cls.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="field-hint">아이콘·색상은 우측 상단 클래스 관리에서 편집합니다.</p>
          </>
        ) : (
          <p className="inspector__empty">이 종류는 클래스를 사용하지 않습니다.</p>
        )}
      </div>

      {data.kind === 'void' && (
        <>
          <p className="inspector__empty">
            Void spacer — 오르빗 빈 칸을 수동으로 채울 때만 사용. 용량 미달 빈 슬롯도 개념상 void입니다.
            Void Master는 더 이상 쓰지 않습니다.
          </p>
          <div className="field">
            <span>Passing</span>
            <div className="inspector__passing-toggle" role="group" aria-label="Passing">
              <button
                type="button"
                className={`btn btn--ghost${data.voidPassing ? ' is-active' : ''}`}
                aria-pressed={Boolean(data.voidPassing)}
                onClick={() => onChangeVoidPassing(nodeId, true)}
              >
                On
              </button>
              <button
                type="button"
                className={`btn btn--ghost${!data.voidPassing ? ' is-active' : ''}`}
                aria-pressed={!data.voidPassing}
                onClick={() => onChangeVoidPassing(nodeId, false)}
              >
                Off
              </button>
            </div>
            <p className="field-hint">
              On이면 Passing Void를 사이에 둔 Small/Notable끼리 오르빗 링크가 가능합니다.
            </p>
          </div>
        </>
      )}

      {isMasteryKind(data.kind) && (
        <>
          <p className="inspector__empty">
            Mastery — 띠·개인 링크 없음. 오르빗 위성에 파워가 도달하면 Mastery가 켜집니다. 빈 용량
            슬롯 = void.
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
            1단 직경 고정 · 2·3단은 바깥으로 추가 · 멤버 드래그로 단 배치 · 단별 용량 초과 시 추가
            불가 (빈 칸 = void)
          </p>

          {Array.from({ length: orbitTierCount }, (_, index) => {
            const tier = (index + 1) as OrbitTier
            const capacity = getOrbitTierCapacity(data, tier)
            return (
              <label key={`cap-${tier}`} className="field">
                <span>{tier}단 용량</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={capacity}
                    onChange={(e) => {
                      const value = Math.max(1, Math.min(24, Number(e.target.value) || 1))
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
              <h3>Orbit order (clockwise)</h3>
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
                      aria-label={`Order for ${member.label}`}
                      value={member.order}
                      disabled={data.orbitLocked}
                      onChange={(e) =>
                        onChangeOrbitOrder(nodeId, member.id, Number(e.target.value))
                      }
                    >
                      {orbitMembers
                        .filter((m) => m.tier === member.tier)
                        .map((_, i) => (
                          <option key={i + 1} value={i + 1}>
                            #{i + 1}
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

      {(data.kind === 'initial' ||
        data.kind === 'small' ||
        data.kind === 'notable' ||
        data.kind === 'mastery') && (
        <div className="inspector__section">
          <div className="inspector__section-head">
            <h3>Links</h3>
          </div>
          {data.kind === 'initial' && (
            <p className="inspector__empty">Initial Node는 Small Passive에만 직선 링크로 파워를 공급합니다.</p>
          )}
          {data.kind === 'mastery' && (
            <p className="inspector__empty">
              Mastery는 개인 링크가 없습니다. 오르빗 위성에 파워가 도달하면 Mastery가 켜집니다.
            </p>
          )}
          {(data.kind === 'small' || data.kind === 'notable') && (
            <p className="inspector__empty">
              같은 단 = 인접 노드만 호 링크 · 인접 단(1↔2, 2↔3) = 직선 호 링크 · 1↔3 불가 · 오르빗 밖 = 직선 링크 · Notable끼리 직선 연결 불가
            </p>
          )}
          {links.length === 0 ? (
            <p className="inspector__empty">No passive links yet.</p>
          ) : (
            <ul className="link-list">
              {links.map((link) => (
                <li key={link.edgeId} className="link-item">
                  <span>
                    {link.peerLabel}
                    <small>
                      {PASSIVE_KIND_LABEL[link.peerKind]}
                      {link.linkKind === 'orbit' ? ' · 오르빗' : ' · 직선'}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="btn btn--icon"
                    onClick={() => onRemoveLink(link.edgeId)}
                    aria-label={`Remove link to ${link.peerLabel}`}
                  >
                    ×
                  </button>
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
                {linkCandidates.length === 0 ? 'No partners available' : 'Select partner…'}
              </option>
              {linkCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({PASSIVE_KIND_LABEL[c.kind]}
                  {c.linkKind === 'orbit' ? ', 오르빗' : ', 직선'})
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

      {(data.kind === 'small' || data.kind === 'notable' || data.kind === 'void') && (
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
                : 'Not on an orbit. Connect to a Mastery or Void Master (membership only).'}
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

      {kindUsesTrainingBands(data.kind) && (
      <div className="inspector__section">
        <div className="inspector__section-head">
          <h3>Notable 띠 (누적 3·5·7)</h3>
        </div>
        <p className="inspector__empty">
          총 횟수가 안쪽부터 3 → 5 → 7 칸을 채웁니다. 완료돼도 원형이 아니라 세그먼트로
          표시됩니다. 1밴드(3) 완료 시 파워 전달.
        </p>
        {(() => {
          const total = totalRawLoggedAcrossStages(stages)
          const fills = notableBandFills(total)
          return (
            <p className="field-hint">
              누적 {total}회 ·{' '}
              {NOTABLE_BAND_GOALS.map((goal, i) => `${fills[i]}/${goal}`).join(' · ')}
            </p>
          )
        })()}

        <ul className="stage-list">
          {ensureNotableStages(stages).map((stage, bandIndex) => {
            const total = totalRawLoggedAcrossStages(stages)
            const fills = notableBandFills(total)
            const filled = fills[bandIndex] ?? 0
            const complete = filled >= stage.goal
            const expanded = expandedStageIds.includes(stage.id)
            const isPool = bandIndex === 0
            return (
              <li key={stage.id} className={`stage-card${complete ? ' is-complete' : ''}`}>
                <div className="stage-card__head">
                  <button
                    type="button"
                    className="stage-card__toggle"
                    aria-expanded={expanded}
                    onClick={() => toggleStageExpanded(stage.id)}
                  >
                    <span className="stage-card__chevron" aria-hidden>
                      {expanded ? '▾' : '▸'}
                    </span>
                    <span className="stage-card__title">
                      <strong>밴드 {stage.goal}</strong>
                      <small>
                        {filled}/{stage.goal}
                        {complete ? ' · 채움' : ''}
                        {isPool ? ' · 로그 풀' : ''}
                      </small>
                    </span>
                  </button>
                </div>
                {expanded && isPool && (
                  <div className="stage-card__body">
                    <div className="inspector__section-head">
                      <h4>트레이닝 로그</h4>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          const next = ensureNotableStages(stages)
                          const pool = next[0]!
                          patchStages(
                            next.map((s, i) =>
                              i === 0
                                ? { ...pool, logs: [...pool.logs, createTrainingLog('Session', 1)] }
                                : s,
                            ),
                          )
                        }}
                      >
                        + 로그
                      </button>
                    </div>
                    {ensureNotableStages(stages)[0]!.logs.length === 0 ? (
                      <p className="inspector__empty">로그 없음</p>
                    ) : (
                      <ul className="training-list">
                        {ensureNotableStages(stages)[0]!.logs.map((log) => (
                          <li key={log.id} className="training-item">
                            <input
                              className="training-item__label"
                              value={log.label}
                              onChange={(e) => {
                                const next = ensureNotableStages(stages)
                                const pool = next[0]!
                                patchStages(
                                  next.map((s, i) =>
                                    i === 0
                                      ? {
                                          ...pool,
                                          logs: pool.logs.map((l) =>
                                            l.id === log.id ? { ...l, label: e.target.value } : l,
                                          ),
                                        }
                                      : s,
                                  ),
                                )
                              }}
                              placeholder="로그 이름"
                            />
                            <input
                              className="training-item__count"
                              type="number"
                              min={0}
                              value={log.count}
                              onChange={(e) => {
                                const count = Math.max(0, Number(e.target.value) || 0)
                                const next = ensureNotableStages(stages)
                                const pool = next[0]!
                                patchStages(
                                  next.map((s, i) =>
                                    i === 0
                                      ? {
                                          ...pool,
                                          logs: pool.logs.map((l) =>
                                            l.id === log.id ? { ...l, count } : l,
                                          ),
                                        }
                                      : s,
                                  ),
                                )
                              }}
                              aria-label="Training count"
                            />
                            <button
                              type="button"
                              className="btn btn--icon"
                              onClick={() => {
                                const next = ensureNotableStages(stages)
                                const pool = next[0]!
                                patchStages(
                                  next.map((s, i) =>
                                    i === 0
                                      ? {
                                          ...pool,
                                          logs: pool.logs.filter((l) => l.id !== log.id),
                                        }
                                      : s,
                                  ),
                                )
                              }}
                              aria-label="로그 삭제"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      )}

      {(data.kind === 'small' || data.kind === 'initial') && (
        <p className="inspector__empty">
          Connect 노드 — 띠 없음. 파워가 들어오면 그대로 전달합니다.
        </p>
      )}

    </aside>
  )
}

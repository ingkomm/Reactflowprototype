import { useEffect, useState, type DragEvent } from 'react'
import type {
  PassiveKind,
  PassiveNodeData,
  OrbitTier,
  OrbitTierCount,
  StageData,
  TrainingLog,
} from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import {
  createStage,
  createTrainingLog,
  isStageComplete,
  sortedStages,
  stageLoggedCount,
  stageRawLoggedCount,
  withNormalizedStage,
} from '../stage'
import {
  DEFAULT_ORBIT_START_ANGLE,
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
  onChangeOrbitStartAngle: (nodeId: string, degrees: number) => void
  onChangeOrbitOrder: (masteryId: string, satelliteId: string, order1Based: number) => void
  onChangeOrbitLocked: (masteryId: string, locked: boolean) => void
  onChangeVoidPassing: (nodeId: string, passing: boolean) => void
  onDetachFromMastery: (nodeId: string) => void
  onRemoveLink: (edgeId: string) => void
  onAddLink: (peerId: string) => void
  onDeleteNode: (nodeId: string) => void
}

function reindexStages(stages: StageData[]): StageData[] {
  return stages.map((stage, i) => ({
    ...withNormalizedStage(stage),
    index: i + 1,
  }))
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
  onChangeVoidPassing,
  onDetachFromMastery,
  onRemoveLink,
  onAddLink,
  onDeleteNode,
}: Props) {
  const { classes, resolve } = usePassiveClasses()
  const [addPeerId, setAddPeerId] = useState('')
  const [expandedStageIds, setExpandedStageIds] = useState<string[]>([])
  const [dragStageId, setDragStageId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  useEffect(() => {
    setExpandedStageIds([])
    setDragStageId(null)
    setDragOverStageId(null)
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
  const startAngle = data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE
  const orbitTierCount = normalizeOrbitTierCount(data.orbitTierCount)
  const stages = sortedStages(data.stages ?? [])
  const kindClasses = classesForKind(classes, data.kind)
  const currentClass = resolve(data.classId, data.kind)

  const patchStages = (next: StageData[]) => {
    onChangeStages(nodeId, reindexStages(next))
  }

  const updateStage = (stageId: string, patch: Partial<StageData>) => {
    patchStages(
      stages.map((stage) => {
        if (stage.id !== stageId) return stage
        return withNormalizedStage({ ...stage, ...patch })
      }),
    )
  }

  const addStage = () => {
    const index = stages.length + 1
    patchStages([...stages, createStage(index)])
  }

  const removeStage = (stageId: string) => {
    patchStages(stages.filter((s) => s.id !== stageId))
  }

  const addLog = (stageId: string) => {
    patchStages(
      stages.map((stage) => {
        if (stage.id !== stageId) return stage
        const log = createTrainingLog(`로그 ${stage.logs.length + 1}`, 1)
        return withNormalizedStage({ ...stage, logs: [...stage.logs, log] })
      }),
    )
  }

  const updateLog = (
    stageId: string,
    logId: string,
    patch: Partial<Pick<TrainingLog, 'label' | 'count' | 'note'>>,
  ) => {
    patchStages(
      stages.map((stage) => {
        if (stage.id !== stageId) return stage
        const logs = stage.logs.map((log) =>
          log.id === logId ? { ...log, ...patch } : log,
        )
        return withNormalizedStage({ ...stage, logs })
      }),
    )
  }

  const removeLog = (stageId: string, logId: string) => {
    patchStages(
      stages.map((stage) => {
        if (stage.id !== stageId) return stage
        return withNormalizedStage({
          ...stage,
          logs: stage.logs.filter((log) => log.id !== logId),
        })
      }),
    )
  }

  const toggleStageExpanded = (stageId: string) => {
    setExpandedStageIds((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId],
    )
  }

  const reorderStage = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const list = [...stages]
    const from = list.findIndex((s) => s.id === fromId)
    const to = list.findIndex((s) => s.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved!)
    patchStages(list)
  }

  const onStageDragStart = (event: DragEvent, stageId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/stage-id', stageId)
    setDragStageId(stageId)
  }

  const onStageDragOver = (event: DragEvent, stageId: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverStageId !== stageId) setDragOverStageId(stageId)
  }

  const onStageDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    const fromId = event.dataTransfer.getData('text/stage-id') || dragStageId
    if (fromId) reorderStage(fromId, targetId)
    setDragStageId(null)
    setDragOverStageId(null)
  }

  const onStageDragEnd = () => {
    setDragStageId(null)
    setDragOverStageId(null)
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
          {(Object.keys(PASSIVE_KIND_LABEL) as PassiveKind[]).map((kind) => (
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
            Void Node — 오르빗 배치용. 파워·직접 링크·띠 없음. 오르빗에 속하지 않을 때만
            표시됩니다.
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

      {data.kind === 'voidMastery' && (
        <p className="inspector__empty">
          Void Master Node — Mastery와 같이 오르빗을 갖지만 링크·파워·띠·아이콘 없음. 오르빗이
          비어 있을 때만 표시됩니다.
        </p>
      )}

      {isMasteryKind(data.kind) && (
        <>
          <label className="field field--row">
            <span>Orbit lock</span>
            <input
              type="checkbox"
              checked={data.orbitLocked ?? false}
              onChange={(e) => onChangeOrbitLocked(nodeId, e.target.checked)}
            />
          </label>
          <p className="field-hint">
            Lock 시 멤버 추가/제거·순서 변경만 불가합니다. 오르빗 회전은 가능합니다.
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
            같은 단에서는 인접 노드만 호 링크 · 다른 단 사이에는 인접 제한 없음
          </p>

          <label className="field">
            <span>Orbit start angle</span>
            <select
              value={startAngle}
              onChange={(e) => onChangeOrbitStartAngle(nodeId, Number(e.target.value))}
            >
              {angleOptions.map((deg) => (
                <option key={deg} value={deg}>
                  {deg}°
                </option>
              ))}
            </select>
          </label>

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
                      {orbitMembers.map((_, i) => (
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
              같은 오르빗의 Notable과 직선 링크가 있어야 파워가 공급됩니다.
            </p>
          )}
          {(data.kind === 'small' || data.kind === 'notable') && (
            <p className="inspector__empty">
              같은 단 = 인접 노드만 호 링크 · 다른 단 = 제한 없음 · 오르빗 밖 = 직선 링크 · Notable끼리 직선 연결 불가
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

      {data.kind !== 'initial' && !isStealthPassiveKind(data.kind) && (
      <div className="inspector__section">
        <div className="inspector__section-head">
          <h3>단계 (띠)</h3>
          <button type="button" className="btn btn--ghost" onClick={addStage}>
            + 단계
          </button>
        </div>
        <p className="inspector__empty">
          안쪽 원 = 1단계. 핸들로 순서 변경 · 제목을 눌러 상세 펼침.
        </p>

        {stages.length === 0 ? (
          <p className="inspector__empty">단계가 없습니다.</p>
        ) : (
          <ul className="stage-list">
            {stages.map((stage) => {
              const logged = stageLoggedCount(stage)
              const rawLogged = stageRawLoggedCount(stage)
              const complete = isStageComplete(stage)
              const expanded = expandedStageIds.includes(stage.id)
              return (
                <li
                  key={stage.id}
                  className={`stage-card${complete ? ' is-complete' : ''}${
                    dragStageId === stage.id ? ' is-dragging' : ''
                  }${dragOverStageId === stage.id && dragStageId !== stage.id ? ' is-drop-target' : ''}`}
                  onDragOver={(e) => onStageDragOver(e, stage.id)}
                  onDrop={(e) => onStageDrop(e, stage.id)}
                  onDragEnd={onStageDragEnd}
                >
                  <div className="stage-card__head">
                    <button
                      type="button"
                      className="stage-card__drag"
                      draggable
                      aria-label={`${stage.label} 순서 변경`}
                      title="드래그해서 순서 변경"
                      onDragStart={(e) => onStageDragStart(e, stage.id)}
                      onClick={(e) => e.preventDefault()}
                    >
                      ⋮⋮
                    </button>
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
                        <strong>
                          #{stage.index} {stage.label}
                        </strong>
                        <small>
                          {rawLogged > stage.goal
                            ? `${logged}/${stage.goal} · 로그 ${rawLogged}`
                            : `${rawLogged}/${stage.goal}`}
                          {complete ? ' · 완료' : ''}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon"
                      onClick={() => removeStage(stage.id)}
                      aria-label="단계 삭제"
                    >
                      ×
                    </button>
                  </div>

                  {expanded && (
                    <div className="stage-card__body">
                      <label className="field">
                        <span>이름</span>
                        <input
                          value={stage.label}
                          onChange={(e) => updateStage(stage.id, { label: e.target.value })}
                        />
                      </label>

                      <div className="stats-row">
                        <label className="field">
                          <span>목표 (칸)</span>
                          <input
                            type="number"
                            min={1}
                            value={stage.goal}
                            onChange={(e) =>
                              updateStage(stage.id, {
                                goal: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>진행 (띠)</span>
                          <input
                            type="text"
                            readOnly
                            value={
                              rawLogged > stage.goal
                                ? `${logged}/${stage.goal} · 로그 ${rawLogged}`
                                : `${rawLogged} / ${stage.goal}`
                            }
                          />
                        </label>
                      </div>

                      <label className="stage-complete">
                        <input
                          type="checkbox"
                          checked={stage.completedManually || rawLogged >= stage.goal}
                          onChange={(e) => {
                            if (rawLogged >= stage.goal) return
                            updateStage(stage.id, { completedManually: e.target.checked })
                          }}
                        />
                        <span>
                          {rawLogged >= stage.goal
                            ? '목표 달성으로 완료'
                            : stage.completedManually
                              ? '수동 완료됨'
                              : '수동 완료 표시'}
                        </span>
                      </label>

                      <div className="inspector__section-head">
                        <h3>트레이닝 로그</h3>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => addLog(stage.id)}
                        >
                          + 로그
                        </button>
                      </div>

                      {stage.logs.length === 0 ? (
                        <p className="inspector__empty">로그 없음</p>
                      ) : (
                        <ul className="training-list">
                          {stage.logs.map((log) => (
                            <li key={log.id} className="training-item">
                              <input
                                className="training-item__label"
                                value={log.label}
                                onChange={(e) =>
                                  updateLog(stage.id, log.id, { label: e.target.value })
                                }
                                placeholder="로그 이름"
                              />
                              <input
                                className="training-item__count"
                                type="number"
                                min={0}
                                value={log.count}
                                onChange={(e) =>
                                  updateLog(stage.id, log.id, {
                                    count: Number(e.target.value) || 0,
                                  })
                                }
                                aria-label="Training count"
                              />
                              <input
                                className="training-item__note"
                                value={log.note ?? ''}
                                onChange={(e) =>
                                  updateLog(stage.id, log.id, { note: e.target.value })
                                }
                                placeholder="메모"
                              />
                              <button
                                type="button"
                                className="btn btn--icon"
                                onClick={() => removeLog(stage.id, log.id)}
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
        )}
      </div>
      )}
    </aside>
  )
}

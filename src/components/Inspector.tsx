import { useState } from 'react'
import type {
  NodeIconColor,
  PassiveKind,
  PassiveNodeData,
  StageData,
  TrainingLog,
} from '../types'
import { NODE_ICON_COLORS, PASSIVE_KIND_LABEL } from '../types'
import { getIconDef } from '../icons'
import {
  clampStageLogs,
  createStage,
  createTrainingLog,
  isStageComplete,
  sortedStages,
  stageLoggedCount,
  withClampedStage,
} from '../stage'
import {
  DEFAULT_ORBIT_RADIUS,
  DEFAULT_ORBIT_START_ANGLE,
  orbitAngleOptions,
} from '../orbit'
import { IconGlyph } from './IconGlyph'
import { IconPicker } from './IconPicker'
import './Inspector.css'

export type OrbitMember = {
  id: string
  label: string
  kind: PassiveKind
  order: number
}

export type LinkItem = {
  edgeId: string
  peerId: string
  peerLabel: string
  peerKind: PassiveKind
}

export type LinkCandidate = {
  id: string
  label: string
  kind: PassiveKind
}

type Props = {
  nodeId: string | null
  data: PassiveNodeData | null
  masteryLabel?: string | null
  orbitMembers?: OrbitMember[]
  links?: LinkItem[]
  linkCandidates?: LinkCandidate[]
  onRename: (nodeId: string, label: string) => void
  onChangeKind: (nodeId: string, kind: PassiveKind) => void
  onChangeIconColor: (nodeId: string, color: NodeIconColor) => void
  onChangeIconId: (nodeId: string, iconId: string) => void
  onChangeProficiency: (nodeId: string, proficiency: number) => void
  onChangePower: (nodeId: string, power: number) => void
  onChangeStages: (nodeId: string, stages: StageData[]) => void
  onChangeOrbitRadius: (nodeId: string, radius: number) => void
  onChangeOrbitStartAngle: (nodeId: string, degrees: number) => void
  onChangeOrbitOrder: (masteryId: string, satelliteId: string, order1Based: number) => void
  onDetachFromMastery: (nodeId: string) => void
  onRemoveLink: (edgeId: string) => void
  onAddLink: (peerId: string) => void
  onDeleteNode: (nodeId: string) => void
}

function reindexStages(stages: StageData[]): StageData[] {
  return sortedStages(stages).map((stage, i) => ({
    ...withClampedStage(stage),
    index: i + 1,
  }))
}

export function Inspector({
  nodeId,
  data,
  masteryLabel,
  orbitMembers = [],
  links = [],
  linkCandidates = [],
  onRename,
  onChangeKind,
  onChangeIconColor,
  onChangeIconId,
  onChangeProficiency,
  onChangePower,
  onChangeStages,
  onChangeOrbitRadius,
  onChangeOrbitStartAngle,
  onChangeOrbitOrder,
  onDetachFromMastery,
  onRemoveLink,
  onAddLink,
  onDeleteNode,
}: Props) {
  const [addPeerId, setAddPeerId] = useState('')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  if (!nodeId || !data) {
    return (
      <aside className="inspector">
        <h2 className="inspector__title">Node Inspector</h2>
        <p className="inspector__empty">
          노드를 선택하면 숙련도·파워·단계별 띠와 트레이닝 로그를 편집할 수 있습니다.
        </p>
      </aside>
    )
  }

  const angleOptions = orbitAngleOptions()
  const startAngle = data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE
  const stages = sortedStages(data.stages ?? [])

  const patchStages = (next: StageData[]) => {
    onChangeStages(nodeId, reindexStages(next))
  }

  const updateStage = (stageId: string, patch: Partial<StageData>) => {
    patchStages(
      stages.map((stage) => {
        if (stage.id !== stageId) return stage
        const merged = withClampedStage({ ...stage, ...patch })
        return merged
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
        const used = stageLoggedCount(stage)
        if (used >= stage.goal) return stage
        const room = stage.goal - used
        const log = createTrainingLog(`로그 ${stage.logs.length + 1}`, Math.min(1, room))
        return withClampedStage({ ...stage, logs: [...stage.logs, log] })
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
        return withClampedStage({ ...stage, logs: clampStageLogs(logs, stage.goal) })
      }),
    )
  }

  const removeLog = (stageId: string, logId: string) => {
    patchStages(
      stages.map((stage) => {
        if (stage.id !== stageId) return stage
        return withClampedStage({
          ...stage,
          logs: stage.logs.filter((log) => log.id !== logId),
        })
      }),
    )
  }

  return (
    <aside className="inspector">
      <div className="inspector__header">
        <h2 className="inspector__title">
          {data.kind === 'mastery' ? 'Mastery Edit' : 'Node Inspector'}
        </h2>
        <button type="button" className="btn btn--danger" onClick={() => onDeleteNode(nodeId)}>
          Delete
        </button>
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

      <div className="stats-row">
        <label className="field">
          <span>숙련도</span>
          <input
            type="number"
            min={0}
            value={data.proficiency}
            onChange={(e) => onChangeProficiency(nodeId, Number(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          <span>파워</span>
          <input
            type="number"
            min={0}
            value={data.power}
            onChange={(e) => onChangePower(nodeId, Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="field">
        <span>Icon</span>
        <button
          type="button"
          className="icon-open-btn"
          onClick={() => setIconPickerOpen(true)}
        >
          <span className="icon-open-btn__preview" style={{ color: data.iconColor }}>
            <IconGlyph iconId={data.iconId} />
          </span>
          <span className="icon-open-btn__meta">
            <strong>{getIconDef(data.iconId).label}</strong>
            <small>아이콘 셋 열기</small>
          </span>
        </button>
      </div>

      <div className="field">
        <span>Icon color</span>
        <div className="color-grid" role="listbox" aria-label="Node icon color">
          {NODE_ICON_COLORS.map((color) => {
            const selected = data.iconColor === color
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={selected}
                className={`color-swatch${selected ? ' is-selected' : ''}`}
                style={{ background: color }}
                title={color}
                onClick={() => onChangeIconColor(nodeId, color)}
              />
            )
          })}
        </div>
      </div>

      {data.kind === 'mastery' && (
        <>
          <label className="field">
            <span>Orbit radius</span>
            <input
              type="number"
              min={80}
              max={480}
              step={10}
              value={data.orbitRadius ?? DEFAULT_ORBIT_RADIUS}
              onChange={(e) =>
                onChangeOrbitRadius(nodeId, Number(e.target.value) || DEFAULT_ORBIT_RADIUS)
              }
            />
          </label>

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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
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
          </div>

          <div className="inspector__section">
            <div className="inspector__section-head">
              <h3>Links</h3>
            </div>
            {links.length === 0 ? (
              <p className="inspector__empty">No passive links yet.</p>
            ) : (
              <ul className="link-list">
                {links.map((link) => (
                  <li key={link.edgeId} className="link-item">
                    <span>
                      {link.peerLabel}
                      <small>{PASSIVE_KIND_LABEL[link.peerKind]}</small>
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
                    {c.label} ({PASSIVE_KIND_LABEL[c.kind]})
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
        </>
      )}

      <div className="inspector__section">
        <div className="inspector__section-head">
          <h3>단계 (띠)</h3>
          <button type="button" className="btn btn--ghost" onClick={addStage}>
            + 단계
          </button>
        </div>
        <p className="inspector__empty">
          안쪽 원 = 1단계. 목표 칸만큼 분절되며, 목표 이상 로그는 기록되지 않습니다.
        </p>

        {stages.length === 0 ? (
          <p className="inspector__empty">단계가 없습니다.</p>
        ) : (
          <ul className="stage-list">
            {stages.map((stage) => {
              const logged = stageLoggedCount(stage)
              const complete = isStageComplete(stage)
              const atCap = logged >= stage.goal
              return (
                <li key={stage.id} className={`stage-card${complete ? ' is-complete' : ''}`}>
                  <div className="stage-card__head">
                    <strong>
                      #{stage.index} {stage.label}
                    </strong>
                    <button
                      type="button"
                      className="btn btn--icon"
                      onClick={() => removeStage(stage.id)}
                      aria-label="단계 삭제"
                    >
                      ×
                    </button>
                  </div>

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
                      <span>진행</span>
                      <input type="text" readOnly value={`${logged} / ${stage.goal}`} />
                    </label>
                  </div>

                  <label className="stage-complete">
                    <input
                      type="checkbox"
                      checked={stage.completedManually || logged >= stage.goal}
                      onChange={(e) => {
                        if (logged >= stage.goal) return
                        updateStage(stage.id, { completedManually: e.target.checked })
                      }}
                    />
                    <span>
                      {logged >= stage.goal
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
                      disabled={atCap}
                      onClick={() => addLog(stage.id)}
                      title={atCap ? '목표치에 도달해 더 이상 기록할 수 없습니다' : undefined}
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
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <IconPicker
        open={iconPickerOpen}
        value={data.iconId}
        onClose={() => setIconPickerOpen(false)}
        onSelect={(iconId) => onChangeIconId(nodeId, iconId)}
      />
    </aside>
  )
}

import { useState } from 'react'
import type { PassiveKind, PassiveNodeData, TrainingEntry } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import {
  DEFAULT_ORBIT_RADIUS,
  DEFAULT_ORBIT_START_ANGLE,
  orbitAngleOptions,
} from '../orbit'
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
  managed?: boolean
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
  onChangeOrbitRadius: (nodeId: string, radius: number) => void
  onChangeOrbitStartAngle: (nodeId: string, degrees: number) => void
  onChangeOrbitOrder: (masteryId: string, satelliteId: string, order1Based: number) => void
  onDetachFromMastery: (nodeId: string) => void
  onRemoveLink: (edgeId: string) => void
  onAddLink: (peerId: string) => void
  onAddTraining: (nodeId: string) => void
  onUpdateTraining: (
    nodeId: string,
    trainingId: string,
    patch: Partial<Pick<TrainingEntry, 'label' | 'count' | 'note'>>,
  ) => void
  onRemoveTraining: (nodeId: string, trainingId: string) => void
  onDeleteNode: (nodeId: string) => void
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
  onChangeOrbitRadius,
  onChangeOrbitStartAngle,
  onChangeOrbitOrder,
  onDetachFromMastery,
  onRemoveLink,
  onAddLink,
  onAddTraining,
  onUpdateTraining,
  onRemoveTraining,
  onDeleteNode,
}: Props) {
  const [addPeerId, setAddPeerId] = useState('')

  if (!nodeId || !data) {
    return (
      <aside className="inspector">
        <h2 className="inspector__title">Node Inspector</h2>
        <p className="inspector__empty">
          Select a Mastery to edit orbit order/angle. Notable↔Small links toggle on reconnect and
          can be managed here.
        </p>
      </aside>
    )
  }

  const angleOptions = orbitAngleOptions()
  const startAngle = data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE

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
              <p className="inspector__empty">No Notable↔Small links yet.</p>
            ) : (
              <ul className="link-list">
                {links.map((link) => (
                  <li key={link.edgeId} className="link-item">
                    <span>
                      {link.peerLabel}
                      <small>
                        {PASSIVE_KIND_LABEL[link.peerKind]}
                        {link.managed ? ' · orbit' : ''}
                      </small>
                    </span>
                    {link.managed ? (
                      <span className="link-item__badge">auto</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--icon"
                        onClick={() => onRemoveLink(link.edgeId)}
                        aria-label={`Remove link to ${link.peerLabel}`}
                      >
                        ×
                      </button>
                    )}
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
          <h3>Trainings</h3>
          <button type="button" className="btn btn--ghost" onClick={() => onAddTraining(nodeId)}>
            + Add
          </button>
        </div>

        {data.trainings.length === 0 ? (
          <p className="inspector__empty">No training entries yet.</p>
        ) : (
          <ul className="training-list">
            {data.trainings.map((training) => (
              <li key={training.id} className="training-item">
                <input
                  className="training-item__label"
                  value={training.label}
                  onChange={(e) =>
                    onUpdateTraining(nodeId, training.id, { label: e.target.value })
                  }
                  placeholder="Session name"
                />
                <input
                  className="training-item__count"
                  type="number"
                  min={0}
                  value={training.count}
                  onChange={(e) =>
                    onUpdateTraining(nodeId, training.id, {
                      count: Number(e.target.value) || 0,
                    })
                  }
                  aria-label="Training count"
                />
                <input
                  className="training-item__note"
                  value={training.note ?? ''}
                  onChange={(e) =>
                    onUpdateTraining(nodeId, training.id, { note: e.target.value })
                  }
                  placeholder="Note (optional)"
                />
                <button
                  type="button"
                  className="btn btn--icon"
                  onClick={() => onRemoveTraining(nodeId, training.id)}
                  aria-label="Remove training"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

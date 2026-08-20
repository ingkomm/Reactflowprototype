import type { PassiveKind, PassiveNodeData, TrainingEntry } from '../types'
import { PASSIVE_KIND_LABEL } from '../types'
import { DEFAULT_ORBIT_RADIUS } from '../orbit'
import './Inspector.css'

type Props = {
  nodeId: string | null
  data: PassiveNodeData | null
  masteryLabel?: string | null
  onRename: (nodeId: string, label: string) => void
  onChangeKind: (nodeId: string, kind: PassiveKind) => void
  onChangeOrbitRadius: (nodeId: string, radius: number) => void
  onDetachFromMastery: (nodeId: string) => void
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
  onRename,
  onChangeKind,
  onChangeOrbitRadius,
  onDetachFromMastery,
  onAddTraining,
  onUpdateTraining,
  onRemoveTraining,
  onDeleteNode,
}: Props) {
  if (!nodeId || !data) {
    return (
      <aside className="inspector">
        <h2 className="inspector__title">Node Inspector</h2>
        <p className="inspector__empty">
          Select a Mastery to set orbit radius. Connect Small/Notable → Mastery to join an orbit
          (no edge). Tree links are Notable↔Small only.
        </p>
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <div className="inspector__header">
        <h2 className="inspector__title">Node Inspector</h2>
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
        <label className="field">
          <span>Orbit radius</span>
          <input
            type="number"
            min={80}
            max={480}
            step={10}
            value={data.orbitRadius ?? DEFAULT_ORBIT_RADIUS}
            onChange={(e) => onChangeOrbitRadius(nodeId, Number(e.target.value) || DEFAULT_ORBIT_RADIUS)}
          />
        </label>
      )}

      {(data.kind === 'small' || data.kind === 'notable') && (
        <div className="inspector__section">
          <div className="inspector__section-head">
            <h3>Mastery link</h3>
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
              : 'Not on an orbit. Connect this node to a Mastery (membership only, no edge line).'}
          </p>
        </div>
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

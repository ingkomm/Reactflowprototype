import { useEffect, useMemo, useState } from 'react'
import {
  collectReferenceUsages,
  filterReferences,
  type ReferenceUsageV03,
} from '../persistence/worldReferences'
import type { ReferenceDocumentV03, WorldDocumentV03 } from '../persistence/worldTypes'
import './ReferenceLibrary.css'

export type ReferenceDraft = {
  title: string
  ddc: string
  creator: string
  year: string
  locator: string
  note: string
}

const EMPTY_DRAFT: ReferenceDraft = {
  title: '',
  ddc: '',
  creator: '',
  year: '',
  locator: '',
  note: '',
}

type Props = {
  open: boolean
  world: WorldDocumentV03
  onClose: () => void
  onCreate: (draft: ReferenceDraft) => Promise<boolean> | boolean
  onUpdate: (referenceId: string, draft: ReferenceDraft) => Promise<boolean> | boolean
  onDelete: (referenceId: string) => Promise<boolean> | boolean
}

export function ReferenceLibrary({
  open,
  world,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReferenceDraft>(EMPTY_DRAFT)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const listed = useMemo(
    () => filterReferences(world.references, query),
    [world.references, query],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    if (creating) {
      setDraft(EMPTY_DRAFT)
      return
    }
    const selected =
      world.references.find((r) => r.id === selectedId) ?? listed[0] ?? null
    if (selected) {
      setSelectedId(selected.id)
      setDraft({
        title: selected.title,
        ddc: selected.ddc ?? '',
        creator: selected.creator ?? '',
        year: selected.year ?? '',
        locator: selected.locator ?? '',
        note: selected.note ?? '',
      })
    } else {
      setSelectedId(null)
      setDraft(EMPTY_DRAFT)
    }
    // listed identity changes with query; only re-seed when opening / selection / refs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, world.references, selectedId, creating])

  if (!open) return null

  const usages: ReferenceUsageV03[] = selectedId
    ? collectReferenceUsages(world, selectedId)
    : []
  const used = usages.length > 0

  const field = (key: keyof ReferenceDraft, label: string, multiline = false) => (
    <label className="reference-library__field" key={key}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          rows={4}
        />
      ) : (
        <input
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
      )}
    </label>
  )

  return (
    <div className="reference-library" role="dialog" aria-modal="true" aria-label="Reference Library">
      <div className="reference-library__panel" data-testid="reference-library">
        <header className="reference-library__header">
          <h2>Reference Library</h2>
          <div className="reference-library__header-actions">
            <button
              type="button"
              className="btn btn--primary"
              data-testid="reference-new"
              onClick={() => {
                setCreating(true)
                setError(null)
                setDraft(EMPTY_DRAFT)
                setSelectedId(null)
              }}
            >
              + New
            </button>
            <button type="button" className="btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="reference-library__body">
          <aside className="reference-library__list">
            <input
              className="reference-library__search"
              placeholder="Search title, DDC, creator…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search references"
            />
            <ul>
              {listed.map((ref: ReferenceDocumentV03) => (
                <li key={ref.id}>
                  <button
                    type="button"
                    className={
                      !creating && selectedId === ref.id
                        ? 'reference-library__item reference-library__item--active'
                        : 'reference-library__item'
                    }
                    onClick={() => {
                      setCreating(false)
                      setSelectedId(ref.id)
                      setError(null)
                    }}
                  >
                    <span className="reference-library__item-title">{ref.title}</span>
                    {ref.ddc ? (
                      <span className="reference-library__item-ddc">{ref.ddc}</span>
                    ) : null}
                  </button>
                </li>
              ))}
              {listed.length === 0 ? (
                <li className="reference-library__empty">No references</li>
              ) : null}
            </ul>
          </aside>

          <section className="reference-library__detail">
            {creating || selectedId ? (
              <>
                {field('title', 'Title')}
                {field('ddc', 'DDC')}
                {field('creator', 'Creator')}
                {field('year', 'Year')}
                {field('locator', 'Locator')}
                {field('note', 'Note', true)}

                {!creating && selectedId ? (
                  <div className="reference-library__usage" data-testid="reference-usage">
                    <strong>Used in {usages.length} Shards</strong>
                    <ul>
                      {usages.map((u) => (
                        <li key={`${u.galaxyId}:${u.shardNodeId}`}>
                          {u.galaxyName} — {u.shardLabel}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {error ? <p className="reference-library__error">{error}</p> : null}

                <div className="reference-library__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !draft.title.trim()}
                    onClick={() => {
                      void (async () => {
                        setBusy(true)
                        setError(null)
                        try {
                          const ok = creating
                            ? await onCreate(draft)
                            : selectedId
                              ? await onUpdate(selectedId, draft)
                              : false
                          if (ok && creating) setCreating(false)
                          if (!ok) setError('Save failed')
                        } finally {
                          setBusy(false)
                        }
                      })()
                    }}
                  >
                    {creating ? 'Create' : 'Save'}
                  </button>
                  {!creating && selectedId ? (
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={busy || used}
                      title={
                        used
                          ? `This Reference is used by ${usages.length} Shards`
                          : 'Delete Reference'
                      }
                      onClick={() => {
                        if (used) {
                          setError(
                            `이 Reference는 ${usages.length}개의 Shard에서 사용 중입니다.`,
                          )
                          return
                        }
                        if (!window.confirm('Delete this Reference?')) return
                        void (async () => {
                          setBusy(true)
                          setError(null)
                          try {
                            const ok = await onDelete(selectedId)
                            if (!ok) setError('Delete failed')
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="reference-library__empty">
                Select a Reference or create a new one.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

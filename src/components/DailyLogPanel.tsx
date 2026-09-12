import { useEffect, useMemo, useState } from 'react'
import type { TrainingLog, VideoMedia } from '../types'
import {
  createDailyLog,
  dailyLogTimelineLabel,
  sortedDailyLogs,
  upsertDailyLog,
} from '../dailyLog'
import {
  createLocalVideoMedia,
  createVideoMedia,
  isLocalVideoMedia,
} from '../videoMedia'
import {
  DailyLogEditorModal,
  type DailyLogEditorDraft,
  type DailyLogEditorMode,
} from './DailyLogEditorModal'
import './DailyLogPanel.css'

type Props = {
  logs: TrainingLog[]
  onChangeLogs: (logs: TrainingLog[]) => void
  focusLogId?: string | null
  onFocusLogConsumed?: () => void
}

export function draftFieldsFromLog(log: TrainingLog): Pick<
  DailyLogEditorDraft,
  'videoUrl' | 'localVideoPath'
> {
  const first = log.media?.[0]
  if (first && isLocalVideoMedia(first)) {
    return { videoUrl: '', localVideoPath: first.url }
  }
  return { videoUrl: first?.url ?? '', localVideoPath: '' }
}

/**
 * Edit only the first video slot. Preserve media[1...] always.
 * Local path and remote URL are mutually exclusive for media[0].
 * - both empty → drop media[0] only
 * - same locator → keep media[0] (id/note/title) + rest
 * - new locator → replace media[0]; keep rest
 */
export function resolveDailyLogMediaEdit(
  existing: VideoMedia[] | undefined,
  nextUrl: string,
  nextLocalPath = '',
): VideoMedia[] | null {
  const previous = existing ?? []
  const rest = previous.slice(1)
  const trimmedUrl = nextUrl.trim()
  const trimmedLocal = nextLocalPath.trim()

  if (trimmedLocal && trimmedUrl) {
    // Prefer explicit local selection when both are somehow set.
  }

  if (trimmedLocal) {
    const first = previous[0]
    if (first && isLocalVideoMedia(first) && first.url === trimmedLocal) {
      return [{ ...first, url: trimmedLocal, kind: 'local', provider: 'local' }, ...rest]
    }
    const created = createLocalVideoMedia(trimmedLocal)
    if (!created) return null
    return [created, ...rest]
  }

  if (!trimmedUrl) {
    return rest
  }

  const first = previous[0]
  if (first && !isLocalVideoMedia(first) && first.url === trimmedUrl) {
    return [{ ...first, url: trimmedUrl }, ...rest]
  }

  const created = createVideoMedia(trimmedUrl)
  if (!created) return null
  return [created, ...rest]
}

/** New Daily Log: optional single video, never writes media.note. */
export function mediaFromDraft(draft: Pick<DailyLogEditorDraft, 'videoUrl' | 'localVideoPath'>): VideoMedia[] | null {
  const local = draft.localVideoPath.trim()
  if (local) {
    const created = createLocalVideoMedia(local)
    if (!created) return null
    return [created]
  }
  const trimmedUrl = draft.videoUrl.trim()
  if (!trimmedUrl) return []
  const created = createVideoMedia(trimmedUrl)
  if (!created) return null
  return [created]
}

type EditorState =
  | { open: false }
  | { open: true; mode: 'add' }
  | { open: true; mode: 'edit'; log: TrainingLog }

export function DailyLogPanel({ logs, onChangeLogs, focusLogId, onFocusLogConsumed }: Props) {
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const practiceEntries = logs.length
  const orderedLogs = useMemo(() => sortedDailyLogs(logs), [logs])

  useEffect(() => {
    if (!focusLogId) return
    const target = logs.find((log) => log.id === focusLogId)
    onFocusLogConsumed?.()
    if (target) {
      setEditor({ open: true, mode: 'edit', log: target })
    }
  }, [focusLogId, logs, onFocusLogConsumed])

  const closeEditor = () => setEditor({ open: false })

  const openAdd = () => setEditor({ open: true, mode: 'add' })

  const openEdit = (log: TrainingLog) => {
    onFocusLogConsumed?.()
    setEditor({ open: true, mode: 'edit', log })
  }

  const handleSave = (draft: DailyLogEditorDraft): string | null => {
    if (editor.open && editor.mode === 'edit') {
      const media = resolveDailyLogMediaEdit(
        editor.log.media,
        draft.videoUrl,
        draft.localVideoPath,
      )
      if (media === null) {
        return draft.localVideoPath.trim()
          ? '유효한 로컬 동영상 경로를 선택하세요.'
          : '유효한 http(s) 동영상 URL을 입력하세요.'
      }
      const next = createDailyLog(draft.date, draft.note, media.length ? media : undefined)
      next.id = editor.log.id
      const result = upsertDailyLog(logs, next)
      if (result.error) return result.error
      onChangeLogs(result.logs)
      closeEditor()
      return null
    }

    const media = mediaFromDraft(draft)
    if (media === null) {
      return draft.localVideoPath.trim()
        ? '유효한 로컬 동영상 경로를 선택하세요.'
        : '유효한 http(s) 동영상 URL을 입력하세요.'
    }
    const log = createDailyLog(draft.date, draft.note, media.length ? media : undefined)
    const result = upsertDailyLog(logs, log)
    if (result.error) return result.error
    onChangeLogs(result.logs)
    closeEditor()
    return null
  }

  const removeLog = (logId: string) => {
    onChangeLogs(logs.filter((log) => log.id !== logId))
    if (editor.open && editor.mode === 'edit' && editor.log.id === logId) {
      closeEditor()
    }
  }

  const editorMode: DailyLogEditorMode = editor.open && editor.mode === 'edit' ? 'edit' : 'add'
  const editorKey =
    editor.open && editor.mode === 'edit'
      ? `edit-${editor.log.id}`
      : editor.open
        ? 'add'
        : 'closed'
  const editorInitial: DailyLogEditorDraft | null =
    editor.open && editor.mode === 'edit'
      ? {
          date: editor.log.date,
          note: editor.log.note ?? '',
          ...draftFieldsFromLog(editor.log),
        }
      : null

  return (
    <div className="daily-log-panel">
      <div className="inspector__section-head">
        <h3>Daily Log</h3>
        <span className="daily-log-panel__summary">총 {practiceEntries}개</span>
      </div>

      <button
        type="button"
        className="btn btn--ghost daily-log-panel__add"
        data-testid="daily-log-open-add"
        onClick={openAdd}
      >
        기록 추가
      </button>

      {orderedLogs.length === 0 ? (
        <p className="inspector__empty">기록 없음</p>
      ) : (
        <ul className="daily-log-list" aria-label="Daily Log list">
          {orderedLogs.map((log) => (
            <li key={log.id} className="daily-log-card">
              <div className="daily-log-card__head">
                <strong className="daily-log-card__date">{log.date}</strong>
                <div className="daily-log-card__actions">
                  <button
                    type="button"
                    className="btn"
                    data-testid={`daily-log-edit-${log.id}`}
                    onClick={() => openEdit(log)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon"
                    onClick={() => removeLog(log.id)}
                    aria-label="기록 삭제"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p className="daily-log-card__preview">{dailyLogTimelineLabel(log)}</p>
            </li>
          ))}
        </ul>
      )}

      <DailyLogEditorModal
        key={editorKey}
        open={editor.open}
        mode={editorMode}
        initial={editorInitial}
        onClose={closeEditor}
        onSave={handleSave}
      />
    </div>
  )
}

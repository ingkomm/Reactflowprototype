import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPracticeDate } from '../dailyLog'
import { tryPasteSvgIntoTextarea } from '../markdownSvgPaste'
import {
  isLocalVideoSupported,
  localVideoDisplayName,
  pickLocalVideo,
} from '../platform/localVideo'
import './DailyLogEditorModal.css'

export type DailyLogEditorMode = 'add' | 'edit'

export type DailyLogEditorDraft = {
  date: string
  note: string
  videoUrl: string
  /** Absolute local path reference (Desktop only). Mutually exclusive with videoUrl. */
  localVideoPath: string
}

type Props = {
  open: boolean
  mode: DailyLogEditorMode
  initial?: DailyLogEditorDraft | null
  onClose: () => void
  /** Return error string to keep modal open; null means parent closed after save. */
  onSave: (draft: DailyLogEditorDraft) => string | null
}

function seedDraft(initial?: DailyLogEditorDraft | null): DailyLogEditorDraft {
  if (!initial) {
    return {
      date: formatPracticeDate(),
      note: '',
      videoUrl: '',
      localVideoPath: '',
    }
  }
  return {
    date: initial.date,
    note: initial.note,
    videoUrl: initial.videoUrl ?? '',
    localVideoPath: initial.localVideoPath ?? '',
  }
}

export function isDailyLogDraftDirty(
  current: DailyLogEditorDraft,
  initial: DailyLogEditorDraft,
): boolean {
  return (
    current.date !== initial.date ||
    current.note !== initial.note ||
    current.videoUrl !== initial.videoUrl ||
    current.localVideoPath !== initial.localVideoPath
  )
}

export function DailyLogEditorModal({ open, mode, initial, onClose, onSave }: Props) {
  const seed = seedDraft(initial)
  const initialRef = useRef(seed)
  const [date, setDate] = useState(seed.date)
  const [note, setNote] = useState(seed.note)
  const [videoUrl, setVideoUrl] = useState(seed.videoUrl)
  const [localVideoPath, setLocalVideoPath] = useState(seed.localVideoPath)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const draftRef = useRef({ date, note, videoUrl, localVideoPath })
  const localSupported = isLocalVideoSupported()

  useEffect(() => {
    draftRef.current = { date, note, videoUrl, localVideoPath }
  }, [date, note, videoUrl, localVideoPath])

  const requestClose = () => {
    const dirty = isDailyLogDraftDirty(
      { date, note, videoUrl, localVideoPath },
      initialRef.current,
    )
    if (
      dirty &&
      !window.confirm('작성 중인 내용을 버릴까요?\n확인하면 변경 내용이 사라집니다.')
    ) {
      return
    }
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      const dirty = isDailyLogDraftDirty(draftRef.current, initialRef.current)
      if (
        dirty &&
        !window.confirm('작성 중인 내용을 버릴까요?\n확인하면 변경 내용이 사라집니다.')
      ) {
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const title = mode === 'edit' ? '기록 수정' : '기록 추가'

  const handleSave = () => {
    const saveError = onSave({ date, note, videoUrl, localVideoPath })
    if (saveError) setError(saveError)
  }

  const onVideoUrlChange = (value: string) => {
    setVideoUrl(value)
    if (value.trim()) setLocalVideoPath('')
  }

  const onPickLocal = async () => {
    if (!localSupported || picking) return
    setPicking(true)
    setError(null)
    try {
      const path = await pickLocalVideo()
      if (!path) return
      setLocalVideoPath(path)
      setVideoUrl('')
    } finally {
      setPicking(false)
    }
  }

  const clearLocal = () => {
    setLocalVideoPath('')
  }

  return createPortal(
    <div
      className="daily-log-editor-modal"
      data-testid="daily-log-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="daily-log-editor-modal__backdrop"
        aria-label="닫기"
        onClick={requestClose}
      />
      <div className="daily-log-editor-modal__panel">
        <header className="daily-log-editor-modal__head">
          <h2 className="daily-log-editor-modal__title">{title}</h2>
          <button
            type="button"
            className="btn btn--ghost"
            data-testid="daily-log-editor-close"
            onClick={requestClose}
          >
            닫기
          </button>
        </header>

        <div className="daily-log-editor-modal__body">
          <label className="field">
            <span>날짜</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="daily-log-editor-date"
            />
          </label>
          <label className="field">
            <span>동영상 URL (선택)</span>
            <input
              value={videoUrl}
              onChange={(e) => onVideoUrlChange(e.target.value)}
              placeholder="https://..."
              data-testid="daily-log-editor-video"
              disabled={Boolean(localVideoPath)}
            />
          </label>
          {localSupported ? (
            <div className="field daily-log-editor-modal__local-field">
              <span>로컬 동영상 (선택)</span>
              <div className="daily-log-editor-modal__local-row">
                <button
                  type="button"
                  className="btn btn--ghost"
                  data-testid="daily-log-editor-pick-local"
                  onClick={() => {
                    void onPickLocal()
                  }}
                  disabled={picking}
                >
                  {picking ? '선택 중…' : '로컬 동영상 선택'}
                </button>
                {localVideoPath ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    data-testid="daily-log-editor-clear-local"
                    onClick={clearLocal}
                  >
                    해제
                  </button>
                ) : null}
              </div>
              {localVideoPath ? (
                <p
                  className="daily-log-editor-modal__local-hint"
                  data-testid="daily-log-editor-local-name"
                  title={localVideoPath}
                >
                  {localVideoDisplayName(localVideoPath)}
                </p>
              ) : (
                <p className="daily-log-editor-modal__local-hint">
                  파일은 복사되지 않고 경로만 저장됩니다.
                </p>
              )}
            </div>
          ) : (
            <p className="daily-log-editor-modal__local-hint" data-testid="daily-log-editor-local-web-hint">
              로컬 동영상은 Desktop 앱에서 사용할 수 있습니다.
            </p>
          )}
          <label className="field daily-log-editor-modal__memo-field">
            <span>Memo (Markdown)</span>
            <textarea
              className="daily-log-editor-modal__memo"
              data-testid="daily-log-editor-memo"
              wrap="soft"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onPaste={(e) => {
                tryPasteSvgIntoTextarea(e, note, setNote)
              }}
              placeholder="긴 Markdown / Draw.io SVG paste 가능"
            />
          </label>
          {error ? (
            <p className="daily-log-editor-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="daily-log-editor-modal__footer">
          <button type="button" className="btn" onClick={requestClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            data-testid="daily-log-editor-save"
            onClick={handleSave}
          >
            {mode === 'edit' ? '수정' : '저장'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

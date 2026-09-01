import { useState } from 'react'
import type { TrainingLog } from '../types'
import {
  createDailyLog,
  formatPracticeDate,
  sortedDailyLogs,
  upsertDailyLog,
} from '../dailyLog'
import { createVideoMedia } from '../videoMedia'
import './DailyLogPanel.css'

type Props = {
  logs: TrainingLog[]
  onChangeLogs: (logs: TrainingLog[]) => void
}

function videoUrlFromLog(log: TrainingLog): string {
  return log.media?.[0]?.url ?? ''
}

export function DailyLogPanel({ logs, onChangeLogs }: Props) {
  const [draftDate, setDraftDate] = useState(formatPracticeDate())
  const [draftNote, setDraftNote] = useState('')
  const [draftVideoUrl, setDraftVideoUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editVideoUrl, setEditVideoUrl] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const practiceDays = new Set(logs.map((log) => log.date)).size
  const orderedLogs = sortedDailyLogs(logs)

  const buildLog = (id: string | undefined, date: string, note: string, videoUrl: string): TrainingLog | null => {
    const trimmedUrl = videoUrl.trim()
    const media = trimmedUrl ? createVideoMedia(trimmedUrl) : null
    if (trimmedUrl && !media) return null
    const log = createDailyLog(date, note, media ? [media] : undefined)
    if (id) log.id = id
    return log
  }

  const handleAdd = () => {
    const log = buildLog(undefined, draftDate, draftNote, draftVideoUrl)
    if (!log) {
      setFormError('유효한 http(s) 동영상 URL을 입력하세요.')
      return
    }
    const result = upsertDailyLog(logs, log)
    if (result.error) {
      setFormError(result.error)
      return
    }
    onChangeLogs(result.logs)
    setDraftDate(formatPracticeDate())
    setDraftNote('')
    setDraftVideoUrl('')
    setFormError(null)
  }

  const startEdit = (log: TrainingLog) => {
    setEditingId(log.id)
    setEditDate(log.date)
    setEditNote(log.note ?? '')
    setEditVideoUrl(videoUrlFromLog(log))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const saveEdit = () => {
    if (!editingId) return
    const log = buildLog(editingId, editDate, editNote, editVideoUrl)
    if (!log) {
      setEditError('유효한 http(s) 동영상 URL을 입력하세요.')
      return
    }
    const result = upsertDailyLog(logs, log)
    if (result.error) {
      setEditError(result.error)
      return
    }
    onChangeLogs(result.logs)
    setEditingId(null)
    setEditError(null)
  }

  const removeLog = (logId: string) => {
    onChangeLogs(logs.filter((log) => log.id !== logId))
    if (editingId === logId) setEditingId(null)
  }

  return (
    <div className="daily-log-panel">
      <div className="inspector__section-head">
        <h3>연습 기록</h3>
        <span className="daily-log-panel__summary">총 {practiceDays}일</span>
      </div>

      <div className="daily-log-card daily-log-card--form">
        <h4 className="daily-log-card__title">기록 추가</h4>
        <label className="field">
          <span>날짜</span>
          <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
        </label>
        <label className="field">
          <span>메모 (선택)</span>
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="오늘 연습 내용"
            rows={2}
          />
        </label>
        <label className="field">
          <span>동영상 URL (선택)</span>
          <input
            value={draftVideoUrl}
            onChange={(e) => setDraftVideoUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>
        {formError && (
          <p className="daily-log-panel__error" role="alert">
            {formError}
          </p>
        )}
        <button type="button" className="btn btn--ghost" onClick={handleAdd}>
          기록 추가
        </button>
      </div>

      {orderedLogs.length === 0 ? (
        <p className="inspector__empty">기록 없음</p>
      ) : (
        <ul className="daily-log-list">
          {orderedLogs.map((log) => {
            const isEditing = editingId === log.id
            return (
              <li key={log.id} className="daily-log-card">
                {isEditing ? (
                  <>
                    <label className="field">
                      <span>날짜</span>
                      <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>메모 (선택)</span>
                      <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        rows={2}
                      />
                    </label>
                    <label className="field">
                      <span>동영상 URL (선택)</span>
                      <input
                        value={editVideoUrl}
                        onChange={(e) => setEditVideoUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </label>
                    {editError && (
                      <p className="daily-log-panel__error" role="alert">
                        {editError}
                      </p>
                    )}
                    <div className="daily-log-card__actions">
                      <button type="button" className="btn btn--ghost" onClick={saveEdit}>
                        저장
                      </button>
                      <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                        취소
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="daily-log-card__head">
                      <strong className="daily-log-card__date">{log.date}</strong>
                      <div className="daily-log-card__actions">
                        <button type="button" className="btn btn--ghost" onClick={() => startEdit(log)}>
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
                    {log.note ? <p className="daily-log-card__note">{log.note}</p> : null}
                    {log.media?.[0]?.url ? (
                      <a
                        className="daily-log-card__video"
                        href={log.media[0].url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {log.media[0].title || log.media[0].url}
                      </a>
                    ) : null}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

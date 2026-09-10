import { useState } from 'react'
import type { VideoMedia } from '../types'
import { createVideoMedia } from '../videoMedia'
import { VideoEmbed } from './VideoEmbed'
import './VideoMediaPanel.css'

type Props = {
  media: VideoMedia[]
  onChange: (next: VideoMedia[]) => void
  title?: string
}

export function VideoMediaPanel({ media, onChange, title = '동영상' }: Props) {
  const [url, setUrl] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const addVideo = () => {
    const created = createVideoMedia(url, { title: videoTitle, note })
    if (!created) {
      setError('유효한 http(s) URL을 입력하세요.')
      return
    }
    setError(null)
    onChange([...media, created])
    setUrl('')
    setVideoTitle('')
    setNote('')
  }

  const updateVideo = (id: string, patch: Partial<VideoMedia>) => {
    onChange(
      media.map((item) => {
        if (item.id !== id) return item
        const merged = { ...item, ...patch }
        const validated = createVideoMedia(merged.url, {
          id: merged.id,
          title: merged.title,
          note: merged.note,
        })
        return validated ?? item
      }),
    )
  }

  const removeVideo = (id: string) => {
    onChange(media.filter((item) => item.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  return (
    <div className="video-media-panel">
      <div className="inspector__section-head">
        <h3>{title}</h3>
      </div>
      <p className="field-hint">YouTube는 임베드, 그 외 URL은 외부 링크로 열립니다. 자동재생 없음.</p>

      <label className="field">
        <span>URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </label>
      <label className="field">
        <span>제목 (선택)</span>
        <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="영상 제목" />
      </label>
      <label className="field">
        <span>메모 (선택)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" />
      </label>
      {error && <p className="video-media-panel__error">{error}</p>}
      <button type="button" className="btn btn--ghost" onClick={addVideo} disabled={!url.trim()}>
        + 동영상 추가
      </button>

      {media.length > 0 && (
        <ul className="video-media-list">
          {media.map((item) => (
            <li key={item.id} className="video-media-item">
              <div className="video-media-item__head">
                <button
                  type="button"
                  className="video-media-item__toggle"
                  onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                >
                  {item.title || item.url}
                  <small>{item.kind === 'youtube' ? 'YouTube' : '링크'}</small>
                </button>
                <button type="button" className="btn btn--icon" onClick={() => removeVideo(item.id)} aria-label="삭제">
                  ×
                </button>
              </div>
              {expandedId === item.id && (
                <div className="video-media-item__body">
                  <label className="field">
                    <span>URL</span>
                    <input
                      value={item.url}
                      onChange={(e) => updateVideo(item.id, { url: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>제목</span>
                    <input
                      value={item.title ?? ''}
                      onChange={(e) => updateVideo(item.id, { title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>메모</span>
                    <input
                      value={item.note ?? ''}
                      onChange={(e) => updateVideo(item.id, { note: e.target.value })}
                    />
                  </label>
                  <VideoEmbed media={item} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

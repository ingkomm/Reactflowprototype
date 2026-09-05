import { useState } from 'react'
import type { VideoMedia } from '../types'
import { extractYouTubeId, youtubeEmbedUrl } from '../videoMedia'
import './VideoEmbed.css'

type Props = {
  media: VideoMedia
}

export function VideoEmbed({ media }: Props) {
  const youtubeId = extractYouTubeId(media.url)
  const [loaded, setLoaded] = useState(false)

  if (youtubeId) {
    if (!loaded) {
      return (
        <div className="video-embed video-embed--placeholder">
          <button
            type="button"
            className="video-embed__load-btn"
            onClick={() => setLoaded(true)}
          >
            YouTube 재생 (클릭 후 로드)
          </button>
          <p className="video-embed__hint">{media.title || 'YouTube video'}</p>
        </div>
      )
    }
    return (
      <div className="video-embed">
        <iframe
          title={media.title || 'YouTube video'}
          src={youtubeEmbedUrl(youtubeId)}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <p className="video-embed__link">
      <a href={media.url} target="_blank" rel="noopener noreferrer">
        {media.title || media.url} (외부 링크)
      </a>
    </p>
  )
}

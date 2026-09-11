import { useState, type SyntheticEvent } from 'react'
import type { VideoMedia } from '../types'
import { resolveLocalVideoPlaybackUrl } from '../platform/localVideo'
import { extractYouTubeId, isLocalVideoMedia, youtubeEmbedUrl } from '../videoMedia'
import './VideoEmbed.css'

type Props = {
  media: VideoMedia
}

export function VideoEmbed({ media }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [localError, setLocalError] = useState(false)
  const [localAspectRatio, setLocalAspectRatio] = useState<number | null>(null)
  const [activeMediaId, setActiveMediaId] = useState(media.id)

  // Same VideoEmbed instance can be reused when Viewer/Pin swaps active media.
  if (media.id !== activeMediaId) {
    setActiveMediaId(media.id)
    setLoaded(false)
    setLocalError(false)
    setLocalAspectRatio(null)
  }

  if (isLocalVideoMedia(media)) {
    const src = resolveLocalVideoPlaybackUrl(media.url)
    if (!src) {
      return (
        <p className="video-embed__fallback" data-testid="video-embed-local-unavailable">
          로컬 영상은 Desktop 앱에서 재생할 수 있습니다.
        </p>
      )
    }
    if (localError) {
      return (
        <p className="video-embed__fallback" data-testid="video-embed-local-error">
          영상을 재생할 수 없습니다.
          <br />
          파일이 이동/삭제되었거나 지원되지 않는 형식일 수 있습니다.
        </p>
      )
    }

    const onLocalMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setLocalAspectRatio(video.videoWidth / video.videoHeight)
      }
    }

    return (
      <div
        className="video-embed video-embed--local"
        data-testid="video-embed-local"
        data-aspect-ratio={localAspectRatio != null ? String(localAspectRatio) : '16/9'}
        style={{
          aspectRatio: localAspectRatio != null ? String(localAspectRatio) : '16 / 9',
        }}
      >
        <video
          controls
          preload="metadata"
          src={src}
          title={media.title || 'Local video'}
          onLoadedMetadata={onLocalMetadata}
          onError={() => setLocalError(true)}
        />
      </div>
    )
  }

  const youtubeId = extractYouTubeId(media.url)

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
      <div className="video-embed" data-testid="video-embed-youtube">
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

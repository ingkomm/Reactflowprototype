import type { VideoMedia } from '../types'
import { extractYouTubeId, youtubeEmbedUrl } from '../videoMedia'

type Props = {
  media: VideoMedia
}

export function VideoEmbed({ media }: Props) {
  const youtubeId = extractYouTubeId(media.url)
  if (youtubeId) {
    return (
      <div className="video-embed">
        <iframe
          title={media.title || 'YouTube video'}
          src={youtubeEmbedUrl(youtubeId)}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
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

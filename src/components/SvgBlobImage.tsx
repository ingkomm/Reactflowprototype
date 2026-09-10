import { useEffect, useState } from 'react'
import { isSafeSvgForBlobImage } from '../svgFence'
import { createLightSvgObjectUrl } from '../prepareSvgForLightRendering'

type Props = {
  source: string
}

/** Read-only SVG via Blob URL (no inline DOM / dangerouslySetInnerHTML). */
export function SvgBlobImage({ source }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isSafeSvgForBlobImage(source)) {
      setUrl(null)
      return
    }
    // Persistence/source stays unchanged; Blob uses Light-forced rendering copy only.
    const objectUrl = createLightSvgObjectUrl(source)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [source])

  if (!url) return null

  return (
    <img
      className="markdown-view__svg"
      src={url}
      alt=""
      data-testid="markdown-svg-image"
    />
  )
}

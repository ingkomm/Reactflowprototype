import { useState } from 'react'
import { SvgBlobImage } from './SvgBlobImage'
import { SvgLightbox } from './SvgLightbox'
import './SvgPreview.css'

type Props = {
  svg: string
  className?: string
}

/**
 * Document-inline SVG preview (intrinsic size, no zoom/pan).
 * Single-click or hover expand opens a viewport-level SvgLightbox.
 */
export function SvgPreview({ svg, className }: Props) {
  const [open, setOpen] = useState(false)

  const openLightbox = () => setOpen(true)
  const closeLightbox = () => setOpen(false)

  return (
    <>
      <div
        className={['svg-preview', className].filter(Boolean).join(' ')}
        data-testid="svg-preview"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          openLightbox()
        }}
      >
        <SvgBlobImage source={svg} />
        <button
          type="button"
          className="svg-preview__expand"
          data-testid="svg-preview-expand"
          aria-label="SVG 크게 보기"
          title="크게 보기"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            openLightbox()
          }}
        >
          <span aria-hidden="true">⤢</span>
        </button>
      </div>
      {open ? <SvgLightbox svg={svg} onClose={closeLightbox} /> : null}
    </>
  )
}

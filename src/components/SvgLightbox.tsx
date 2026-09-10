import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  SVG_LIGHTBOX_SCALE_STEP,
  clampSvgPan,
  clampSvgScale,
  computeFitScale,
} from '../svgLightboxMath'
import './SvgLightbox.css'

type Props = {
  svg: string
  onClose: () => void
}

export function SvgLightbox({ svg, onClose }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [fitMode, setFitMode] = useState(true)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originTx: number
    originTy: number
  } | null>(null)
  const fitModeRef = useRef(true)

  useEffect(() => {
    fitModeRef.current = fitMode
  }, [fitMode])

  useEffect(() => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const next = URL.createObjectURL(blob)
    setUrl(next)
    setNatural({ w: 0, h: 0 })
    setScale(1)
    setTx(0)
    setTy(0)
    setFitMode(true)
    return () => {
      URL.revokeObjectURL(next)
    }
  }, [svg])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const applyFit = useCallback(() => {
    const vp = viewportRef.current
    const { w: nw, h: nh } = natural
    if (!vp || nw <= 0 || nh <= 0) return
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    const nextScale = computeFitScale(nw, nh, vw, vh)
    const nextTx = Math.max(0, (vw - nw * nextScale) / 2)
    const nextTy = Math.max(0, (vh - nh * nextScale) / 2)
    setScale(nextScale)
    setTx(nextTx)
    setTy(nextTy)
    setFitMode(true)
  }, [natural])

  useLayoutEffect(() => {
    if (natural.w > 0) applyFit()
  }, [natural, applyFit])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (fitModeRef.current) applyFit()
    })
    ro.observe(vp)
    return () => ro.disconnect()
  }, [applyFit])

  const onImgLoad = () => {
    const img = imgRef.current
    if (!img) return
    setNatural({
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
    })
  }

  const zoomBy = (delta: number) => {
    const vp = viewportRef.current
    if (!vp || natural.w <= 0) return
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    const nextScale = clampSvgScale(
      Math.round((scale + delta) / SVG_LIGHTBOX_SCALE_STEP) * SVG_LIGHTBOX_SCALE_STEP,
    )
    const cx = vw / 2
    const cy = vh / 2
    const contentX = (cx - tx) / scale
    const contentY = (cy - ty) / scale
    let nextTx = cx - contentX * nextScale
    let nextTy = cy - contentY * nextScale
    ;({ tx: nextTx, ty: nextTy } = clampSvgPan(
      nextTx,
      nextTy,
      nextScale,
      natural.w,
      natural.h,
      vw,
      vh,
    ))
    setScale(nextScale)
    setTx(nextTx)
    setTy(nextTy)
    setFitMode(false)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTx: tx,
      originTy: ty,
    }
    setDragging(true)
    setFitMode(false)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const vp = viewportRef.current
    if (!drag || drag.pointerId !== e.pointerId || !vp || natural.w <= 0) return
    const next = clampSvgPan(
      drag.originTx + (e.clientX - drag.startX),
      drag.originTy + (e.clientY - drag.startY),
      scale,
      natural.w,
      natural.h,
      vp.clientWidth,
      vp.clientHeight,
    )
    setTx(next.tx)
    setTy(next.ty)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
      setDragging(false)
    }
  }

  return createPortal(
    <div className="svg-lightbox" data-testid="svg-lightbox" role="dialog" aria-modal="true" aria-label="SVG viewer">
      <button
        type="button"
        className="svg-lightbox__backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="svg-lightbox__panel">
        <div className="svg-lightbox__toolbar" role="toolbar" aria-label="SVG zoom">
          <button
            type="button"
            className="svg-lightbox__btn"
            onClick={() => zoomBy(-SVG_LIGHTBOX_SCALE_STEP)}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="svg-lightbox__zoom" aria-live="polite">
            {`${Math.round(scale * 100)}%`}
          </span>
          <button
            type="button"
            className="svg-lightbox__btn"
            onClick={() => zoomBy(SVG_LIGHTBOX_SCALE_STEP)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" className="svg-lightbox__btn" onClick={applyFit}>
            Fit
          </button>
          <button
            type="button"
            className="svg-lightbox__btn svg-lightbox__btn--close"
            data-testid="svg-lightbox-close"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div
          ref={viewportRef}
          className={[
            'svg-lightbox__viewport',
            'svg-lightbox__viewport--pannable',
            dragging ? 'svg-lightbox__viewport--dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {url ? (
            <img
              ref={imgRef}
              className="svg-lightbox__img"
              src={url}
              alt=""
              draggable={false}
              data-testid="svg-lightbox-image"
              onLoad={onImgLoad}
              style={{
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

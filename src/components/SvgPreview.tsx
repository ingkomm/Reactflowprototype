import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './SvgPreview.css'

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_STEP = 0.25

type Props = {
  svg: string
  className?: string
}

function clampScale(n: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n))
}

export function computeFitScale(nw: number, nh: number, vw: number, vh: number): number {
  if (nw <= 0 || nh <= 0 || vw <= 0 || vh <= 0) return 1
  return Math.min(1, vw / nw, vh / nh)
}

export function clampSvgPan(
  tx: number,
  ty: number,
  scale: number,
  nw: number,
  nh: number,
  vw: number,
  vh: number,
): { tx: number; ty: number } {
  const sw = nw * scale
  const sh = nh * scale
  const minTx = Math.min(0, vw - sw)
  const maxTx = Math.max(0, vw - sw)
  const minTy = Math.min(0, vh - sh)
  const maxTy = Math.max(0, vh - sh)
  return {
    tx: Math.min(maxTx, Math.max(minTx, tx)),
    ty: Math.min(maxTy, Math.max(minTy, ty)),
  }
}

function fitScale(nw: number, nh: number, vw: number, vh: number): number {
  return computeFitScale(nw, nh, vw, vh)
}

function clampPan(
  tx: number,
  ty: number,
  scale: number,
  nw: number,
  nh: number,
  vw: number,
  vh: number,
): { tx: number; ty: number } {
  return clampSvgPan(tx, ty, scale, nw, nh, vw, vh)
}

export function SvgPreview({ svg, className }: Props) {
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

  const applyFit = useCallback(() => {
    const vp = viewportRef.current
    const { w: nw, h: nh } = natural
    if (!vp || nw <= 0 || nh <= 0) return
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    const nextScale = fitScale(nw, nh, vw, vh)
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
    const nextScale = clampScale(Math.round((scale + delta) / SCALE_STEP) * SCALE_STEP)
    const cx = vw / 2
    const cy = vh / 2
    const contentX = (cx - tx) / scale
    const contentY = (cy - ty) / scale
    let nextTx = cx - contentX * nextScale
    let nextTy = cy - contentY * nextScale
    ;({ tx: nextTx, ty: nextTy } = clampPan(nextTx, nextTy, nextScale, natural.w, natural.h, vw, vh))
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
    const next = clampPan(
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

  if (!url) return null

  return (
    <div className={['svg-preview', className].filter(Boolean).join(' ')}>
      <div className="svg-preview__controls" role="toolbar" aria-label="SVG zoom">
        <button type="button" className="svg-preview__btn" onClick={() => zoomBy(-SCALE_STEP)} aria-label="Zoom out">
          −
        </button>
        <span className="svg-preview__zoom" aria-live="polite">
          {`${Math.round(scale * 100)}%`}
        </span>
        <button type="button" className="svg-preview__btn" onClick={() => zoomBy(SCALE_STEP)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="svg-preview__btn svg-preview__btn--fit" onClick={applyFit}>
          Fit
        </button>
      </div>
      <div
        ref={viewportRef}
        className={[
          'svg-preview__viewport',
          'svg-preview__viewport--pannable',
          dragging ? 'svg-preview__viewport--dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          ref={imgRef}
          className="svg-preview__img"
          src={url}
          alt=""
          draggable={false}
          data-testid="markdown-svg-image"
          onLoad={onImgLoad}
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        />
      </div>
    </div>
  )
}

export const SVG_PREVIEW_MIN_SCALE = MIN_SCALE
export const SVG_PREVIEW_MAX_SCALE = MAX_SCALE
export const SVG_PREVIEW_SCALE_STEP = SCALE_STEP

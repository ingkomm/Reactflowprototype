import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { ViewerPanelBounds } from './pinnedViewer'

export type FloatingPanelPoint = { x: number; y: number }

const DRAG_IGNORE_SELECTOR = 'button, a, input, textarea, select, [data-no-drag]'

/** Keep a floating panel fully within the viewport (with a small margin). */
export function clampFloatingPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : width,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : height,
): FloatingPanelPoint {
  const margin = 8
  const maxX = Math.max(margin, viewportWidth - width - margin)
  const maxY = Math.max(margin, viewportHeight - height - margin)
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  }
}

/** Close buttons and other controls must not start a panel drag. */
export function isFloatingPanelDragIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return Boolean(target.closest(DRAG_IGNORE_SELECTOR))
}

type HeaderDragProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

type UseFloatingPanelDragOptions = {
  /** Fires when panel position or size changes (UI-only; for tether overlay). */
  onBoundsChange?: (bounds: ViewerPanelBounds) => void
}

/**
 * UI-only floating panel position + header pointer drag.
 * Remount (or change initial x/y) to reset to a new open coordinate.
 * Never persisted to the graph document.
 */
export function useFloatingPanelDrag(
  initialX: number,
  initialY: number,
  options?: UseFloatingPanelDragOptions,
): {
  panelRef: RefObject<HTMLDivElement | null>
  position: FloatingPanelPoint
  headerDragProps: HeaderDragProps
} {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<FloatingPanelPoint>(() =>
    clampFloatingPanelPosition(initialX, initialY, 320, 200),
  )
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const onBoundsChangeRef = useRef(options?.onBoundsChange)
  useLayoutEffect(() => {
    onBoundsChangeRef.current = options?.onBoundsChange
  }, [options?.onBoundsChange])
  const lastBoundsRef = useRef<ViewerPanelBounds | null>(null)

  const reportBounds = useCallback((next: FloatingPanelPoint) => {
    const el = panelRef.current
    if (!el) return
    const width = el.offsetWidth
    const height = el.offsetHeight
    const prev = lastBoundsRef.current
    if (
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.width === width &&
      prev.height === height
    ) {
      return
    }
    const bounds = { x: next.x, y: next.y, width, height }
    lastBoundsRef.current = bounds
    onBoundsChangeRef.current?.(bounds)
  }, [])

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = clampFloatingPanelPosition(initialX, initialY, rect.width, rect.height)
    setPosition(next)
    reportBounds(next)
  }, [initialX, initialY, reportBounds])

  useLayoutEffect(() => {
    const reclampToViewport = () => {
      // Do not fight an in-progress header drag.
      if (dragRef.current) return
      const el = panelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPosition((prev) => {
        const next = clampFloatingPanelPosition(prev.x, prev.y, rect.width, rect.height)
        reportBounds(next)
        return next
      })
    }
    window.addEventListener('resize', reclampToViewport)

    const el = panelRef.current
    let observer: ResizeObserver | null = null
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        reclampToViewport()
      })
      observer.observe(el)
    }

    return () => {
      window.removeEventListener('resize', reclampToViewport)
      observer?.disconnect()
    }
  }, [reportBounds])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (isFloatingPanelDragIgnoredTarget(event.target)) return
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const el = panelRef.current
      const width = el?.offsetWidth ?? 320
      const height = el?.offsetHeight ?? 200
      const next = clampFloatingPanelPosition(
        event.clientX - drag.offsetX,
        event.clientY - drag.offsetY,
        width,
        height,
      )
      setPosition(next)
      reportBounds(next)
    },
    [reportBounds],
  )

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    }
  }, [])

  return {
    panelRef,
    position,
    headerDragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}

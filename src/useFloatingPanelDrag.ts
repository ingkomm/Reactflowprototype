import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

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

/**
 * UI-only floating panel position + header pointer drag.
 * Remount (or change initial x/y) to reset to a new open coordinate.
 * Never persisted to the graph document.
 */
export function useFloatingPanelDrag(
  initialX: number,
  initialY: number,
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

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition(clampFloatingPanelPosition(initialX, initialY, rect.width, rect.height))
  }, [initialX, initialY])

  useLayoutEffect(() => {
    const onResize = () => {
      const el = panelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPosition((prev) =>
        clampFloatingPanelPosition(prev.x, prev.y, rect.width, rect.height),
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const el = panelRef.current
    const width = el?.offsetWidth ?? 320
    const height = el?.offsetHeight ?? 200
    setPosition(
      clampFloatingPanelPosition(
        event.clientX - drag.offsetX,
        event.clientY - drag.offsetY,
        width,
        height,
      ),
    )
  }, [])

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

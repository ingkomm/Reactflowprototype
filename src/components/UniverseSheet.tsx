import { useCallback, useEffect, useRef, useState } from 'react'
import type { GalaxyDocumentV03 } from '../persistence/worldTypes'
import './UniverseSheet.css'

type Props = {
  width: number
  height: number
  galaxies: GalaxyDocumentV03[]
  selectedGalaxyId: string | null
  highlightGalaxyId?: string | null
  onSelectGalaxy: (galaxyId: string) => void
  onEnterGalaxy: (galaxyId: string) => void
  onMoveGalaxy: (galaxyId: string, position: { x: number; y: number }) => void
  onCreateGalaxy: () => void
  onRenameGalaxy: (galaxyId: string) => void
  onDeleteGalaxy: (galaxyId: string) => void
  onOpenReferenceLibrary: () => void
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function UniverseSheet({
  width,
  height,
  galaxies,
  selectedGalaxyId,
  highlightGalaxyId = null,
  onSelectGalaxy,
  onEnterGalaxy,
  onMoveGalaxy,
  onCreateGalaxy,
  onRenameGalaxy,
  onDeleteGalaxy,
  onOpenReferenceLibrary,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [surfaceSize, setSurfaceSize] = useState({ w: 800, h: 500 })
  const dragRef = useRef<{
    galaxyId: string
    pointerId: number
    origin: { x: number; y: number }
  } | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    galaxyId: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSurfaceSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.min(surfaceSize.w / width, surfaceSize.h / height)
  const offsetX = (surfaceSize.w - width * scale) / 2
  const offsetY = (surfaceSize.h - height * scale) / 2

  const toLogical = useCallback(
    (clientX: number, clientY: number) => {
      const el = surfaceRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const x = (clientX - rect.left - offsetX) / scale
      const y = (clientY - rect.top - offsetY) / scale
      return {
        x: clamp(x, 0, width),
        y: clamp(y, 0, height),
      }
    },
    [offsetX, offsetY, scale, width, height],
  )

  const onPointerDownGateway = (
    event: React.PointerEvent<HTMLButtonElement>,
    galaxy: GalaxyDocumentV03,
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelectGalaxy(galaxy.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      galaxyId: galaxy.id,
      pointerId: event.pointerId,
      origin: { ...galaxy.universePosition },
    }
    setDragPreview({
      galaxyId: galaxy.id,
      x: galaxy.universePosition.x,
      y: galaxy.universePosition.y,
    })
  }

  const onPointerMoveGateway = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const logical = toLogical(event.clientX, event.clientY)
    setDragPreview({ galaxyId: drag.galaxyId, x: logical.x, y: logical.y })
  }

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const logical = toLogical(event.clientX, event.clientY)
    setDragPreview(null)
    const moved =
      Math.hypot(logical.x - drag.origin.x, logical.y - drag.origin.y) > 2
    if (moved) onMoveGalaxy(drag.galaxyId, logical)
  }

  return (
    <div className="universe-sheet" data-testid="universe-sheet">
      <div className="universe-sheet__toolbar">
        <div className="universe-sheet__toolbar-left">
          <span className="universe-sheet__title">Universe</span>
          <span className="universe-sheet__meta">
            {width} × {height} · {galaxies.length} galaxies
          </span>
        </div>
        <div className="universe-sheet__toolbar-actions">
          <button type="button" className="btn" onClick={onOpenReferenceLibrary}>
            Reference Library
          </button>
          <button
            type="button"
            className="btn btn--primary"
            data-testid="universe-new-galaxy"
            onClick={onCreateGalaxy}
          >
            + Galaxy
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selectedGalaxyId}
            onClick={() => selectedGalaxyId && onRenameGalaxy(selectedGalaxyId)}
          >
            Rename
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!selectedGalaxyId || galaxies.length <= 1}
            onClick={() => selectedGalaxyId && onDeleteGalaxy(selectedGalaxyId)}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="universe-sheet__viewport" ref={surfaceRef}>
        <div
          className="universe-sheet__space"
          style={{
            width: width * scale,
            height: height * scale,
            left: offsetX,
            top: offsetY,
          }}
          aria-label="Universe map"
        >
          <div className="universe-sheet__starfield" aria-hidden />
          <div className="universe-sheet__frame" aria-hidden />
          {galaxies.map((galaxy) => {
            const pos =
              dragPreview?.galaxyId === galaxy.id
                ? { x: dragPreview.x, y: dragPreview.y }
                : galaxy.universePosition
            const selected = selectedGalaxyId === galaxy.id
            const highlighted = highlightGalaxyId === galaxy.id
            return (
              <button
                key={galaxy.id}
                type="button"
                className={[
                  'galaxy-gateway',
                  selected ? 'galaxy-gateway--selected' : '',
                  highlighted ? 'galaxy-gateway--highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: pos.x * scale,
                  top: pos.y * scale,
                }}
                aria-label={`Galaxy ${galaxy.name}`}
                data-testid={`galaxy-gateway-${galaxy.id}`}
                onPointerDown={(e) => onPointerDownGateway(e, galaxy)}
                onPointerMove={onPointerMoveGateway}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onEnterGalaxy(galaxy.id)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectGalaxy(galaxy.id)
                }}
              >
                <span className="galaxy-gateway__core" aria-hidden />
                <span className="galaxy-gateway__ring" aria-hidden />
                <span className="galaxy-gateway__label">{galaxy.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="universe-sheet__hint">
        Drag to move · Double-click to enter · At least one Galaxy required
      </p>
    </div>
  )
}

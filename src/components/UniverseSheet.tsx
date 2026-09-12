import { useCallback, useEffect, useRef, useState } from 'react'
import type { GalaxyDocumentV03 } from '../persistence/worldTypes'
import './UniverseSheet.css'

type Props = {
  width: number
  height: number
  galaxies: GalaxyDocumentV03[]
  selectedGalaxyId: string | null
  highlightGalaxyId?: string | null
  /** When false, structure tools are hidden and gateway drag is disabled. */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  navigationLocked?: boolean
  onSelectGalaxy: (galaxyId: string) => void
  onEnterGalaxy: (galaxyId: string, originPct: { x: number; y: number }) => void
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
  editing: editingProp,
  onEditingChange,
  navigationLocked = false,
  onSelectGalaxy,
  onEnterGalaxy,
  onMoveGalaxy,
  onCreateGalaxy,
  onRenameGalaxy,
  onDeleteGalaxy,
  onOpenReferenceLibrary,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [surfaceSize, setSurfaceSize] = useState({ w: 800, h: 500 })
  const [uncontrolledEditing, setUncontrolledEditing] = useState(false)
  const editing = editingProp ?? uncontrolledEditing
  const setEditing = (next: boolean) => {
    onEditingChange?.(next)
    if (editingProp === undefined) setUncontrolledEditing(next)
  }

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

  const originPctFromEvent = (event: React.MouseEvent<HTMLElement>) => {
    const sheet = sheetRef.current
    if (!sheet) return { x: 50, y: 50 }
    const sheetRect = sheet.getBoundingClientRect()
    const targetRect = event.currentTarget.getBoundingClientRect()
    const cx = targetRect.left + targetRect.width / 2 - sheetRect.left
    const cy = targetRect.top + targetRect.height / 2 - sheetRect.top
    return {
      x: sheetRect.width > 0 ? (cx / sheetRect.width) * 100 : 50,
      y: sheetRect.height > 0 ? (cy / sheetRect.height) * 100 : 50,
    }
  }

  const onPointerDownGateway = (
    event: React.PointerEvent<HTMLButtonElement>,
    galaxy: GalaxyDocumentV03,
  ) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelectGalaxy(galaxy.id)
    if (!editing || navigationLocked) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
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
    if (!editing) return
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
    if (!editing) return
    const moved =
      Math.hypot(logical.x - drag.origin.x, logical.y - drag.origin.y) > 2
    if (moved) onMoveGalaxy(drag.galaxyId, logical)
  }

  const enterGalaxy = (galaxyId: string, event: React.MouseEvent<HTMLElement>) => {
    if (navigationLocked) return
    setEditing(false)
    onEnterGalaxy(galaxyId, originPctFromEvent(event))
  }

  return (
    <div
      ref={sheetRef}
      className={[
        'universe-sheet',
        editing ? 'universe-sheet--editing' : 'universe-sheet--exploring',
      ].join(' ')}
      data-testid="universe-sheet"
      data-editing={editing ? 'true' : 'false'}
    >
      <div className="universe-sheet__toolbar">
        <div className="universe-sheet__toolbar-left">
          <span className="universe-sheet__title">Universe</span>
          <span className="universe-sheet__meta">
            {width} × {height} · {galaxies.length} galaxies
            {editing ? ' · Edit Mode' : ''}
          </span>
        </div>
        <div className="universe-sheet__toolbar-actions">
          <button
            type="button"
            className="btn"
            data-testid="universe-reference-library"
            onClick={onOpenReferenceLibrary}
          >
            Reference Library
          </button>
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                data-testid="universe-new-galaxy"
                disabled={navigationLocked}
                onClick={onCreateGalaxy}
              >
                + Galaxy
              </button>
              <button
                type="button"
                className="btn"
                data-testid="universe-rename-galaxy"
                disabled={!selectedGalaxyId || navigationLocked}
                onClick={() => selectedGalaxyId && onRenameGalaxy(selectedGalaxyId)}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="universe-delete-galaxy"
                disabled={!selectedGalaxyId || galaxies.length <= 1 || navigationLocked}
                onClick={() => selectedGalaxyId && onDeleteGalaxy(selectedGalaxyId)}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn"
                data-testid="universe-edit-done"
                onClick={() => setEditing(false)}
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn"
              data-testid="universe-edit-toggle"
              disabled={navigationLocked}
              onClick={() => setEditing(true)}
            >
              Edit Universe
            </button>
          )}
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
                  editing ? 'galaxy-gateway--editable' : '',
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
                  enterGalaxy(galaxy.id, e)
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
        {editing
          ? 'Edit Mode · Drag gateways to move · Double-click to enter · Done to finish'
          : 'Explore · Select a Galaxy · Double-click to enter · Edit Universe to rearrange'}
      </p>
    </div>
  )
}

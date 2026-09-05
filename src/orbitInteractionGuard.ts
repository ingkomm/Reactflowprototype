/** Suppresses pane click / selection clear while orbit ring is being rotated. */
const orbitInteractionGuard = {
  dragging: false,
  suppressUntil: 0,
  preserveSelectionId: null as string | null,
}

export function beginOrbitRotateDrag(preserveSelectionId: string | null) {
  orbitInteractionGuard.dragging = true
  orbitInteractionGuard.preserveSelectionId = preserveSelectionId
}

export function endOrbitRotateDrag() {
  orbitInteractionGuard.dragging = false
  orbitInteractionGuard.suppressUntil = Date.now() + 400
}

export function shouldSuppressOrbitSelectionClear() {
  return orbitInteractionGuard.dragging || Date.now() < orbitInteractionGuard.suppressUntil
}

export function getOrbitPreserveSelectionId() {
  return orbitInteractionGuard.preserveSelectionId
}

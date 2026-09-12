/**
 * Build a rendering-only SVG string that forces Light color-scheme.
 * Does not mutate the caller's source string / persistence.
 */
export function prepareSvgForLightRendering(svgSource: string): string {
  const trimmed = svgSource.trim()
  if (!trimmed) return trimmed

  try {
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml')
    if (doc.querySelector('parsererror')) return trimmed
    const root = doc.documentElement
    if (!root || root.localName.toLowerCase() !== 'svg') return trimmed

    // Force Light for adaptive Draw.io SVGs (`color-scheme: light dark` + light-dark()).
    root.setAttribute('color-scheme', 'light')
    root.style.setProperty('color-scheme', 'light', 'important')

    return new XMLSerializer().serializeToString(doc)
  } catch {
    return trimmed
  }
}

/** Blob URL for light-forced SVG rendering. Caller must revoke. */
export function createLightSvgObjectUrl(svgSource: string): string {
  const prepared = prepareSvgForLightRendering(svgSource)
  const blob = new Blob([prepared], { type: 'image/svg+xml;charset=utf-8' })
  return URL.createObjectURL(blob)
}

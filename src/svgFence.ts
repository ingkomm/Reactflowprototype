/** Defense-in-depth checks for SVG fenced blocks shown as Blob images. */

const EVENT_ATTR_RE = /^on/i
const JS_URL_RE = /^\s*javascript:/i

export function isSafeSvgForBlobImage(source: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml')
  } catch {
    return false
  }
  if (doc.querySelector('parsererror')) return false
  if (doc.documentElement?.localName?.toLowerCase() !== 'svg') return false

  const elements = doc.getElementsByTagName('*')
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i]!
    if (el.localName.toLowerCase() === 'script') return false
    for (const attr of Array.from(el.attributes)) {
      if (EVENT_ATTR_RE.test(attr.name)) return false
      if (JS_URL_RE.test(attr.value)) return false
    }
  }
  return true
}

export function parseSvgFenceInfo(openingLine: string): string | null {
  if (!openingLine.startsWith('```')) return null
  return openingLine.slice(3).trim()
}

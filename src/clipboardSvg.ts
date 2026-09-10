/** Extract Draw.io / browser clipboard SVG payloads as UTF-8 XML source. */

const SVG_DATA_URI_RE = /^data:image\/svg\+xml([;,].*)$/i

function decodeBase64Utf8(base64: string): string | null {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return null
  }
}

function decodeSvgDataUri(src: string): string | null {
  const trimmed = src.trim()
  const match = SVG_DATA_URI_RE.exec(trimmed)
  if (!match) return null
  const rest = match[1] ?? ''
  const comma = rest.indexOf(',')
  if (comma < 0) return null
  const meta = rest.slice(0, comma).toLowerCase()
  const payload = rest.slice(comma + 1)
  if (!payload) return null

  if (meta.includes(';base64') || meta === ';base64') {
    return decodeBase64Utf8(payload)
  }

  try {
    // data:image/svg+xml;charset=utf-8,%3Csvg... or data:image/svg+xml,%3Csvg...
    return decodeURIComponent(payload)
  } catch {
    return null
  }
}

/** True when source is well-formed SVG XML with <svg> root (no parsererror). */
export function isValidSvgXml(source: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false
  try {
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml')
    if (doc.querySelector('parsererror')) return false
    return doc.documentElement?.localName?.toLowerCase() === 'svg'
  } catch {
    return false
  }
}

function extractFromHtml(html: string): string | null {
  if (!html.trim()) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const images = doc.querySelectorAll('img')
    for (const img of images) {
      const src = img.getAttribute('src') ?? ''
      const decoded = decodeSvgDataUri(src)
      if (decoded && isValidSvgXml(decoded)) return decoded.trim()
    }
  } catch {
    return null
  }
  return null
}

/**
 * PRIMARY: text/html → img[src=data:image/svg+xml...]
 * FALLBACK: non-empty image/svg+xml, then raw text/plain SVG XML
 */
export function extractSvgFromClipboard(clipboardData: DataTransfer | null | undefined): string | null {
  if (!clipboardData) return null

  const html = clipboardData.getData('text/html')
  const fromHtml = extractFromHtml(html)
  if (fromHtml) return fromHtml

  const direct = clipboardData.getData('image/svg+xml')?.trim()
  if (direct && isValidSvgXml(direct)) return direct

  const plain = clipboardData.getData('text/plain')?.trim()
  if (plain && isValidSvgXml(plain)) return plain

  return null
}

export function wrapSvgMarkdownFence(svgSource: string): string {
  const body = svgSource.trim()
  return `\`\`\`svg\n${body}\n\`\`\``
}

export function insertAtTextareaSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insertion: string,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length))
  const end = Math.max(start, Math.min(selectionEnd, value.length))
  const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`
  return { value: next, caret: start + insertion.length }
}

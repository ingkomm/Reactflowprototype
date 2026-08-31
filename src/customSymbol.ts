import type { CustomSymbol } from './types'

const BLOCKED_TAG = /<\/?(script|foreignObject|iframe|object|embed|use)\b[^>]*>/gi
const EVENT_ATTR = /\s(on[a-z]+|formaction|xlink:href|href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const EXTERNAL_REF = /\s(xlink:)?href\s*=\s*("|')?(https?:|javascript:|data:)/gi

const KEEP_PAINT = /^(none|transparent|currentcolor|inherit|url\()/i

export function createCustomSymbolId() {
  return `cs-${crypto.randomUUID().slice(0, 8)}`
}

export type SanitizeSvgResult =
  | { ok: true; symbol: CustomSymbol }
  | { ok: false; message: string }

function parseViewBox(raw: string): { viewBox: string; width: number; height: number } | null {
  const parts = raw.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  const width = parts[2]!
  const height = parts[3]!
  if (width <= 0 || height <= 0) return null
  return { viewBox: parts.join(' '), width, height }
}

function stripOuterSvg(svgText: string): string | null {
  const match = svgText.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i)
  if (!match?.[1]) return null
  return match[1].trim()
}

function sanitizeInnerMarkup(markup: string): string {
  let next = markup.replace(BLOCKED_TAG, '')
  next = next.replace(EVENT_ATTR, '')
  next = next.replace(EXTERNAL_REF, '')
  return next.trim()
}

function unwrapAttrValue(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function shouldKeepPaint(value: string): boolean {
  return KEEP_PAINT.test(value.trim())
}

function rewriteStylePaint(styleValue: string): string {
  return styleValue
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const colon = decl.indexOf(':')
      if (colon < 0) return decl
      const prop = decl.slice(0, colon).trim().toLowerCase()
      const value = decl.slice(colon + 1).trim()
      if (prop === 'fill' || prop === 'stroke' || prop === 'stop-color' || prop === 'flood-color') {
        if (shouldKeepPaint(value)) return `${prop}: ${value}`
        return `${prop}: currentColor`
      }
      if (prop === 'color') return 'color: currentColor'
      return decl
    })
    .join('; ')
}

/**
 * Replace hardcoded paints with currentColor so symbol tinting works.
 * Preserves none / transparent / url(...) paints.
 */
export function toMonochromeMarkup(markup: string): string {
  let next = markup

  next = next.replace(/\s(fill|stroke|stop-color|flood-color)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, attr, raw) => {
    const value = unwrapAttrValue(String(raw))
    if (shouldKeepPaint(value)) return match
    return ` ${attr}="currentColor"`
  })

  next = next.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_match, _full, doubleQuoted, singleQuoted) => {
    const styleValue = doubleQuoted ?? singleQuoted ?? ''
    const rewritten = rewriteStylePaint(styleValue)
    return ` style="${rewritten}"`
  })

  next = next.replace(/\sfill-opacity\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' fill-opacity="1"')
  next = next.replace(/\sstroke-opacity\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' stroke-opacity="1"')

  return next.trim()
}

export function sanitizeSvgFile(svgText: string, name: string): SanitizeSvgResult {
  const trimmed = svgText.trim()
  if (!/<svg\b/i.test(trimmed)) {
    return { ok: false, message: 'SVG root element가 필요합니다.' }
  }

  const viewBoxMatch = trimmed.match(/\bviewBox\s*=\s*("|')([^"']+)\1/i)
  if (!viewBoxMatch?.[2]) {
    return { ok: false, message: 'viewBox 속성이 있는 SVG만 가져올 수 있습니다.' }
  }

  const view = parseViewBox(viewBoxMatch[2])
  if (!view) {
    return { ok: false, message: 'viewBox 형식이 올바르지 않습니다.' }
  }

  const inner = stripOuterSvg(trimmed)
  if (!inner) {
    return { ok: false, message: 'SVG 내용을 읽을 수 없습니다.' }
  }

  const markup = toMonochromeMarkup(sanitizeInnerMarkup(inner))
  if (!markup) {
    return { ok: false, message: '표시 가능한 SVG 요소가 없습니다.' }
  }

  const safeName = name.trim() || 'Symbol'
  return {
    ok: true,
    symbol: {
      id: createCustomSymbolId(),
      name: safeName,
      viewBox: view.viewBox,
      width: view.width,
      height: view.height,
      markup,
    },
  }
}

export function validateCustomSymbol(value: unknown): CustomSymbol | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<CustomSymbol>
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (typeof raw.viewBox !== 'string' || !raw.viewBox.trim()) return null
  if (typeof raw.markup !== 'string' || !raw.markup.trim()) return null
  const view = parseViewBox(raw.viewBox)
  if (!view) return null

  const markup = toMonochromeMarkup(sanitizeInnerMarkup(raw.markup))
  if (!markup) return null

  const symbol: CustomSymbol = {
    id: raw.id.trim(),
    name: raw.name.trim(),
    viewBox: view.viewBox,
    width: view.width,
    height: view.height,
    markup,
  }
  if (raw.kind === 'mastery' || raw.kind === 'notable' || raw.kind === 'small') {
    symbol.kind = raw.kind
  }
  const color = parseSymbolColor(raw.color)
  if (color) symbol.color = color
  return symbol
}

function parseSymbolColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed
  return undefined
}

export function validateCustomSymbols(value: unknown): CustomSymbol[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const symbols: CustomSymbol[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const symbol = validateCustomSymbol(item)
    if (!symbol) return null
    if (seen.has(symbol.id)) return null
    seen.add(symbol.id)
    symbols.push(symbol)
  }

  return symbols
}

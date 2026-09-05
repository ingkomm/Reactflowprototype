import type { CustomSymbol } from './types'
import { MAX_IMAGE_BYTES } from './limits'

const BLOCKED_TAG = /<\/?(script|foreignObject|iframe|object|embed)\b[^>]*>/gi
const EVENT_ATTR = /\s(on[a-z]+|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const KEEP_PAINT = /^(none|transparent|currentcolor|inherit|url\()/i
const RASTER_MIME = /^image\/(png|jpe?g|webp|gif)$/i
const MAX_RASTER_EDGE = 256
/** Placeholder replaced per render so mask ids never collide across nodes. */
export const SYMBOL_MASK_ID = '__SYMBOL_MASK__'

export const DEFAULT_SYMBOL_SCALE = 1
export const MIN_SYMBOL_SCALE = 0.5
export const MAX_SYMBOL_SCALE = 2
export const SYMBOL_SCALE_STEP = 0.05

export function normalizeSymbolScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SYMBOL_SCALE
  const clamped = Math.min(MAX_SYMBOL_SCALE, Math.max(MIN_SYMBOL_SCALE, value))
  return Number((Math.round(clamped / SYMBOL_SCALE_STEP) * SYMBOL_SCALE_STEP).toFixed(2))
}

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

function parseLength(raw: string | undefined): number | null {
  if (!raw) return null
  const match = raw.trim().match(/^([0-9]*\.?[0-9]+)(px|pt|pc|mm|cm|in|%)?$/i)
  if (!match?.[1]) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = (match[2] ?? 'px').toLowerCase()
  if (unit === '%' ) return null
  if (unit === 'pt') return value * (96 / 72)
  if (unit === 'pc') return value * 16
  if (unit === 'mm') return value * (96 / 25.4)
  if (unit === 'cm') return value * (96 / 2.54)
  if (unit === 'in') return value * 96
  return value
}

function inferViewBox(svgText: string): { viewBox: string; width: number; height: number } | null {
  const openTag = svgText.match(/<svg\b[^>]*>/i)?.[0]
  if (!openTag) return null

  const viewBoxMatch = openTag.match(/\bviewBox\s*=\s*("|')([^"']+)\1/i)
  if (viewBoxMatch?.[2]) {
    const parsed = parseViewBox(viewBoxMatch[2])
    if (parsed) return parsed
  }

  const width = parseLength(openTag.match(/\bwidth\s*=\s*("|')([^"']+)\1/i)?.[2])
  const height = parseLength(openTag.match(/\bheight\s*=\s*("|')([^"']+)\1/i)?.[2])
  if (width && height) {
    return { viewBox: `0 0 ${width} ${height}`, width, height }
  }
  return null
}

function stripOuterSvg(svgText: string): string | null {
  const match = svgText.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i)
  if (!match?.[1]) return null
  return match[1].trim()
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

function isAllowedHref(value: string): boolean {
  if (!value) return false
  if (value.startsWith('#')) return true
  if (/^data:image\/(png|jpe?g|webp|gif)[;,]/i.test(value)) return true
  return false
}

function sanitizeHrefs(markup: string): string {
  return markup.replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, _prefix, raw) => {
    const value = unwrapAttrValue(String(raw))
    if (isAllowedHref(value)) return match
    return ''
  })
}

function sanitizeInnerMarkup(markup: string): string {
  let next = markup.replace(BLOCKED_TAG, '')
  next = next.replace(EVENT_ATTR, '')
  next = sanitizeHrefs(next)
  // Drop <use> that points outside fragment ids (keep internal #refs).
  next = next.replace(/<use\b([^>]*)\/?>/gi, (full, attrs: string) => {
    const href = attrs.match(/\b(?:xlink:)?href\s*=\s*("|')([^"']+)\1/i)?.[2]
    if (href && href.startsWith('#')) return full
    return ''
  })
  return next.trim()
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

/** Replace hardcoded paints with currentColor so symbol tinting works. */
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

export function buildMaskedImageMarkup(dataUrl: string, width: number, height: number): string {
  return [
    `<defs>`,
    `<mask id="${SYMBOL_MASK_ID}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">`,
    `<image href="${dataUrl}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`,
    `</mask>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="currentColor" mask="url(#${SYMBOL_MASK_ID})"/>`,
  ].join('')
}

const RASTER_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
const BLOCKED_MARKUP = /<\/?(script|style|foreignObject|iframe|object|embed)\b/i
const EVENT_ATTR_MARKUP = /\s(on[a-z]+|formaction)\s*=/i
const EXTERNAL_URL_MARKUP = /\b(?:href|xlink:href)\s*=\s*("|')(?!data:image\/png;base64,)(?!#)[^"']*\1/i

export type ParsedRasterSymbol = {
  dataUrl: string
  width: number
  height: number
}

/** Extract raster data URL from masked-image markup produced by import. */
export function parseRasterSymbolMarkup(markup: string): ParsedRasterSymbol | null {
  if (!markup.includes(SYMBOL_MASK_ID)) return null
  const hrefMatch = markup.match(/<image\b[^>]*\bhref="(data:image\/png;base64,[^"]+)"/i)
  if (!hrefMatch?.[1] || !RASTER_DATA_URL.test(hrefMatch[1])) return null
  const rectMatch = markup.match(/<rect\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/i)
  if (!rectMatch?.[1] || !rectMatch?.[2]) return null
  const width = Number(rectMatch[1])
  const height = Number(rectMatch[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { dataUrl: hrefMatch[1], width, height }
}

function rejectUnsafeMarkup(markup: string): string | null {
  if (BLOCKED_MARKUP.test(markup)) return null
  if (EVENT_ATTR_MARKUP.test(markup)) return null
  if (EXTERNAL_URL_MARKUP.test(markup)) return null
  return markup
}

function parseSymbolColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed
  return undefined
}

export function isRasterSymbolFile(file: File): boolean {
  if (RASTER_MIME.test(file.type)) return true
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export function isSvgSymbolFile(file: File): boolean {
  if (file.type === 'image/svg+xml') return true
  return /\.svg$/i.test(file.name)
}

function scaleToMaxEdge(width: number, height: number, maxEdge: number) {
  const edge = Math.max(width, height)
  if (edge <= maxEdge) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  const scale = maxEdge / edge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function luminanceToAlpha(data: Uint8ClampedArray) {
  // Prefer dark-on-transparent / dark-on-light icons: dark pixels become opaque.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const a = data[i + 3]!
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const darkness = 1 - lum / 255
    const alpha = Math.round(a * darkness)
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    data[i + 3] = alpha
  }
}

async function canvasFromImageSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const sized = scaleToMaxEdge(sourceWidth, sourceHeight, MAX_RASTER_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = sized.width
  canvas.height = sized.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 초기화할 수 없습니다.')
  ctx.clearRect(0, 0, sized.width, sized.height)
  ctx.drawImage(source, 0, 0, sized.width, sized.height)
  const imageData = ctx.getImageData(0, 0, sized.width, sized.height)
  luminanceToAlpha(imageData.data)
  ctx.putImageData(imageData, 0, 0)
  return { canvas, width: sized.width, height: sized.height }
}

async function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL('image/png')
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
    img.src = src
  })
  return img
}

export async function rasterDataUrlToSymbol(
  dataUrl: string,
  name: string,
  id = createCustomSymbolId(),
): Promise<SanitizeSvgResult> {
  try {
    const img = await loadHtmlImage(dataUrl)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) {
      return { ok: false, message: '이미지 크기를 읽을 수 없습니다.' }
    }
    const { canvas, width: w, height: h } = await canvasFromImageSource(img, width, height)
    const maskUrl = await canvasToPngDataUrl(canvas)
    return {
      ok: true,
      symbol: {
        id,
        name: name.trim() || 'Symbol',
        viewBox: `0 0 ${w} ${h}`,
        width: w,
        height: h,
        markup: buildMaskedImageMarkup(maskUrl, w, h),
      },
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '이미지를 심볼로 변환할 수 없습니다.',
    }
  }
}

export async function importRasterSymbol(file: File, name: string): Promise<SanitizeSvgResult> {
  const url = URL.createObjectURL(file)
  try {
    return await rasterDataUrlToSymbol(url, name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function sanitizeSvgFile(svgText: string, name: string): SanitizeSvgResult {
  const trimmed = svgText.replace(/^\uFEFF/, '').trim()
  if (!/<svg\b/i.test(trimmed)) {
    return { ok: false, message: 'SVG root element가 필요합니다.' }
  }

  const view = inferViewBox(trimmed)
  if (!view) {
    return {
      ok: false,
      message: 'viewBox 또는 width/height가 있는 SVG만 가져올 수 있습니다.',
    }
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

/** Unified importer for PNG / JPEG / WebP / GIF (SVG disabled in v0.1). */
export async function importSymbolFile(file: File): Promise<SanitizeSvgResult> {
  const name = file.name.replace(/\.[^.]+$/, '') || 'Symbol'

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `이미지 파일이 너무 큽니다 (최대 ${Math.round(MAX_IMAGE_BYTES / 1024)}KB).`,
    }
  }

  if (isRasterSymbolFile(file)) {
    return importRasterSymbol(file, name)
  }

  if (isSvgSymbolFile(file)) {
    return {
      ok: false,
      message:
        'v0.1에서는 보안상 SVG 가져오기가 비활성화되어 있습니다. PNG/JPEG/WebP/GIF를 사용해 주세요.',
    }
  }

  if (!isSvgSymbolFile(file) && file.type && file.type !== 'image/svg+xml') {
    return { ok: false, message: 'PNG/JPEG/WebP/GIF 이미지만 가져올 수 있습니다.' }
  }

  return { ok: false, message: '지원하지 않는 파일 형식입니다.' }
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

  const safeMarkup = rejectUnsafeMarkup(raw.markup.trim())
  if (!safeMarkup) return null
  const raster = parseRasterSymbolMarkup(safeMarkup)
  if (!raster) return null
  if (raster.width !== view.width || raster.height !== view.height) return null

  const symbol: CustomSymbol = {
    id: raw.id.trim(),
    name: raw.name.trim(),
    viewBox: view.viewBox,
    width: view.width,
    height: view.height,
    markup: safeMarkup,
  }
  if (raw.kind === 'mastery' || raw.kind === 'notable' || raw.kind === 'shard') {
    symbol.kind = raw.kind
  }
  const color = parseSymbolColor(raw.color)
  if (color) symbol.color = color
  if (raw.scale != null) {
    const scale = normalizeSymbolScale(raw.scale)
    if (scale !== DEFAULT_SYMBOL_SCALE) symbol.scale = scale
  }
  return symbol
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

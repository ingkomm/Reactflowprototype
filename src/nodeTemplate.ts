import type { PassiveKind } from './types'

export const PALETTE_MIME = 'application/x-pob-node-template'

export type NodeTemplatePayload = {
  source: 'symbol'
  symbolId: string
  kind: PassiveKind
}

export function encodePalettePayload(payload: NodeTemplatePayload): string {
  return JSON.stringify(payload)
}

export const PALETTE_KINDS = new Set<PassiveKind>(['shard', 'notable', 'mastery', 'connect'])

export function decodePalettePayload(raw: string): NodeTemplatePayload | null {
  try {
    const parsed = JSON.parse(raw) as NodeTemplatePayload
    if (parsed.source !== 'symbol') return null
    if (typeof parsed.symbolId !== 'string' || !parsed.symbolId.trim()) return null
    if (!PALETTE_KINDS.has(parsed.kind)) return null
    return { source: 'symbol', symbolId: parsed.symbolId.trim(), kind: parsed.kind }
  } catch {
    return null
  }
}

/** Write palette payload to custom MIME + text/plain (WebView2-compatible). */
export function writePalettePayload(
  dataTransfer: DataTransfer,
  payload: NodeTemplatePayload,
): void {
  const encoded = encodePalettePayload(payload)
  dataTransfer.setData(PALETTE_MIME, encoded)
  dataTransfer.setData('text/plain', encoded)
  dataTransfer.effectAllowed = 'copy'
}

/** Read palette payload: custom MIME first, then text/plain fallback. */
export function readPalettePayload(dataTransfer: DataTransfer): NodeTemplatePayload | null {
  const primary = dataTransfer.getData(PALETTE_MIME)
  const fromPrimary = primary ? decodePalettePayload(primary) : null
  if (fromPrimary) return fromPrimary
  const fallback = dataTransfer.getData('text/plain')
  return fallback ? decodePalettePayload(fallback) : null
}

/** Kinds with expandable symbol lists in the left Library tree. */
export const LIBRARY_NODE_KINDS = ['mastery', 'notable', 'shard', 'connect'] as const satisfies PassiveKind[]

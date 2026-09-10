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

/** Kinds with expandable symbol lists in the left Library tree. */
export const LIBRARY_NODE_KINDS = ['mastery', 'notable', 'shard', 'connect'] as const satisfies PassiveKind[]

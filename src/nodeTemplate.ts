import type { PassiveKind } from './types'

export const PALETTE_MIME = 'application/x-pob-node-template'

export type NodeTemplatePayload =
  | { source: 'system'; kind: PassiveKind }
  | { source: 'custom'; symbolId: string; kind?: PassiveKind }

export function encodePalettePayload(payload: NodeTemplatePayload): string {
  return JSON.stringify(payload)
}

export function decodePalettePayload(raw: string): NodeTemplatePayload | null {
  try {
    const parsed = JSON.parse(raw) as NodeTemplatePayload
    if (parsed.source === 'system') {
      if (parsed.kind !== 'small' && parsed.kind !== 'notable' && parsed.kind !== 'mastery') return null
      return parsed
    }
    if (parsed.source === 'custom') {
      if (typeof parsed.symbolId !== 'string' || !parsed.symbolId.trim()) return null
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/** Kinds shown in the left Library palette. */
export const LIBRARY_NODE_KINDS = ['small', 'notable', 'mastery'] as const satisfies PassiveKind[]

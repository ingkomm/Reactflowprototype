import { describe, expect, it } from 'vitest'
import {
  buildGraphDocument,
  graphDocumentsEqual,
  parseGraphDocumentJson,
  serializeGraphDocument,
  validateGraphDocument,
} from './graphDocument'
import { sanitizeSvgFile } from './customSymbol'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import { createVideoMediaId } from './videoMedia'

describe('graphDocument', () => {
  it('round-trips seed graph JSON', () => {
    const doc = buildGraphDocument({
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: { gridSnapEnabled: true, voidHighlightEnabled: false },
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(graphDocumentsEqual(doc, parsed.document)).toBe(true)
  })

  it('rejects unsupported schema versions without mutating parse state', () => {
    const bad = { schemaVersion: '9.9', nodes: [], edges: [], customSymbols: [] }
    const result = validateGraphDocument(bad)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('schemaVersion')
  })

  it('ignores legacy classes/customIcons and migrates classId to symbolId', () => {
    const legacy = {
      schemaVersion: '0.1',
      nodes: SEED_NODES.map((n) => ({
        id: n.id,
        type: 'passive',
        position: n.position,
        data: {
          ...n.data,
          classId: 'm-dance',
          customIconId: 'ci-old',
        },
      })),
      edges: SEED_EDGES,
      classes: [{ id: 'm-dance', kind: 'mastery', label: 'Legacy', iconId: 'da-disco', iconColor: '#AD1A72' }],
      customIcons: [{ id: 'ci-old', name: 'Legacy', width: 16, height: 16, pixels: [] }],
    }
    const result = validateGraphDocument(legacy)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.customSymbols).toEqual([])
    const node = result.document.nodes.find((n) => n.id === 'mastery-dance')
    expect(node?.data.symbolId).toBe('m-2')
    expect(node?.data.classId).toBeUndefined()
  })

  it('preserves custom symbols and media references', () => {
    const imported = sanitizeSvgFile(
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
      'Star',
    )
    if (!imported.ok) throw new Error('svg import failed')
    const customSymbols = [imported.symbol]
    const nodes = structuredClone(SEED_NODES)
    const notable = nodes.find((n) => n.id === 'notable-hiphop')
    if (notable) {
      const data = notable.data
      data.customSymbolId = customSymbols[0]!.id
      data.media = [
        {
          id: createVideoMediaId(),
          url: 'https://youtu.be/dQw4w9WgXcQ',
          title: 'Practice',
          kind: 'youtube',
          provider: 'youtube',
        },
      ]
    }

    const doc = buildGraphDocument({
      nodes,
      edges: SEED_EDGES,
      customSymbols,
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.customSymbols).toHaveLength(1)
    const restored = parsed.document.nodes.find((n) => n.id === 'notable-hiphop')
    expect(restored?.data.customSymbolId).toBe(customSymbols[0]!.id)
  })
})

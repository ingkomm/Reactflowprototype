import { describe, expect, it } from 'vitest'
import { createCustomIcon } from './customIcon'
import {
  buildGraphDocument,
  graphDocumentsEqual,
  parseGraphDocumentJson,
  serializeGraphDocument,
  validateGraphDocument,
} from './graphDocument'
import { buildSeedClasses } from './passiveClass'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import { createVideoMediaId } from './videoMedia'

describe('graphDocument', () => {
  it('round-trips seed graph JSON', () => {
    const doc = buildGraphDocument({
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      classes: buildSeedClasses(),
      customIcons: [],
      settings: { gridSnapEnabled: true, voidHighlightEnabled: false },
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(graphDocumentsEqual(doc, parsed.document)).toBe(true)
  })

  it('rejects unsupported schema versions without mutating parse state', () => {
    const bad = { schemaVersion: '9.9', nodes: [], edges: [], classes: [], customIcons: [] }
    const result = validateGraphDocument(bad)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('schemaVersion')
  })

  it('preserves custom icons and media references', () => {
    const customIcons = [createCustomIcon('Star')]
    customIcons[0]!.pixels[0] = '#D9730D'
    const nodes = structuredClone(SEED_NODES)
    const notable = nodes.find((n) => n.id === 'notable-hiphop')
    if (notable) {
      const data = notable.data
      data.customIconId = customIcons[0]!.id
      data.media = [
        {
          id: createVideoMediaId(),
          url: 'https://youtu.be/dQw4w9WgXcQ',
          title: 'Practice',
          kind: 'youtube',
          provider: 'youtube',
        },
      ]
      if (data.stages[0]?.logs[0]) {
        data.stages[0].logs[0].media = [
          {
            id: createVideoMediaId(),
            url: 'https://example.com/workout',
            kind: 'external',
            provider: 'link',
          },
        ]
      }
    }

    const doc = buildGraphDocument({
      nodes,
      edges: SEED_EDGES,
      classes: buildSeedClasses(),
      customIcons,
    })
    const parsed = parseGraphDocumentJson(serializeGraphDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document.customIcons).toHaveLength(1)
    const restored = parsed.document.nodes.find((n) => n.id === 'notable-hiphop')
    expect(restored?.data.customIconId).toBe(customIcons[0]!.id)
    expect(restored?.data.media?.[0]?.url).toContain('youtu.be')
    expect(restored?.data.stages[0]?.logs[0]?.media?.[0]?.url).toBe('https://example.com/workout')
  })
})

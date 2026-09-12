import { describe, expect, it } from 'vitest'
import {
  decodePalettePayload,
  encodePalettePayload,
  readPalettePayload,
  writePalettePayload,
  type NodeTemplatePayload,
} from './nodeTemplate'

function fakeDataTransfer(initial: Record<string, string> = {}): DataTransfer {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getData: (type: string) => store.get(type) ?? '',
    setData: (type: string, value: string) => {
      store.set(type, value)
    },
    effectAllowed: 'uninitialized',
  } as unknown as DataTransfer
}

const kinds = ['mastery', 'notable', 'shard', 'connect'] as const

describe('palette DataTransfer payload', () => {
  it('decodes PALETTE_MIME payloads for all library kinds', () => {
    for (const kind of kinds) {
      const payload: NodeTemplatePayload = {
        source: 'symbol',
        symbolId: 'default',
        kind,
      }
      expect(decodePalettePayload(encodePalettePayload(payload))).toEqual(payload)
    }
  })

  it('falls back to text/plain when custom MIME is empty', () => {
    const payload: NodeTemplatePayload = {
      source: 'symbol',
      symbolId: 'default',
      kind: 'notable',
    }
    const dt = fakeDataTransfer({
      'text/plain': encodePalettePayload(payload),
    })
    expect(readPalettePayload(dt)).toEqual(payload)
  })

  it('prefers custom MIME over text/plain', () => {
    const primary: NodeTemplatePayload = {
      source: 'symbol',
      symbolId: 'default',
      kind: 'mastery',
    }
    const other: NodeTemplatePayload = {
      source: 'symbol',
      symbolId: 'default',
      kind: 'shard',
    }
    const dt = fakeDataTransfer({
      'application/x-pob-node-template': encodePalettePayload(primary),
      'text/plain': encodePalettePayload(other),
    })
    expect(readPalettePayload(dt)).toEqual(primary)
  })

  it('rejects invalid text/plain', () => {
    expect(decodePalettePayload('not-json')).toBeNull()
    expect(decodePalettePayload('{"hello":"world"}')).toBeNull()
    expect(
      readPalettePayload(
        fakeDataTransfer({
          'text/plain': 'hello world',
        }),
      ),
    ).toBeNull()
  })

  it('does not treat arbitrary text drag as a node template', () => {
    expect(
      readPalettePayload(
        fakeDataTransfer({
          'text/plain': 'https://example.com/file.json',
        }),
      ),
    ).toBeNull()
    expect(
      readPalettePayload(
        fakeDataTransfer({
          'text/plain': JSON.stringify({ source: 'symbol', symbolId: 'x', kind: 'void' }),
        }),
      ),
    ).toBeNull()
  })

  it('writePalettePayload stores both MIME channels', () => {
    const payload: NodeTemplatePayload = {
      source: 'symbol',
      symbolId: 'default',
      kind: 'connect',
    }
    const dt = fakeDataTransfer()
    writePalettePayload(dt, payload)
    expect(dt.getData('application/x-pob-node-template')).toBe(encodePalettePayload(payload))
    expect(dt.getData('text/plain')).toBe(encodePalettePayload(payload))
    expect(dt.effectAllowed).toBe('copy')
  })
})

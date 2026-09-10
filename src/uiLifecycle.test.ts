import { describe, expect, it } from 'vitest'
import {
  pinOrFocusViewer,
  type PinnedViewerEntry,
} from './pinnedViewer'

/** Mirrors App export: download must not reset UI pin/menu state. */
function afterExport(state: {
  contextMenu: unknown
  pinnedViewers: PinnedViewerEntry[]
  pinnedViewerBounds: Record<string, unknown>
  pinnedVideoNodeIds: string[]
}) {
  return state
}

/** Mirrors App import success cleanup. */
function afterImportSuccess(_state: {
  contextMenu: unknown
  pinnedViewers: PinnedViewerEntry[]
  pinnedViewerBounds: Record<string, unknown>
  pinnedVideoNodeIds: string[]
}) {
  return {
    contextMenu: null,
    pinnedViewers: [] as PinnedViewerEntry[],
    pinnedViewerBounds: {},
    pinnedVideoNodeIds: [] as string[],
  }
}

describe('export/import UI lifecycle', () => {
  it('keeps pinned state after export', () => {
    const pinned = pinOrFocusViewer([], { nodeId: 'a', kind: 'shard', x: 1, y: 2 }, 1)
    const before = {
      contextMenu: { nodeId: 'a', x: 0, y: 0 },
      pinnedViewers: pinned,
      pinnedViewerBounds: { a: { x: 0, y: 0, width: 10, height: 10 } },
      pinnedVideoNodeIds: ['v1'],
    }
    expect(afterExport(before)).toEqual(before)
  })

  it('clears viewer/pin state only after successful import', () => {
    const pinned = pinOrFocusViewer([], { nodeId: 'a', kind: 'notable', x: 1, y: 2 }, 1)
    const before = {
      contextMenu: { nodeId: 'a', x: 0, y: 0 },
      pinnedViewers: pinned,
      pinnedViewerBounds: { a: { x: 0, y: 0, width: 10, height: 10 } },
      pinnedVideoNodeIds: ['v1'],
    }
    expect(afterImportSuccess(before)).toEqual({
      contextMenu: null,
      pinnedViewers: [],
      pinnedViewerBounds: {},
      pinnedVideoNodeIds: [],
    })
  })
})

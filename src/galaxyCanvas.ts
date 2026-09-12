/**
 * Apply Galaxy GraphDocument into App canvas session fields.
 */
import type { Edge } from '@xyflow/react'
import { documentToFlowState, type GraphDocumentV01 } from './graphDocument'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { CustomSymbol, GraphDocumentSettings } from './types'
import { sanitizeFlowEdges } from './useGraphApp'

export type GalaxyCanvasSession = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  customSymbols: CustomSymbol[]
  settings: GraphDocumentSettings
}

export function snapshotFromGalaxyGraph(graph: GraphDocumentV01): GalaxyCanvasSession {
  const imported = documentToFlowState(graph)
  return {
    nodes: imported.nodes,
    edges: sanitizeFlowEdges(imported.nodes, imported.edges),
    customSymbols: imported.customSymbols,
    settings: imported.settings,
  }
}

/** Session-only UI that must not leak across Galaxy switches. */
export type GalaxySessionUiReset = {
  selectedId: null
  contextMenu: null
  pinnedViewers: []
  pinnedViewerBounds: Record<string, never>
  floatingVideoNodeIds: []
  focusLogId: null
  dragPreviewNodes: null
}

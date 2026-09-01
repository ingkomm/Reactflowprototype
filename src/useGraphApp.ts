import { useCallback, useEffect, useRef } from 'react'
import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  buildGraphDocument,
  documentToFlowState,
  parseGraphDocumentJson,
  type GraphDocumentV01,
} from './graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from './emptyGraph'
import {
  backupDocumentToStorage,
  loadDocumentFromStorage,
  readBootstrapChoice,
  saveDocumentToStorage,
  writeBootstrapChoice,
  type BootstrapChoice,
} from './persistence/autosave'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import type { CustomSymbol, GraphDocumentSettings } from './types'
import { MAX_JSON_BYTES } from './limits'
import { syncEdgesReachableFromInitial } from './power'
import { pruneInvalidEdges } from './graphEdges'

export type GraphAppSnapshot = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  customSymbols: CustomSymbol[]
  settings: GraphDocumentSettings
}

export type GraphPersistInput = GraphAppSnapshot & {
  pinnedVideoNodeIds?: string[]
}

const AUTOSAVE_DEBOUNCE_MS = 400

function flowFromBootstrap(choice: BootstrapChoice): GraphAppSnapshot {
  if (choice === 'demo') {
    return {
      nodes: SEED_NODES,
      edges: SEED_EDGES,
      customSymbols: [],
      settings: {},
    }
  }
  return {
    nodes: EMPTY_GRAPH_NODES,
    edges: EMPTY_GRAPH_EDGES,
    customSymbols: [],
    settings: {},
  }
}

function tryLoadStored(): GraphAppSnapshot | null {
  const stored = loadDocumentFromStorage()
  if (!stored) return null
  const imported = documentToFlowState(stored)
  return {
    nodes: imported.nodes,
    edges: imported.edges,
    customSymbols: imported.customSymbols,
    settings: imported.settings,
  }
}

export function resolveInitialGraphState(): {
  snapshot: GraphAppSnapshot | null
  needsBootstrap: boolean
} {
  const stored = tryLoadStored()
  if (stored) return { snapshot: stored, needsBootstrap: false }

  const choice = readBootstrapChoice()
  if (choice) return { snapshot: flowFromBootstrap(choice), needsBootstrap: false }

  return { snapshot: null, needsBootstrap: true }
}

export function sanitizeFlowEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return syncEdgesReachableFromInitial(nodes, pruneInvalidEdges(nodes, edges))
}

export function snapshotToDocument(input: GraphPersistInput): GraphDocumentV01 {
  return buildGraphDocument({
    nodes: input.nodes,
    edges: input.edges,
    customSymbols: input.customSymbols,
    settings: input.settings,
  })
}

export function useGraphAutosave(snapshot: GraphPersistInput, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (!enabled) return
    saveDocumentToStorage(snapshotToDocument(snapshot))
  }, [enabled, snapshot])

  useEffect(() => {
    if (!enabled) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, flush, snapshot])

  useEffect(() => {
    if (!enabled) return
    const onBeforeUnload = () => flush()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [enabled, flush])
}

export function commitBootstrapChoice(choice: BootstrapChoice): GraphAppSnapshot {
  writeBootstrapChoice(choice)
  const snapshot = flowFromBootstrap(choice)
  saveDocumentToStorage(snapshotToDocument(snapshot))
  return snapshot
}

export type ImportJsonResult =
  | { ok: true; snapshot: GraphAppSnapshot }
  | { ok: false; message: string }

export async function importGraphJsonFile(
  file: File,
  current: GraphPersistInput,
): Promise<ImportJsonResult> {
  if (file.size > MAX_JSON_BYTES) {
    return { ok: false, message: `JSON 파일이 너무 큽니다 (최대 ${MAX_JSON_BYTES} bytes).` }
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, message: '파일을 읽을 수 없습니다.' }
  }

  backupDocumentToStorage(snapshotToDocument(current))

  const parsed = parseGraphDocumentJson(text)
  if (!parsed.ok) {
    return { ok: false, message: parsed.message }
  }

  const imported = documentToFlowState(parsed.document)
  return {
    ok: true,
    snapshot: {
      nodes: imported.nodes,
      edges: sanitizeFlowEdges(imported.nodes, imported.edges),
      customSymbols: imported.customSymbols,
      settings: imported.settings,
    },
  }
}

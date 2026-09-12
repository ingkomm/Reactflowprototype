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
  hasStoredDocument,
  loadDocumentFromStorage,
  readBootstrapChoice,
  restoreBackupFromStorage,
  saveDocumentToStorage,
  storageFailureMessage,
  writeBootstrapChoice,
  type BootstrapChoice,
  type StorageSaveResult,
} from './persistence/autosave'
import { WorkspaceStoreInitError } from './persistence/workspaceStore'
import { SEED_EDGES, SEED_NODES } from './seedGraph'
import type { CustomSymbol, GraphDocumentSettings } from './types'
import { MAX_PORTABLE_JSON_BYTES, utf8ByteLength } from './limits'
import { syncEdgesReachableFromInitial } from './power'
import { pruneInvalidEdges } from './graphEdges'
import { stripInvalidRootPowerEdges } from './rootOrbit'

export type GraphAppSnapshot = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  customSymbols: CustomSymbol[]
  settings: GraphDocumentSettings
}

export type GraphPersistInput = GraphAppSnapshot & {
  floatingVideoNodeIds?: string[]
}

export type SaveStatus = 'idle' | 'saved' | 'failed'

export type SaveFailureReason = 'quota' | 'too_large' | 'io'

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

function snapshotFromDocument(document: GraphDocumentV01): GraphAppSnapshot {
  const imported = documentToFlowState(document)
  return {
    nodes: imported.nodes,
    edges: sanitizeFlowEdges(imported.nodes, imported.edges),
    customSymbols: imported.customSymbols,
    settings: imported.settings,
  }
}

export async function resolveInitialGraphState(): Promise<{
  snapshot: GraphAppSnapshot | null
  needsBootstrap: boolean
  storageCorrupt: boolean
}> {
  try {
    const stored = await loadDocumentFromStorage()
    if (stored.ok) {
      // Rewrite migrated legacy docs so the next load stays clean.
      await saveDocumentToStorage(stored.document)
      return {
        snapshot: snapshotFromDocument(stored.document),
        needsBootstrap: false,
        storageCorrupt: false,
      }
    }

    if (await hasStoredDocument()) {
      const backup = await restoreBackupFromStorage()
      if (backup.ok) {
        await saveDocumentToStorage(backup.document)
        return {
          snapshot: snapshotFromDocument(backup.document),
          needsBootstrap: false,
          storageCorrupt: false,
        }
      }
      return { snapshot: null, needsBootstrap: false, storageCorrupt: true }
    }

    const choice = readBootstrapChoice()
    if (choice) {
      return {
        snapshot: flowFromBootstrap(choice),
        needsBootstrap: false,
        storageCorrupt: false,
      }
    }

    return { snapshot: null, needsBootstrap: true, storageCorrupt: false }
  } catch (err) {
    if (err instanceof WorkspaceStoreInitError) {
      return { snapshot: null, needsBootstrap: false, storageCorrupt: true }
    }
    throw err
  }
}

export function sanitizeFlowEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return syncEdgesReachableFromInitial(
    nodes,
    stripInvalidRootPowerEdges(nodes, pruneInvalidEdges(nodes, edges)),
  )
}

export function snapshotToDocument(input: GraphPersistInput): GraphDocumentV01 {
  return buildGraphDocument({
    nodes: input.nodes,
    edges: input.edges,
    customSymbols: input.customSymbols,
    settings: input.settings,
  })
}

export async function persistSnapshot(
  snapshot: GraphPersistInput,
): Promise<StorageSaveResult> {
  return saveDocumentToStorage(snapshotToDocument(snapshot))
}

export function useGraphAutosave(
  snapshot: GraphPersistInput,
  enabled: boolean,
  onStatus?: (status: SaveStatus, reason?: SaveFailureReason) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef(snapshot)
  const generationRef = useRef(0)
  snapshotRef.current = snapshot

  const flush = useCallback(() => {
    if (!enabled) return
    const generation = ++generationRef.current
    const pending = snapshotRef.current
    void persistSnapshot(pending).then((result) => {
      if (generation !== generationRef.current) return
      if (result.ok) onStatus?.('saved')
      else onStatus?.('failed', result.reason)
    })
  }, [enabled, onStatus])

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

export type NewSheetResult =
  | { ok: true; snapshot: GraphAppSnapshot }
  | { ok: false; message: string }

export type BootstrapCommitResult =
  | { ok: true; snapshot: GraphAppSnapshot }
  | { ok: false; message: string }

/** Start a blank sheet only after the current document is backed up successfully. */
export async function createNewSheet(
  current: GraphPersistInput,
): Promise<NewSheetResult> {
  const currentDoc = snapshotToDocument(current)
  const backedUp = await backupDocumentToStorage(currentDoc)
  if (!backedUp.ok) {
    return {
      ok: false,
      message: `새 시트를 만들 수 없습니다. 현재 문서 백업 실패 — ${storageFailureMessage(backedUp.reason)}`,
    }
  }

  const bootstrap = writeBootstrapChoice('empty')
  if (!bootstrap.ok) {
    return {
      ok: false,
      message: `새 시트를 만들 수 없습니다. 시작 설정 저장 실패 — ${storageFailureMessage(bootstrap.reason)}`,
    }
  }

  const snapshot = flowFromBootstrap('empty')
  const saved = await saveDocumentToStorage(snapshotToDocument(snapshot))
  if (!saved.ok) {
    return {
      ok: false,
      message: `새 시트를 저장할 수 없습니다 — ${storageFailureMessage(saved.reason)}`,
    }
  }
  return { ok: true, snapshot }
}

export async function commitBootstrapChoice(
  choice: BootstrapChoice,
): Promise<BootstrapCommitResult> {
  const written = writeBootstrapChoice(choice)
  if (!written.ok) {
    return {
      ok: false,
      message: `시작 설정을 저장할 수 없습니다 — ${storageFailureMessage(written.reason)}`,
    }
  }
  const snapshot = flowFromBootstrap(choice)
  const saved = await saveDocumentToStorage(snapshotToDocument(snapshot))
  if (!saved.ok) {
    return {
      ok: false,
      message: `문서를 저장할 수 없습니다 — ${storageFailureMessage(saved.reason)}`,
    }
  }
  return { ok: true, snapshot }
}

export type ImportJsonResult =
  | { ok: true; snapshot: GraphAppSnapshot }
  | { ok: false; message: string }

/** Shared import core for browser File input and Desktop native open. */
export async function importGraphJsonText(
  text: string,
  current: GraphPersistInput,
): Promise<ImportJsonResult> {
  if (utf8ByteLength(text) > MAX_PORTABLE_JSON_BYTES) {
    return {
      ok: false,
      message: `JSON 파일이 너무 큽니다 (최대 ${MAX_PORTABLE_JSON_BYTES} bytes).`,
    }
  }

  const parsed = parseGraphDocumentJson(text)
  if (!parsed.ok) {
    return { ok: false, message: parsed.message }
  }

  let snapshot: GraphAppSnapshot
  try {
    const imported = documentToFlowState(parsed.document)
    snapshot = {
      nodes: imported.nodes,
      edges: sanitizeFlowEdges(imported.nodes, imported.edges),
      customSymbols: imported.customSymbols,
      settings: imported.settings,
    }
  } catch {
    return { ok: false, message: 'JSON은 파싱됐지만 그래프로 변환할 수 없습니다.' }
  }

  const backedUp = await backupDocumentToStorage(snapshotToDocument(current))
  if (!backedUp.ok) {
    return {
      ok: false,
      message: `불러오기를 취소했습니다. 현재 문서 백업 실패 — ${storageFailureMessage(backedUp.reason)}`,
    }
  }

  // Persist imported document immediately — do not rely on debounced autosave.
  const saved = await saveDocumentToStorage(snapshotToDocument(snapshot))
  if (!saved.ok) {
    return {
      ok: false,
      message: `불러오기를 적용할 수 없습니다. 가져온 문서 저장 실패 — ${storageFailureMessage(saved.reason)}`,
    }
  }

  return { ok: true, snapshot }
}

export async function importGraphJsonFile(
  file: File,
  current: GraphPersistInput,
): Promise<ImportJsonResult> {
  if (file.size > MAX_PORTABLE_JSON_BYTES) {
    return {
      ok: false,
      message: `JSON 파일이 너무 큽니다 (최대 ${MAX_PORTABLE_JSON_BYTES} bytes).`,
    }
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, message: '파일을 읽을 수 없습니다.' }
  }

  return importGraphJsonText(text, current)
}

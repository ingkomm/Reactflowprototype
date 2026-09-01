import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import { validateCustomSymbols } from './customSymbol'
import { isValidPracticeDate, migrateLegacyTrainingLogs, normalizeDailyLogs } from './dailyLog'
import { layoutMasteryOrbit, isMasteryKind } from './orbit'
import {
  migrateLegacyClassId,
  normalizeSymbolId,
} from './librarySymbols'
import { ensureNotableStages, ensureSmallPracticeStages, stagesForKind } from './stage'
import type {
  CustomSymbol,
  GraphDocumentSettings,
  GraphEdgeData,
  PassiveKind,
  PassiveNodeData,
  StageData,
  TrainingLog,
} from './types'
import { GRAPH_SCHEMA_VERSION } from './types'
import { validateVideoMediaList } from './videoMedia'
import {
  MAX_CUSTOM_SYMBOLS,
  MAX_EDGE_COUNT,
  MAX_JSON_BYTES,
  MAX_LOG_COUNT,
  MAX_NODE_COUNT,
  isWithinStringLimit,
} from './limits'
import { validateGraphIntegrity } from './graphIntegrity'

export type SerializedFlowNode = {
  id: string
  type: 'passive'
  position: { x: number; y: number }
  data: PassiveNodeData
}

export type SerializedEdge = {
  id: string
  type?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: Record<string, unknown>
  zIndex?: number
}

export type GraphDocumentV01 = {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION
  nodes: SerializedFlowNode[]
  edges: SerializedEdge[]
  customSymbols: CustomSymbol[]
  settings?: GraphDocumentSettings
}

export type GraphExportInput = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  customSymbols: CustomSymbol[]
  settings?: GraphDocumentSettings
}

export type GraphImportResult = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  customSymbols: CustomSymbol[]
  settings: GraphDocumentSettings
}

export type GraphParseError = {
  ok: false
  message: string
}

export type GraphParseSuccess = {
  ok: true
  document: GraphDocumentV01
}

export type GraphParseResult = GraphParseError | GraphParseSuccess

const PASSIVE_KINDS = new Set<PassiveKind>([
  'initial',
  'connect',
  'small',
  'notable',
  'mastery',
  'voidMastery',
  'void',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parsePosition(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null
  const x = value.x
  const y = value.y
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  return { x, y }
}

function normalizeTrainingLog(value: unknown): TrainingLog | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  if (typeof value.date !== 'string' || !isValidPracticeDate(value.date)) return null
  const media = validateVideoMediaList(value.media)
  if (media === null) return null
  const log: TrainingLog = {
    id: value.id.trim(),
    date: value.date.trim(),
  }
  if (typeof value.note === 'string' && value.note.trim()) {
    if (!isWithinStringLimit(value.note)) return null
    log.note = value.note.trim()
  }
  if (media.length > 0) log.media = media
  return log
}

function normalizeStage(value: unknown): StageData | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  if (typeof value.index !== 'number' || !Number.isFinite(value.index)) return null
  if (typeof value.label !== 'string') return null
  if (typeof value.goal !== 'number' || !Number.isFinite(value.goal)) return null
  if (!Array.isArray(value.logs)) return null
  const logs: TrainingLog[] = []
  for (const log of value.logs) {
    const parsedEntries = migrateLegacyTrainingLogs(log)
    if (parsedEntries.length === 0) return null
    for (const entry of parsedEntries) {
      const normalized = normalizeTrainingLog(entry)
      if (!normalized) return null
      logs.push(normalized)
    }
  }
  return {
    id: value.id.trim(),
    index: Math.floor(value.index),
    label: value.label,
    goal: Math.max(1, Math.floor(value.goal)),
    completedManually: Boolean(value.completedManually),
    logs: normalizeDailyLogs(logs),
  }
}

function normalizePassiveNodeData(value: unknown, kindFallback: PassiveKind = 'small'): PassiveNodeData | null {
  if (!isRecord(value)) return null
  const kindRaw = value.kind
  const kind = (typeof kindRaw === 'string' && PASSIVE_KINDS.has(kindRaw as PassiveKind)
    ? kindRaw
    : kindFallback) as PassiveKind
  const resolvedKind = kind === 'voidMastery' ? 'mastery' : kind

  const label = typeof value.label === 'string' ? value.label : 'Node'
  if (!isWithinStringLimit(label)) return null

  const symbolIdRaw =
    typeof value.symbolId === 'string'
      ? value.symbolId
      : typeof value.classId === 'string'
        ? value.classId
        : undefined

  let stages: StageData[] = []
  if (Array.isArray(value.stages)) {
    const parsed: StageData[] = []
    for (const stage of value.stages) {
      const s = normalizeStage(stage)
      if (!s) return null
      parsed.push(s)
    }
    stages = stagesForKind(kind, parsed)
  } else {
    stages = stagesForKind(kind)
  }

  const media = validateVideoMediaList(value.media)
  if (media === null) return null

  const data: PassiveNodeData = {
    label,
    kind: resolvedKind,
    stages,
    symbolId: migrateLegacyClassId(symbolIdRaw, resolvedKind),
  }

  const optionalNumber = (key: string) => {
    const v = value[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }

  const optionalBool = (key: string) => {
    const v = value[key]
    return typeof v === 'boolean' ? v : undefined
  }

  if (optionalNumber('orbitRadius') != null) data.orbitRadius = optionalNumber('orbitRadius')
  if (optionalNumber('orbitTierCount') != null) data.orbitTierCount = optionalNumber('orbitTierCount') as PassiveNodeData['orbitTierCount']
  if (optionalNumber('orbitStartAngle') != null) data.orbitStartAngle = optionalNumber('orbitStartAngle')
  if (isRecord(value.orbitStartAngleByTier)) data.orbitStartAngleByTier = value.orbitStartAngleByTier as PassiveNodeData['orbitStartAngleByTier']
  if (Array.isArray(value.orbitOrder)) data.orbitOrder = value.orbitOrder.filter((id): id is string => typeof id === 'string')
  if (isRecord(value.orbitOrderByTier)) data.orbitOrderByTier = value.orbitOrderByTier as PassiveNodeData['orbitOrderByTier']
  if (isRecord(value.orbitCapacityByTier)) data.orbitCapacityByTier = value.orbitCapacityByTier as PassiveNodeData['orbitCapacityByTier']
  if (optionalBool('orbitLocked') != null) data.orbitLocked = optionalBool('orbitLocked')
  if (value.masteryId === null || typeof value.masteryId === 'string') data.masteryId = value.masteryId as string | null
  if (optionalNumber('orbitTier') != null) data.orbitTier = optionalNumber('orbitTier') as PassiveNodeData['orbitTier']
  if (optionalNumber('orbitSlot') != null) data.orbitSlot = optionalNumber('orbitSlot')
  if (optionalBool('voidPassing') != null) data.voidPassing = optionalBool('voidPassing')
  if (optionalBool('connectEnabled') != null) data.connectEnabled = optionalBool('connectEnabled')
  const slot = optionalNumber('initialSlot')
  if (slot != null && slot >= 0 && slot <= 2) data.initialSlot = Math.floor(slot) as 0 | 1 | 2
  if (value.customIconId === null || typeof value.customIconId === 'string') {
    // Legacy dot icon — ignored.
  }
  delete (data as { classId?: string }).classId
  if (value.customSymbolId === null || typeof value.customSymbolId === 'string') {
    data.customSymbolId = value.customSymbolId as string | null
  }
  if (media.length > 0) data.media = media

  return data
}

function normalizeSerializedNode(value: unknown): SerializedFlowNode | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  const position = parsePosition(value.position)
  if (!position) return null
  const data = normalizePassiveNodeData(value.data)
  if (!data) return null
  const type = value.type === 'passive' ? 'passive' : 'passive'
  return {
    id: value.id.trim(),
    type,
    position,
    data,
  }
}

function normalizeSerializedEdge(value: unknown): SerializedEdge | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  if (typeof value.source !== 'string' || !value.source.trim()) return null
  if (typeof value.target !== 'string' || !value.target.trim()) return null
  const edge: SerializedEdge = {
    id: value.id.trim(),
    source: value.source.trim(),
    target: value.target.trim(),
  }
  if (typeof value.type === 'string') edge.type = value.type
  if (value.sourceHandle === null || typeof value.sourceHandle === 'string') edge.sourceHandle = value.sourceHandle
  if (value.targetHandle === null || typeof value.targetHandle === 'string') edge.targetHandle = value.targetHandle
  if (isRecord(value.data)) edge.data = value.data
  if (typeof value.zIndex === 'number') edge.zIndex = value.zIndex
  return edge
}

function parseSymbolColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed
  return undefined
}

function normalizeDefaultSymbolColors(value: unknown): GraphDocumentSettings['defaultSymbolColors'] {
  if (!isRecord(value)) return undefined
  const next: NonNullable<GraphDocumentSettings['defaultSymbolColors']> = {}
  for (const kind of ['mastery', 'notable', 'small'] as const) {
    const color = parseSymbolColor(value[kind])
    if (color) next[kind] = color
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function normalizeSettings(value: unknown): GraphDocumentSettings {
  if (!isRecord(value)) return {}
  const settings: GraphDocumentSettings = {}
  if (typeof value.gridSnapEnabled === 'boolean') settings.gridSnapEnabled = value.gridSnapEnabled
  if (typeof value.voidHighlightEnabled === 'boolean') settings.voidHighlightEnabled = value.voidHighlightEnabled
  const defaultSymbolColors = normalizeDefaultSymbolColors(value.defaultSymbolColors)
  if (defaultSymbolColors) settings.defaultSymbolColors = defaultSymbolColors
  return settings
}

export function parseGraphDocumentJson(text: string): GraphParseResult {
  if (text.length > MAX_JSON_BYTES) {
    return { ok: false, message: `JSON 파일이 너무 큽니다 (최대 ${MAX_JSON_BYTES} bytes).` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: 'JSON 파싱에 실패했습니다.' }
  }
  return validateGraphDocument(parsed)
}

export function validateGraphDocument(value: unknown): GraphParseResult {
  if (!isRecord(value)) return { ok: false, message: '문서 루트가 객체가 아닙니다.' }
  if (value.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    return { ok: false, message: `지원하지 않는 schemaVersion입니다 (필요: ${GRAPH_SCHEMA_VERSION}).` }
  }
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
    return { ok: false, message: 'nodes 배열이 비어 있거나 없습니다.' }
  }
  if (value.nodes.length > MAX_NODE_COUNT) {
    return { ok: false, message: `노드 수가 제한(${MAX_NODE_COUNT})을 초과했습니다.` }
  }
  if (!Array.isArray(value.edges)) return { ok: false, message: 'edges 배열이 없습니다.' }
  if (value.edges.length > MAX_EDGE_COUNT) {
    return { ok: false, message: `엣지 수가 제한(${MAX_EDGE_COUNT})을 초과했습니다.` }
  }

  const nodes: SerializedFlowNode[] = []
  const nodeIds = new Set<string>()
  for (const item of value.nodes) {
    const node = normalizeSerializedNode(item)
    if (!node) return { ok: false, message: '노드 데이터 형식이 올바르지 않습니다.' }
    if (nodeIds.has(node.id)) return { ok: false, message: `중복 노드 id: ${node.id}` }
    nodeIds.add(node.id)
    nodes.push(node)
  }

  const edges: SerializedEdge[] = []
  const edgeIds = new Set<string>()
  for (const item of value.edges) {
    const edge = normalizeSerializedEdge(item)
    if (!edge) return { ok: false, message: '엣지 데이터 형식이 올바르지 않습니다.' }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return { ok: false, message: `엣지가 존재하지 않는 노드를 참조합니다: ${edge.id}` }
    }
    if (edgeIds.has(edge.id)) return { ok: false, message: `중복 엣지 id: ${edge.id}` }
    edgeIds.add(edge.id)
    edges.push(edge)
  }

  const customSymbols = validateCustomSymbols(value.customSymbols)
  if (customSymbols === null) return { ok: false, message: 'customSymbols 배열 형식이 올바르지 않습니다.' }
  if (customSymbols.length > MAX_CUSTOM_SYMBOLS) {
    return { ok: false, message: `customSymbols 수가 제한(${MAX_CUSTOM_SYMBOLS})을 초과했습니다.` }
  }

  let totalLogs = 0
  for (const node of nodes) {
    for (const stage of node.data.stages ?? []) {
      totalLogs += stage.logs.length
    }
  }
  if (totalLogs > MAX_LOG_COUNT) {
    return { ok: false, message: `연습 로그 수가 제한(${MAX_LOG_COUNT})을 초과했습니다.` }
  }

  const integrity = validateGraphIntegrity(nodes, edges)
  if (integrity) return { ok: false, message: integrity.message }

  // Legacy `classes` array is ignored — symbolId on each node is authoritative.

  const symbolIds = new Set(customSymbols.map((s) => s.id))
  for (const node of nodes) {
    const customSymbolId = node.data.customSymbolId
    if (customSymbolId && !symbolIds.has(customSymbolId)) {
      node.data.customSymbolId = null
    }
    delete node.data.classId
    if (node.data.customSymbolId) {
      node.data.symbolId = node.data.customSymbolId
      node.data.customSymbolId = null
    }
    node.data.symbolId = normalizeSymbolId(node.data.symbolId, customSymbols, node.data.kind)
    if (node.data.kind === 'notable' && node.data.stages) {
      node.data.stages = ensureNotableStages(node.data.stages)
    }
    if (node.data.kind === 'small' && node.data.stages) {
      node.data.stages = ensureSmallPracticeStages(node.data.stages)
    }
  }

  const document: GraphDocumentV01 = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes,
    edges,
    customSymbols,
    settings: normalizeSettings(value.settings),
  }

  return { ok: true, document }
}

function normalizePassiveDataForExport(data: PassiveNodeData): PassiveNodeData {
  const cloned = structuredClone(data)
  if (cloned.kind === 'small') {
    cloned.stages = ensureSmallPracticeStages(cloned.stages ?? [])
  } else if (cloned.kind === 'notable') {
    cloned.stages = ensureNotableStages(cloned.stages ?? [])
  }
  return cloned
}

export function buildGraphDocument(input: GraphExportInput): GraphDocumentV01 {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: input.nodes.map((node) => ({
      id: node.id,
      type: 'passive' as const,
      position: { x: node.position.x, y: node.position.y },
      data: normalizePassiveDataForExport(node.data as PassiveNodeData),
    })),
    edges: input.edges.map((edge) => {
      const raw = edge.data ? (structuredClone(edge.data) as GraphEdgeData) : undefined
      if (raw) delete raw.active
      return {
        id: edge.id,
        type: edge.type,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        data: raw && Object.keys(raw).length > 0 ? raw : undefined,
        zIndex: edge.zIndex,
      }
    }),
    customSymbols: structuredClone(input.customSymbols),
    settings: input.settings ? structuredClone(input.settings) : undefined,
  }
}

export function serializeGraphDocument(document: GraphDocumentV01): string {
  return JSON.stringify(document, null, 2)
}

export function documentToFlowState(document: GraphDocumentV01): GraphImportResult {
  let nodes: PassiveFlowNode[] = document.nodes.map((node) => ({
    id: node.id,
    type: 'passive',
    position: { ...node.position },
    dragHandle: '.node-drag-handle',
    draggable: true,
    data: structuredClone(node.data),
  }))

  for (const node of nodes) {
    if (isMasteryKind((node.data as PassiveNodeData).kind)) {
      nodes = layoutMasteryOrbit(nodes, node.id)
    }
  }

  const edges: Edge[] = document.edges.map((edge) => ({
    id: edge.id,
    type: edge.type,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    data: edge.data,
    zIndex: edge.zIndex,
  }))

  return {
    nodes,
    edges,
    customSymbols: structuredClone(document.customSymbols),
    settings: document.settings ?? {},
  }
}

export function downloadGraphDocument(graph: GraphDocumentV01, filename = 'skill-tree.json') {
  const blob = new Blob([serializeGraphDocument(graph)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function stableSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSortKeys)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = stableSortKeys(obj[key])
    }
    return sorted
  }
  return value
}

/** Semantic equality for round-trip tests (ignores object key order). */
export function graphDocumentsEqual(a: GraphDocumentV01, b: GraphDocumentV01): boolean {
  return JSON.stringify(stableSortKeys(a)) === JSON.stringify(stableSortKeys(b))
}

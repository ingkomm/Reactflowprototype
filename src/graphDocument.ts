import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import { validateCustomSymbols } from './customSymbol'
import { layoutMasteryOrbit, isMasteryKind } from './orbit'
import {
  buildSeedClasses,
  resolvePassiveClass,
  type PassiveClass,
} from './passiveClass'
import { ensureNotableStages, stagesForKind } from './stage'
import type {
  CustomSymbol,
  GraphDocumentSettings,
  PassiveKind,
  PassiveNodeData,
  StageData,
  TrainingLog,
} from './types'
import { GRAPH_SCHEMA_VERSION } from './types'
import { validateVideoMediaList } from './videoMedia'

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
  classes: PassiveClass[]
  customSymbols: CustomSymbol[]
  settings?: GraphDocumentSettings
}

export type GraphExportInput = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  classes: PassiveClass[]
  customSymbols: CustomSymbol[]
  settings?: GraphDocumentSettings
}

export type GraphImportResult = {
  nodes: PassiveFlowNode[]
  edges: Edge[]
  classes: PassiveClass[]
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
  if (typeof value.label !== 'string') return null
  const count = typeof value.count === 'number' && Number.isFinite(value.count) ? Math.max(0, value.count) : 0
  const media = validateVideoMediaList(value.media)
  if (media === null) return null
  const log: TrainingLog = {
    id: value.id.trim(),
    label: value.label,
    count,
  }
  if (typeof value.note === 'string' && value.note.trim()) log.note = value.note.trim()
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
    const parsed = normalizeTrainingLog(log)
    if (!parsed) return null
    logs.push(parsed)
  }
  return {
    id: value.id.trim(),
    index: Math.floor(value.index),
    label: value.label,
    goal: Math.max(1, Math.floor(value.goal)),
    completedManually: Boolean(value.completedManually),
    logs,
  }
}

function normalizePassiveNodeData(value: unknown, kindFallback: PassiveKind = 'small'): PassiveNodeData | null {
  if (!isRecord(value)) return null
  const kindRaw = value.kind
  const kind = (typeof kindRaw === 'string' && PASSIVE_KINDS.has(kindRaw as PassiveKind)
    ? kindRaw
    : kindFallback) as PassiveKind

  const label = typeof value.label === 'string' ? value.label : 'Node'
  const classId = typeof value.classId === 'string' ? value.classId : undefined

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
    kind: kind === 'voidMastery' ? 'mastery' : kind,
    stages,
    classId: classId ?? resolvePassiveClass(buildSeedClasses(), null, kind === 'voidMastery' ? 'mastery' : kind).id,
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
  if (value.customIconId === null || typeof value.customIconId === 'string') {
    // Legacy dot icon — ignored (fallback to class icon).
    delete (data as { customIconId?: string | null }).customIconId
  }
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

function normalizePassiveClass(value: unknown): PassiveClass | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  if (typeof value.label !== 'string') return null
  if (typeof value.iconId !== 'string' || !value.iconId.trim()) return null
  if (typeof value.iconColor !== 'string' || !value.iconColor.trim()) return null
  const kind = value.kind
  if (typeof kind !== 'string' || !PASSIVE_KINDS.has(kind as PassiveKind)) return null
  return {
    id: value.id.trim(),
    kind: kind as PassiveKind,
    label: value.label,
    iconId: value.iconId.trim(),
    iconColor: value.iconColor as PassiveClass['iconColor'],
  }
}

function normalizeClasses(value: unknown): PassiveClass[] | null {
  if (!Array.isArray(value)) return null
  const classes: PassiveClass[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const cls = normalizePassiveClass(item)
    if (!cls) return null
    if (seen.has(cls.id)) return null
    seen.add(cls.id)
    classes.push(cls)
  }
  return classes
}

function normalizeSettings(value: unknown): GraphDocumentSettings {
  if (!isRecord(value)) return {}
  const settings: GraphDocumentSettings = {}
  if (typeof value.gridSnapEnabled === 'boolean') settings.gridSnapEnabled = value.gridSnapEnabled
  if (typeof value.voidHighlightEnabled === 'boolean') settings.voidHighlightEnabled = value.voidHighlightEnabled
  return settings
}

export function parseGraphDocumentJson(text: string): GraphParseResult {
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
  if (!Array.isArray(value.edges)) return { ok: false, message: 'edges 배열이 없습니다.' }

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

  const classes = normalizeClasses(value.classes)
  if (!classes) return { ok: false, message: 'classes 배열 형식이 올바르지 않습니다.' }

  const customSymbols = validateCustomSymbols(value.customSymbols)
  if (customSymbols === null) return { ok: false, message: 'customSymbols 배열 형식이 올바르지 않습니다.' }

  const symbolIds = new Set(customSymbols.map((s) => s.id))
  for (const node of nodes) {
    const customSymbolId = node.data.customSymbolId
    if (customSymbolId && !symbolIds.has(customSymbolId)) {
      node.data.customSymbolId = null
    }
    delete node.data.customIconId
    if (node.data.kind === 'notable' && node.data.stages) {
      node.data.stages = ensureNotableStages(node.data.stages)
    }
  }

  const document: GraphDocumentV01 = {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes,
    edges,
    classes,
    customSymbols,
    settings: normalizeSettings(value.settings),
  }

  return { ok: true, document }
}

export function buildGraphDocument(input: GraphExportInput): GraphDocumentV01 {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: input.nodes.map((node) => ({
      id: node.id,
      type: 'passive' as const,
      position: { x: node.position.x, y: node.position.y },
      data: structuredClone(node.data as PassiveNodeData),
    })),
    edges: input.edges.map((edge) => ({
      id: edge.id,
      type: edge.type,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      data: edge.data ? structuredClone(edge.data as Record<string, unknown>) : undefined,
      zIndex: edge.zIndex,
    })),
    classes: structuredClone(input.classes),
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
    classes: structuredClone(document.classes),
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

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { type PassiveFlowNode } from './components/PassiveNode'
import { TreeWorkspace } from './components/TreeWorkspace'
import { classifyPassiveConnection, computePoweredNodeIds, computePowerFlowMeta, resolveRootConnectSlot, isEdgeActive } from './power'
import type { PassiveKind, PassiveNodeData, OrbitTier, OrbitTierCount, StageData, CustomSymbol, VideoMedia, InitialConnectSlot, TrainingLog } from './types'
import { INITIAL_NODE_ID, PASSIVE_KIND_LABEL } from './types'
import { normalizeSymbolId, type SymbolEditorKind, DEFAULT_SYMBOL_ID } from './librarySymbols'
import { CustomSymbolProvider } from './CustomSymbolContext'
import { importSymbolFile } from './customSymbol'
import { SymbolKindEditor } from './components/SymbolKindEditor'
import {
  buildGraphDocument,
  downloadGraphDocument,
} from './graphDocument'
import { createVideoMediaId, canPinNodeVideos } from './videoMedia'
import type { NodeTemplatePayload } from './nodeTemplate'
import { stagesForKind, uid as stageUid } from './stage'
import {
  DEFAULT_GRID_SNAP_SCALE,
  GRID_SNAP_SCALE_OPTIONS,
  normalizeGridSnapScale,
  snapNodeTopLeft,
} from './grid'
import { createPassiveData, passiveLinkEdge, rootSocketLinkEdge, orbitLinkEdge, notableLinkEdge } from './graphFactory'
import {
  DEFAULT_SELECTED_NODE_ID,
} from './seedGraph'
import {
  assignSatelliteOrbitSlot,
  canAcceptOrbitMember,
  countOrbitTierMembers,
  DEFAULT_ORBIT_START_ANGLE,
  findOrbitAttachTarget,
  getOrbitTierCapacity,
  getOrderedTierSatellites,
  getSatelliteOrbitSlot,
  getSatelliteOrbitTier,
  getTierStartAngle,
  isConnectKind,
  isMasteryKind,
  isMasteryOrbitLocked,
  isOrbitMemberKind,
  layoutMasteryOrbit,
  normalizeOrbitTier,
  normalizeOrbitTierCount,
  normalizeAngleDelta,
  placeSatelliteFromDrag,
  placeSatelliteOnMasteryOrbit,
  rematerializeOrbitTierSlots,
  removeSatelliteFromOrbitOrders,
  rotateAllMasteryTiersByDelta,
  setMasteryTierOrbitOrder,
  setMasteryTierStartAngle,
  snapshotMasteryTierAngles,
  removeNodesAndRelayout,
  snapOrbitAngle,
  type SatelliteDragOrigin,
  withMasteryDragFlags,
} from './orbit'
import { shouldSuppressOrbitSelectionClear } from './orbitInteractionGuard'
import { useGraphHistory } from './useGraphHistory'
import { FirstRunDialog } from './components/FirstRunDialog'
import { NodeContextPopup } from './components/NodeContextPopup'
import { ShardMarkdownPreview } from './components/ShardMarkdownPreview'
import { NotableLogViewer } from './components/NotableLogViewer'
import {
  commitBootstrapChoice,
  createNewSheet,
  importGraphJsonFile,
  resolveInitialGraphState,
  sanitizeFlowEdges,
  useGraphAutosave,
  type SaveFailureReason,
  type SaveStatus,
} from './useGraphApp'
import { clampOrbitTierCapacity } from './limits'
import { extractDailyLogsFromNodeData, absorbNodeMediaIntoDailyLogs } from './dailyLogNode'
import './App.css'

function dailyLogsForNode(data: PassiveNodeData): TrainingLog[] {
  return extractDailyLogsFromNodeData(data)
}

function uid(prefix: string) {
  return stageUid(prefix)
}

type NodeClipboard = {
  data: PassiveNodeData
  position: { x: number; y: number }
}

function cloneMediaList(media?: VideoMedia[]): VideoMedia[] | undefined {
  if (!media?.length) return undefined
  return media.map((item) => ({ ...item, id: createVideoMediaId() }))
}

function cloneStagesWithNewIds(stages: StageData[]): StageData[] {
  return stages.map((stage) => ({
    ...stage,
    id: uid('stage'),
    logs: stage.logs.map((log) => ({
      ...log,
      id: uid('log'),
      media: cloneMediaList(log.media),
    })),
  }))
}

/** Append `_N` using the next free number for this exact title stem. */
function nextCopyLabel(baseLabel: string, existingLabels: Iterable<string>): string {
  const escaped = baseLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}_(\\d+)$`)
  let max = 0
  for (const label of existingLabels) {
    const match = label.match(re)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${baseLabel}_${max + 1}`
}

function buildPastedNode(
  clipboard: NodeClipboard,
  label: string,
  offsetIndex: number,
): PassiveFlowNode {
  const source = clipboard.data
  const kind = source.kind
  const stages = cloneStagesWithNewIds(source.stages ?? [])
  const data = absorbNodeMediaIntoDailyLogs({
    label,
    kind,
    stages,
    symbolId: source.symbolId,
    customSymbolId: source.customSymbolId ?? null,
    media: cloneMediaList(source.media),
    ...(isMasteryKind(kind)
      ? {
          orbitStartAngle: source.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitOrder: [],
          orbitTierCount: source.orbitTierCount ?? 1,
        }
      : kind === 'void'
        ? { masteryId: null, voidPassing: source.voidPassing ?? false, orbitTier: 1 }
        : kind === 'initial'
          ? {}
          : kind === 'connect'
            ? { connectEnabled: source.connectEnabled ?? true }
            : { masteryId: null, orbitTier: 1 }),
  })

  return {
    id: uid(kind),
    type: 'passive',
    position: {
      x: clipboard.position.x + offsetIndex * 36,
      y: clipboard.position.y + offsetIndex * 36,
    },
    dragHandle: '.node-drag-handle',
    draggable: true,
    data,
  }
}

function resolveMasteryPair(
  source: PassiveFlowNode,
  target: PassiveFlowNode,
): { mastery: PassiveFlowNode; satellite: PassiveFlowNode } | null {
  const sourceData = source.data as PassiveNodeData
  const targetData = target.data as PassiveNodeData

  if (isMasteryKind(sourceData.kind) && isOrbitMemberKind(targetData.kind)) {
    return { mastery: source, satellite: target }
  }
  if (isMasteryKind(targetData.kind) && isOrbitMemberKind(sourceData.kind)) {
    return { mastery: target, satellite: source }
  }
  return null
}

function findLinkEdge(edges: Edge[], a: string, b: string, type?: 'center' | 'orbit' | 'notable') {
  return edges.find((e) => {
    if (type && e.type !== type) return false
    return (e.source === a && e.target === b) || (e.source === b && e.target === a)
  })
}

function classifyLink(
  source: PassiveFlowNode,
  target: PassiveFlowNode,
  nodes: PassiveFlowNode[],
) {
  return classifyPassiveConnection(source, target, nodes)
}

function isRootConnectSlotTaken(
  nodes: PassiveFlowNode[],
  slot: InitialConnectSlot,
  exceptConnectId?: string,
): boolean {
  return nodes.some((node) => {
    if (node.id === exceptConnectId) return false
    const data = node.data as PassiveNodeData
    return isConnectKind(data.kind) && data.initialSlot === slot
  })
}

function sanitizeEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return sanitizeFlowEdges(nodes, edges)
}

const initialGraph = resolveInitialGraphState()

export default function App() {
  const [bootstrapPending, setBootstrapPending] = useState(initialGraph.needsBootstrap)
  const [storageCorrupt, setStorageCorrupt] = useState(initialGraph.storageCorrupt)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveFailureReason, setSaveFailureReason] = useState<SaveFailureReason | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.snapshot?.nodes ?? [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.snapshot?.edges ?? [])
  const [gridSnapEnabled, setGridSnapEnabled] = useState(
    initialGraph.snapshot?.settings.gridSnapEnabled ?? false,
  )
  const [gridSnapScale, setGridSnapScale] = useState(
    normalizeGridSnapScale(initialGraph.snapshot?.settings.gridSnapScale ?? DEFAULT_GRID_SNAP_SCALE),
  )
  const [voidHighlightEnabled, setVoidHighlightEnabled] = useState(
    initialGraph.snapshot?.settings.voidHighlightEnabled ?? false,
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    initialGraph.snapshot?.nodes[0]?.id ?? DEFAULT_SELECTED_NODE_ID,
  )
  const [inspectorWidth, setInspectorWidth] = useState(360)
  const [customSymbols, setCustomSymbols] = useState<CustomSymbol[]>(
    initialGraph.snapshot?.customSymbols ?? [],
  )
  const [defaultSymbolColors, setDefaultSymbolColors] = useState<
    Partial<Record<SymbolEditorKind, string>>
  >(initialGraph.snapshot?.settings.defaultSymbolColors ?? {})
  const [symbolEditorKind, setSymbolEditorKind] = useState<SymbolEditorKind | null>(null)
  const [symbolImportError, setSymbolImportError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [pinnedVideoNodeIds, setPinnedVideoNodeIds] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [focusLogId, setFocusLogId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  /** Visual-only graph while dragging satellites — committed `nodes` stay until drop. */
  const [dragPreviewNodes, setDragPreviewNodes] = useState<PassiveFlowNode[] | null>(null)
  const resizingInspector = useRef(false)
  const clipboardRef = useRef<NodeClipboard | null>(null)
  const pasteSerialRef = useRef(0)
  const orbitDragSessionRef = useRef<{
    nodeId: string
    originPosition: { x: number; y: number }
    snapshotNodes: PassiveFlowNode[]
    orbitOrigin?: {
      masteryId: string
      tier: OrbitTier
      slot: number
    }
  } | null>(null)

  const stateRef = useRef({ nodes, edges })
  const selectedIdRef = useRef(selectedId)
  const nodesRef = useRef(nodes)

  useEffect(() => {
    stateRef.current = { nodes, edges }
    selectedIdRef.current = selectedId
    nodesRef.current = nodes
  })

  useGraphAutosave(
    {
      nodes,
      edges,
      customSymbols,
      settings: { gridSnapEnabled, gridSnapScale, voidHighlightEnabled, defaultSymbolColors },
    },
    !bootstrapPending && !storageCorrupt,
    (status, reason) => {
      setSaveStatus(status)
      setSaveFailureReason(reason ?? null)
    },
  )

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!resizingInspector.current) return
      const min = 280
      const max = Math.min(760, Math.floor(window.innerWidth * 0.72))
      const next = window.innerWidth - event.clientX
      setInspectorWidth(Math.min(max, Math.max(min, next)))
    }
    const onUp = () => {
      if (!resizingInspector.current) return
      resizingInspector.current = false
      document.body.classList.remove('is-resizing-inspector')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onInspectorResizeStart = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    resizingInspector.current = true
    document.body.classList.add('is-resizing-inspector')
  }, [])

  const stack = useCallback(
    (nds: PassiveFlowNode[]) => withMasteryDragFlags(nds, selectedIdRef.current),
    [],
  )

  const { commit, reset: resetHistory } = useGraphHistory({
    getState: () => stateRef.current,
    setState: (snap) => {
      setNodes(stack(snap.nodes))
      setEdges(snap.edges)
    },
  })

  const handleBootstrap = useCallback(
    (choice: 'empty' | 'demo') => {
      const snapshot = commitBootstrapChoice(choice)
      resetHistory()
      setCustomSymbols(snapshot.customSymbols)
      setDefaultSymbolColors(snapshot.settings.defaultSymbolColors ?? {})
      setGridSnapEnabled(snapshot.settings.gridSnapEnabled ?? false)
      setGridSnapScale(normalizeGridSnapScale(snapshot.settings.gridSnapScale))
      setVoidHighlightEnabled(snapshot.settings.voidHighlightEnabled ?? false)
      setNodes(stack(snapshot.nodes))
      setEdges(sanitizeFlowEdges(snapshot.nodes, snapshot.edges))
      setSelectedId(snapshot.nodes[0]?.id ?? null)
      setBootstrapPending(false)
    },
    [resetHistory, setEdges, setNodes, stack],
  )

  const copySelectedNode = useCallback(() => {
    const currentId = selectedIdRef.current
    if (!currentId) return false
    const node = nodesRef.current.find((n) => n.id === currentId)
    if (!node) return false
    clipboardRef.current = {
      data: structuredClone(node.data as PassiveNodeData),
      position: { ...node.position },
    }
    pasteSerialRef.current = 0
    return true
  }, [])

  const pasteClipboardNode = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip) return false
    commit()
    pasteSerialRef.current += 1
    const labels = nodesRef.current.map((n) => (n.data as PassiveNodeData).label)
    const label = nextCopyLabel(clip.data.label, labels)
    const pasted = buildPastedNode(clip, label, pasteSerialRef.current)
    setNodes((nds) => stack([...nds, pasted]))
    setSelectedId(pasted.id)
    return true
  }, [commit, setNodes, stack])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

      const mod = event.ctrlKey || event.metaKey
      if (!mod) return

      const key = event.key.toLowerCase()
      if (key === 'c') {
        if (copySelectedNode()) event.preventDefault()
        return
      }
      if (key === 'v') {
        if (pasteClipboardNode()) event.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelectedNode, pasteClipboardNode])

  // Keep title-bearing satellites above mastery orbits / elevate selection.
  useEffect(() => {
    setNodes((nds) => withMasteryDragFlags(nds, selectedId))
  }, [selectedId, setNodes])

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const session = orbitDragSessionRef.current
      const filtered = changes.filter((c) => {
        if (c.type === 'position' && 'id' in c && c.id === INITIAL_NODE_ID) return false
        if (session != null && c.type === 'position' && 'id' in c && c.id === session.nodeId) {
          return false
        }
        return true
      })
      const removals = filtered.filter((c) => c.type === 'remove')
      const rest = filtered.filter((c) => c.type !== 'remove')
      if (rest.length > 0) onNodesChange(rest)
      const blockedRemovals = removals.filter((c) => c.id !== INITIAL_NODE_ID)
      if (blockedRemovals.length === 0) return

      commit()
      const removeIds = new Set(blockedRemovals.map((c) => c.id))
      setNodes((nds) =>
        removeNodesAndRelayout(nds, removeIds, selectedIdRef.current),
      )
      setEdges((eds) =>
        eds.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
      )
      setSelectedId((cur) => (cur && removeIds.has(cur) ? null : cur))
    },
    [commit, onNodesChange, setEdges, setNodes],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (changes.some((c) => c.type === 'remove')) {
        commit()
      }
      onEdgesChange(changes)
    },
    [commit, onEdgesChange],
  )

  const poweredIds = useMemo(
    () => computePoweredNodeIds(nodes, edges),
    [nodes, edges],
  )

  const powerFlowMeta = useMemo(
    () => computePowerFlowMeta(nodes, edges),
    [nodes, edges],
  )

  // Drop invalid links and anything not reachable from Initial.
  // Skip while a satellite drag preview is active so hover alone cannot prune edges.
  useEffect(() => {
    if (dragPreviewNodes) return
    setEdges((eds) => {
      const next = sanitizeEdges(nodes, eds)
      const unchanged =
        next.length === eds.length &&
        next.every((e, i) => {
          const prev = eds[i]
          return (
            prev != null &&
            prev.id === e.id &&
            isEdgeActive(prev) === isEdgeActive(e) &&
            prev.source === e.source &&
            prev.target === e.target &&
            prev.sourceHandle === e.sourceHandle &&
            prev.targetHandle === e.targetHandle
          )
        })
      return unchanged ? eds : next
    })
  }, [nodes, edges, setEdges, dragPreviewNodes])

  const flowNodes = dragPreviewNodes ?? nodes

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const selectedData = (selectedNode?.data as PassiveNodeData | undefined) ?? null

  const selectedMasteryLabel = useMemo(() => {
    const masteryId = selectedData?.masteryId
    if (!masteryId) return null
    const mastery = nodes.find((n) => n.id === masteryId)
    return (mastery?.data as PassiveNodeData | undefined)?.label ?? masteryId
  }, [nodes, selectedData?.masteryId])

  const selectedMasteryTierCount = useMemo(() => {
    const masteryId = selectedData?.masteryId
    if (!masteryId) return null
    const mastery = nodes.find((n) => n.id === masteryId)
    return normalizeOrbitTierCount((mastery?.data as PassiveNodeData | undefined)?.orbitTierCount)
  }, [nodes, selectedData?.masteryId])

  const orbitMembers = useMemo(() => {
    if (!selectedNode || !selectedData || !isMasteryKind(selectedData.kind)) return []
    const tierCount = normalizeOrbitTierCount(selectedData.orbitTierCount)
    const members: {
      id: string
      label: string
      kind: PassiveKind
      order: number
      tier: OrbitTier
      tierSize: number
    }[] = []
    for (let t = 1; t <= tierCount; t++) {
      const tier = t as OrbitTier
      const tierSats = getOrderedTierSatellites(nodes, selectedNode.id, tier)
      const capacity = getOrbitTierCapacity(selectedData, tier)
      tierSats.forEach((sat, index) => {
        const data = sat.data as PassiveNodeData
        members.push({
          id: sat.id,
          label: data.label,
          kind: data.kind,
          order: (data.orbitSlot ?? index) + 1,
          tier,
          tierSize: capacity,
        })
      })
    }
    return members
  }, [nodes, selectedData, selectedNode])

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target || source.id === target.id) return false
      const kind = classifyLink(source, target, nodes)
      if (kind !== 'center' && kind !== 'orbit' && kind !== 'notable' && kind !== 'attach') {
        return false
      }
      const sd = source.data as PassiveNodeData
      const td = target.data as PassiveNodeData
      if (sd.kind === 'initial' || td.kind === 'initial') {
        if (kind !== 'center') return false
        const slot = resolveRootConnectSlot(
          source,
          target,
          connection.sourceHandle,
          connection.targetHandle,
        )
        if (slot === null) return false
        const connectId = sd.kind === 'connect' ? source.id : td.kind === 'connect' ? target.id : null
        if (!connectId) return false
        return !isRootConnectSlotTaken(nodes, slot, connectId)
      }
      return true
    },
    [nodes],
  )

  const attachSatellite = useCallback(
    (masteryId: string, satelliteId: string, preferredTier?: OrbitTier) => {
      if (isMasteryOrbitLocked(nodes, masteryId)) return
      const mastery = nodes.find((n) => n.id === masteryId)
      if (!mastery) return
      const current = nodes.find((n) => n.id === satelliteId)
      const alreadyOn =
        (current?.data as PassiveNodeData | undefined)?.masteryId === masteryId
      const swapOrigin = current ? { ...current.position } : { x: 0, y: 0 }

      commit()
      setNodes((nds) => {
        const prevMasteryId = (current?.data as PassiveNodeData | undefined)?.masteryId ?? null
        const oldMasteryId =
          prevMasteryId && prevMasteryId !== masteryId ? prevMasteryId : null

        let next = nds.map((node) => {
          const data = node.data as PassiveNodeData
          if (node.id === satelliteId) {
            return {
              ...node,
              data: { ...data, masteryId },
              draggable: true,
            }
          }
          if (oldMasteryId && node.id === oldMasteryId && isMasteryKind(data.kind)) {
            return {
              ...node,
              data: removeSatelliteFromOrbitOrders(data, satelliteId),
            }
          }
          return node
        })

        const placed = placeSatelliteOnMasteryOrbit(next, masteryId, satelliteId, {
          preferredTier,
          swapOriginPosition: alreadyOn ? undefined : swapOrigin,
        })
        if (!placed) return nds

        next = placed
        if (oldMasteryId) {
          next = layoutMasteryOrbit(next, oldMasteryId)
        }
        const stacked = stack(next)
        setEdges((eds) => sanitizeEdges(stacked, eds))
        return stacked
      })
    },
    [commit, nodes, setEdges, setNodes, stack],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target) return

      const linkKind = classifyLink(source, target, nodes)
      if (linkKind === 'attach') {
        const pair = resolveMasteryPair(source, target)
        if (pair && !isMasteryOrbitLocked(nodes, pair.mastery.id)) {
          attachSatellite(pair.mastery.id, pair.satellite.id)
        }
        return
      }
      if (linkKind !== 'center' && linkKind !== 'orbit' && linkKind !== 'notable') return

      commit()

      const sd = source.data as PassiveNodeData
      const td = target.data as PassiveNodeData
      const isRootConnect =
        linkKind === 'center' && (sd.kind === 'initial' || td.kind === 'initial')
      let rootConnectSlot: InitialConnectSlot | null = null
      let rootId: string | null = null
      let connectId: string | null = null
      if (isRootConnect) {
        rootConnectSlot = resolveRootConnectSlot(
          source,
          target,
          connection.sourceHandle,
          connection.targetHandle,
        )
        if (rootConnectSlot === null) return
        rootId = sd.kind === 'initial' ? source.id : target.id
        connectId = sd.kind === 'connect' ? source.id : target.id
        if (isRootConnectSlotTaken(nodes, rootConnectSlot, connectId)) return
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id !== connectId) return node
            const data = node.data as PassiveNodeData
            return { ...node, data: { ...data, initialSlot: rootConnectSlot! } }
          }),
        )
      }

      setEdges((eds) => {
        const edgeType =
          linkKind === 'orbit' ? 'orbit' : linkKind === 'notable' ? 'notable' : 'center'
        const existing = findLinkEdge(eds, source.id, target.id, edgeType)
        let next: Edge[]
        if (existing) {
          next = eds.filter((e) => e.id !== existing.id)
        } else if (linkKind === 'orbit') {
          const orbitMasteryId = sd.masteryId ?? td.masteryId
          if (!orbitMasteryId) return eds
          next = [...eds, orbitLinkEdge(source.id, target.id, orbitMasteryId)]
        } else if (linkKind === 'notable') {
          next = [...eds, notableLinkEdge(source.id, target.id)]
        } else if (isRootConnect && rootConnectSlot !== null && rootId && connectId) {
          next = [...eds, rootSocketLinkEdge(rootId, connectId, rootConnectSlot)]
        } else {
          next = [...eds, passiveLinkEdge(source.id, target.id)]
        }
        return sanitizeEdges(nodes, next)
      })
    },
    [attachSatellite, commit, nodes, setEdges, setNodes],
  )

  const detachFromMastery = useCallback(
    (satelliteId: string) => {
      const sat = nodes.find((n) => n.id === satelliteId)
      const masteryId = (sat?.data as PassiveNodeData | undefined)?.masteryId
      if (masteryId && isMasteryOrbitLocked(nodes, masteryId)) return
      commit()
      setNodes((nds) => {
        let oldMasteryId: string | null = null
        const next = nds.map((node) => {
          const data = node.data as PassiveNodeData
          if (node.id === satelliteId) {
            oldMasteryId = data.masteryId ?? null
            return {
              ...node,
              data: { ...data, masteryId: null },
              draggable: true,
            }
          }
          return node
        }).map((node) => {
          if (!oldMasteryId || node.id !== oldMasteryId) return node
          const data = node.data as PassiveNodeData
          return {
            ...node,
            data: removeSatelliteFromOrbitOrders(data, satelliteId),
          }
        })
        if (!oldMasteryId) return stack(next)
        return stack(layoutMasteryOrbit(next, oldMasteryId))
      })
    },
    [commit, nodes, setNodes, stack],
  )

  const changeOrbitTierCount = useCallback(
    (masteryId: string, tierCount: OrbitTierCount) => {
      const mastery = nodes.find((n) => n.id === masteryId)
      if (!mastery) return
      const currentCount = normalizeOrbitTierCount(
        (mastery.data as PassiveNodeData).orbitTierCount,
      )
      if (tierCount < currentCount) {
        for (let t = tierCount + 1; t <= currentCount; t++) {
          const tier = t as OrbitTier
          const members = countOrbitTierMembers(nodes, masteryId, tier)
          if (members > 0) {
            window.alert(
              `${tier}단에 노드가 ${members}개 있습니다. 해당 단의 노드를 제거한 뒤 단수를 줄여 주세요.`,
            )
            return
          }
        }
      }
      commit()
      setNodes((nds) => {
        let next = nds.map((node) => {
          const data = node.data as PassiveNodeData
          if (node.id === masteryId) {
            return { ...node, data: { ...data, orbitTierCount: tierCount } }
          }
          if (data.masteryId === masteryId) {
            return {
              ...node,
              data: {
                ...data,
                orbitTier: normalizeOrbitTier(data.orbitTier, tierCount),
              },
            }
          }
          return node
        })
        next = layoutMasteryOrbit(next, masteryId)
        const stacked = stack(next)
        setEdges((eds) => sanitizeEdges(stacked, eds))
        return stacked
      })
    },
    [commit, nodes, setEdges, setNodes, stack],
  )

  const changeSatelliteOrbitTier = useCallback(
    (satelliteId: string, tier: OrbitTier) => {
      const satellite = nodes.find((n) => n.id === satelliteId)
      if (!satellite) return
      const masteryId = (satellite.data as PassiveNodeData).masteryId
      if (!masteryId) return
      const oldTier = getSatelliteOrbitTier(nodes, masteryId, satelliteId)
      const mastery = nodes.find((n) => n.id === masteryId)
      const tierCount = normalizeOrbitTierCount(
        (mastery?.data as PassiveNodeData | undefined)?.orbitTierCount,
      )
      const newTier = normalizeOrbitTier(tier, tierCount)
      if (oldTier !== newTier && !canAcceptOrbitMember(nodes, masteryId, newTier, satelliteId)) {
        return
      }
      commit()
      setNodes((nds) => {
        let next = nds.map((node) => {
          if (node.id !== satelliteId) return node
          const data = node.data as PassiveNodeData
          return {
            ...node,
            data: { ...data, orbitTier: newTier },
          }
        })
        const masteryNode = next.find((n) => n.id === masteryId)
        if (masteryNode) {
          const md = masteryNode.data as PassiveNodeData
          if (oldTier !== newTier) {
            let mdNext = removeSatelliteFromOrbitOrders(md, satelliteId)
            const newTierOrder = [...(mdNext.orbitOrderByTier?.[newTier] ?? []), satelliteId]
            mdNext = setMasteryTierOrbitOrder(mdNext, newTier, newTierOrder)
            next = next.map((node) =>
              node.id === masteryId ? { ...node, data: mdNext } : node,
            )
          }
        }
        next = layoutMasteryOrbit(next, masteryId)
        const stacked = stack(next)
        setEdges((eds) => sanitizeEdges(stacked, eds))
        return stacked
      })
    },
    [commit, nodes, setEdges, setNodes, stack],
  )

  const changeOrbitStartAngle = useCallback(
    (masteryId: string, tier: OrbitTier, degrees: number) => {
      const snapped = snapOrbitAngle(degrees)
      commit()
      setNodes((nds) => {
        const next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          let nextData: PassiveNodeData
          if (data.orbitLocked) {
            const snapshot = snapshotMasteryTierAngles(data)
            const refTier: OrbitTier = 1
            const delta = normalizeAngleDelta(snapped - getTierStartAngle(data, refTier))
            nextData = rotateAllMasteryTiersByDelta(data, snapshot, delta)
          } else {
            nextData = setMasteryTierStartAngle(data, tier, snapped)
          }
          return { ...node, data: nextData }
        })
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    },
    [commit, setNodes, stack],
  )

  const changeOrbitOrder = useCallback(
    (masteryId: string, satelliteId: string, order1Based: number) => {
      if (isMasteryOrbitLocked(nodes, masteryId)) return
      commit()
      setNodes((nds) => {
        const tier = getSatelliteOrbitTier(nds, masteryId, satelliteId)
        const slot = Math.max(0, order1Based - 1)
        const next = assignSatelliteOrbitSlot(nds, masteryId, satelliteId, tier, slot)
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    },
    [commit, nodes, setNodes, stack],
  )

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    if (shouldSuppressOrbitSelectionClear()) return
    setSelectedId(selected[0]?.id ?? null)
  }, [])

  const restoreFlowSelection = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId)
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })))
    },
    [setNodes],
  )

  const updateNodeData = useCallback(
    (nodeId: string, updater: (data: PassiveNodeData) => PassiveNodeData) => {
      commit()
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: updater(node.data as PassiveNodeData) }
            : node,
        ),
      )
    },
    [commit, setNodes],
  )

  const changeOrbitLocked = useCallback(
    (masteryId: string, locked: boolean) => {
      updateNodeData(masteryId, (d) => ({ ...d, orbitLocked: locked }))
    },
    [updateNodeData],
  )

  const changeOrbitCapacity = useCallback(
    (masteryId: string, tier: OrbitTier, capacity: number) => {
      const nextCapacity = clampOrbitTierCapacity(capacity)
      const members = countOrbitTierMembers(nodes, masteryId, tier)
      if (nextCapacity < members) {
        window.alert(
          `${tier}단에 노드가 ${members}개 있습니다. 용량이 가득 찬 상태에서는 더 줄일 수 없습니다. 노드를 제거한 뒤 다시 시도해 주세요.`,
        )
        return
      }
      const mastery = nodes.find((n) => n.id === masteryId)
      const currentCapacity = mastery
        ? getOrbitTierCapacity(mastery.data as PassiveNodeData, tier)
        : nextCapacity
      if (nextCapacity === currentCapacity) return

      commit()
      setNodes((nds) => {
        let next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          return {
            ...node,
            data: {
              ...data,
              orbitCapacityByTier: {
                ...(data.orbitCapacityByTier ?? {}),
                [tier]: nextCapacity,
              },
            },
          }
        })
        next = rematerializeOrbitTierSlots(next, masteryId, tier, nextCapacity)
        const stacked = stack(layoutMasteryOrbit(next, masteryId))
        setEdges((eds) => sanitizeEdges(stacked, eds))
        return stacked
      })
    },
    [commit, nodes, setEdges, setNodes, stack],
  )

  const changeConnectEnabled = useCallback(
    (nodeId: string, enabled: boolean) => {
      updateNodeData(nodeId, (d) => ({ ...d, connectEnabled: enabled }))
    },
    [updateNodeData],
  )

  const changeKind = useCallback(
    (nodeId: string, kind: PassiveKind) => {
      if (nodeId === INITIAL_NODE_ID) return
      const current = nodes.find((n) => n.id === nodeId)
      if (!current) return
      const prev = current.data as PassiveNodeData
      const affectedMasteries = new Set<string>()

      if (prev.masteryId) affectedMasteries.add(prev.masteryId)
      if (isMasteryKind(prev.kind) && !isMasteryKind(kind)) affectedMasteries.add(nodeId)

      commit()
      setNodes((nds) => {
        let next = nds.map((node) => {
          const data = node.data as PassiveNodeData

          if (node.id === nodeId) {
            const resolvedKind = kind === 'voidMastery' ? 'mastery' : kind
            const nextData: PassiveNodeData = {
              label: data.label,
              kind: resolvedKind,
              stages: stagesForKind(resolvedKind, data.stages),
              symbolId: normalizeSymbolId(data.symbolId, customSymbols, resolvedKind),
              ...(isMasteryKind(resolvedKind)
                ? {
                    orbitStartAngle: data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
                    orbitStartAngleByTier: isMasteryKind(prev.kind)
                      ? data.orbitStartAngleByTier
                      : undefined,
                    orbitOrder: isMasteryKind(prev.kind) ? (data.orbitOrder ?? []) : [],
                    orbitOrderByTier: isMasteryKind(prev.kind)
                      ? data.orbitOrderByTier
                      : undefined,
                    orbitCapacityByTier: isMasteryKind(prev.kind)
                      ? data.orbitCapacityByTier
                      : { 1: 6 },
                    orbitLocked: data.orbitLocked ?? false,
                    orbitTierCount: isMasteryKind(prev.kind)
                      ? normalizeOrbitTierCount(data.orbitTierCount)
                      : 1,
                    masteryId: null,
                  }
                : resolvedKind === 'void'
                  ? {
                      masteryId:
                        isOrbitMemberKind(resolvedKind) && !isMasteryKind(prev.kind)
                          ? data.masteryId ?? null
                          : null,
                      voidPassing: prev.kind === 'void' ? (data.voidPassing ?? false) : false,
                      orbitTier: normalizeOrbitTier(
                        data.orbitTier,
                        data.masteryId
                          ? normalizeOrbitTierCount(
                              (nodes.find((n) => n.id === data.masteryId)?.data as PassiveNodeData)
                                ?.orbitTierCount,
                            )
                          : 1,
                      ),
                    }
                : resolvedKind === 'initial'
                  ? {}
                  : resolvedKind === 'connect'
                    ? {
                        connectEnabled:
                          prev.kind === 'connect' ? (data.connectEnabled ?? true) : true,
                        initialSlot: prev.kind === 'connect' ? data.initialSlot : undefined,
                      }
                    : {
                      masteryId:
                        isOrbitMemberKind(resolvedKind) && !isMasteryKind(prev.kind)
                          ? data.masteryId ?? null
                          : null,
                      orbitTier: normalizeOrbitTier(
                        data.orbitTier,
                        data.masteryId
                          ? normalizeOrbitTierCount(
                              (nodes.find((n) => n.id === data.masteryId)?.data as PassiveNodeData)
                                ?.orbitTierCount,
                            )
                          : 1,
                      ),
                    }),
            }
            if (resolvedKind === 'shard') {
              nextData.stages = []
              if (prev.kind === 'shard' && data.markdown) nextData.markdown = data.markdown
            } else {
              delete nextData.markdown
            }
            return { ...node, data: nextData }
          }

          if (isMasteryKind(prev.kind) && !isMasteryKind(kind) && data.masteryId === nodeId) {
            return { ...node, data: { ...data, masteryId: null }, draggable: true }
          }

          if (
            prev.masteryId &&
            node.id === prev.masteryId &&
            isMasteryKind(data.kind) &&
            !isOrbitMemberKind(kind)
          ) {
            return {
              ...node,
              data: removeSatelliteFromOrbitOrders(data, nodeId),
            }
          }

          return node
        })

        for (const masteryId of affectedMasteries) {
          if (isMasteryKind(prev.kind) && !isMasteryKind(kind) && masteryId === nodeId) continue
          next = layoutMasteryOrbit(next, masteryId)
        }
        return stack(next)
      })

      setEdges((eds) =>
        eds.filter((e) => {
          const sourceNode = nodes.find((n) => n.id === e.source)
          const targetNode = nodes.find((n) => n.id === e.target)
          if (!sourceNode || !targetNode) return false

          const sourceData: PassiveNodeData =
            e.source === nodeId
              ? { ...(sourceNode.data as PassiveNodeData), kind }
              : (sourceNode.data as PassiveNodeData)
          const targetData: PassiveNodeData =
            e.target === nodeId
              ? { ...(targetNode.data as PassiveNodeData), kind }
              : (targetNode.data as PassiveNodeData)

          const linkKind = classifyPassiveConnection(
            { ...sourceNode, data: sourceData },
            { ...targetNode, data: targetData },
            nodes,
          )

          if (e.type === 'orbit') return linkKind === 'orbit'
          if (e.type === 'notable') return linkKind === 'notable'
          return linkKind === 'center'
        }),
      )
    },
    [commit, nodes, setEdges, setNodes, customSymbols, stack],
  )

  const handleImportSvg = useCallback(async (file: File, kind: SymbolEditorKind) => {
    const result = await importSymbolFile(file)
    if (!result.ok) {
      setSymbolImportError(result.message)
      return
    }
    setSymbolImportError(null)
    setCustomSymbols((prev) => [...prev, { ...result.symbol, kind }])
  }, [])

  const handleDeleteSymbol = useCallback(
    (symbolId: string) => {
      setCustomSymbols((prev) => prev.filter((s) => s.id !== symbolId))
      commit()
      setNodes((nds) =>
        stack(
          nds.map((node) => {
            const data = node.data as PassiveNodeData
            if (data.symbolId !== symbolId) return node
            return { ...node, data: { ...data, symbolId: DEFAULT_SYMBOL_ID } }
          }),
        ),
      )
    },
    [commit, setNodes, stack],
  )

  const handleDefaultSymbolColor = useCallback((kind: SymbolEditorKind, color: string) => {
    setDefaultSymbolColors((prev) => ({ ...prev, [kind]: color }))
  }, [])

  const handleCustomSymbolColor = useCallback((symbolId: string, color: string) => {
    setCustomSymbols((prev) =>
      prev.map((symbol) => (symbol.id === symbolId ? { ...symbol, color } : symbol)),
    )
  }, [])

  const handleCustomSymbolScale = useCallback((symbolId: string, scale: number) => {
    setCustomSymbols((prev) =>
      prev.map((symbol) => (symbol.id === symbolId ? { ...symbol, scale } : symbol)),
    )
  }, [])

  const handleCustomSymbolRename = useCallback((symbolId: string, name: string) => {
    setCustomSymbols((prev) =>
      prev.map((symbol) =>
        symbol.id === symbolId ? { ...symbol, name: name.length > 0 ? name : 'Symbol' } : symbol,
      ),
    )
  }, [])

  const createFromTemplate = useCallback(
    (template: NodeTemplatePayload, flowPosition: { x: number; y: number }) => {
      const kind = template.kind
      let position = flowPosition
      if (gridSnapEnabled) position = snapNodeTopLeft(position, gridSnapScale)
      commit()
      const id = uid(kind)
      const data = createPassiveData(kind, `New ${PASSIVE_KIND_LABEL[kind]}`, {
        symbolId: template.symbolId,
      })
      const newNode: PassiveFlowNode = {
        id,
        type: 'passive',
        position,
        dragHandle: '.node-drag-handle',
        draggable: true,
        data,
      }
      setNodes((nds) => stack([...nds, newNode]))
      setSelectedId(id)
    },
    [commit, gridSnapEnabled, gridSnapScale, setNodes, stack],
  )

  const handleExportJson = useCallback(() => {
    const document = buildGraphDocument({
      nodes: stateRef.current.nodes,
      edges: stateRef.current.edges,
      customSymbols,
      settings: { gridSnapEnabled, gridSnapScale, voidHighlightEnabled, defaultSymbolColors },
    })
    downloadGraphDocument(document)
    setImportError(null)
  }, [customSymbols, defaultSymbolColors, gridSnapEnabled, gridSnapScale, voidHighlightEnabled])

  const handleImportJson = useCallback(
    async (file: File) => {
      const result = await importGraphJsonFile(file, {
        nodes: stateRef.current.nodes,
        edges: stateRef.current.edges,
        customSymbols,
        settings: { gridSnapEnabled, gridSnapScale, voidHighlightEnabled, defaultSymbolColors },
      })
      if (!result.ok) {
        setImportError(result.message)
        return
      }
      const imported = result.snapshot
      resetHistory()
      setCustomSymbols(imported.customSymbols)
      setDefaultSymbolColors(imported.settings.defaultSymbolColors ?? {})
      setNodes(stack(imported.nodes))
      setEdges(imported.edges)
      if (imported.settings.gridSnapEnabled != null) {
        setGridSnapEnabled(imported.settings.gridSnapEnabled)
      }
      if (imported.settings.gridSnapScale != null) {
        setGridSnapScale(normalizeGridSnapScale(imported.settings.gridSnapScale))
      }
      if (imported.settings.voidHighlightEnabled != null) {
        setVoidHighlightEnabled(imported.settings.voidHighlightEnabled)
      }
      setSelectedId(imported.nodes[0]?.id ?? null)
      setImportError(null)
      setStorageCorrupt(false)
    },
    [
      customSymbols,
      defaultSymbolColors,
      gridSnapEnabled,
      gridSnapScale,
      resetHistory,
      setEdges,
      setNodes,
      stack,
      voidHighlightEnabled,
    ],
  )



  const handleNewSheet = useCallback(() => {
    const confirmed = window.confirm(
      '새 시트를 만들까요?\n현재 작업 내용은 지워지고 빈 시트로 바뀝니다.',
    )
    if (!confirmed) return
    const snapshot = createNewSheet({
      nodes: stateRef.current.nodes,
      edges: stateRef.current.edges,
      customSymbols,
      settings: { gridSnapEnabled, gridSnapScale, voidHighlightEnabled, defaultSymbolColors },
    })
    resetHistory()
    setCustomSymbols(snapshot.customSymbols)
    setDefaultSymbolColors(snapshot.settings.defaultSymbolColors ?? {})
    setNodes(stack(snapshot.nodes))
    setEdges(snapshot.edges)
    setGridSnapEnabled(snapshot.settings.gridSnapEnabled ?? false)
    setGridSnapScale(normalizeGridSnapScale(snapshot.settings.gridSnapScale))
    setVoidHighlightEnabled(snapshot.settings.voidHighlightEnabled ?? false)
    setSelectedId(snapshot.nodes[0]?.id ?? null)
    setStorageCorrupt(false)
    setImportError(null)
    setSaveStatus('saved')
    setSaveFailureReason(null)
  }, [
    customSymbols,
    defaultSymbolColors,
    gridSnapEnabled,
    gridSnapScale,
    resetHistory,
    setEdges,
    setNodes,
    stack,
    voidHighlightEnabled,
  ])


  const deleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === INITIAL_NODE_ID) return
      commit()
      setPinnedVideoNodeIds((cur) => cur.filter((id) => id !== nodeId))
      setNodes((nds) =>
        removeNodesAndRelayout(nds, [nodeId], selectedIdRef.current),
      )
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setSelectedId((cur) => (cur === nodeId ? null : cur))
    },
    [commit, setEdges, setNodes],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    deleteNode(selectedId)
  }, [deleteNode, selectedId])

  const onPaneClick = useCallback(() => {
    if (shouldSuppressOrbitSelectionClear()) return
    setContextMenu(null)
    setSelectedId(null)
  }, [])

  const onNodeClick = useCallback((_: ReactMouseEvent, node: Node) => {
    setContextMenu(null)
    setSelectedId(node.id)
  }, [])

  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault()
    setSelectedId(node.id)
    setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
  }, [])

  const contextMenuNode = useMemo(() => {
    if (!contextMenu) return null
    return nodes.find((n) => n.id === contextMenu.nodeId) ?? null
  }, [contextMenu, nodes])

  const handlePinnedLogSelect = useCallback((nodeId: string, logId: string) => {
    setSelectedId(nodeId)
    setFocusLogId(logId)
  }, [])

  const handleToggleContextVideoPin = useCallback(() => {
    if (!contextMenu) return
    const nodeId = contextMenu.nodeId
    setPinnedVideoNodeIds((cur) =>
      cur.includes(nodeId) ? cur.filter((id) => id !== nodeId) : [...cur, nodeId],
    )
    setContextMenu(null)
  }, [contextMenu])

  const onClosePinnedVideo = useCallback((nodeId: string) => {
    setPinnedVideoNodeIds((cur) => cur.filter((id) => id !== nodeId))
  }, [])

  const onNodeDragStart = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      commit()
      const data = node.data as PassiveNodeData
      if (isOrbitMemberKind(data.kind)) {
        const snapshotNodes = structuredClone(nodesRef.current)
        const session: NonNullable<typeof orbitDragSessionRef.current> = {
          nodeId: node.id,
          originPosition: { ...node.position },
          snapshotNodes,
        }
        if (data.masteryId) {
          session.orbitOrigin = {
            masteryId: data.masteryId,
            tier: getSatelliteOrbitTier(snapshotNodes, data.masteryId, node.id),
            slot: getSatelliteOrbitSlot(snapshotNodes, data.masteryId, node.id),
          }
        }
        orbitDragSessionRef.current = session
        setDragPreviewNodes(null)
      } else {
        orbitDragSessionRef.current = null
        setDragPreviewNodes(null)
      }
    },
    [commit],
  )

  const onEdgeDoubleClick = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      commit()
      const edgeId = edge.id.replace(/-hit$/, '')
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    },
    [commit, setEdges],
  )

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData

      if (isMasteryKind(data.kind)) {
        const position = gridSnapEnabled ? snapNodeTopLeft(node.position, gridSnapScale) : node.position
        setNodes((nds) => {
          const synced = nds.map((n) =>
            n.id === node.id ? { ...n, position } : n,
          )
          return stack(layoutMasteryOrbit(synced, node.id))
        })
        return
      }

      if (!isOrbitMemberKind(data.kind)) return

      if (data.masteryId && isMasteryOrbitLocked(nodes, data.masteryId)) return

      const session = orbitDragSessionRef.current
      if (session?.nodeId !== node.id) return

      const origin: SatelliteDragOrigin = session.orbitOrigin
        ? { kind: 'orbit', ...session.orbitOrigin }
        : { kind: 'external', position: session.originPosition }

      // Preview only — committed nodes/edges stay until drop.
      setDragPreviewNodes(
        stack(
          placeSatelliteFromDrag(
            session.snapshotNodes,
            node.id,
            node.position,
            origin,
          ),
        ),
      )
    },
    [gridSnapEnabled, gridSnapScale, nodes, setNodes, stack],
  )

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData
      const dragSession = orbitDragSessionRef.current
      orbitDragSessionRef.current = null
      setDragPreviewNodes(null)

      if (isMasteryKind(data.kind)) {
        setNodes((nds) => {
          const position = gridSnapEnabled ? snapNodeTopLeft(node.position, gridSnapScale) : node.position
          const synced = nds.map((n) => (n.id === node.id ? { ...n, position } : n))
          return stack(layoutMasteryOrbit(synced, node.id))
        })
        return
      }

      if (!isOrbitMemberKind(data.kind)) {
        if (gridSnapEnabled) {
          setNodes((nds) =>
            stack(
              nds.map((n) =>
                n.id === node.id ? { ...n, position: snapNodeTopLeft(node.position, gridSnapScale) } : n,
              ),
            ),
          )
        }
        return
      }

      if (!dragSession || dragSession.nodeId !== node.id) {
        if (gridSnapEnabled) {
          setNodes((nds) =>
            stack(
              nds.map((n) =>
                n.id === node.id ? { ...n, position: snapNodeTopLeft(node.position, gridSnapScale) } : n,
              ),
            ),
          )
        }
        return
      }

      if (
        dragSession.orbitOrigin &&
        isMasteryOrbitLocked(dragSession.snapshotNodes, dragSession.orbitOrigin.masteryId)
      ) {
        setNodes(() =>
          stack(layoutMasteryOrbit(dragSession.snapshotNodes, dragSession.orbitOrigin!.masteryId)),
        )
        return
      }

      const origin: SatelliteDragOrigin = dragSession.orbitOrigin
        ? { kind: 'orbit', ...dragSession.orbitOrigin }
        : { kind: 'external', position: dragSession.originPosition }

      let finalPosition = node.position
      if (gridSnapEnabled) {
        const dragged = {
          ...(dragSession.snapshotNodes.find((n) => n.id === node.id) ?? node),
          position: node.position,
        } as PassiveFlowNode
        const atPointer = dragSession.snapshotNodes.map((n) =>
          n.id === node.id ? dragged : n,
        )
        const attach = findOrbitAttachTarget(atPointer, dragged)
        if (!attach) {
          finalPosition = snapNodeTopLeft(node.position, gridSnapScale)
        }
      }

      setNodes(() =>
        stack(
          placeSatelliteFromDrag(
            dragSession.snapshotNodes,
            node.id,
            finalPosition,
            origin,
          ),
        ),
      )
    },
    [gridSnapEnabled, gridSnapScale, setNodes, stack],
  )

  const onRenameNode = useCallback(
    (nodeId: string, label: string) => {
      if (nodeId === INITIAL_NODE_ID) return
      updateNodeData(nodeId, (d) => ({ ...d, label }))
    },
    [updateNodeData],
  )

  const onChangeSymbolId = useCallback(
    (nodeId: string, symbolId: string) => updateNodeData(nodeId, (d) => ({ ...d, symbolId })),
    [updateNodeData],
  )

  const onChangeStages = useCallback(
    (nodeId: string, stages: StageData[]) => updateNodeData(nodeId, (d) => ({ ...d, stages })),
    [updateNodeData],
  )

  const onChangeMarkdown = useCallback(
    (nodeId: string, markdown: string) =>
      updateNodeData(nodeId, (d) => {
        const next = { ...d }
        if (markdown.trim()) next.markdown = markdown
        else delete next.markdown
        return next
      }),
    [updateNodeData],
  )

  return (
    <CustomSymbolProvider customSymbols={customSymbols} defaultSymbolColors={defaultSymbolColors}>
      <ReactFlowProvider>
        <div className="app-shell">
            {bootstrapPending && <FirstRunDialog onChoose={handleBootstrap} />}
            <header className="topbar">
              <div className="topbar__brand">
                <span className="topbar__mark" aria-hidden />
                <div>
                  <p className="topbar__eyebrow">연습 우선 · 로컬 우선 트래커</p>
                  <h1>Passive Tree v0.1</h1>
                </div>
              </div>

              <div className="topbar__actions">
                <label className="topbar__toggle">
                  <input
                    type="checkbox"
                    checked={gridSnapEnabled}
                    onChange={(e) => setGridSnapEnabled(e.target.checked)}
                  />
                  <span>그리드 스냅</span>
                </label>
                {gridSnapEnabled ? (
                  <label className="topbar__scale">
                    <span>Scale</span>
                    <select
                      value={gridSnapScale}
                      onChange={(e) => setGridSnapScale(normalizeGridSnapScale(Number(e.target.value)))}
                      aria-label="그리드 스냅 Scale"
                    >
                      {GRID_SNAP_SCALE_OPTIONS.map((scale) => (
                        <option key={scale} value={scale}>
                          {scale}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="topbar__toggle">
                  <input
                    type="checkbox"
                    checked={voidHighlightEnabled}
                    onChange={(e) => setVoidHighlightEnabled(e.target.checked)}
                  />
                  <span>빈 슬롯 표시</span>
                </label>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={deleteSelected}
                  disabled={!selectedId}
                >
                  Delete Selected
                </button>
                <button type="button" className="btn" onClick={handleNewSheet}>
                  새 시트
                </button>
                <button type="button" className="btn" onClick={handleExportJson}>
                  JSON보내기
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => importInputRef.current?.click()}
                >
                  JSON 불러오기
                </button>
                {saveStatus === 'failed' && (
                  <span
                    className="topbar__save-status topbar__save-status--failed"
                    role="status"
                    aria-live="polite"
                  >
                    {saveFailureReason === 'too_large'
                      ? '저장 실패 (용량 초과)'
                      : '저장 실패'}
                  </span>
                )}
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void handleImportJson(file)
                  }}
                />
              </div>
            </header>

            {importError && (
              <p className="import-error" role="alert">
                {importError}
              </p>
            )}

            {storageCorrupt && (
              <p className="import-error" role="alert">
                저장된 데이터가 손상되었습니다. JSON을 불러와 주세요.
              </p>
            )}

            <TreeWorkspace
              inspectorWidth={inspectorWidth}
              onOpenSymbolEditor={setSymbolEditorKind}
              flowNodes={flowNodes}
              edges={edges}
              poweredIds={poweredIds}
              powerFlowMeta={powerFlowMeta}
              voidHighlightEnabled={voidHighlightEnabled}
              gridSnapScale={gridSnapScale}
              selectedNode={selectedNode}
              selectedData={selectedData}
              masteryLabel={selectedMasteryLabel}
              masteryTierCount={selectedMasteryTierCount}
              orbitMembers={orbitMembers}
              focusLogId={focusLogId}
              onFocusLogConsumed={() => setFocusLogId(null)}
              onCreateFromTemplate={createFromTemplate}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              onPaneClick={onPaneClick}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              pinnedVideoNodeIds={pinnedVideoNodeIds}
              onClosePinnedVideo={onClosePinnedVideo}
              onPinnedLogSelect={handlePinnedLogSelect}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onEdgeDoubleClick={onEdgeDoubleClick}
              onInspectorResizeStart={onInspectorResizeStart}
              commit={commit}
              selectedIdRef={selectedIdRef}
              setNodes={setNodes}
              stack={stack}
              restoreFlowSelection={restoreFlowSelection}
              onRename={onRenameNode}
              onChangeKind={changeKind}
              onChangeSymbolId={onChangeSymbolId}
              onChangeStages={onChangeStages}
              onChangeMarkdown={onChangeMarkdown}
              onChangeConnectEnabled={changeConnectEnabled}
              onChangeOrbitTierCount={changeOrbitTierCount}
              onChangeSatelliteOrbitTier={changeSatelliteOrbitTier}
              onChangeOrbitStartAngle={changeOrbitStartAngle}
              onChangeOrbitOrder={changeOrbitOrder}
              onChangeOrbitLocked={changeOrbitLocked}
              onChangeOrbitCapacity={changeOrbitCapacity}
              onDetachFromMastery={detachFromMastery}
              onDeleteNode={deleteNode}
            />

            {contextMenu && contextMenuNode ? (
              (() => {
                const data = contextMenuNode.data as PassiveNodeData
                const closeMenu = () => setContextMenu(null)
                if (data.kind === 'shard') {
                  return (
                    <ShardMarkdownPreview
                      open
                      x={contextMenu.x}
                      y={contextMenu.y}
                      nodeLabel={data.label}
                      markdown={data.markdown}
                      onClose={closeMenu}
                    />
                  )
                }
                if (data.kind === 'notable') {
                  return (
                    <NotableLogViewer
                      open
                      x={contextMenu.x}
                      y={contextMenu.y}
                      nodeLabel={data.label}
                      logs={dailyLogsForNode(data)}
                      onClose={closeMenu}
                    />
                  )
                }
                return (
                  <NodeContextPopup
                    open
                    x={contextMenu.x}
                    y={contextMenu.y}
                    nodeLabel={data.label}
                    canPinVideos={canPinNodeVideos(data.kind)}
                    isVideoPinned={pinnedVideoNodeIds.includes(contextMenu.nodeId)}
                    onClose={closeMenu}
                    onToggleVideoPin={handleToggleContextVideoPin}
                  />
                )
              })()
            ) : null}

            <SymbolKindEditor
              kind={symbolEditorKind ?? 'mastery'}
              open={symbolEditorKind != null}
              customSymbols={customSymbols}
              defaultSymbolColors={defaultSymbolColors}
              importError={symbolImportError}
              onClose={() => {
                setSymbolEditorKind(null)
                setSymbolImportError(null)
              }}
              onImportSvg={(file, kind) => void handleImportSvg(file, kind)}
              onDeleteSymbol={handleDeleteSymbol}
              onDefaultColorChange={handleDefaultSymbolColor}
              onCustomSymbolColorChange={handleCustomSymbolColor}
              onCustomSymbolScaleChange={handleCustomSymbolScale}
              onCustomSymbolRename={handleCustomSymbolRename}
            />
          </div>
        </ReactFlowProvider>
      </CustomSymbolProvider>
  )
}

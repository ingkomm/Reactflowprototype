import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  BackgroundVariant,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { PassiveNode, type PassiveFlowNode } from './components/PassiveNode'
import { CenterEdge } from './components/CenterEdge'
import { OrbitEdge } from './components/OrbitEdge'
import { Inspector } from './components/Inspector'
import { PowerProvider } from './PowerContext'
import { classifyPassiveConnection, computePoweredNodeIds, computePowerFlowMeta, pruneEdgesReachableFromInitial } from './power'
import type { PassiveKind, PassiveNodeData, OrbitTier, OrbitTierCount, StageData } from './types'
import { ADDABLE_PASSIVE_KINDS, INITIAL_NODE_ID, PASSIVE_KIND_LABEL } from './types'
import {
  buildSeedClasses,
  resolvePassiveClass,
  type PassiveClass,
} from './passiveClass'
import { PassiveClassProvider } from './PassiveClassContext'
import { ClassManager } from './components/ClassManager'
import { stagesForKind, uid as stageUid } from './stage'
import { snapNodeTopLeft } from './grid'
import { createPassiveData, passiveLinkEdge, orbitLinkEdge } from './graphFactory'
import {
  DEFAULT_SELECTED_NODE_ID,
  SEED_EDGES,
  SEED_NODES,
} from './seedGraph'
import {
  applySatelliteOrbitPlacement,
  assignSatelliteOrbitSlot,
  canAcceptOrbitMember,
  DEFAULT_ORBIT_START_ANGLE,
  distanceBetweenCenters,
  findFirstFreeOrbitSlot,
  findNearestMastery,
  getOrbitTierCapacity,
  getOrderedTierSatellites,
  getSatelliteOrbitTier,
  getTierStartAngle,
  isMasteryKind,
  isMasteryOrbitLocked,
  isOrbitMemberKind,
  layoutMasteryOrbit,
  masteryOuterOrbitRadius,
  normalizeOrbitTier,
  normalizeOrbitTierCount,
  normalizeAngleDelta,
  ORBIT_ATTACH_SLACK,
  ORBIT_DETACH_SLACK,
  orbitTierFreeSlots,
  removeSatelliteFromOrbitOrders,
  rotateAllMasteryTiersByDelta,
  setMasteryTierOrbitOrder,
  setMasteryTierStartAngle,
  snapshotMasteryTierAngles,
  removeNodesAndRelayout,
  snapOrbitAngle,
  withMasteryDragFlags,
} from './orbit'
import { OrbitRotateController, shouldSuppressOrbitSelectionClear } from './components/OrbitRotateController'
import { MiniMapCircleNode } from './components/MiniMapCircleNode'
import { ZoomKeyboardController } from './components/ZoomKeyboardController'
import { VoidHighlightProvider } from './VoidHighlightContext'
import { useGraphHistory } from './useGraphHistory'
import './App.css'

const nodeTypes = { passive: PassiveNode }
const edgeTypes = { center: CenterEdge, orbit: OrbitEdge }

function uid(prefix: string) {
  return stageUid(prefix)
}

type NodeClipboard = {
  data: PassiveNodeData
  position: { x: number; y: number }
}

function cloneStagesWithNewIds(stages: StageData[]): StageData[] {
  return stages.map((stage) => ({
    ...stage,
    id: uid('stage'),
    logs: stage.logs.map((log) => ({ ...log, id: uid('log') })),
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
  const data: PassiveNodeData = {
    label,
    kind,
    stages,
    classId: source.classId,
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
  }

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

function findLinkEdge(edges: Edge[], a: string, b: string, type?: 'center' | 'orbit') {
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

function pruneInvalidEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return edges.filter((e) => {
    const source = nodes.find((n) => n.id === e.source)
    const target = nodes.find((n) => n.id === e.target)
    if (!source || !target) return false
    const linkKind = classifyLink(source, target, nodes)
    if (e.type === 'orbit') return linkKind === 'orbit'
    return linkKind === 'center'
  })
}

function sanitizeEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return pruneEdgesReachableFromInitial(nodes, pruneInvalidEdges(nodes, edges))
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(SEED_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(SEED_EDGES)
  const [selectedId, setSelectedId] = useState<string | null>(DEFAULT_SELECTED_NODE_ID)
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false)
  const [voidHighlightEnabled, setVoidHighlightEnabled] = useState(false)
  const [addKind, setAddKind] = useState<PassiveKind>('connect')
  const [inspectorWidth, setInspectorWidth] = useState(360)
  const [classes, setClasses] = useState<PassiveClass[]>(() => buildSeedClasses())
  const [classManagerOpen, setClassManagerOpen] = useState(false)
  const resizingInspector = useRef(false)
  const clipboardRef = useRef<NodeClipboard | null>(null)
  const pasteSerialRef = useRef(0)

  const stateRef = useRef({ nodes, edges })
  stateRef.current = { nodes, edges }
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

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

  const { commit } = useGraphHistory({
    getState: () => stateRef.current,
    setState: (snap) => {
      setNodes(stack(snap.nodes))
      setEdges(snap.edges)
    },
  })

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
      const removals = changes.filter((c) => c.type === 'remove')
      const rest = changes.filter((c) => c.type !== 'remove')
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
  useEffect(() => {
    setEdges((eds) => {
      const next = sanitizeEdges(nodes, eds)
      if (next.length === eds.length && next.every((e, i) => e.id === eds[i]?.id)) return eds
      return next
    })
  }, [nodes, edges, setEdges])

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
  }, [nodes, selectedData?.kind, selectedData?.orbitTierCount, selectedNode])

  const selectedLinks = useMemo(() => {
    if (!selectedNode || !selectedData) return []
    const kind = selectedData.kind
    if (kind !== 'initial' && kind !== 'connect' && kind !== 'small' && kind !== 'notable' && kind !== 'mastery') {
      return []
    }
    return edges
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .filter((e) => {
        if (kind === 'mastery') return e.type === 'center' || !e.type
        if (kind === 'initial') return e.type === 'center' || !e.type
        return true
      })
      .map((e) => {
        const peerId = e.source === selectedNode.id ? e.target : e.source
        const peer = nodes.find((n) => n.id === peerId)
        const peerData = peer?.data as PassiveNodeData | undefined
        return {
          edgeId: e.id,
          peerId,
          peerLabel: peerData?.label ?? peerId,
          peerKind: peerData?.kind ?? 'small',
          linkKind: e.type === 'orbit' ? ('orbit' as const) : ('center' as const),
        }
      })
  }, [edges, nodes, selectedData, selectedNode])

  const linkCandidates = useMemo(() => {
    if (!selectedNode || !selectedData) return []
    const kind = selectedData.kind
    if (kind !== 'initial' && kind !== 'connect' && kind !== 'small' && kind !== 'notable' && kind !== 'mastery') {
      return []
    }
    const linked = new Set(selectedLinks.map((l) => l.peerId))
    return nodes
      .filter((n) => {
        if (n.id === selectedNode.id || linked.has(n.id)) return false
        const linkKind = classifyLink(selectedNode, n, nodes)
        return linkKind === 'center' || linkKind === 'orbit'
      })
      .map((n) => {
        const d = n.data as PassiveNodeData
        const linkKind = classifyLink(selectedNode, n, nodes)
        return {
          id: n.id,
          label: d.label,
          kind: d.kind,
          linkKind: linkKind === 'orbit' ? ('orbit' as const) : ('center' as const),
        }
      })
  }, [nodes, selectedData, selectedLinks, selectedNode])

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target || source.id === target.id) return false
      const kind = classifyLink(source, target, nodes)
      return kind === 'center' || kind === 'orbit' || kind === 'attach'
    },
    [nodes],
  )

  const attachSatellite = useCallback((masteryId: string, satelliteId: string) => {
    if (isMasteryOrbitLocked(nodes, masteryId)) return
    const mastery = nodes.find((n) => n.id === masteryId)
    if (!mastery) return
    const md = mastery.data as PassiveNodeData
    const tierCount = normalizeOrbitTierCount(md.orbitTierCount)
    const current = nodes.find((n) => n.id === satelliteId)
    const alreadyOn =
      (current?.data as PassiveNodeData | undefined)?.masteryId === masteryId
    if (!alreadyOn) {
      let hasFree = false
      for (let t = 1; t <= tierCount; t++) {
        if (orbitTierFreeSlots(nodes, masteryId, t as OrbitTier) > 0) {
          hasFree = true
          break
        }
      }
      if (!hasFree) return
    }

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

      next = applySatelliteOrbitPlacement(next, masteryId, satelliteId)
      const placedTier = getSatelliteOrbitTier(next, masteryId, satelliteId)
      if (!canAcceptOrbitMember(nds, masteryId, placedTier, satelliteId)) {
        return nds
      }
      if (!alreadyOn) {
        const freeSlot = findFirstFreeOrbitSlot(next, masteryId, placedTier)
        if (freeSlot != null) {
          next = assignSatelliteOrbitSlot(next, masteryId, satelliteId, placedTier, freeSlot)
        }
      }
      next = layoutMasteryOrbit(next, masteryId)
      if (oldMasteryId) {
        next = layoutMasteryOrbit(next, oldMasteryId)
      }
      const stacked = stack(next)
      setEdges((eds) => sanitizeEdges(stacked, eds))
      return stacked
    })
  }, [commit, nodes, setEdges, setNodes, stack])

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
      if (linkKind !== 'center' && linkKind !== 'orbit') return

      commit()
      setEdges((eds) => {
        const edgeType = linkKind === 'orbit' ? 'orbit' : 'center'
        const existing = findLinkEdge(eds, source.id, target.id, edgeType)
        let next: Edge[]
        if (existing) {
          next = eds.filter((e) => e.id !== existing.id)
        } else if (linkKind === 'orbit') {
          const sd = source.data as PassiveNodeData
          const masteryId = sd.masteryId ?? (target.data as PassiveNodeData).masteryId
          if (!masteryId) return eds
          next = [...eds, orbitLinkEdge(source.id, target.id, masteryId)]
        } else {
          next = [...eds, passiveLinkEdge(source.id, target.id)]
        }
        return sanitizeEdges(nodes, next)
      })
    },
    [attachSatellite, commit, nodes, setEdges],
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
    [commit, setEdges, setNodes, stack],
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

  const addLink = useCallback(
    (peerId: string) => {
      if (!selectedId) return
      const source = nodes.find((n) => n.id === selectedId)
      const target = nodes.find((n) => n.id === peerId)
      if (!source || !target) return
      const linkKind = classifyLink(source, target, nodes)
      if (linkKind !== 'center' && linkKind !== 'orbit') return
      commit()
      setEdges((eds) => {
        const edgeType = linkKind === 'orbit' ? 'orbit' : 'center'
        if (findLinkEdge(eds, source.id, target.id, edgeType)) return eds
        let next: Edge[]
        if (linkKind === 'orbit') {
          const sd = source.data as PassiveNodeData
          const masteryId = sd.masteryId ?? (target.data as PassiveNodeData).masteryId
          if (!masteryId) return eds
          next = [...eds, orbitLinkEdge(source.id, target.id, masteryId)]
        } else {
          next = [...eds, passiveLinkEdge(source.id, target.id)]
        }
        return sanitizeEdges(nodes, next)
      })
    },
    [commit, nodes, selectedId, setEdges],
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
      commit()
      setNodes((nds) => {
        const next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          return {
            ...node,
            data: {
              ...data,
              orbitCapacityByTier: {
                ...(data.orbitCapacityByTier ?? {}),
                [tier]: Math.max(1, Math.floor(capacity)),
              },
            },
          }
        })
        const stacked = stack(layoutMasteryOrbit(next, masteryId))
        setEdges((eds) => sanitizeEdges(stacked, eds))
        return stacked
      })
    },
    [commit, setEdges, setNodes, stack],
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
              classId: resolvePassiveClass(classes, data.classId, resolvedKind).id,
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
          return linkKind === 'center'
        }),
      )
    },
    [commit, nodes, setEdges, setNodes, classes, stack],
  )

  const handleClassesChange = useCallback(
    (next: PassiveClass[]) => {
      const removedIds = new Set(
        classes.filter((c) => !next.some((n) => n.id === c.id)).map((c) => c.id),
      )
      setClasses(next)
      if (removedIds.size === 0) return
      setNodes((nds) =>
        stack(
          nds.map((node) => {
            const data = node.data as PassiveNodeData
            if (!removedIds.has(data.classId)) return node
            const fallback = resolvePassiveClass(next, null, data.kind)
            return { ...node, data: { ...data, classId: fallback.id } }
          }),
        ),
      )
    },
    [classes, setNodes, stack],
  )

  const addNode = useCallback(() => {
    const id = uid(addKind)
    const offset = nodes.length * 18
    const raw = { x: 280 + (offset % 220), y: 180 + (offset % 160) }
    const position = gridSnapEnabled ? snapNodeTopLeft(raw) : raw
    commit()
    const newNode: PassiveFlowNode = {
      id,
      type: 'passive',
      position,
      dragHandle: '.node-drag-handle',
      draggable: true,
      data: createPassiveData(addKind, `New ${PASSIVE_KIND_LABEL[addKind]}`),
    }
    setNodes((nds) => stack([...nds, newNode]))
    setSelectedId(id)
  }, [addKind, commit, gridSnapEnabled, nodes.length, setNodes, stack])

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === INITIAL_NODE_ID) return
      commit()
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
    setSelectedId(null)
  }, [])

  const onNodeClick = useCallback((_: ReactMouseEvent, node: Node) => {
    setSelectedId(node.id)
  }, [])

  const onNodeDragStart = useCallback(() => {
    commit()
  }, [commit])

  const onEdgeDoubleClick = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      commit()
      const edgeId = edge.id.replace(/-hit$/, '')
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    },
    [commit, setEdges],
  )

  const relayoutOrbitSatellite = useCallback(
    (nds: PassiveFlowNode[], masteryId: string, satelliteId: string) => {
      let next = applySatelliteOrbitPlacement(nds, masteryId, satelliteId)
      next = layoutMasteryOrbit(next, masteryId)
      return stack(next)
    },
    [stack],
  )

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData

      if (isMasteryKind(data.kind)) {
        const position = gridSnapEnabled ? snapNodeTopLeft(node.position) : node.position
        setNodes((nds) => {
          const synced = nds.map((n) =>
            n.id === node.id ? { ...n, position } : n,
          )
          return stack(layoutMasteryOrbit(synced, node.id))
        })
        return
      }

      if (isOrbitMemberKind(data.kind) && data.masteryId) {
        const masteryId = data.masteryId
        if (isMasteryOrbitLocked(nodes, masteryId)) return

        const mastery = nodes.find((n) => n.id === masteryId)
        if (mastery) {
          const dragged: PassiveFlowNode = { ...(nodes.find((n) => n.id === node.id) ?? node), position: node.position } as PassiveFlowNode
          const radius = masteryOuterOrbitRadius(mastery.data as PassiveNodeData)
          const dist = distanceBetweenCenters(dragged, mastery, nodes)

          if (dist > radius + ORBIT_DETACH_SLACK) {
            setNodes((nds) => {
              let next = nds.map((n) => {
                if (n.id === node.id) {
                  const d = n.data as PassiveNodeData
                  return {
                    ...n,
                    position: node.position,
                    data: { ...d, masteryId: null, orbitSlot: undefined },
                  }
                }
                if (n.id === masteryId) {
                  const d = n.data as PassiveNodeData
                  return { ...n, data: removeSatelliteFromOrbitOrders(d, node.id) }
                }
                return n
              })
              next = layoutMasteryOrbit(next, masteryId)
              return stack(next)
            })
            return
          }
        }

        setNodes((nds) => {
          const synced = nds.map((n) =>
            n.id === node.id ? { ...n, position: node.position } : n,
          )
          return relayoutOrbitSatellite(synced, masteryId, node.id)
        })
      }
    },
    [gridSnapEnabled, nodes, relayoutOrbitSatellite, setNodes, stack],
  )

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData

      if (isMasteryKind(data.kind)) {
        setNodes((nds) => {
          const position = gridSnapEnabled ? snapNodeTopLeft(node.position) : node.position
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
                n.id === node.id ? { ...n, position: snapNodeTopLeft(node.position) } : n,
              ),
            ),
          )
        }
        return
      }

      setNodes((nds) => {
        let next = nds.map((n) =>
          n.id === node.id ? { ...n, position: node.position } : n,
        )
        const satellite = next.find((n) => n.id === node.id)
        if (!satellite) return nds

        const currentMasteryId = (satellite.data as PassiveNodeData).masteryId ?? null

        if (currentMasteryId) {
          if (isMasteryOrbitLocked(next, currentMasteryId)) {
            return stack(layoutMasteryOrbit(next, currentMasteryId))
          }

          const mastery = next.find((n) => n.id === currentMasteryId)
          if (mastery) {
            const parentDist =
              findNearestMastery([mastery, satellite], satellite)?.dist ?? Infinity
            const radius = masteryOuterOrbitRadius(mastery.data as PassiveNodeData)

            if (parentDist > radius + ORBIT_DETACH_SLACK) {
              next = next.map((n) => {
                const d = n.data as PassiveNodeData
                if (n.id === satellite.id) {
                  const pos = gridSnapEnabled ? snapNodeTopLeft(n.position) : n.position
                  return { ...n, position: pos, data: { ...d, masteryId: null, orbitSlot: undefined }, draggable: true }
                }
                if (n.id === currentMasteryId && isMasteryKind(d.kind)) {
                  return {
                    ...n,
                    data: removeSatelliteFromOrbitOrders(d, satellite.id),
                  }
                }
                return n
              })
              next = layoutMasteryOrbit(next, currentMasteryId)

              const freeSat = next.find((n) => n.id === satellite.id)!
              const other = findNearestMastery(next, freeSat)
              if (
                other &&
                other.mastery.id !== currentMasteryId &&
                !isMasteryOrbitLocked(next, other.mastery.id) &&
                other.dist <= other.radius + ORBIT_ATTACH_SLACK
              ) {
                next = next.map((n) => {
                  const d = n.data as PassiveNodeData
                  if (n.id === freeSat.id) {
                    return {
                      ...n,
                      data: { ...d, masteryId: other.mastery.id },
                      draggable: true,
                    }
                  }
                  return n
                })
                next = applySatelliteOrbitPlacement(next, other.mastery.id, freeSat.id)
                next = layoutMasteryOrbit(next, other.mastery.id)
              }

              return stack(next)
            }

            next = applySatelliteOrbitPlacement(next, currentMasteryId, satellite.id)
            return stack(layoutMasteryOrbit(next, currentMasteryId))
          }
        }

        const nearest = findNearestMastery(next, satellite)
        if (
          nearest &&
          !isMasteryOrbitLocked(next, nearest.mastery.id) &&
          nearest.dist <= nearest.radius + ORBIT_ATTACH_SLACK
        ) {
          next = next.map((n) => {
            const d = n.data as PassiveNodeData
            if (n.id === satellite.id) {
              return {
                ...n,
                data: { ...d, masteryId: nearest.mastery.id },
                draggable: true,
              }
            }
            return n
          })
          next = applySatelliteOrbitPlacement(next, nearest.mastery.id, satellite.id)
          return stack(layoutMasteryOrbit(next, nearest.mastery.id))
        }

        if (gridSnapEnabled && !currentMasteryId) {
          next = next.map((n) =>
            n.id === node.id ? { ...n, position: snapNodeTopLeft(n.position) } : n,
          )
        }

        return stack(next)
      })
    },
    [gridSnapEnabled, setNodes, stack],
  )

  return (
    <PassiveClassProvider classes={classes}>
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden />
          <div>
            <p className="topbar__eyebrow">Path of Building style</p>
            <h1>Passive Tree Prototype</h1>
          </div>
        </div>

        <div className="topbar__actions">
          <label className="topbar__kind">
            <span>Add as</span>
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as PassiveKind)}
            >
              {(ADDABLE_PASSIVE_KINDS).map((kind) => (
                <option key={kind} value={kind}>
                  {PASSIVE_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn--primary" onClick={addNode}>
            Add Node
          </button>
          <label className="topbar__toggle">
            <input
              type="checkbox"
              checked={gridSnapEnabled}
              onChange={(e) => setGridSnapEnabled(e.target.checked)}
            />
            <span>그리드 스냅</span>
          </label>
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
          <button
            type="button"
            className="btn"
            onClick={() => setClassManagerOpen(true)}
          >
            클래스
          </button>
        </div>
      </header>

      <main
        className="workspace"
        style={{ gridTemplateColumns: `minmax(0, 1fr) ${inspectorWidth}px` }}
      >
        <section className="canvas-pane" aria-label="Passive tree canvas">
          <PowerProvider poweredIds={poweredIds} flowMeta={powerFlowMeta}>
          <VoidHighlightProvider enabled={voidHighlightEnabled}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={onSelectionChange}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onEdgeDoubleClick={onEdgeDoubleClick}
            zoomOnDoubleClick={false}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            connectionLineType={ConnectionLineType.Straight}
            connectionLineStyle={{
              stroke: 'color-mix(in srgb, #9aa8b5 22%, transparent)',
              strokeWidth: 1,
            }}
            fitView
            elevateNodesOnSelect
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              type: 'center',
              style: {
                stroke: 'color-mix(in srgb, #9aa8b5 22%, transparent)',
                strokeWidth: 1,
              },
              zIndex: 0,
            }}
            proOptions={{ hideAttribution: true }}
          >
            <OrbitRotateController
              commit={commit}
              selectedIdRef={selectedIdRef}
              setNodes={setNodes}
              stack={stack}
              restoreSelection={restoreFlowSelection}
            />
            <ZoomKeyboardController />
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1c2430" />
            <Controls position="top-left" />
            <MiniMap
              pannable
              zoomable
              nodeComponent={MiniMapCircleNode}
              nodeColor={(node) => {
                const d = node.data as PassiveNodeData | undefined
                if (!d?.kind) return '#9B9A97'
                return resolvePassiveClass(classes, d.classId, d.kind).iconColor
              }}
              maskColor="rgba(8, 12, 16, 0.7)"
            />
          </ReactFlow>
          </VoidHighlightProvider>
          </PowerProvider>

          <p className="canvas-hint">
            Initial 미연결 링크 자동 삭제 · 오르빗 최대 3단 · 인접 단(1↔2, 2↔3) 호 링크 · 단별 독립 회전
          </p>
        </section>

        <div className="inspector-pane" style={{ width: inspectorWidth }}>
          <button
            type="button"
            className="inspector-resizer"
            aria-label="편집 창 너비 조절"
            title="드래그해서 편집 창 너비 조절"
            onMouseDown={onInspectorResizeStart}
          />
          <Inspector
            nodeId={selectedNode?.id ?? null}
            data={selectedData}
            masteryLabel={selectedMasteryLabel}
            masteryTierCount={selectedMasteryTierCount}
            orbitMembers={orbitMembers}
            linkCandidates={linkCandidates}
            onRename={(nodeId, label) => {
              if (nodeId === INITIAL_NODE_ID) return
              updateNodeData(nodeId, (d) => ({ ...d, label }))
            }}
            onChangeKind={changeKind}
            onChangeClassId={(nodeId, classId) =>
              updateNodeData(nodeId, (d) => ({ ...d, classId }))
            }
            onChangeStages={(nodeId, stages) =>
              updateNodeData(nodeId, (d) => ({ ...d, stages }))
            }
            onChangeConnectEnabled={changeConnectEnabled}
            onChangeOrbitTierCount={changeOrbitTierCount}
            onChangeSatelliteOrbitTier={changeSatelliteOrbitTier}
            onChangeOrbitStartAngle={changeOrbitStartAngle}
            onChangeOrbitOrder={changeOrbitOrder}
            onChangeOrbitLocked={changeOrbitLocked}
            onChangeOrbitCapacity={changeOrbitCapacity}
            onDetachFromMastery={detachFromMastery}
            onAddLink={addLink}
            onDeleteNode={deleteNode}
          />
        </div>
      </main>

      <ClassManager
        open={classManagerOpen}
        classes={classes}
        onClose={() => setClassManagerOpen(false)}
        onChange={handleClassesChange}
      />
    </div>
    </PassiveClassProvider>
  )
}

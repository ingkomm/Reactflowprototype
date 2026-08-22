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
import { PASSIVE_KIND_LABEL } from './types'
import {
  buildSeedClasses,
  DEFAULT_CLASS_ID_BY_KIND,
  resolvePassiveClass,
  type PassiveClass,
} from './passiveClass'
import { PassiveClassProvider } from './PassiveClassContext'
import { ClassManager } from './components/ClassManager'
import { createStage, defaultStagesForSeed, uid as stageUid } from './stage'
import { snapNodeTopLeft } from './grid'
import {
  applySatelliteOrbitPlacement,
  DEFAULT_ORBIT_START_ANGLE,
  findNearestMastery,
  getOrderedTierSatellites,
  getSatelliteOrbitTier,
  getTierStartAngle,
  isMasteryKind,
  isMasteryOrbitLocked,
  isOrbitMemberKind,
  isStealthPassiveKind,
  layoutMasteryOrbit,
  masteryOuterOrbitRadius,
  mergeOrbitOrderFromTiers,
  normalizeOrbitTier,
  normalizeOrbitTierCount,
  normalizeAngleDelta,
  ORBIT_ATTACH_SLACK,
  ORBIT_DETACH_SLACK,
  removeSatelliteFromOrbitOrders,
  rotateAllMasteryTiersByDelta,
  setMasteryTierOrbitOrder,
  setMasteryTierStartAngle,
  snapshotMasteryTierAngles,
  removeNodesAndRelayout,
  snapOrbitAngle,
  withMasteryDragFlags,
} from './orbit'
import { OrbitRotateController } from './components/OrbitRotateController'
import { MiniMapCircleNode } from './components/MiniMapCircleNode'
import { ZoomKeyboardController } from './components/ZoomKeyboardController'
import { shouldSuppressOrbitSelectionClear } from './orbitInteractionGuard'
import { VoidHighlightProvider } from './VoidHighlightContext'
import { useGraphHistory } from './useGraphHistory'
import './App.css'

const nodeTypes = { passive: PassiveNode }
const edgeTypes = { center: CenterEdge, orbit: OrbitEdge }

function uid(prefix: string) {
  return stageUid(prefix)
}

function createPassiveData(
  kind: PassiveKind,
  label: string,
  extras: Partial<
    Pick<
      PassiveNodeData,
      | 'orbitTierCount'
      | 'orbitStartAngle'
      | 'orbitStartAngleByTier'
      | 'orbitOrder'
      | 'orbitOrderByTier'
      | 'orbitLocked'
      | 'masteryId'
      | 'orbitTier'
      | 'voidPassing'
      | 'classId'
      | 'stages'
    >
  > = {},
): PassiveNodeData {
  return {
    label,
    kind,
    stages:
      extras.stages ??
      (kind === 'initial' || isStealthPassiveKind(kind) ? [] : [createStage(1)]),
    classId: extras.classId ?? DEFAULT_CLASS_ID_BY_KIND[kind],
    ...(isMasteryKind(kind)
      ? {
          orbitStartAngle: extras.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitStartAngleByTier: extras.orbitStartAngleByTier,
          orbitOrder: extras.orbitOrder ?? [],
          orbitOrderByTier: extras.orbitOrderByTier,
          orbitLocked: extras.orbitLocked ?? false,
          orbitTierCount: extras.orbitTierCount ?? 1,
        }
      : kind === 'void'
        ? {
            masteryId: extras.masteryId ?? null,
            voidPassing: extras.voidPassing ?? false,
            orbitTier: extras.orbitTier ?? 1,
          }
        : kind === 'initial'
          ? {}
          : {
              masteryId: extras.masteryId ?? null,
              orbitTier: extras.orbitTier ?? 1,
            }),
  }
}

function passiveLinkEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `link-${sourceId}-${targetId}`,
    type: 'center',
    source: sourceId,
    target: targetId,
    sourceHandle: 'center',
    targetHandle: 'center-target',
  }
}

function orbitLinkEdge(sourceId: string, targetId: string, masteryId: string): Edge {
  return {
    id: `orbit-${sourceId}-${targetId}`,
    type: 'orbit',
    source: sourceId,
    target: targetId,
    data: { masteryId },
    zIndex: 1,
  }
}

function orbitAdjacentEdges(order: string[], masteryId: string): Edge[] {
  if (order.length < 2) return []
  return order.map((id, i) => {
    const next = order[(i + 1) % order.length]!
    return orbitLinkEdge(id, next, masteryId)
  })
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

const danceMasteryId = 'mastery-dance'
const gymMasteryId = 'mastery-gym'
const danceOrbitOrderByTier: Partial<Record<OrbitTier, string[]>> = {
  1: ['notable-hiphop', 'notable-kpop', 'small-basic'],
  2: ['small-footwork', 'small-stretch'],
}
const danceOrbitOrder = mergeOrbitOrderFromTiers(2, danceOrbitOrderByTier)
const danceOrbitStartAngleByTier: Partial<Record<OrbitTier, number>> = {
  1: -90,
  2: 0,
}
const gymOrbitOrder = [
  'notable-strength',
  'notable-cardio',
  'small-legs',
  'small-back',
  'small-run',
  'small-core',
]

function buildSeedNodes(): PassiveFlowNode[] {
  const base: PassiveFlowNode[] = [
    {
      id: 'initial-main',
      type: 'passive',
      position: { x: 20, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('initial', '시작', { stages: [], classId: 'i-default' }),
    },
    {
      id: danceMasteryId,
      type: 'passive',
      position: { x: 260, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('mastery', '댄스', {
        stages: defaultStagesForSeed([
          { label: '기초 그루브', goal: 4, logged: 4 },
          { label: '안무 리허설', goal: 5, logged: 3 },
          { label: '공연', goal: 3, logged: 1 },
        ]),
        orbitStartAngle: -90,
        orbitStartAngleByTier: danceOrbitStartAngleByTier,
        orbitOrder: danceOrbitOrder,
        orbitOrderByTier: danceOrbitOrderByTier,
        orbitTierCount: 2,
        classId: 'm-dance',
      }),
    },
    {
      id: 'notable-hiphop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '힙합', {
        stages: defaultStagesForSeed([
          { label: '기초 스텝', goal: 5, logged: 4 },
          { label: '프리스타일', goal: 4, logged: 2 },
        ]),
        masteryId: danceMasteryId,
        orbitTier: 1,
        classId: 'n-hiphop',
      }),
    },
    {
      id: 'notable-kpop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', 'K-pop', {
        stages: defaultStagesForSeed([
          { label: '안무 암기', goal: 6, logged: 5 },
          { label: '포인트 안무', goal: 3, logged: 3 },
        ]),
        masteryId: danceMasteryId,
        orbitTier: 1,
        classId: 'n-kpop',
      }),
    },
    {
      id: 'small-basic',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '기본기', {
        stages: defaultStagesForSeed([{ label: '아이솔레이션', goal: 4, logged: 4 }]),
        masteryId: danceMasteryId,
        orbitTier: 1,
        classId: 's-basic',
      }),
    },
    {
      id: 'small-footwork',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '풋워크', {
        stages: defaultStagesForSeed([{ label: '그루브', goal: 3, logged: 2 }]),
        masteryId: danceMasteryId,
        orbitTier: 2,
        classId: 's-footwork',
      }),
    },
    {
      id: 'small-stretch',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '스트레칭', {
        stages: defaultStagesForSeed([{ label: '유연성', goal: 3, logged: 1 }]),
        masteryId: danceMasteryId,
        orbitTier: 2,
        classId: 's-stretch',
      }),
    },
    {
      id: gymMasteryId,
      type: 'passive',
      position: { x: 760, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('mastery', '운동', {
        stages: defaultStagesForSeed([
          { label: '워밍업', goal: 4, logged: 4 },
          { label: '메인', goal: 5, logged: 2 },
          { label: '쿨다운', goal: 3, logged: 0 },
        ]),
        orbitStartAngle: -90,
        orbitOrder: gymOrbitOrder,
        orbitTierCount: 1,
        classId: 'm-gym',
      }),
    },
    {
      id: 'notable-strength',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '근력', {
        stages: defaultStagesForSeed([
          { label: '스쿼트', goal: 6, logged: 6 },
          { label: '데드리프트', goal: 5, logged: 4 },
        ]),
        masteryId: gymMasteryId,
        classId: 'n-strength',
      }),
    },
    {
      id: 'notable-cardio',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '유산소', {
        stages: defaultStagesForSeed([
          { label: '러닝', goal: 5, logged: 5 },
          { label: '사이클', goal: 4, logged: 2 },
        ]),
        masteryId: gymMasteryId,
        classId: 'n-cardio',
      }),
    },
    {
      id: 'small-legs',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '하체', {
        stages: defaultStagesForSeed([{ label: '런지', goal: 4, logged: 4 }]),
        masteryId: gymMasteryId,
        classId: 's-legs',
      }),
    },
    {
      id: 'small-back',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '등', {
        stages: defaultStagesForSeed([{ label: '풀업', goal: 5, logged: 4 }]),
        masteryId: gymMasteryId,
        classId: 's-back',
      }),
    },
    {
      id: 'small-run',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '러닝', {
        stages: defaultStagesForSeed([{ label: '인터벌', goal: 3, logged: 2 }]),
        masteryId: gymMasteryId,
        classId: 's-run',
      }),
    },
    {
      id: 'small-core',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '코어', {
        stages: defaultStagesForSeed([{ label: '플랭크', goal: 4, logged: 3 }]),
        masteryId: gymMasteryId,
        classId: 's-core',
      }),
    },
  ]

  return withMasteryDragFlags(
    layoutMasteryOrbit(layoutMasteryOrbit(base, danceMasteryId), gymMasteryId),
  )
}

const seedNodes = buildSeedNodes()

const initialEdges: Edge[] = [
  passiveLinkEdge('initial-main', 'small-basic'),
  passiveLinkEdge('initial-main', 'small-legs'),
  passiveLinkEdge('notable-hiphop', danceMasteryId),
  passiveLinkEdge('notable-strength', gymMasteryId),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[1] ?? [], danceMasteryId),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[2] ?? [], danceMasteryId),
  ...orbitAdjacentEdges(gymOrbitOrder, gymMasteryId),
]

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(danceMasteryId)
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false)
  const [voidHighlightEnabled, setVoidHighlightEnabled] = useState(false)
  const [addKind, setAddKind] = useState<PassiveKind>('small')
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
      if (removals.length === 0) return

      commit()
      const removeIds = new Set(removals.map((c) => c.id))
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
      tierSats.forEach((sat, index) => {
        const data = sat.data as PassiveNodeData
        members.push({
          id: sat.id,
          label: data.label,
          kind: data.kind,
          order: index + 1,
          tier,
          tierSize: tierSats.length,
        })
      })
    }
    return members
  }, [nodes, selectedData?.kind, selectedData?.orbitTierCount, selectedNode])

  const selectedLinks = useMemo(() => {
    if (!selectedNode || !selectedData) return []
    const kind = selectedData.kind
    if (kind !== 'initial' && kind !== 'small' && kind !== 'notable' && kind !== 'mastery') {
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
    if (kind !== 'initial' && kind !== 'small' && kind !== 'notable' && kind !== 'mastery') {
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
    commit()
    setNodes((nds) => {
      const current = nds.find((n) => n.id === satelliteId)
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
      commit()
      setNodes((nds) => {
        const satellite = nds.find((n) => n.id === satelliteId)
        if (!satellite) return nds
        const masteryId = (satellite.data as PassiveNodeData).masteryId
        if (!masteryId) return nds
        const mastery = nds.find((n) => n.id === masteryId)
        const tierCount = normalizeOrbitTierCount(
          (mastery?.data as PassiveNodeData | undefined)?.orbitTierCount,
        )
        let next = nds.map((node) => {
          if (node.id !== satelliteId) return node
          const data = node.data as PassiveNodeData
          return {
            ...node,
            data: { ...data, orbitTier: normalizeOrbitTier(tier, tierCount) },
          }
        })
        const masteryNode = next.find((n) => n.id === masteryId)
        if (masteryNode) {
          const md = masteryNode.data as PassiveNodeData
          const oldTier = getSatelliteOrbitTier(nds, masteryId, satelliteId)
          const newTier = normalizeOrbitTier(tier, tierCount)
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
    [commit, setEdges, setNodes, stack],
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
        const mastery = nds.find((n) => n.id === masteryId)
        if (!mastery) return nds
        const data = mastery.data as PassiveNodeData
        const tier = getSatelliteOrbitTier(nds, masteryId, satelliteId)
        const ordered = getOrderedTierSatellites(nds, masteryId, tier).map((s) => s.id)
        const without = ordered.filter((id) => id !== satelliteId)
        const insertAt = Math.max(0, Math.min(without.length, order1Based - 1))
        without.splice(insertAt, 0, satelliteId)

        const next = nds.map((node) =>
          node.id === masteryId
            ? { ...node, data: setMasteryTierOrbitOrder(data, tier, without) }
            : node,
        )
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    },
    [commit, nodes, setNodes, stack],
  )

  const removeLink = useCallback(
    (edgeId: string) => {
      commit()
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    },
    [commit, setEdges],
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

  const changeVoidPassing = useCallback(
    (nodeId: string, passing: boolean) => {
      commit()
      setNodes((nds) => {
        const next = nds.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node.data as PassiveNodeData),
                  voidPassing: passing,
                },
              }
            : node,
        )
        setEdges((eds) => sanitizeEdges(next, eds))
        return next
      })
    },
    [commit, setEdges, setNodes],
  )

  const changeKind = useCallback(
    (nodeId: string, kind: PassiveKind) => {
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
            const nextData: PassiveNodeData = {
              label: data.label,
              kind,
              stages:
                kind === 'initial' || isStealthPassiveKind(kind)
                  ? []
                  : data.stages.length > 0
                    ? data.stages
                    : [createStage(1)],
              classId: resolvePassiveClass(classes, data.classId, kind).id,
              ...(isMasteryKind(kind)
                ? {
                    orbitStartAngle: data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
                    orbitStartAngleByTier: isMasteryKind(prev.kind)
                      ? data.orbitStartAngleByTier
                      : undefined,
                    orbitOrder: isMasteryKind(prev.kind) ? (data.orbitOrder ?? []) : [],
                    orbitOrderByTier: isMasteryKind(prev.kind)
                      ? data.orbitOrderByTier
                      : undefined,
                    orbitLocked: data.orbitLocked ?? false,
                    orbitTierCount: isMasteryKind(prev.kind)
                      ? normalizeOrbitTierCount(data.orbitTierCount)
                      : 1,
                    masteryId: null,
                  }
                : kind === 'void'
                  ? {
                      masteryId:
                        isOrbitMemberKind(kind) && !isMasteryKind(prev.kind)
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
                : kind === 'initial'
                  ? {}
                  : {
                      masteryId:
                        isOrbitMemberKind(kind) && !isMasteryKind(prev.kind)
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
        if (isMasteryOrbitLocked(nodes, data.masteryId)) return
        setNodes((nds) => {
          const synced = nds.map((n) =>
            n.id === node.id ? { ...n, position: node.position } : n,
          )
          return relayoutOrbitSatellite(synced, data.masteryId!, node.id)
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
                  return { ...n, position: pos, data: { ...d, masteryId: null }, draggable: true }
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
              {(Object.keys(PASSIVE_KIND_LABEL) as PassiveKind[]).map((kind) => (
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
            <span>보이드 표시</span>
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
            links={selectedLinks}
            linkCandidates={linkCandidates}
            onRename={(nodeId, label) => updateNodeData(nodeId, (d) => ({ ...d, label }))}
            onChangeKind={changeKind}
            onChangeClassId={(nodeId, classId) =>
              updateNodeData(nodeId, (d) => ({ ...d, classId }))
            }
            onChangeStages={(nodeId, stages) =>
              updateNodeData(nodeId, (d) => ({ ...d, stages }))
            }
            onChangeOrbitTierCount={changeOrbitTierCount}
            onChangeSatelliteOrbitTier={changeSatelliteOrbitTier}
            onChangeOrbitStartAngle={changeOrbitStartAngle}
            onChangeOrbitOrder={changeOrbitOrder}
            onChangeOrbitLocked={changeOrbitLocked}
            onChangeVoidPassing={changeVoidPassing}
            onDetachFromMastery={detachFromMastery}
            onRemoveLink={removeLink}
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

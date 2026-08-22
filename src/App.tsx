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
import { classifyPassiveConnection, computePoweredNodeIds } from './power'
import type { PassiveKind, PassiveNodeData, StageData } from './types'
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
import {
  areOrbitAdjacent,
  DEFAULT_ORBIT_RADIUS,
  DEFAULT_ORBIT_START_ANGLE,
  findNearestMastery,
  getOrderedOrbitSatellites,
  isSatelliteKind,
  layoutMasteryOrbit,
  ORBIT_ATTACH_SLACK,
  ORBIT_DETACH_SLACK,
  orbitOrderByDropAngle,
  removeNodesAndRelayout,
  snapOrbitAngle,
  withMasteryDragFlags,
} from './orbit'
import { OrbitRotateController } from './components/OrbitRotateController'
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
      | 'orbitRadius'
      | 'orbitStartAngle'
      | 'orbitOrder'
      | 'masteryId'
      | 'classId'
      | 'stages'
    >
  > = {},
): PassiveNodeData {
  return {
    label,
    kind,
    stages: extras.stages ?? (kind === 'initial' ? [] : [createStage(1)]),
    classId: extras.classId ?? DEFAULT_CLASS_ID_BY_KIND[kind],
    ...(kind === 'mastery'
      ? {
          orbitRadius: extras.orbitRadius ?? DEFAULT_ORBIT_RADIUS,
          orbitStartAngle: extras.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitOrder: extras.orbitOrder ?? [],
        }
      : { masteryId: extras.masteryId ?? null }),
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
    ...(kind === 'mastery'
      ? {
          orbitRadius: source.orbitRadius ?? DEFAULT_ORBIT_RADIUS,
          orbitStartAngle: source.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
          orbitOrder: [],
        }
      : kind === 'initial'
        ? {}
        : { masteryId: null }),
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

  if (sourceData.kind === 'mastery' && isSatelliteKind(targetData.kind)) {
    return { mastery: source, satellite: target }
  }
  if (targetData.kind === 'mastery' && isSatelliteKind(sourceData.kind)) {
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
  return classifyPassiveConnection(source, target, nodes, (masteryId, a, b) =>
    areOrbitAdjacent(nodes, masteryId, a, b),
  )
}

const danceMasteryId = 'mastery-dance'
const gymMasteryId = 'mastery-gym'
const danceOrbitOrder = [
  'notable-hiphop',
  'notable-kpop',
  'small-basic',
  'small-footwork',
  'small-stretch',
]
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
        orbitRadius: 170,
        orbitStartAngle: -90,
        orbitOrder: danceOrbitOrder,
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
        classId: 'n-kpop',
      }),
    },
    {
      id: 'small-basic',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '기본기', {
        stages: defaultStagesForSeed([{ label: '아이솔레이션', goal: 4, logged: 3 }]),
        masteryId: danceMasteryId,
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
        orbitRadius: 170,
        orbitStartAngle: -90,
        orbitOrder: gymOrbitOrder,
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
        stages: defaultStagesForSeed([{ label: '런지', goal: 4, logged: 3 }]),
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
  passiveLinkEdge('initial-main', 'notable-hiphop'),
  passiveLinkEdge('initial-main', 'notable-strength'),
  passiveLinkEdge('notable-hiphop', danceMasteryId),
  passiveLinkEdge('notable-strength', gymMasteryId),
  ...orbitAdjacentEdges(danceOrbitOrder, danceMasteryId),
  ...orbitAdjacentEdges(gymOrbitOrder, gymMasteryId),
]

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(danceMasteryId)
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

  // Drop edges that no longer match link rules (orbit adjacency, no Notable↔Notable, etc.).
  useEffect(() => {
    setEdges((eds) => {
      const next = eds.filter((e) => {
        const source = nodes.find((n) => n.id === e.source)
        const target = nodes.find((n) => n.id === e.target)
        if (!source || !target) return false
        const linkKind = classifyLink(source, target, nodes)
        if (e.type === 'orbit') return linkKind === 'orbit'
        return linkKind === 'center'
      })
      return next.length === eds.length ? eds : next
    })
  }, [nodes, setEdges])

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
  }, [nodes, selectedData])

  const orbitMembers = useMemo(() => {
    if (!selectedNode || selectedData?.kind !== 'mastery') return []
    return getOrderedOrbitSatellites(nodes, selectedNode.id).map((sat, index) => {
      const data = sat.data as PassiveNodeData
      return {
        id: sat.id,
        label: data.label,
        kind: data.kind,
        order: index + 1,
      }
    })
  }, [nodes, selectedData?.kind, selectedNode])

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
        if (oldMasteryId && node.id === oldMasteryId && data.kind === 'mastery') {
          return {
            ...node,
            data: {
              ...data,
              orbitOrder: (data.orbitOrder ?? []).filter((id) => id !== satelliteId),
            },
          }
        }
        return node
      })

      const order = orbitOrderByDropAngle(next, masteryId, satelliteId)
      next = next.map((node) => {
        if (node.id !== masteryId) return node
        const data = node.data as PassiveNodeData
        if (data.kind !== 'mastery') return node
        return { ...node, data: { ...data, orbitOrder: order } }
      })

      next = layoutMasteryOrbit(next, masteryId)
      if (oldMasteryId) {
        next = layoutMasteryOrbit(next, oldMasteryId)
      }
      return stack(next)
    })
  }, [commit, setNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target) return

      const linkKind = classifyLink(source, target, nodes)
      if (linkKind === 'attach') {
        const pair = resolveMasteryPair(source, target)
        if (pair) attachSatellite(pair.mastery.id, pair.satellite.id)
        return
      }
      if (linkKind !== 'center' && linkKind !== 'orbit') return

      commit()
      setEdges((eds) => {
        const edgeType = linkKind === 'orbit' ? 'orbit' : 'center'
        const existing = findLinkEdge(eds, source.id, target.id, edgeType)
        if (existing) {
          return eds.filter((e) => e.id !== existing.id)
        }
        if (linkKind === 'orbit') {
          const sd = source.data as PassiveNodeData
          const masteryId = sd.masteryId ?? (target.data as PassiveNodeData).masteryId
          if (!masteryId) return eds
          return [...eds, orbitLinkEdge(source.id, target.id, masteryId)]
        }
        return [...eds, passiveLinkEdge(source.id, target.id)]
      })
    },
    [attachSatellite, commit, nodes, setEdges],
  )

  const detachFromMastery = useCallback(
    (satelliteId: string) => {
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
            data: {
              ...data,
              orbitOrder: (data.orbitOrder ?? []).filter((id) => id !== satelliteId),
            },
          }
        })
        if (!oldMasteryId) return stack(next)
        return stack(layoutMasteryOrbit(next, oldMasteryId))
      })
    },
    [commit, setNodes],
  )

  const changeOrbitRadius = useCallback(
    (masteryId: string, radius: number) => {
      const clamped = Math.min(480, Math.max(80, radius))
      commit()
      setNodes((nds) => {
        const next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          return { ...node, data: { ...data, orbitRadius: clamped } }
        })
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    },
    [commit, setNodes],
  )

  const changeOrbitStartAngle = useCallback(
    (masteryId: string, degrees: number) => {
      const snapped = snapOrbitAngle(degrees)
      commit()
      setNodes((nds) => {
        const next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          return { ...node, data: { ...data, orbitStartAngle: snapped } }
        })
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    },
    [commit, setNodes],
  )

  const changeOrbitOrder = useCallback(
    (masteryId: string, satelliteId: string, order1Based: number) => {
      commit()
      setNodes((nds) => {
        const mastery = nds.find((n) => n.id === masteryId)
        if (!mastery) return nds
        const data = mastery.data as PassiveNodeData
        const ordered = getOrderedOrbitSatellites(nds, masteryId).map((s) => s.id)
        const without = ordered.filter((id) => id !== satelliteId)
        const insertAt = Math.max(0, Math.min(without.length, order1Based - 1))
        without.splice(insertAt, 0, satelliteId)

        const next = nds.map((node) =>
          node.id === masteryId
            ? { ...node, data: { ...data, orbitOrder: without } }
            : node,
        )
        return stack(layoutMasteryOrbit(next, masteryId))
      })
    },
    [commit, setNodes],
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
        if (linkKind === 'orbit') {
          const sd = source.data as PassiveNodeData
          const masteryId = sd.masteryId ?? (target.data as PassiveNodeData).masteryId
          if (!masteryId) return eds
          return [...eds, orbitLinkEdge(source.id, target.id, masteryId)]
        }
        return [...eds, passiveLinkEdge(source.id, target.id)]
      })
    },
    [commit, nodes, selectedId, setEdges],
  )

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    setSelectedId(selected[0]?.id ?? null)
  }, [])

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

  const changeKind = useCallback(
    (nodeId: string, kind: PassiveKind) => {
      const current = nodes.find((n) => n.id === nodeId)
      if (!current) return
      const prev = current.data as PassiveNodeData
      const affectedMasteries = new Set<string>()

      if (prev.masteryId) affectedMasteries.add(prev.masteryId)
      if (prev.kind === 'mastery' && kind !== 'mastery') affectedMasteries.add(nodeId)

      commit()
      setNodes((nds) => {
        let next = nds.map((node) => {
          const data = node.data as PassiveNodeData

          if (node.id === nodeId) {
            const nextData: PassiveNodeData = {
              label: data.label,
              kind,
              stages:
                kind === 'initial'
                  ? []
                  : data.stages.length > 0
                    ? data.stages
                    : [createStage(1)],
              classId: resolvePassiveClass(classes, data.classId, kind).id,
              ...(kind === 'mastery'
                ? {
                    orbitRadius: data.orbitRadius ?? DEFAULT_ORBIT_RADIUS,
                    orbitStartAngle: data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
                    orbitOrder: [],
                    masteryId: null,
                  }
                : kind === 'initial'
                  ? {}
                  : {
                      masteryId:
                        isSatelliteKind(kind) && prev.kind !== 'mastery'
                          ? data.masteryId ?? null
                          : null,
                    }),
            }
            return { ...node, data: nextData }
          }

          if (prev.kind === 'mastery' && kind !== 'mastery' && data.masteryId === nodeId) {
            return { ...node, data: { ...data, masteryId: null }, draggable: true }
          }

          if (
            prev.masteryId &&
            node.id === prev.masteryId &&
            data.kind === 'mastery' &&
            !isSatelliteKind(kind)
          ) {
            return {
              ...node,
              data: {
                ...data,
                orbitOrder: (data.orbitOrder ?? []).filter((id) => id !== nodeId),
              },
            }
          }

          return node
        })

        for (const masteryId of affectedMasteries) {
          if (prev.kind === 'mastery' && kind !== 'mastery' && masteryId === nodeId) continue
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
            (masteryId, a, b) => areOrbitAdjacent(nodes, masteryId, a, b),
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
    commit()
    const newNode: PassiveFlowNode = {
      id,
      type: 'passive',
      position: { x: 280 + (offset % 220), y: 180 + (offset % 160) },
      dragHandle: '.node-drag-handle',
      draggable: true,
      data: createPassiveData(addKind, `New ${PASSIVE_KIND_LABEL[addKind]}`),
    }
    setNodes((nds) => stack([...nds, newNode]))
    setSelectedId(id)
  }, [addKind, commit, nodes.length, setNodes, stack])

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

  const onPaneClick = useCallback(() => setSelectedId(null), [])

  const onNodeClick = useCallback((_: ReactMouseEvent, node: Node) => {
    setSelectedId(node.id)
  }, [])

  const onNodeDragStart = useCallback(() => {
    commit()
  }, [commit])

  const onEdgeDoubleClick = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      commit()
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    },
    [commit, setEdges],
  )

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData
      if (data.kind !== 'mastery') return
      setNodes((nds) => {
        const synced = nds.map((n) =>
          n.id === node.id ? { ...n, position: node.position } : n,
        )
        return stack(layoutMasteryOrbit(synced, node.id))
      })
    },
    [setNodes, stack],
  )

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData
      if (!isSatelliteKind(data.kind)) return

      setNodes((nds) => {
        let next = nds.map((n) =>
          n.id === node.id ? { ...n, position: node.position } : n,
        )
        const satellite = next.find((n) => n.id === node.id)
        if (!satellite) return nds

        const currentMasteryId = (satellite.data as PassiveNodeData).masteryId ?? null

        if (currentMasteryId) {
          const mastery = next.find((n) => n.id === currentMasteryId)
          if (mastery) {
            const parentDist =
              findNearestMastery([mastery, satellite], satellite)?.dist ?? Infinity
            const radius =
              (mastery.data as PassiveNodeData).orbitRadius ?? DEFAULT_ORBIT_RADIUS

            if (parentDist > radius + ORBIT_DETACH_SLACK) {
              next = next.map((n) => {
                const d = n.data as PassiveNodeData
                if (n.id === satellite.id) {
                  return { ...n, data: { ...d, masteryId: null }, draggable: true }
                }
                if (n.id === currentMasteryId && d.kind === 'mastery') {
                  return {
                    ...n,
                    data: {
                      ...d,
                      orbitOrder: (d.orbitOrder ?? []).filter((id) => id !== satellite.id),
                    },
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
                other.dist <= other.radius + ORBIT_ATTACH_SLACK
              ) {
                const order = orbitOrderByDropAngle(next, other.mastery.id, freeSat.id)
                next = next.map((n) => {
                  const d = n.data as PassiveNodeData
                  if (n.id === freeSat.id) {
                    return {
                      ...n,
                      data: { ...d, masteryId: other.mastery.id },
                      draggable: true,
                    }
                  }
                  if (n.id === other.mastery.id && d.kind === 'mastery') {
                    return { ...n, data: { ...d, orbitOrder: order } }
                  }
                  return n
                })
                next = layoutMasteryOrbit(next, other.mastery.id)
              }

              return stack(next)
            }

            const order = orbitOrderByDropAngle(next, currentMasteryId, satellite.id)
            next = next.map((n) => {
              if (n.id !== currentMasteryId) return n
              const d = n.data as PassiveNodeData
              return { ...n, data: { ...d, orbitOrder: order } }
            })
            return stack(layoutMasteryOrbit(next, currentMasteryId))
          }
        }

        const nearest = findNearestMastery(next, satellite)
        if (nearest && nearest.dist <= nearest.radius + ORBIT_ATTACH_SLACK) {
          const order = orbitOrderByDropAngle(next, nearest.mastery.id, satellite.id)
          next = next.map((n) => {
            const d = n.data as PassiveNodeData
            if (n.id === satellite.id) {
              return {
                ...n,
                data: { ...d, masteryId: nearest.mastery.id },
                draggable: true,
              }
            }
            if (n.id === nearest.mastery.id && d.kind === 'mastery') {
              return { ...n, data: { ...d, orbitOrder: order } }
            }
            return n
          })
          return stack(layoutMasteryOrbit(next, nearest.mastery.id))
        }

        return stack(next)
      })
    },
    [setNodes, stack],
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
          <PowerProvider poweredIds={poweredIds}>
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
            <OrbitRotateController commit={commit} setNodes={setNodes} stack={stack} />
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1c2430" />
            <Controls position="top-left" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const d = node.data as PassiveNodeData | undefined
                if (!d?.kind) return '#9B9A97'
                return resolvePassiveClass(classes, d.classId, d.kind).iconColor
              }}
              maskColor="rgba(8, 12, 16, 0.7)"
            />
          </ReactFlow>
          </PowerProvider>

          <p className="canvas-hint">
            Initial에서 파워 공급 · 오르빗 인접 = 호 링크 · Mastery↔Notable = 직선 링크
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
            onChangeOrbitRadius={changeOrbitRadius}
            onChangeOrbitStartAngle={changeOrbitStartAngle}
            onChangeOrbitOrder={changeOrbitOrder}
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

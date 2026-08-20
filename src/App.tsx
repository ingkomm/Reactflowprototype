import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
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
import { Inspector } from './components/Inspector'
import type { PassiveKind, PassiveNodeData, TrainingEntry } from './types'
import { DEFAULT_ICON_BY_KIND, NODE_ICON_COLORS, PASSIVE_KIND_LABEL } from './types'
import {
  DEFAULT_ORBIT_RADIUS,
  DEFAULT_ORBIT_START_ANGLE,
  findNearestMastery,
  getOrderedOrbitSatellites,
  isSatelliteKind,
  layoutMasteryOrbit,
  ORBIT_ATTACH_SLACK,
  ORBIT_DETACH_SLACK,
  orbitOrderByDropAngle,
  shareSameOrbit,
  snapOrbitAngle,
  withMasteryDragFlags,
} from './orbit'
import './App.css'

const nodeTypes = { passive: PassiveNode }
const edgeTypes = { center: CenterEdge }

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function createTraining(label = 'Session', count = 1): TrainingEntry {
  return { id: uid('tr'), label, count }
}

function createPassiveData(
  kind: PassiveKind,
  label: string,
  trainings: TrainingEntry[] = [],
  extras: Partial<
    Pick<
      PassiveNodeData,
      'orbitRadius' | 'orbitStartAngle' | 'orbitOrder' | 'masteryId' | 'iconColor'
    >
  > = {},
): PassiveNodeData {
  return {
    label,
    kind,
    trainings,
    iconColor: extras.iconColor ?? DEFAULT_ICON_BY_KIND[kind],
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

function isPassiveLinkPair(source: PassiveFlowNode, target: PassiveFlowNode) {
  const a = (source.data as PassiveNodeData).kind
  const b = (target.data as PassiveNodeData).kind
  return isSatelliteKind(a) && isSatelliteKind(b)
}

function findLinkEdge(edges: Edge[], a: string, b: string) {
  return edges.find(
    (e) =>
      (e.source === a && e.target === b) || (e.source === b && e.target === a),
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
      id: danceMasteryId,
      type: 'passive',
      position: { x: 260, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData(
        'mastery',
        '댄스',
        [createTraining('안무 리허설', 3), createTraining('공연 연습', 2)],
        {
          orbitRadius: 170,
          orbitStartAngle: -90,
          orbitOrder: danceOrbitOrder,
          iconColor: NODE_ICON_COLORS[7],
        },
      ),
    },
    {
      id: 'notable-hiphop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData(
        'notable',
        '힙합',
        [createTraining('기초 스텝', 4), createTraining('프리스타일', 2)],
        { masteryId: danceMasteryId, iconColor: NODE_ICON_COLORS[5] },
      ),
    },
    {
      id: 'notable-kpop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData(
        'notable',
        'K-pop',
        [createTraining('안무 암기', 5), createTraining('포인트 안무', 3)],
        { masteryId: danceMasteryId, iconColor: NODE_ICON_COLORS[4] },
      ),
    },
    {
      id: 'small-basic',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '기본기', [createTraining('아이솔레이션', 3)], {
        masteryId: danceMasteryId,
        iconColor: NODE_ICON_COLORS[2],
      }),
    },
    {
      id: 'small-footwork',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '풋워크', [createTraining('그루브', 2)], {
        masteryId: danceMasteryId,
        iconColor: NODE_ICON_COLORS[8],
      }),
    },
    {
      id: 'small-stretch',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '스트레칭', [createTraining('유연성', 1)], {
        masteryId: danceMasteryId,
        iconColor: NODE_ICON_COLORS[11],
      }),
    },
    {
      id: gymMasteryId,
      type: 'passive',
      position: { x: 760, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData(
        'mastery',
        '운동',
        [createTraining('워밍업', 4), createTraining('쿨다운', 2)],
        {
          orbitRadius: 170,
          orbitStartAngle: -90,
          orbitOrder: gymOrbitOrder,
          iconColor: NODE_ICON_COLORS[0],
        },
      ),
    },
    {
      id: 'notable-strength',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData(
        'notable',
        '근력',
        [createTraining('스쿼트', 6), createTraining('데드리프트', 4)],
        { masteryId: gymMasteryId, iconColor: NODE_ICON_COLORS[8] },
      ),
    },
    {
      id: 'notable-cardio',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData(
        'notable',
        '유산소',
        [createTraining('러닝', 5), createTraining('사이클', 2)],
        { masteryId: gymMasteryId, iconColor: NODE_ICON_COLORS[6] },
      ),
    },
    {
      id: 'small-legs',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '하체', [createTraining('런지', 3)], {
        masteryId: gymMasteryId,
        iconColor: NODE_ICON_COLORS[1],
      }),
    },
    {
      id: 'small-back',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '등', [createTraining('풀업', 4)], {
        masteryId: gymMasteryId,
        iconColor: NODE_ICON_COLORS[14],
      }),
    },
    {
      id: 'small-run',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '러닝', [createTraining('인터벌', 2)], {
        masteryId: gymMasteryId,
        iconColor: NODE_ICON_COLORS[9],
      }),
    },
    {
      id: 'small-core',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '코어', [createTraining('플랭크', 3)], {
        masteryId: gymMasteryId,
        iconColor: NODE_ICON_COLORS[3],
      }),
    },
  ]

  return withMasteryDragFlags(
    layoutMasteryOrbit(layoutMasteryOrbit(base, danceMasteryId), gymMasteryId),
  )
}

const seedNodes = buildSeedNodes()

const initialEdges: Edge[] = [
  passiveLinkEdge('small-basic', 'small-legs'),
  passiveLinkEdge('notable-hiphop', 'notable-strength'),
]

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(danceMasteryId)
  const [addKind, setAddKind] = useState<PassiveKind>('small')

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
    if (!isSatelliteKind(selectedData.kind)) return []
    return edges
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((e) => {
        const peerId = e.source === selectedNode.id ? e.target : e.source
        const peer = nodes.find((n) => n.id === peerId)
        const peerData = peer?.data as PassiveNodeData | undefined
        return {
          edgeId: e.id,
          peerId,
          peerLabel: peerData?.label ?? peerId,
          peerKind: peerData?.kind ?? 'small',
        }
      })
  }, [edges, nodes, selectedData, selectedNode])

  // Drop any leftover same-orbit links (orbit membership is visual only).
  useEffect(() => {
    setEdges((eds) => {
      const next = eds.filter((e) => {
        const source = nodes.find((n) => n.id === e.source)
        const target = nodes.find((n) => n.id === e.target)
        if (!source || !target) return true
        return !shareSameOrbit(
          { data: source.data as PassiveNodeData },
          { data: target.data as PassiveNodeData },
        )
      })
      return next.length === eds.length ? eds : next
    })
  }, [nodes, setEdges])

  const linkCandidates = useMemo(() => {
    if (!selectedNode || !selectedData) return []
    if (!isSatelliteKind(selectedData.kind)) return []
    const linked = new Set(selectedLinks.map((l) => l.peerId))
    return nodes
      .filter((n) => {
        const d = n.data as PassiveNodeData
        if (n.id === selectedNode.id || linked.has(n.id) || !isSatelliteKind(d.kind)) return false
        // No links inside the same mastery orbit.
        if (shareSameOrbit({ data: selectedData }, { data: d })) return false
        return true
      })
      .map((n) => {
        const d = n.data as PassiveNodeData
        return { id: n.id, label: d.label, kind: d.kind }
      })
  }, [nodes, selectedData, selectedLinks, selectedNode])

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target || source.id === target.id) return false
      if (resolveMasteryPair(source, target) !== null) return true
      if (!isPassiveLinkPair(source, target)) return false
      return !shareSameOrbit(
        { data: source.data as PassiveNodeData },
        { data: target.data as PassiveNodeData },
      )
    },
    [nodes],
  )

  const attachSatellite = useCallback((masteryId: string, satelliteId: string) => {
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
      return withMasteryDragFlags(next)
    })
  }, [setNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target) return

      const masteryPair = resolveMasteryPair(source, target)
      if (masteryPair) {
        attachSatellite(masteryPair.mastery.id, masteryPair.satellite.id)
        return
      }

      if (!isPassiveLinkPair(source, target)) return

      if (
        shareSameOrbit(
          { data: source.data as PassiveNodeData },
          { data: target.data as PassiveNodeData },
        )
      ) {
        return
      }

      setEdges((eds) => {
        const existing = findLinkEdge(eds, source.id, target.id)
        if (existing) {
          return eds.filter((e) => e.id !== existing.id)
        }
        return [...eds, passiveLinkEdge(source.id, target.id)]
      })
    },
    [attachSatellite, nodes, setEdges],
  )

  const detachFromMastery = useCallback(
    (satelliteId: string) => {
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
        if (!oldMasteryId) return withMasteryDragFlags(next)
        return withMasteryDragFlags(layoutMasteryOrbit(next, oldMasteryId))
      })
    },
    [setNodes],
  )

  const changeOrbitRadius = useCallback(
    (masteryId: string, radius: number) => {
      const clamped = Math.min(480, Math.max(80, radius))
      setNodes((nds) => {
        const next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          return { ...node, data: { ...data, orbitRadius: clamped } }
        })
        return withMasteryDragFlags(layoutMasteryOrbit(next, masteryId))
      })
    },
    [setNodes],
  )

  const changeOrbitStartAngle = useCallback(
    (masteryId: string, degrees: number) => {
      const snapped = snapOrbitAngle(degrees)
      setNodes((nds) => {
        const next = nds.map((node) => {
          if (node.id !== masteryId) return node
          const data = node.data as PassiveNodeData
          return { ...node, data: { ...data, orbitStartAngle: snapped } }
        })
        return withMasteryDragFlags(layoutMasteryOrbit(next, masteryId))
      })
    },
    [setNodes],
  )

  const changeOrbitOrder = useCallback(
    (masteryId: string, satelliteId: string, order1Based: number) => {
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
        return withMasteryDragFlags(layoutMasteryOrbit(next, masteryId))
      })
    },
    [setNodes],
  )

  const removeLink = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    },
    [setEdges],
  )

  const addLink = useCallback(
    (peerId: string) => {
      if (!selectedId) return
      const source = nodes.find((n) => n.id === selectedId)
      const target = nodes.find((n) => n.id === peerId)
      if (!source || !target || !isPassiveLinkPair(source, target)) return
      if (
        shareSameOrbit(
          { data: source.data as PassiveNodeData },
          { data: target.data as PassiveNodeData },
        )
      ) {
        return
      }
      setEdges((eds) => {
        if (findLinkEdge(eds, source.id, target.id)) return eds
        return [...eds, passiveLinkEdge(source.id, target.id)]
      })
    },
    [nodes, selectedId, setEdges],
  )

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    setSelectedId(selected[0]?.id ?? null)
  }, [])

  const updateNodeData = useCallback(
    (nodeId: string, updater: (data: PassiveNodeData) => PassiveNodeData) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: updater(node.data as PassiveNodeData) }
            : node,
        ),
      )
    },
    [setNodes],
  )

  const changeKind = useCallback(
    (nodeId: string, kind: PassiveKind) => {
      const current = nodes.find((n) => n.id === nodeId)
      if (!current) return
      const prev = current.data as PassiveNodeData
      const affectedMasteries = new Set<string>()

      if (prev.masteryId) affectedMasteries.add(prev.masteryId)
      if (prev.kind === 'mastery' && kind !== 'mastery') affectedMasteries.add(nodeId)

      setNodes((nds) => {
        let next = nds.map((node) => {
          const data = node.data as PassiveNodeData

          if (node.id === nodeId) {
            const nextData: PassiveNodeData = {
              label: data.label,
              kind,
              trainings: data.trainings,
              iconColor: data.iconColor ?? DEFAULT_ICON_BY_KIND[kind],
              ...(kind === 'mastery'
                ? {
                    orbitRadius: data.orbitRadius ?? DEFAULT_ORBIT_RADIUS,
                    orbitStartAngle: data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE,
                    orbitOrder: [],
                    masteryId: null,
                  }
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
        return withMasteryDragFlags(next)
      })

      setEdges((eds) =>
        eds.filter((e) => {
          if (e.source === nodeId || e.target === nodeId) {
            if (kind === 'mastery' || prev.kind === 'mastery') return false
          }
          const sourceNode =
            e.source === nodeId
              ? { data: { kind } }
              : nodes.find((n) => n.id === e.source)
          const targetNode =
            e.target === nodeId
              ? { data: { kind } }
              : nodes.find((n) => n.id === e.target)
          if (!sourceNode || !targetNode) return false
          const sk =
            e.source === nodeId ? kind : (sourceNode.data as PassiveNodeData).kind
          const tk =
            e.target === nodeId ? kind : (targetNode.data as PassiveNodeData).kind
          return isSatelliteKind(sk) && isSatelliteKind(tk)
        }),
      )
    },
    [nodes, setEdges, setNodes],
  )

  const addNode = useCallback(() => {
    const id = uid(addKind)
    const offset = nodes.length * 18
    const newNode: PassiveFlowNode = {
      id,
      type: 'passive',
      position: { x: 280 + (offset % 220), y: 180 + (offset % 160) },
      dragHandle: '.node-drag-handle',
      draggable: true,
      data: createPassiveData(addKind, `New ${PASSIVE_KIND_LABEL[addKind]}`, []),
    }
    setNodes((nds) => withMasteryDragFlags([...nds, newNode]))
    setSelectedId(id)
  }, [addKind, nodes.length, setNodes])

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const target = nds.find((n) => n.id === nodeId)
        if (!target) return nds
        const data = target.data as PassiveNodeData
        const affected = new Set<string>()
        if (data.kind === 'mastery') affected.add(nodeId)
        if (data.masteryId) affected.add(data.masteryId)

        let next = nds
          .filter((n) => n.id !== nodeId)
          .map((node) => {
            const d = node.data as PassiveNodeData
            if (d.masteryId === nodeId) {
              return { ...node, data: { ...d, masteryId: null }, draggable: true }
            }
            if (d.kind === 'mastery' && (d.orbitOrder ?? []).includes(nodeId)) {
              return {
                ...node,
                data: {
                  ...d,
                  orbitOrder: (d.orbitOrder ?? []).filter((id) => id !== nodeId),
                },
              }
            }
            return node
          })

        for (const masteryId of affected) {
          if (masteryId === nodeId) continue
          next = layoutMasteryOrbit(next, masteryId)
        }
        return withMasteryDragFlags(next)
      })
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setSelectedId((cur) => (cur === nodeId ? null : cur))
    },
    [setEdges, setNodes],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    deleteNode(selectedId)
  }, [deleteNode, selectedId])

  const onPaneClick = useCallback(() => setSelectedId(null), [])

  const onNodeClick = useCallback((_: ReactMouseEvent, node: Node) => {
    setSelectedId(node.id)
  }, [])

  const onNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      const data = node.data as PassiveNodeData
      if (data.kind !== 'mastery') return
      setNodes((nds) => {
        const synced = nds.map((n) =>
          n.id === node.id ? { ...n, position: node.position } : n,
        )
        return withMasteryDragFlags(layoutMasteryOrbit(synced, node.id))
      })
    },
    [setNodes],
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

              return withMasteryDragFlags(next)
            }

            const order = orbitOrderByDropAngle(next, currentMasteryId, satellite.id)
            next = next.map((n) => {
              if (n.id !== currentMasteryId) return n
              const d = n.data as PassiveNodeData
              return { ...n, data: { ...d, orbitOrder: order } }
            })
            return withMasteryDragFlags(layoutMasteryOrbit(next, currentMasteryId))
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
          return withMasteryDragFlags(layoutMasteryOrbit(next, nearest.mastery.id))
        }

        return withMasteryDragFlags(next)
      })
    },
    [setNodes],
  )

  return (
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
        </div>
      </header>

      <main className="workspace">
        <section className="canvas-pane" aria-label="Passive tree canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={onSelectionChange}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            connectionLineType={ConnectionLineType.Straight}
            connectionLineStyle={{ stroke: '#7f8fa0', strokeWidth: 2 }}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              type: 'center',
              style: { stroke: '#7f8fa0', strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1c2430" />
            <Controls position="top-left" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const d = node.data as PassiveNodeData | undefined
                return d?.iconColor ?? DEFAULT_ICON_BY_KIND[d?.kind ?? 'small']
              }}
              maskColor="rgba(8, 12, 16, 0.7)"
            />
          </ReactFlow>

          <p className="canvas-hint">
            노드를 드래그해 오르빗 근처에 놓으면 포함되고, 바깥으로 빼면 해제됩니다.
            같은 오르빗끼리는 링크 없음 · 호버 시 요약 툴팁.
          </p>
        </section>

        <Inspector
          nodeId={selectedNode?.id ?? null}
          data={selectedData}
          masteryLabel={selectedMasteryLabel}
          orbitMembers={orbitMembers}
          links={selectedLinks}
          linkCandidates={linkCandidates}
          onRename={(nodeId, label) => updateNodeData(nodeId, (d) => ({ ...d, label }))}
          onChangeKind={changeKind}
          onChangeIconColor={(nodeId, iconColor) =>
            updateNodeData(nodeId, (d) => ({ ...d, iconColor }))
          }
          onChangeOrbitRadius={changeOrbitRadius}
          onChangeOrbitStartAngle={changeOrbitStartAngle}
          onChangeOrbitOrder={changeOrbitOrder}
          onDetachFromMastery={detachFromMastery}
          onRemoveLink={removeLink}
          onAddLink={addLink}
          onAddTraining={(nodeId) =>
            updateNodeData(nodeId, (d) => ({
              ...d,
              trainings: [...d.trainings, createTraining(`Session ${d.trainings.length + 1}`, 1)],
            }))
          }
          onUpdateTraining={(nodeId, trainingId, patch) =>
            updateNodeData(nodeId, (d) => ({
              ...d,
              trainings: d.trainings.map((t) =>
                t.id === trainingId ? { ...t, ...patch } : t,
              ),
            }))
          }
          onRemoveTraining={(nodeId, trainingId) =>
            updateNodeData(nodeId, (d) => ({
              ...d,
              trainings: d.trainings.filter((t) => t.id !== trainingId),
            }))
          }
          onDeleteNode={deleteNode}
        />
      </main>
    </div>
  )
}

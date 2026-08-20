import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
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
import { PASSIVE_KIND_LABEL } from './types'
import {
  DEFAULT_ORBIT_RADIUS,
  isSatelliteKind,
  layoutMasteryOrbit,
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
  extras: Partial<Pick<PassiveNodeData, 'orbitRadius' | 'masteryId'>> = {},
): PassiveNodeData {
  return {
    label,
    kind,
    trainings,
    ...(kind === 'mastery'
      ? { orbitRadius: extras.orbitRadius ?? DEFAULT_ORBIT_RADIUS }
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

function isNotableSmallPair(source: PassiveFlowNode, target: PassiveFlowNode) {
  const a = (source.data as PassiveNodeData).kind
  const b = (target.data as PassiveNodeData).kind
  return (a === 'notable' && b === 'small') || (a === 'small' && b === 'notable')
}

function edgeTouchesMastery(edge: Edge, nodes: PassiveFlowNode[]) {
  const source = nodes.find((n) => n.id === edge.source)
  const target = nodes.find((n) => n.id === edge.target)
  return (
    (source?.data as PassiveNodeData | undefined)?.kind === 'mastery' ||
    (target?.data as PassiveNodeData | undefined)?.kind === 'mastery'
  )
}

const seedMasteryId = 'mastery-a'
const seedNodes: PassiveFlowNode[] = withMasteryDragFlags(
  layoutMasteryOrbit(
    [
      {
        id: seedMasteryId,
        type: 'passive',
        position: { x: 420, y: 280 },
        dragHandle: '.node-drag-handle',
        data: createPassiveData('mastery', 'Combo Mastery', [
          createTraining('Slow reps', 4),
          createTraining('Live pace', 2),
        ], { orbitRadius: 180 }),
      },
      {
        id: 'notable-a',
        type: 'passive',
        position: { x: 0, y: 0 },
        dragHandle: '.node-drag-handle',
        data: createPassiveData('notable', 'Core Focus', [
          createTraining('Baseline', 3),
          createTraining('Review', 1),
        ], { masteryId: seedMasteryId }),
      },
      {
        id: 'small-a',
        type: 'passive',
        position: { x: 0, y: 0 },
        dragHandle: '.node-drag-handle',
        data: createPassiveData('small', 'Footwork', [createTraining('Drill', 5)], {
          masteryId: seedMasteryId,
        }),
      },
      {
        id: 'small-b',
        type: 'passive',
        position: { x: 0, y: 0 },
        dragHandle: '.node-drag-handle',
        data: createPassiveData('small', 'Timing', [createTraining('Metronome', 2)], {
          masteryId: seedMasteryId,
        }),
      },
    ],
    seedMasteryId,
  ),
)

const initialEdges: Edge[] = [
  passiveLinkEdge('notable-a', 'small-a'),
  passiveLinkEdge('notable-a', 'small-b'),
]

const kindAccent: Record<PassiveKind, string> = {
  small: '#8b9aa8',
  notable: '#d4a24c',
  mastery: '#3db8a8',
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(seedMasteryId)
  const [addKind, setAddKind] = useState<PassiveKind>('small')

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const selectedMasteryLabel = useMemo(() => {
    const masteryId = (selectedNode?.data as PassiveNodeData | undefined)?.masteryId
    if (!masteryId) return null
    const mastery = nodes.find((n) => n.id === masteryId)
    return (mastery?.data as PassiveNodeData | undefined)?.label ?? masteryId
  }, [nodes, selectedNode])

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target || source.id === target.id) return false
      // Orbit attach (no edge) OR Notable↔Small tree link
      return (
        resolveMasteryPair(source, target) !== null || isNotableSmallPair(source, target)
      )
    },
    [nodes],
  )

  const attachSatellite = useCallback((masteryId: string, satelliteId: string) => {
    setNodes((nds) => {
      const oldMasteryIds = new Set<string>()
      const updated = nds.map((node) => {
        const data = node.data as PassiveNodeData
        if (node.id !== satelliteId) return node
        if (data.masteryId && data.masteryId !== masteryId) {
          oldMasteryIds.add(data.masteryId)
        }
        return {
          ...node,
          data: { ...data, masteryId },
          draggable: false,
        }
      })

      // Keep newly attached satellite last so it takes the next orbit slot.
      const satellite = updated.find((n) => n.id === satelliteId)
      const rest = updated.filter((n) => n.id !== satelliteId)
      let laidOut = satellite ? [...rest, satellite] : updated
      laidOut = layoutMasteryOrbit(laidOut, masteryId)
      for (const oldId of oldMasteryIds) {
        laidOut = layoutMasteryOrbit(laidOut, oldId)
      }
      return withMasteryDragFlags(laidOut)
    })
  }, [setNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((n) => n.id === connection.source)
      const target = nodes.find((n) => n.id === connection.target)
      if (!source || !target) return

      const masteryPair = resolveMasteryPair(source, target)
      if (masteryPair) {
        // PoB-style: Mastery membership is orbit-only (no edge line).
        attachSatellite(masteryPair.mastery.id, masteryPair.satellite.id)
        return
      }

      if (!isNotableSmallPair(source, target)) return

      setEdges((eds) => {
        const exists = eds.some(
          (e) =>
            (e.source === source.id && e.target === target.id) ||
            (e.source === target.id && e.target === source.id),
        )
        if (exists) return eds
        return [
          ...eds.filter((e) => !edgeTouchesMastery(e, nodes)),
          passiveLinkEdge(source.id, target.id),
        ]
      })
    },
    [attachSatellite, nodes, setEdges],
  )

  const detachFromMastery = useCallback(
    (satelliteId: string) => {
      setNodes((nds) => {
        let oldMasteryId: string | null = null
        const next = nds.map((node) => {
          if (node.id !== satelliteId) return node
          const data = node.data as PassiveNodeData
          oldMasteryId = data.masteryId ?? null
          return {
            ...node,
            data: { ...data, masteryId: null },
            draggable: true,
          }
        })
        if (!oldMasteryId) return withMasteryDragFlags(next)
        return withMasteryDragFlags(layoutMasteryOrbit(next, oldMasteryId))
      })
    },
    [setNodes],
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
              ...(kind === 'mastery'
                ? { orbitRadius: data.orbitRadius ?? DEFAULT_ORBIT_RADIUS, masteryId: null }
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

          return node
        })

        for (const masteryId of affectedMasteries) {
          if (prev.kind === 'mastery' && kind !== 'mastery' && masteryId === nodeId) continue
          next = layoutMasteryOrbit(next, masteryId)
        }
        return withMasteryDragFlags(next)
      })

      // Drop invalid edges after kind changes (Mastery never has tree links;
      // tree links are Notable↔Small only).
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
          return (
            (sk === 'notable' && tk === 'small') || (sk === 'small' && tk === 'notable')
          )
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
      data: createPassiveData(addKind, `New ${PASSIVE_KIND_LABEL[addKind]}`, [
        createTraining('Session 1', 1),
      ]),
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
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#3a4654" />
            <Controls position="top-left" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const kind = (node.data as PassiveNodeData | undefined)?.kind ?? 'small'
                return kindAccent[kind]
              }}
              maskColor="rgba(8, 12, 16, 0.7)"
            />
          </ReactFlow>

          <p className="canvas-hint">
            Tree links are Notable↔Small only. Connect Small/Notable to a Mastery to join its orbit
            (no line — PoB style). One Mastery per passive.
          </p>
        </section>

        <Inspector
          nodeId={selectedNode?.id ?? null}
          data={(selectedNode?.data as PassiveNodeData | undefined) ?? null}
          masteryLabel={selectedMasteryLabel}
          onRename={(nodeId, label) => updateNodeData(nodeId, (d) => ({ ...d, label }))}
          onChangeKind={changeKind}
          onChangeOrbitRadius={changeOrbitRadius}
          onDetachFromMastery={detachFromMastery}
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

import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { PassiveNode, type PassiveFlowNode } from './components/PassiveNode'
import { Inspector } from './components/Inspector'
import type { PassiveKind, PassiveNodeData, TrainingEntry } from './types'
import { PASSIVE_KIND_LABEL } from './types'
import './App.css'

const nodeTypes = { passive: PassiveNode }

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
): PassiveNodeData {
  return { label, kind, trainings }
}

const initialNodes: PassiveFlowNode[] = [
  {
    id: 'root',
    type: 'passive',
    position: { x: 360, y: 260 },
    data: createPassiveData('notable', 'Core Focus', [
      createTraining('Baseline', 3),
      createTraining('Review', 1),
    ]),
  },
  {
    id: 'small-a',
    type: 'passive',
    position: { x: 180, y: 140 },
    data: createPassiveData('small', 'Footwork', [createTraining('Drill', 5)]),
  },
  {
    id: 'small-b',
    type: 'passive',
    position: { x: 540, y: 140 },
    data: createPassiveData('small', 'Timing', [createTraining('Metronome', 2)]),
  },
  {
    id: 'mastery-a',
    type: 'passive',
    position: { x: 360, y: 430 },
    data: createPassiveData('mastery', 'Combo Mastery', [
      createTraining('Slow reps', 4),
      createTraining('Live pace', 2),
    ]),
  },
]

const initialEdges: Edge[] = [
  {
    id: 'e-root-a',
    source: 'root',
    target: 'small-a',
    sourceHandle: 'center',
    targetHandle: 'center-target',
  },
  {
    id: 'e-root-b',
    source: 'root',
    target: 'small-b',
    sourceHandle: 'center',
    targetHandle: 'center-target',
  },
  {
    id: 'e-root-m',
    source: 'root',
    target: 'mastery-a',
    sourceHandle: 'center',
    targetHandle: 'center-target',
  },
]

const kindAccent: Record<PassiveKind, string> = {
  small: '#8b9aa8',
  notable: '#d4a24c',
  mastery: '#3db8a8',
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>('root')
  const [addKind, setAddKind] = useState<PassiveKind>('small')

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            sourceHandle: connection.sourceHandle ?? 'center',
            targetHandle: connection.targetHandle ?? 'center-target',
          },
          eds,
        ),
      )
    },
    [setEdges],
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

  const addNode = useCallback(() => {
    const id = uid(addKind)
    const offset = nodes.length * 18
    const newNode: PassiveFlowNode = {
      id,
      type: 'passive',
      position: { x: 280 + (offset % 220), y: 180 + (offset % 160) },
      data: createPassiveData(addKind, `New ${PASSIVE_KIND_LABEL[addKind]}`, [
        createTraining('Session 1', 1),
      ]),
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedId(id)
  }, [addKind, nodes.length, setNodes])

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
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

  const onNodeClick = useCallback((_: MouseEvent, node: Node) => {
    setSelectedId(node.id)
  }, [])

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
            onSelectionChange={onSelectionChange}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              type: 'straight',
              style: { stroke: '#7f8fa0', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#7f8fa0', width: 16, height: 16 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#3a4654" />
            <Controls />
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
            Drag from a node center to connect. Select a node to manage trainings. Delete / Backspace
            removes selected nodes.
          </p>
        </section>

        <Inspector
          nodeId={selectedNode?.id ?? null}
          data={(selectedNode?.data as PassiveNodeData | undefined) ?? null}
          onRename={(nodeId, label) => updateNodeData(nodeId, (d) => ({ ...d, label }))}
          onChangeKind={(nodeId, kind) => updateNodeData(nodeId, (d) => ({ ...d, kind }))}
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

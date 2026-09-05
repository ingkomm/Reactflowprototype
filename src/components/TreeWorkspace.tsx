import { useCallback, useRef, type DragEvent, type MouseEvent as ReactMouseEvent, type RefObject, type Dispatch, type SetStateAction } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ConnectionMode,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  type OnSelectionChangeFunc,
  BackgroundVariant,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnNodeDrag,
  type EdgeMouseHandler,
} from '@xyflow/react'

import { PassiveNode, type PassiveFlowNode } from './PassiveNode'
import { CenterEdge } from './CenterEdge'
import { NotableEdge } from './NotableEdge'
import { OrbitEdge } from './OrbitEdge'
import { Inspector, type OrbitMember } from './Inspector'
import { NodeLibrary } from './NodeLibrary'
import { PowerProvider } from '../PowerContext'
import { VoidHighlightProvider } from '../VoidHighlightContext'
import { OrbitRotateController } from './OrbitRotateController'
import { MiniMapCircleNode } from './MiniMapCircleNode'
import { ZoomKeyboardController } from './ZoomKeyboardController'
import type { SymbolEditorKind } from '../librarySymbols'
import type { PassiveKind, PassiveNodeData, OrbitTier, OrbitTierCount, StageData } from '../types'
import { DEFAULT_ICON_BY_KIND } from '../types'
import type { NodeTemplatePayload } from '../nodeTemplate'
import { decodePalettePayload, PALETTE_MIME } from '../nodeTemplate'
import { NODE_SIZE } from '../orbit'
import type { PowerFlowMeta } from '../power'
import { PinnedVideoPopup } from './PinnedVideoPopup'
import { VideoPinProvider } from '../VideoPinContext'

const nodeTypes = { passive: PassiveNode }
const edgeTypes = { center: CenterEdge, orbit: OrbitEdge, notable: NotableEdge }

const connectionLineStyle = {
  stroke: 'color-mix(in srgb, #9aa8b5 22%, transparent)',
  strokeWidth: 1,
}

const defaultEdgeOptions = {
  type: 'center' as const,
  style: {
    stroke: 'color-mix(in srgb, #9aa8b5 22%, transparent)',
    strokeWidth: 1,
  },
  zIndex: 0,
}

export type TreeWorkspaceProps = {
  inspectorWidth: number
  flowNodes: PassiveFlowNode[]
  edges: Edge[]
  poweredIds: Set<string>
  powerFlowMeta: PowerFlowMeta
  voidHighlightEnabled: boolean
  gridSnapScale?: number
  selectedNode: PassiveFlowNode | null
  selectedData: PassiveNodeData | null
  masteryLabel: string | null
  masteryTierCount: OrbitTierCount | null
  orbitMembers: OrbitMember[]
  focusLogId?: string | null
  onFocusLogConsumed?: () => void
  onOpenSymbolEditor: (kind: SymbolEditorKind) => void
  onCreateFromTemplate: (template: NodeTemplatePayload, flowPosition: { x: number; y: number }) => void
  onNodesChange: OnNodesChange<PassiveFlowNode>
  onEdgesChange: OnEdgesChange
  onConnect: (connection: Connection) => void
  isValidConnection: IsValidConnection
  onSelectionChange: OnSelectionChangeFunc
  onPaneClick: () => void
  onNodeClick: NodeMouseHandler
  onNodeContextMenu?: NodeMouseHandler
  pinnedVideoNodeIds: string[]
  onClosePinnedVideo: (nodeId: string) => void
  onPinnedLogSelect?: (nodeId: string, logId: string) => void
  onNodeDragStart: OnNodeDrag<PassiveFlowNode>
  onNodeDrag: OnNodeDrag<PassiveFlowNode>
  onNodeDragStop: OnNodeDrag<PassiveFlowNode>
  onEdgeDoubleClick: EdgeMouseHandler
  onInspectorResizeStart: (event: ReactMouseEvent) => void
  commit: () => void
  selectedIdRef: RefObject<string | null>
  setNodes: Dispatch<SetStateAction<PassiveFlowNode[]>>
  stack: (nodes: PassiveFlowNode[]) => PassiveFlowNode[]
  restoreFlowSelection: (id: string) => void
  onRename: (nodeId: string, label: string) => void
  onChangeKind: (nodeId: string, kind: PassiveKind) => void
  onChangeSymbolId: (nodeId: string, symbolId: string) => void
  onChangeStages: (nodeId: string, stages: StageData[]) => void
  onChangeMarkdown: (nodeId: string, markdown: string) => void
  onChangeConnectEnabled: (nodeId: string, enabled: boolean) => void
  onChangeOrbitTierCount: (masteryId: string, tierCount: OrbitTierCount) => void
  onChangeSatelliteOrbitTier: (satelliteId: string, tier: OrbitTier) => void
  onChangeOrbitStartAngle: (masteryId: string, tier: OrbitTier, degrees: number) => void
  onChangeOrbitOrder: (masteryId: string, satelliteId: string, order1Based: number) => void
  onChangeOrbitLocked: (masteryId: string, locked: boolean) => void
  onChangeOrbitCapacity: (masteryId: string, tier: OrbitTier, capacity: number) => void
  onDetachFromMastery: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}

/** Stable shell for canvas + library + inspector (must not be nested inside App). */
export function TreeWorkspace({
  inspectorWidth,
  flowNodes,
  edges,
  poweredIds,
  powerFlowMeta,
  voidHighlightEnabled,
  gridSnapScale = 20,
  selectedNode,
  selectedData,
  masteryLabel,
  masteryTierCount,
  orbitMembers,
  focusLogId,
  onFocusLogConsumed,
  onOpenSymbolEditor,
  onCreateFromTemplate,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onSelectionChange,
  onPaneClick,
  onNodeClick,
  onNodeContextMenu,
  pinnedVideoNodeIds,
  onClosePinnedVideo,
  onPinnedLogSelect,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  onEdgeDoubleClick,
  onInspectorResizeStart,
  commit,
  selectedIdRef,
  setNodes,
  stack,
  restoreFlowSelection,
  onRename,
  onChangeKind,
  onChangeSymbolId,
  onChangeStages,
  onChangeMarkdown,
  onChangeConnectEnabled,
  onChangeOrbitTierCount,
  onChangeSatelliteOrbitTier,
  onChangeOrbitStartAngle,
  onChangeOrbitOrder,
  onChangeOrbitLocked,
  onChangeOrbitCapacity,
  onDetachFromMastery,
  onDeleteNode,
}: TreeWorkspaceProps) {
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const flowPositionForKind = useCallback(
    (screen: { x: number; y: number }, kind: PassiveKind) => {
      const center = screenToFlowPosition(screen)
      const size = NODE_SIZE[kind]
      return { x: center.x - size / 2, y: center.y - size / 2 }
    },
    [screenToFlowPosition],
  )

  const placeTemplateAtCenter = useCallback(
    (template: NodeTemplatePayload) => {
      const bounds = canvasWrapperRef.current?.getBoundingClientRect()
      if (!bounds) return
      const kind = template.kind
      onCreateFromTemplate(
        template,
        flowPositionForKind(
          { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
          kind,
        ),
      )
    },
    [flowPositionForKind, onCreateFromTemplate],
  )

  const onCanvasDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onCanvasDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const template = decodePalettePayload(event.dataTransfer.getData(PALETTE_MIME))
      if (!template) return
      const kind = template.kind
      onCreateFromTemplate(
        template,
        flowPositionForKind({ x: event.clientX, y: event.clientY }, kind),
      )
    },
    [flowPositionForKind, onCreateFromTemplate],
  )

  const minimapNodeColor = useCallback(
    (node: Node) => {
      const d = node.data as PassiveNodeData | undefined
      if (!d?.kind) return '#9B9A97'
      return DEFAULT_ICON_BY_KIND[d.kind]
    },
    [],
  )

  return (
    <main
      className="workspace"
      style={{ gridTemplateColumns: `168px minmax(0, 1fr) ${inspectorWidth}px` }}
    >
      <NodeLibrary onPlaceTemplate={placeTemplateAtCenter} onOpenSymbolEditor={onOpenSymbolEditor} />

      <section ref={canvasWrapperRef} className="canvas-pane" aria-label="Passive tree canvas">
        <PowerProvider poweredIds={poweredIds} flowMeta={powerFlowMeta}>
          <VoidHighlightProvider enabled={voidHighlightEnabled}>
            <VideoPinProvider pinnedNodeIds={pinnedVideoNodeIds}>
            <ReactFlow
              nodes={flowNodes}
              edges={edges}
              minZoom={0.08}
              maxZoom={2.5}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              onPaneClick={onPaneClick}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onEdgeDoubleClick={onEdgeDoubleClick}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
              zoomOnDoubleClick={false}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={36}
              connectionLineType={ConnectionLineType.Straight}
              connectionLineStyle={connectionLineStyle}
              fitView
              elevateNodesOnSelect={false}
              deleteKeyCode={['Backspace', 'Delete']}
              defaultEdgeOptions={defaultEdgeOptions}
              proOptions={{ hideAttribution: false }}
            >
              <OrbitRotateController
                commit={commit}
                selectedIdRef={selectedIdRef}
                setNodes={setNodes}
                stack={stack}
                restoreSelection={restoreFlowSelection}
              />
              <ZoomKeyboardController />
              <Background variant={BackgroundVariant.Dots} gap={gridSnapScale} size={1.2} color="#1c2430" />
              <Controls position="top-left" />
              <MiniMap
                pannable
                zoomable
                nodeComponent={MiniMapCircleNode}
                nodeColor={minimapNodeColor}
                maskColor="rgba(8, 12, 16, 0.7)"
              />
            </ReactFlow>
            {pinnedVideoNodeIds.map((nodeId, index) => (
              <PinnedVideoPopup
                key={nodeId}
                pinnedNodeId={nodeId}
                stackIndex={index}
                containerRef={canvasWrapperRef}
                onClose={onClosePinnedVideo}
                onSelectLog={onPinnedLogSelect}
              />
            ))}
            </VideoPinProvider>
          </VoidHighlightProvider>
        </PowerProvider>

        <p className="canvas-hint">
          Root 미연결 링크는 비활성화(삭제 안 함) · Notable 우클릭 Log Viewer · 오르빗 용량 1–24
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
          masteryLabel={masteryLabel}
          masteryTierCount={masteryTierCount}
          orbitMembers={orbitMembers}
          focusLogId={focusLogId}
          onFocusLogConsumed={onFocusLogConsumed}
          onRename={onRename}
          onChangeKind={onChangeKind}
          onChangeSymbolId={onChangeSymbolId}
          onChangeStages={onChangeStages}
          onChangeMarkdown={onChangeMarkdown}
          onChangeConnectEnabled={onChangeConnectEnabled}
          onChangeOrbitTierCount={onChangeOrbitTierCount}
          onChangeSatelliteOrbitTier={onChangeSatelliteOrbitTier}
          onChangeOrbitStartAngle={onChangeOrbitStartAngle}
          onChangeOrbitOrder={onChangeOrbitOrder}
          onChangeOrbitLocked={onChangeOrbitLocked}
          onChangeOrbitCapacity={onChangeOrbitCapacity}
          onDetachFromMastery={onDetachFromMastery}
          onDeleteNode={onDeleteNode}
        />
      </div>
    </main>
  )
}

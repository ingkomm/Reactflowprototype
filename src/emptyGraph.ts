import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import { INITIAL_NODE_ID } from './types'
import { connectPositionForInitialHub } from './initialHub'
import { withMasteryDragFlags } from './orbit'
import { createPassiveData, rootSocketLinkEdge } from './graphFactory'

export const EMPTY_CONNECT_IDS = ['connect-top', 'connect-br', 'connect-bl'] as const

const INITIAL_POSITION = { x: 80, y: 80 }

export function buildEmptyNodes(): PassiveFlowNode[] {
  const nodes: PassiveFlowNode[] = [
    {
      id: INITIAL_NODE_ID,
      type: 'passive',
      position: INITIAL_POSITION,
      dragHandle: '.node-drag-handle',
      draggable: true,
      data: createPassiveData('initial', 'Root', { stages: [], symbolId: 'default' }),
    },
    ...EMPTY_CONNECT_IDS.map((id, slot) => ({
      id,
      type: 'passive' as const,
      position: connectPositionForInitialHub(INITIAL_POSITION, slot as 0 | 1 | 2),
      dragHandle: '.node-drag-handle',
      draggable: true,
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        initialSlot: slot as 0 | 1 | 2,
        symbolId: 'default',
      }),
    })),
  ]
  return withMasteryDragFlags(nodes)
}

export function buildEmptyEdges(): Edge[] {
  return EMPTY_CONNECT_IDS.map((connectId, slot) =>
    rootSocketLinkEdge(INITIAL_NODE_ID, connectId, slot as 0 | 1 | 2),
  )
}

export const EMPTY_GRAPH_NODES = buildEmptyNodes()
export const EMPTY_GRAPH_EDGES = buildEmptyEdges()

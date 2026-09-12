import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import { INITIAL_NODE_ID } from './types'
import { connectPositionForInitialHub, rootTopLeftAtOrigin } from './initialHub'
import { withMasteryDragFlags } from './orbit'
import { createPassiveData, rootSocketLinkEdge } from './graphFactory'

export const EMPTY_CONNECT_IDS = ['connect-top', 'connect-br', 'connect-bl'] as const
/** Default Connect sockets keep 120° spacing on the 6-slot rim: top / BR / BL. */
export const EMPTY_CONNECT_SLOTS = [0, 2, 4] as const

const INITIAL_POSITION = rootTopLeftAtOrigin()

export function buildEmptyNodes(): PassiveFlowNode[] {
  const nodes: PassiveFlowNode[] = [
    {
      id: INITIAL_NODE_ID,
      type: 'passive',
      position: INITIAL_POSITION,
      dragHandle: '.node-drag-handle',
      draggable: false,
      data: createPassiveData('initial', 'Root', { stages: [], symbolId: 'default' }),
    },
    ...EMPTY_CONNECT_IDS.map((id, index) => {
      const slot = EMPTY_CONNECT_SLOTS[index]!
      return {
        id,
        type: 'passive' as const,
        position: connectPositionForInitialHub(INITIAL_POSITION, slot),
        dragHandle: '.node-drag-handle',
        draggable: true,
        data: createPassiveData('connect', 'Connect', {
          connectEnabled: true,
          initialSlot: slot,
          symbolId: 'default',
        }),
      }
    }),
  ]
  return withMasteryDragFlags(nodes)
}

export function buildEmptyEdges(): Edge[] {
  return EMPTY_CONNECT_IDS.map((connectId, index) =>
    rootSocketLinkEdge(INITIAL_NODE_ID, connectId, EMPTY_CONNECT_SLOTS[index]!),
  )
}

export const EMPTY_GRAPH_NODES = buildEmptyNodes()
export const EMPTY_GRAPH_EDGES = buildEmptyEdges()

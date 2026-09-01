import { describe, expect, it } from 'vitest'
import {
  computePoweredNodeIds,
  getNodesReachableFromInitial,
  isEdgeActive,
  syncEdgesReachableFromInitial,
} from './power'
import type { PassiveFlowNode } from './components/PassiveNode'
import { createPassiveData, passiveLinkEdge, rootSocketLinkEdge } from './graphFactory'
import { INITIAL_NODE_ID } from './types'

function node(id: string, kind: Parameters<typeof createPassiveData>[0], extras = {}): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x: 0, y: 0 },
    data: createPassiveData(kind, id, extras),
  }
}

describe('power', () => {
  it('deactivates unreachable center links instead of deleting them', () => {
    const nodes: PassiveFlowNode[] = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      node('small-b', 'small'),
    ]
    const edges = [passiveLinkEdge('connect-a', 'small-b')]

    const synced = syncEdgesReachableFromInitial(nodes, edges)
    expect(synced).toHaveLength(1)
    expect(isEdgeActive(synced[0]!)).toBe(false)
  })

  it('ignores inactive edges for power propagation', () => {
    const nodes: PassiveFlowNode[] = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      node('small-b', 'small'),
    ]
    const activeEdge = rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0)
    const deadEdge = {
      ...passiveLinkEdge('connect-a', 'small-b'),
      data: { active: false },
    }
    const powered = computePoweredNodeIds(nodes, [activeEdge, deadEdge])
    expect(powered.has('small-b')).toBe(false)
  })

  it('reactivates reachable edges when Root reconnects', () => {
    const nodes: PassiveFlowNode[] = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      node('small-b', 'small'),
    ]
    const rootLink = rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0)
    const branchLink = passiveLinkEdge('connect-a', 'small-b')

    const disconnected = syncEdgesReachableFromInitial(nodes, [branchLink])
    expect(isEdgeActive(disconnected[0]!)).toBe(false)

    const reconnected = syncEdgesReachableFromInitial(nodes, [rootLink, ...disconnected])
    expect(isEdgeActive(reconnected[0]!)).toBe(true)
    expect(isEdgeActive(reconnected[1]!)).toBe(true)

    const reachable = getNodesReachableFromInitial(nodes, reconnected)
    expect(reachable.has('small-b')).toBe(true)

    const powered = computePoweredNodeIds(nodes, reconnected)
    expect(powered.has('small-b')).toBe(true)
  })
})


import { describe, expect, it } from 'vitest'
import {
  classifyPassiveConnection,
  computePoweredNodeIds,
  syncEdgesReachableFromInitial,
  isEdgeActive,
} from './power'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  createPassiveData,
  passiveLinkEdge,
  rootSocketLinkEdge,
  orbitLinkEdge,
} from './graphFactory'
import { INITIAL_NODE_ID } from './types'

function n(
  id: string,
  kind: Parameters<typeof createPassiveData>[0],
  extras: Record<string, unknown> = {},
): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x: 0, y: 0 },
    data: createPassiveData(kind, id, extras as never),
  }
}

describe('shard link parity with former Small', () => {
  it('allows Connect ↔ Shard center links', () => {
    const nodes = [n('c', 'connect', { connectEnabled: true }), n('s', 'shard')]
    expect(classifyPassiveConnection(nodes[0]!, nodes[1]!, nodes)).toBe('center')
    expect(classifyPassiveConnection(nodes[1]!, nodes[0]!, nodes)).toBe('center')
  })

  it('allows free Shard ↔ Shard center links', () => {
    const nodes = [n('a', 'shard'), n('b', 'shard')]
    expect(classifyPassiveConnection(nodes[0]!, nodes[1]!, nodes)).toBe('center')
  })

  it('allows Mastery attach for Shard', () => {
    const nodes = [n('m', 'mastery'), n('s', 'shard')]
    expect(classifyPassiveConnection(nodes[0]!, nodes[1]!, nodes)).toBe('attach')
  })

  it('allows orbit links between adjacent Shards on same mastery', () => {
    const mastery = n('m', 'mastery', {
      orbitTierCount: 1,
      orbitCapacityByTier: { 1: 6 },
      orbitOrderByTier: { 1: ['s1', 's2'] },
      orbitOrder: ['s1', 's2'],
    })
    const s1 = n('s1', 'shard', { masteryId: 'm', orbitTier: 1, orbitSlot: 0 })
    const s2 = n('s2', 'shard', { masteryId: 'm', orbitTier: 1, orbitSlot: 1 })
    const nodes = [mastery, s1, s2]
    expect(classifyPassiveConnection(s1, s2, nodes)).toBe('orbit')
  })

  it('powers Shard through Connect like Small did', () => {
    const nodes = [
      n(INITIAL_NODE_ID, 'initial'),
      n('c', 'connect', { connectEnabled: true, initialSlot: 0 }),
      n('s', 'shard'),
    ]
    const edges = syncEdgesReachableFromInitial(nodes, [
      rootSocketLinkEdge(INITIAL_NODE_ID, 'c', 0),
      passiveLinkEdge('c', 's'),
    ])
    expect(edges.every(isEdgeActive)).toBe(true)
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('c')).toBe(true)
    expect(powered.has('s')).toBe(true)
  })

  it('powers orbit-adjacent Shard from a powered Shard', () => {
    const mastery = n('m', 'mastery', {
      orbitTierCount: 1,
      orbitCapacityByTier: { 1: 6 },
      orbitOrderByTier: { 1: ['s1', 's2'] },
      orbitOrder: ['s1', 's2'],
    })
    const s1 = n('s1', 'shard', { masteryId: 'm', orbitTier: 1, orbitSlot: 0 })
    const s2 = n('s2', 'shard', { masteryId: 'm', orbitTier: 1, orbitSlot: 1 })
    const connect = n('c', 'connect', { connectEnabled: true, initialSlot: 0 })
    const root = n(INITIAL_NODE_ID, 'initial')
    const nodes = [root, connect, mastery, s1, s2]
    const edges = syncEdgesReachableFromInitial(nodes, [
      rootSocketLinkEdge(INITIAL_NODE_ID, 'c', 0),
      passiveLinkEdge('c', 's1'),
      orbitLinkEdge('s1', 's2', 'm'),
    ])
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('s1')).toBe(true)
    expect(powered.has('s2')).toBe(true)
    expect(powered.has('m')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  computePoweredNodeIds,
  canTransmitPower,
  classifyPassiveConnection,
  getNodesReachableFromInitial,
  isEdgeActive,
  isValidRootPowerHandles,
  syncEdgesReachableFromInitial,
} from './power'
import type { PassiveFlowNode } from './components/PassiveNode'
import {
  createPassiveData,
  passiveLinkEdge,
  rootPowerLinkEdge,
  rootSocketLinkEdge,
} from './graphFactory'
import { INITIAL_NODE_ID } from './types'
import { createNotableStages, ensureNotableStages } from './stage'
import { createDailyLog } from './dailyLog'
import { ROOT_POWER_HANDLE_ID } from './initialHub'

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
      node('shard-b', 'shard'),
    ]
    const edges = [passiveLinkEdge('connect-a', 'shard-b')]

    const synced = syncEdgesReachableFromInitial(nodes, edges)
    expect(synced).toHaveLength(1)
    expect(isEdgeActive(synced[0]!)).toBe(false)
  })

  it('ignores inactive edges for power propagation', () => {
    const nodes: PassiveFlowNode[] = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      node('shard-b', 'shard'),
    ]
    const activeEdge = rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0)
    const deadEdge = {
      ...passiveLinkEdge('connect-a', 'shard-b'),
      data: { active: false },
    }
    const powered = computePoweredNodeIds(nodes, [activeEdge, deadEdge])
    expect(powered.has('shard-b')).toBe(false)
  })

  it('reactivates reachable edges when Root reconnects', () => {
    const nodes: PassiveFlowNode[] = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      node('shard-b', 'shard'),
    ]
    const rootLink = rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0)
    const branchLink = passiveLinkEdge('connect-a', 'shard-b')

    const disconnected = syncEdgesReachableFromInitial(nodes, [branchLink])
    expect(isEdgeActive(disconnected[0]!)).toBe(false)

    const reconnected = syncEdgesReachableFromInitial(nodes, [rootLink, ...disconnected])
    expect(isEdgeActive(reconnected[0]!)).toBe(true)
    expect(isEdgeActive(reconnected[1]!)).toBe(true)

    const reachable = getNodesReachableFromInitial(nodes, reconnected)
    expect(reachable.has('shard-b')).toBe(true)

    const powered = computePoweredNodeIds(nodes, reconnected)
    expect(powered.has('shard-b')).toBe(true)
  })

  it('relays power from Connect to another Connect and downstream shard', () => {
    const nodes = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      node('connect-b', 'connect', { connectEnabled: true }),
      node('shard-x', 'shard'),
    ]
    const edges = [
      rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0),
      passiveLinkEdge('connect-a', 'connect-b'),
      passiveLinkEdge('connect-b', 'shard-x'),
    ]
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('connect-a')).toBe(true)
    expect(powered.has('connect-b')).toBe(true)
    expect(powered.has('shard-x')).toBe(true)
  })

  it('relays Notable power independent of practice entry count', () => {
    const make = (id: string, entryCount: number) =>
      node(id, 'notable', {
        stages: createNotableStages(entryCount),
      })

    for (const entries of [0, 1, 3, 30]) {
      const nodes = [
        node(INITIAL_NODE_ID, 'initial'),
        node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
        make('notable-a', entries),
        node('shard-b', 'shard'),
      ]
      const edges = [
        rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0),
        passiveLinkEdge('connect-a', 'notable-a'),
        passiveLinkEdge('notable-a', 'shard-b'),
      ]
      expect(canTransmitPower(nodes[2]!.data)).toBe(true)
      const powered = computePoweredNodeIds(nodes, edges)
      expect(powered.has('notable-a')).toBe(true)
      expect(powered.has('shard-b')).toBe(true)
    }
  })

  it('does not let duplicate-date logs or band progress change Notable relay', () => {
    const logs = [
      createDailyLog('2026-01-01', 'a'),
      createDailyLog('2026-01-01', 'b'),
      createDailyLog('2026-01-02', 'c'),
    ]
    const stages = ensureNotableStages(createNotableStages(0, logs))
    const notable = node('notable-dup', 'notable', { stages })
    expect(canTransmitPower(notable.data)).toBe(true)

    const nodes = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-a', 'connect', { connectEnabled: true, initialSlot: 0 }),
      notable,
      node('shard-b', 'shard'),
    ]
    const edges = [
      rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-a', 0),
      passiveLinkEdge('connect-a', 'notable-dup'),
      passiveLinkEdge('notable-dup', 'shard-b'),
    ]
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('notable-dup')).toBe(true)
    expect(powered.has('shard-b')).toBe(true)
  })

  it('keeps Connect Off and Mastery non-transmit rules unchanged', () => {
    const nodes = [
      node(INITIAL_NODE_ID, 'initial'),
      node('connect-off', 'connect', { connectEnabled: false, initialSlot: 0 }),
      node('shard-b', 'shard'),
      node('mastery-m', 'mastery'),
    ]
    expect(canTransmitPower(nodes[1]!.data)).toBe(false)
    expect(canTransmitPower(nodes[3]!.data)).toBe(false)
    const edges = [
      rootSocketLinkEdge(INITIAL_NODE_ID, 'connect-off', 0),
      passiveLinkEdge('connect-off', 'shard-b'),
    ]
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('connect-off')).toBe(true)
    expect(powered.has('shard-b')).toBe(false)
  })

  it('propagates power along Notable↔Notable center links after Power Core start', () => {
    const nodes = [
      node(INITIAL_NODE_ID, 'initial'),
      node('na', 'notable', { rootOrbitTier: 1, rootOrbitSlot: 0 }),
      node('nb', 'notable'),
      node('nc', 'notable'),
    ]
    expect(classifyPassiveConnection(nodes[1]!, nodes[2]!, nodes)).toBe('center')
    const edges = [
      rootPowerLinkEdge(INITIAL_NODE_ID, 'na'),
      passiveLinkEdge('na', 'nb'),
      passiveLinkEdge('nb', 'nc'),
    ]
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('na')).toBe(true)
    expect(powered.has('nb')).toBe(true)
    expect(powered.has('nc')).toBe(true)
    const reachable = getNodesReachableFromInitial(nodes, edges)
    expect(reachable.has('nb')).toBe(true)
    expect(reachable.has('nc')).toBe(true)
  })

  it('does not auto-power Root Orbit members without a Power Core edge', () => {
    const nodes = [
      node(INITIAL_NODE_ID, 'initial'),
      node('na', 'notable', { rootOrbitTier: 1, rootOrbitSlot: 0 }),
    ]
    const powered = computePoweredNodeIds(nodes, [])
    expect(powered.has(INITIAL_NODE_ID)).toBe(true)
    expect(powered.has('na')).toBe(false)
  })

  it('powers Root Orbit members only via root-power handle', () => {
    const root = node(INITIAL_NODE_ID, 'initial')
    const member = node('na', 'notable', { rootOrbitTier: 1, rootOrbitSlot: 0 })
    const nodes = [root, member]
    expect(
      isValidRootPowerHandles(root, member, ROOT_POWER_HANDLE_ID, 'center-target'),
    ).toBe(true)
    expect(isValidRootPowerHandles(root, member, 'center', 'center-target')).toBe(false)
    expect(isValidRootPowerHandles(root, member, 'socket-0', 'center-target')).toBe(false)

    const powered = computePoweredNodeIds(nodes, [rootPowerLinkEdge(INITIAL_NODE_ID, 'na')])
    expect(powered.has('na')).toBe(true)
  })
})

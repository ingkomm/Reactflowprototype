import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import {
  getRootConnectSlotForNode,
  isRootOrbitMemberLink,
  isRootSocketOccupied,
  resolveRootAwareEndpoint,
  rootHandleFlowPosition,
  rootOrbitLinkSpec,
  syncConnectInitialSlotsFromEdges,
} from './rootGeometry'
import {
  ROOT_POWER_HANDLE_ID,
  rootPowerFlowPosition,
  rootSocketFlowPosition,
  rootSocketSourceHandle,
  rootTopLeftAtOrigin,
} from './initialHub'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import { createPassiveData } from './graphFactory'
import { centerEdgeUsesOrbitGeometry } from './components/CenterEdge'
import { ROOT_ORBIT_TIER_RADIUS } from './rootOrbit'

function orbitMember(
  id: string,
  kind: 'shard' | 'notable',
  tier: 1 | 2 | 3,
  slot: number,
  position: { x: number; y: number },
): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position,
    data: createPassiveData(kind, id, {
      rootOrbitTier: tier,
      rootOrbitSlot: slot,
    }),
  }
}

function rootNode(capacity = 6): PassiveFlowNode {
  const data = createPassiveData('initial', 'Root')
  return {
    id: INITIAL_NODE_ID,
    type: 'passive',
    position: { x: -60, y: -60 },
    data: {
      ...data,
      rootOrbitCapacityByTier: { 1: capacity, 2: capacity, 3: capacity },
      rootOrbitStartAngleByTier: { 1: -90, 2: -90, 3: -90 },
    },
  }
}

describe('rootGeometry endpoints', () => {
  const rootTL = rootTopLeftAtOrigin()

  it('resolves Power Core and socket positions without center fallback', () => {
    const power = resolveRootAwareEndpoint({
      kind: 'initial',
      nodeTopLeft: rootTL,
      handleId: ROOT_POWER_HANDLE_ID,
    })
    expect(power).toEqual(rootPowerFlowPosition(rootTL))
    expect(power).toEqual({ x: 0, y: 0 })

    const socket = resolveRootAwareEndpoint({
      kind: 'initial',
      nodeTopLeft: rootTL,
      handleId: rootSocketSourceHandle(3),
    })
    expect(socket).toEqual(rootSocketFlowPosition(rootTL, rootSocketSourceHandle(3)))
    expect(socket).not.toEqual({ x: 0, y: 0 })

    expect(
      resolveRootAwareEndpoint({
        kind: 'initial',
        nodeTopLeft: rootTL,
        handleId: 'center',
      }),
    ).toBeNull()
    expect(
      resolveRootAwareEndpoint({
        kind: 'initial',
        nodeTopLeft: rootTL,
        handleId: null,
      }),
    ).toBeNull()
  })

  it('preview Root socket endpoint equals persisted socket endpoint helper', () => {
    for (const slot of [0, 1, 2, 3, 4, 5] as const) {
      const handle = rootSocketSourceHandle(slot)
      const preview = rootHandleFlowPosition(rootTL, handle)
      const persisted = rootSocketFlowPosition(rootTL, handle)
      expect(preview).toEqual(persisted)
    }
    expect(rootHandleFlowPosition(rootTL, ROOT_POWER_HANDLE_ID)).toEqual(
      rootPowerFlowPosition(rootTL),
    )
  })
})

describe('rootOrbitLinkSpec (Mastery-shared rules)', () => {
  it('same-tier member link returns arc (not straight chord)', () => {
    const nodes = [
      rootNode(4),
      orbitMember('a', 'notable', 1, 0, { x: 0, y: -80 }),
      orbitMember('b', 'shard', 1, 1, { x: 80, y: 0 }),
    ]
    const spec = rootOrbitLinkSpec(nodes, 'a', 'b')
    expect(spec?.kind).toBe('arc')
    if (spec?.kind === 'arc') {
      expect(spec.arcRadius).toBe(ROOT_ORBIT_TIER_RADIUS[1])
      expect(typeof spec.clockwise).toBe('boolean')
    }
  })

  it('cross-tier member link returns straight chord (not radial+arc compound)', () => {
    const nodes = [
      rootNode(4),
      orbitMember('a', 'notable', 1, 0, { x: 0, y: -80 }),
      orbitMember('b', 'shard', 2, 0, { x: 0, y: -160 }),
    ]
    const spec = rootOrbitLinkSpec(nodes, 'a', 'b')
    expect(spec).toEqual({ kind: 'chord' })
  })

  it('occupied intermediate slot prefers the clear arc direction', () => {
    const nodes = [
      rootNode(4),
      orbitMember('a', 'notable', 1, 0, { x: 0, y: -80 }),
      orbitMember('blocker', 'shard', 1, 1, { x: 80, y: 0 }),
      orbitMember('b', 'notable', 1, 2, { x: 0, y: 80 }),
    ]
    const spec = rootOrbitLinkSpec(nodes, 'a', 'b')
    expect(spec?.kind).toBe('arc')
    if (spec?.kind === 'arc') {
      // CW 0→1→2 is blocked; CCW 0→3→2 is clear
      expect(spec.clockwise).toBe(false)
    }
  })

  it('Power Core links are not classified as orbit-member geometry', () => {
    const memberData = createPassiveData('notable', 'n', {
      rootOrbitTier: 1,
      rootOrbitSlot: 0,
    })
    const rootData = createPassiveData('initial', 'Root')
    expect(
      isRootOrbitMemberLink(rootData, memberData, ROOT_POWER_HANDLE_ID, 'center-target'),
    ).toBe(false)
    expect(
      centerEdgeUsesOrbitGeometry(rootData, memberData, ROOT_POWER_HANDLE_ID, 'center-target'),
    ).toBe(false)

    const nodes = [
      rootNode(),
      {
        id: 'n',
        type: 'passive' as const,
        position: { x: 0, y: -80 },
        data: memberData,
      },
    ]
    expect(
      rootOrbitLinkSpec(nodes, INITIAL_NODE_ID, 'n', {
        sourceHandle: ROOT_POWER_HANDLE_ID,
        targetHandle: 'center-target',
      }),
    ).toBeNull()
  })
})

describe('Root↔Connect socket truth from edges', () => {
  it('occupancy uses edges, not initialSlot alone', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        type: 'center',
        source: INITIAL_NODE_ID,
        target: 'c1',
        sourceHandle: 'socket-2',
        targetHandle: 'center-target',
      },
    ]
    const nodes: PassiveFlowNode[] = [
      {
        id: 'c1',
        type: 'passive',
        position: { x: 100, y: 0 },
        data: createPassiveData('connect', 'C', { connectEnabled: true, initialSlot: 4 }),
      },
      {
        id: 'c2',
        type: 'passive',
        position: { x: 120, y: 0 },
        data: createPassiveData('connect', 'C2', { connectEnabled: true, initialSlot: 2 }),
      },
    ]
    expect(isRootSocketOccupied(edges, 2)).toBe(true)
    expect(isRootSocketOccupied(edges, 4)).toBe(false)
    expect(getRootConnectSlotForNode(edges, 'c1')).toBe(2)

    const synced = syncConnectInitialSlotsFromEdges(nodes, edges)
    expect(synced.find((n) => n.id === 'c1')!.data.initialSlot).toBe(2)
    expect(synced.find((n) => n.id === 'c2')!.data.initialSlot).toBeUndefined()
  })
})

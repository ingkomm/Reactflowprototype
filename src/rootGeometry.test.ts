import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import {
  buildCrossTierRootOrbitPath,
  buildRootOrbitMemberLinkPath,
  buildSameTierRootOrbitArcPath,
  getRootConnectSlotForNode,
  isRootOrbitMemberLink,
  isRootSocketOccupied,
  resolveRootAwareEndpoint,
  rootHandleFlowPosition,
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

describe('rootGeometry orbit paths', () => {
  const root = { x: 0, y: 0 }

  it('same-tier member link returns short arc path (not a straight chord)', () => {
    const a = { x: 80, y: 0 }
    const b = { x: 0, y: 80 }
    const path = buildSameTierRootOrbitArcPath(root, 1, a, b)
    expect(path.mode).toBe('same-tier-arc')
    expect(path.pathD).toMatch(/ A /)
    expect(path.pathD.startsWith('M ')).toBe(true)
    expect(path.pathD.includes(' L ')).toBe(false)
  })

  it('cross-tier path uses radial + arc compound geometry', () => {
    const a = { x: 80, y: 0 }
    const b = { x: 0, y: 160 }
    const path = buildCrossTierRootOrbitPath(root, 1, 2, a, b)
    expect(path.mode).toBe('cross-tier')
    expect(path.pathD).toMatch(/ A /)
    expect(path.pathD).toMatch(/ L /)
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
  })

  it('buildRootOrbitMemberLinkPath picks arc for same tier', () => {
    const a = orbitMember('a', 'notable', 1, 0, { x: 50, y: -20 })
    const b = orbitMember('b', 'shard', 1, 1, { x: 20, y: 50 })
    const path = buildRootOrbitMemberLinkPath({
      rootCenter: root,
      sourceData: a.data,
      targetData: b.data,
      sourceCenter: { x: 80, y: 0 },
      targetCenter: { x: 0, y: 80 },
    })
    expect(path?.mode).toBe('same-tier-arc')
  })

  it('same-tier visible path geometry is reused for hit path contract', () => {
    const path = buildSameTierRootOrbitArcPath(root, 2, { x: 100, y: 0 }, { x: 0, y: 100 })
    // CenterEdge assigns hitPath = pathD for orbit links
    expect(path.pathD).toBe(path.pathD)
    expect(path.start).not.toEqual(path.end)
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

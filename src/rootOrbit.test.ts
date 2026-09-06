import { describe, expect, it } from 'vitest'
import type { PassiveFlowNode } from './components/PassiveNode'
import { INITIAL_NODE_ID } from './types'
import { ROOT_HUB_SIZE, layoutMasteryOrbit } from './orbit'
import { INITIAL_CONNECT_SLOT_COUNT } from './initialHub'
import {
  ensureRootFixed,
  isValidRootOrbitMemberKind,
  layoutRootOrbit,
  placeNotableFromRootOrbitDrag,
  placeNotableOnRootOrbit,
  rootOrbitHasGlobalHardCap,
  rootOrbitRingPercent,
} from './rootOrbit'
import { computePoweredNodeIds } from './power'

function notable(id: string, x: number, y: number, extra: Record<string, unknown> = {}): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x, y },
    data: {
      label: id,
      kind: 'notable',
      stages: [],
      symbolId: 'default',
      ...extra,
    },
  } as PassiveFlowNode
}

function rootNode(): PassiveFlowNode {
  const half = ROOT_HUB_SIZE / 2
  return {
    id: INITIAL_NODE_ID,
    type: 'passive',
    position: { x: -half, y: -half },
    draggable: false,
    data: { label: 'Root', kind: 'initial', stages: [], symbolId: 'default' },
  } as PassiveFlowNode
}

describe('Root orbit', () => {
  it('accepts only Notable members', () => {
    expect(isValidRootOrbitMemberKind('notable')).toBe(true)
    expect(isValidRootOrbitMemberKind('shard')).toBe(false)
    expect(isValidRootOrbitMemberKind('mastery')).toBe(false)
    expect(isValidRootOrbitMemberKind('connect')).toBe(false)
  })

  it('persists and restores rootOrbitTier 1/2/3', () => {
    let nodes = [rootNode(), notable('n1', 200, 0), notable('n2', 300, 0), notable('n3', 400, 0)]
    nodes = placeNotableOnRootOrbit(nodes, 'n1', 1)!
    nodes = placeNotableOnRootOrbit(nodes, 'n2', 2)!
    nodes = placeNotableOnRootOrbit(nodes, 'n3', 3)!
    expect(nodes.find((n) => n.id === 'n1')!.data.rootOrbitTier).toBe(1)
    expect(nodes.find((n) => n.id === 'n2')!.data.rootOrbitTier).toBe(2)
    expect(nodes.find((n) => n.id === 'n3')!.data.rootOrbitTier).toBe(3)
    const laid = layoutRootOrbit(nodes)
    expect(laid.find((n) => n.id === 'n1')!.data.rootOrbitTier).toBe(1)
  })

  it('has no global Notable hard cap', () => {
    expect(rootOrbitHasGlobalHardCap()).toBe(false)
    let nodes: PassiveFlowNode[] = [rootNode()]
    for (let i = 0; i < 8; i++) {
      nodes.push(notable(`n${i}`, 50, 50))
      nodes = placeNotableOnRootOrbit(nodes, `n${i}`, 1)!
    }
    expect(nodes.filter((n) => (n.data as { rootOrbitTier?: number }).rootOrbitTier === 1)).toHaveLength(8)
  })

  it('does not create power from Root orbit membership alone', () => {
    let nodes = [rootNode(), notable('n1', 0, 0)]
    nodes = placeNotableOnRootOrbit(nodes, 'n1', 1)!
    const powered = computePoweredNodeIds(nodes, [])
    expect(powered.has(INITIAL_NODE_ID)).toBe(true)
    expect(powered.has('n1')).toBe(false)
  })

  it('keeps Root non-draggable at origin', () => {
    const nodes = ensureRootFixed([
      {
        ...rootNode(),
        position: { x: 99, y: 99 },
        draggable: true,
      },
    ])
    const root = nodes.find((n) => n.id === INITIAL_NODE_ID)!
    expect(root.draggable).toBe(false)
    expect(root.position).toEqual({ x: -ROOT_HUB_SIZE / 2, y: -ROOT_HUB_SIZE / 2 })
  })

  it('exposes six connector sockets', () => {
    expect(INITIAL_CONNECT_SLOT_COUNT).toBe(6)
  })

  it('draws three internal ring percents inside the hub', () => {
    expect(rootOrbitRingPercent(1)).toBeLessThan(rootOrbitRingPercent(2))
    expect(rootOrbitRingPercent(2)).toBeLessThan(rootOrbitRingPercent(3))
    expect(rootOrbitRingPercent(3)).toBeLessThan(50)
  })

  it('detaches from Root orbit without deleting the Notable', () => {
    let nodes = [rootNode(), notable('n1', 0, 0)]
    nodes = placeNotableOnRootOrbit(nodes, 'n1', 2)!
    const far = { x: ROOT_HUB_SIZE, y: ROOT_HUB_SIZE }
    const result = placeNotableFromRootOrbitDrag(nodes, 'n1', far)
    expect(result?.kind).toBe('detached')
    const n1 = result!.nodes.find((n) => n.id === 'n1')!
    expect(n1.data.rootOrbitTier).toBeUndefined()
    expect(result!.nodes.some((n) => n.id === 'n1')).toBe(true)
  })

  it('does not break Mastery orbit layout', () => {
    const mastery = {
      id: 'm1',
      type: 'passive',
      position: { x: 400, y: 0 },
      data: {
        label: 'M',
        kind: 'mastery',
        stages: [],
        symbolId: 'default',
        orbitTierCount: 1,
        orbitCapacityByTier: { 1: 6 },
        orbitOrder: ['s1'],
        orbitOrderByTier: { 1: ['s1'] },
      },
    } as PassiveFlowNode
    const sat = notable('s1', 400, 180, { masteryId: 'm1', orbitTier: 1, orbitSlot: 0 })
    const nodes = layoutMasteryOrbit([rootNode(), mastery, sat], 'm1')
    const after = layoutRootOrbit(nodes)
    expect(after.find((n) => n.id === 's1')!.data.masteryId).toBe('m1')
  })
})

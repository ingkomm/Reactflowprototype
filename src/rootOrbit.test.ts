import { describe, expect, it } from 'vitest'
import type { PassiveFlowNode } from './components/PassiveNode'
import { INITIAL_NODE_ID } from './types'
import {
  ROOT_HUB_SIZE,
  ROOT_ORBIT_TIER_RADIUS,
  layoutMasteryOrbit,
  withMasteryDragFlags,
  NODE_SIZE,
  masteryOuterOrbitRadius,
} from './orbit'
import { INITIAL_CONNECT_SLOT_COUNT } from './initialHub'
import {
  ensureRootFixed,
  isValidRootOrbitMemberKind,
  layoutRootOrbit,
  placeNotableFromRootOrbitDrag,
  placeNotableOnRootOrbit,
  rootOrbitHasGlobalHardCap,
  rootOrbitRingPercent,
  ROOT_HUB_RADIUS,
  applyRootBoundaryEject,
  isClearlyInsideRoot,
  overlapsRootArena,
  ROOT_BOUNDARY_GAP,
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

  it('draws three internal ring percents matching diameter/hub ratio', () => {
    expect(rootOrbitRingPercent(1)).toBeLessThan(rootOrbitRingPercent(2))
    expect(rootOrbitRingPercent(2)).toBeLessThan(rootOrbitRingPercent(3))
    expect(rootOrbitRingPercent(3)).toBeLessThan(100)
    for (const tier of [1, 2, 3] as const) {
      expect(rootOrbitRingPercent(tier)).toBeCloseTo(
        (ROOT_ORBIT_TIER_RADIUS[tier] / ROOT_HUB_RADIUS) * 100,
        5,
      )
    }
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


describe('Root stacking and boundary eject', () => {
  it('keeps Root z-index below Notables even when Root is selected', () => {
    const nodes = [
      rootNode(),
      notable('n1', 0, 0, { rootOrbitTier: 1 }),
    ]
    const stacked = withMasteryDragFlags(nodes, INITIAL_NODE_ID)
    const root = stacked.find((n) => n.id === INITIAL_NODE_ID)!
    const n1 = stacked.find((n) => n.id === 'n1')!
    expect(root.zIndex).toBe(0)
    expect(n1.zIndex).toBeGreaterThan(root.zIndex!)
  })

  it('attaches clearly-inside Notable and ejects ambiguous rim overlap without attach', () => {
    const size = NODE_SIZE.notable
    const bodyR = size / 2

    const insideTL = { x: -bodyR, y: -bodyR }
    const attached = placeNotableFromRootOrbitDrag(
      [rootNode(), notable('n-in', insideTL.x, insideTL.y)],
      'n-in',
      insideTL,
    )
    expect(attached?.kind).toBe('root')
    expect(attached!.nodes.find((n) => n.id === 'n-in')!.data.rootOrbitTier).toBeTruthy()

    const ambiguousDist = ROOT_HUB_RADIUS - bodyR / 2
    expect(isClearlyInsideRoot(ambiguousDist, bodyR)).toBe(false)
    expect(overlapsRootArena(ambiguousDist, bodyR)).toBe(true)
    const ambTL = { x: ambiguousDist - bodyR, y: -bodyR }
    const ejected = placeNotableFromRootOrbitDrag(
      [rootNode(), notable('n-amb', ambTL.x, ambTL.y)],
      'n-amb',
      ambTL,
    )
    expect(ejected?.kind).toBe('detached')
    const amb = ejected!.nodes.find((n) => n.id === 'n-amb')!
    expect(amb.data.rootOrbitTier).toBeUndefined()
    const cx = amb.position.x + bodyR
    const cy = amb.position.y + bodyR
    expect(Math.hypot(cx, cy)).toBeGreaterThanOrEqual(
      ROOT_HUB_RADIUS + bodyR + ROOT_BOUNDARY_GAP - 1e-6,
    )
  })

  it('ejects external Shard fully outside Root on boundary overlap', () => {
    const size = NODE_SIZE.shard
    const bodyR = size / 2
    const nodes: PassiveFlowNode[] = [
      rootNode(),
      {
        id: 's1',
        type: 'passive',
        position: { x: ROOT_HUB_RADIUS - bodyR, y: -bodyR },
        data: { label: 'S', kind: 'shard', stages: [], symbolId: 'default' },
      } as PassiveFlowNode,
    ]
    const next = applyRootBoundaryEject(nodes, 's1')
    const shard = next.find((n) => n.id === 's1')!
    const cx = shard.position.x + bodyR
    const cy = shard.position.y + bodyR
    expect(Math.hypot(cx, cy)).toBeGreaterThanOrEqual(
      ROOT_HUB_RADIUS + bodyR + ROOT_BOUNDARY_GAP - 1e-6,
    )
  })

  it('ejects Mastery hub using outer orbit + satellite body margin', () => {
    const mastery = {
      id: 'm1',
      type: 'passive',
      position: { x: 40, y: -NODE_SIZE.mastery / 2 },
      data: {
        label: 'M',
        kind: 'mastery',
        stages: [],
        symbolId: 'default',
        orbitTierCount: 1,
        orbitCapacityByTier: { 1: 6 },
        orbitOrder: ['sat'],
        orbitOrderByTier: { 1: ['sat'] },
      },
    } as PassiveFlowNode
    const sat = notable('sat', 40, 180, { masteryId: 'm1', orbitTier: 1, orbitSlot: 0 })
    const laid = layoutMasteryOrbit([rootNode(), mastery, sat], 'm1')
    const outer = masteryOuterOrbitRadius(mastery.data as never)
    const next = applyRootBoundaryEject(laid, 'm1')
    const m = next.find((n) => n.id === 'm1')!
    const cx = m.position.x + NODE_SIZE.mastery / 2
    const cy = m.position.y + NODE_SIZE.mastery / 2
    const need = ROOT_HUB_RADIUS + outer + NODE_SIZE.notable / 2 + ROOT_BOUNDARY_GAP
    expect(Math.hypot(cx, cy)).toBeGreaterThanOrEqual(need - 1e-6)
  })
})

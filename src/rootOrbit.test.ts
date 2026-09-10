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
import { outermostBandRadius, BAND_STROKE } from './orbitGeometry'
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
  getRootOrbitCapacity,
  getRootOrbitStartAngle,
  setRootOrbitCapacity,
  setRootOrbitStartAngle,
  ensureRootOrbitSlotsAssigned,
  rootOrbitAngleDegrees,
  stripInvalidRootPowerEdges,
  formatRootOrbitMembership,
} from './rootOrbit'
import { computePoweredNodeIds, computePowerFlowMeta } from './power'
import { rootPowerLinkEdge } from './graphFactory'
import { ROOT_POWER_HANDLE_ID } from './initialHub'

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

function shard(id: string, x: number, y: number, extra: Record<string, unknown> = {}): PassiveFlowNode {
  return {
    id,
    type: 'passive',
    position: { x, y },
    data: {
      label: id,
      kind: 'shard',
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
  it('accepts Notable and Shard members only', () => {
    expect(isValidRootOrbitMemberKind('notable')).toBe(true)
    expect(isValidRootOrbitMemberKind('shard')).toBe(true)
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

  it('has no global Notable hard cap (per-tier capacity only)', () => {
    expect(rootOrbitHasGlobalHardCap()).toBe(false)
    let nodes: PassiveFlowNode[] = [
      {
        ...rootNode(),
        data: setRootOrbitCapacity(rootNode().data as never, 1, 12),
      },
    ]
    for (let i = 0; i < 8; i++) {
      nodes.push(notable(`n${i}`, 50, 50))
      nodes = placeNotableOnRootOrbit(nodes, `n${i}`, 1)!
      expect(nodes).toBeTruthy()
    }
    expect(
      nodes.filter((n) => (n.data as { rootOrbitTier?: number }).rootOrbitTier === 1),
    ).toHaveLength(8)
  })

  it('does not auto-power Root Orbit Notables without a Power Core edge', () => {
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

describe('Root orbit capacity/slot layout', () => {
  it('round-trips capacity and start angle on Root data', () => {
    let root = rootNode()
    root = {
      ...root,
      data: setRootOrbitStartAngle(
        setRootOrbitCapacity(root.data as never, 2, 8),
        2,
        45,
      ),
    }
    expect(getRootOrbitCapacity(root.data as never, 2)).toBe(8)
    expect(getRootOrbitStartAngle(root.data as never, 2)).toBe(45)
  })

  it('places members by startAngle + 360 * slot / capacity', () => {
    let nodes = [
      {
        ...rootNode(),
        data: setRootOrbitStartAngle(
          setRootOrbitCapacity(rootNode().data as never, 1, 4),
          1,
          -90,
        ),
      },
      notable('n0', 0, 0),
      notable('n1', 0, 0),
    ]
    nodes = nodes.map((n) => {
      if (n.id === 'n0') {
        return { ...n, data: { ...n.data, rootOrbitTier: 1 as const, rootOrbitSlot: 0 } }
      }
      if (n.id === 'n1') {
        return { ...n, data: { ...n.data, rootOrbitTier: 1 as const, rootOrbitSlot: 1 } }
      }
      return n
    })
    const laid = layoutRootOrbit(nodes)
    const a = laid.find((n) => n.id === 'n0')!
    const b = laid.find((n) => n.id === 'n1')!
    const size = NODE_SIZE.notable
    const angle0 = (rootOrbitAngleDegrees(-90, 0, 4) * Math.PI) / 180
    const angle1 = (rootOrbitAngleDegrees(-90, 1, 4) * Math.PI) / 180
    const r = ROOT_ORBIT_TIER_RADIUS[1]
    expect(a.position.x + size / 2).toBeCloseTo(Math.cos(angle0) * r, 5)
    expect(a.position.y + size / 2).toBeCloseTo(Math.sin(angle0) * r, 5)
    expect(b.position.x + size / 2).toBeCloseTo(Math.cos(angle1) * r, 5)
    expect(b.position.y + size / 2).toBeCloseTo(Math.sin(angle1) * r, 5)
  })

  it('assigns missing slots by nearest world angle (not id order)', () => {
    const size = NODE_SIZE.notable
    // capacity 4, startAngle -90 → slots: 0=-90°, 1=0°, 2=90°, 3=180°
    let root = {
      ...rootNode(),
      data: setRootOrbitStartAngle(
        setRootOrbitCapacity(rootNode().data as never, 1, 4),
        1,
        -90,
      ),
    }
    // A at right (0°) → nearest slot 1; B at bottom (90°) → nearest slot 2
    const r = 120
    let nodes = [
      root,
      notable('a', r - size / 2, -size / 2, { rootOrbitTier: 1 }),
      notable('b', -size / 2, r - size / 2, { rootOrbitTier: 1 }),
    ]
    nodes = ensureRootOrbitSlotsAssigned(nodes)
    const a = nodes.find((n) => n.id === 'a')!
    const b = nodes.find((n) => n.id === 'b')!
    expect(a.data.rootOrbitSlot).toBe(1)
    expect(b.data.rootOrbitSlot).toBe(2)

    const laid = layoutRootOrbit(nodes)
    const la = laid.find((n) => n.id === 'a')!
    const lb = laid.find((n) => n.id === 'b')!
    const acx = la.position.x + size / 2
    const acy = la.position.y + size / 2
    const bcx = lb.position.x + size / 2
    const bcy = lb.position.y + size / 2
    expect(Math.hypot(acx - bcx, acy - bcy)).toBeGreaterThan(1)
  })

  it('expands capacity when legacy unslotted members overflow', () => {
    let root = {
      ...rootNode(),
      data: setRootOrbitCapacity(rootNode().data as never, 1, 6),
    }
    const size = NODE_SIZE.notable
    const members = Array.from({ length: 8 }, (_, i) => {
      const ang = ((-90 + i * 45) * Math.PI) / 180
      const r = 140
      return notable(
        `m${i}`,
        r * Math.cos(ang) - size / 2,
        r * Math.sin(ang) - size / 2,
        { rootOrbitTier: 1 },
      )
    })
    let nodes = [root, ...members]
    nodes = ensureRootOrbitSlotsAssigned(nodes)
    const rootData = nodes.find((n) => n.id === INITIAL_NODE_ID)!.data
    expect(getRootOrbitCapacity(rootData as never, 1)).toBeGreaterThanOrEqual(8)
    const capacity = getRootOrbitCapacity(rootData as never, 1)
    const slots = members.map((m) => {
      const n = nodes.find((x) => x.id === m.id)!
      const slot = n.data.rootOrbitSlot
      expect(slot).toBeTypeOf('number')
      expect(slot!).toBeGreaterThanOrEqual(0)
      expect(slot!).toBeLessThan(capacity)
      return slot
    })
    expect(new Set(slots).size).toBe(8)

    const laid = layoutRootOrbit(nodes)
    const centers = members.map((m) => {
      const n = laid.find((x) => x.id === m.id)!
      return {
        x: n.position.x + size / 2,
        y: n.position.y + size / 2,
      }
    })
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        expect(
          Math.hypot(centers[i]!.x - centers[j]!.x, centers[i]!.y - centers[j]!.y),
        ).toBeGreaterThan(1)
      }
    }
  })

  it('keeps existing valid slots and fills only unslotted members', () => {
    const size = NODE_SIZE.notable
    let root = {
      ...rootNode(),
      data: setRootOrbitStartAngle(
        setRootOrbitCapacity(rootNode().data as never, 1, 4),
        1,
        -90,
      ),
    }
    // Preserved slot 1 (0°). Unslotted C near bottom (90°) → slot 2.
    const r = 120
    let nodes = [
      root,
      notable('kept', r - size / 2, -size / 2, {
        rootOrbitTier: 1,
        rootOrbitSlot: 1,
      }),
      notable('c', -size / 2, r - size / 2, { rootOrbitTier: 1 }),
      shard('s', -r - size / 2, -size / 2, { rootOrbitTier: 1 }), // ~180° → slot 3
    ]
    nodes = ensureRootOrbitSlotsAssigned(nodes)
    expect(nodes.find((n) => n.id === 'kept')!.data.rootOrbitSlot).toBe(1)
    expect(nodes.find((n) => n.id === 'c')!.data.rootOrbitSlot).toBe(2)
    expect(nodes.find((n) => n.id === 's')!.data.rootOrbitSlot).toBe(3)
  })

  it('does not rearrange modern documents that already have unique valid slots', () => {
    let root = {
      ...rootNode(),
      data: setRootOrbitCapacity(rootNode().data as never, 1, 4),
    }
    let nodes = [
      root,
      notable('n0', 0, 0, { rootOrbitTier: 1, rootOrbitSlot: 2 }),
      notable('n1', 0, 0, { rootOrbitTier: 1, rootOrbitSlot: 0 }),
      shard('s0', 0, 0, { rootOrbitTier: 1, rootOrbitSlot: 1 }),
    ]
    nodes = ensureRootOrbitSlotsAssigned(nodes)
    expect(nodes.find((n) => n.id === 'n0')!.data.rootOrbitSlot).toBe(2)
    expect(nodes.find((n) => n.id === 'n1')!.data.rootOrbitSlot).toBe(0)
    expect(nodes.find((n) => n.id === 's0')!.data.rootOrbitSlot).toBe(1)
  })

  it('fails attach when tier has no free slot then ejects on drag', () => {
    let root = {
      ...rootNode(),
      data: setRootOrbitCapacity(rootNode().data as never, 1, 1),
    }
    let nodes = [
      root,
      notable('taken', 0, 0, { rootOrbitTier: 1, rootOrbitSlot: 0 }),
      notable('new', 0, 0),
    ]
    nodes = layoutRootOrbit(nodes)
    const size = NODE_SIZE.notable
    const drop = { x: -size / 2, y: -size / 2 }
    const result = placeNotableFromRootOrbitDrag(nodes, 'new', drop)
    expect(result?.kind).toBe('detached')
    expect(result!.nodes.find((n) => n.id === 'new')!.data.rootOrbitTier).toBeUndefined()
  })
})

describe('Root orbit Power Core (manual)', () => {
  it('keeps Orbit members unpowered until a Power Core edge exists', () => {
    let nodes = [
      rootNode(),
      notable('n1', 0, 0, { rootOrbitTier: 1, rootOrbitSlot: 0 }),
    ]
    nodes = layoutRootOrbit(nodes)
    expect(computePoweredNodeIds(nodes, []).has('n1')).toBe(false)
    const edges = [rootPowerLinkEdge(INITIAL_NODE_ID, 'n1')]
    expect(edges[0]!.sourceHandle).toBe(ROOT_POWER_HANDLE_ID)
    const powered = computePoweredNodeIds(nodes, edges)
    expect(powered.has('n1')).toBe(true)
    const meta = computePowerFlowMeta(nodes, edges)
    expect(meta.parent.get('n1')).toBe(INITIAL_NODE_ID)
    expect(meta.depth.get('n1')).toBe(1)
  })

  it('strips Power Core edges when membership is cleared', () => {
    let nodes = [
      rootNode(),
      notable('n1', 0, 0, { rootOrbitTier: 1, rootOrbitSlot: 0 }),
    ]
    nodes = layoutRootOrbit(nodes)
    const edges = [rootPowerLinkEdge(INITIAL_NODE_ID, 'n1')]
    const detached = nodes.map((n) =>
      n.id === 'n1'
        ? {
            ...n,
            data: {
              ...n.data,
              rootOrbitTier: undefined,
              rootOrbitSlot: undefined,
            },
          }
        : n,
    ) as PassiveFlowNode[]
    const stripped = stripInvalidRootPowerEdges(detached, edges)
    expect(stripped).toHaveLength(0)
  })
})

describe('Root Orbit Shard + hub clearance + Connect eject', () => {
  it('attaches Shard with rootOrbitTier/slot but does not auto-power', () => {
    let nodes = [rootNode(), shard('s1', 40, 0)]
    const next = placeNotableOnRootOrbit(nodes, 's1', 2, 1)
    expect(next).not.toBeNull()
    nodes = next!
    const s = nodes.find((n) => n.id === 's1')!
    expect(s.data.rootOrbitTier).toBe(2)
    expect(s.data.rootOrbitSlot).toBe(1)
    expect(computePoweredNodeIds(nodes, []).has('s1')).toBe(false)
    const powered = computePoweredNodeIds(nodes, [rootPowerLinkEdge(INITIAL_NODE_ID, 's1')])
    expect(powered.has('s1')).toBe(true)
  })

  it('rejects Mastery/Connect Root Orbit attach', () => {
    const nodes = [
      rootNode(),
      {
        id: 'm1',
        type: 'passive',
        position: { x: 0, y: 0 },
        data: { label: 'M', kind: 'mastery', stages: [], symbolId: 'default' },
      } as PassiveFlowNode,
      {
        id: 'c1',
        type: 'passive',
        position: { x: 10, y: 10 },
        data: {
          label: 'C',
          kind: 'connect',
          stages: [],
          symbolId: 'default',
          connectEnabled: true,
        },
      } as PassiveFlowNode,
    ]
    expect(placeNotableOnRootOrbit(nodes, 'm1', 1, 0)).toBeNull()
    expect(placeNotableOnRootOrbit(nodes, 'c1', 1, 0)).toBeNull()
  })

  it('keeps Tier3 Notable + default 3 bands inside enlarged Root rim', () => {
    const bandOuter = outermostBandRadius(3, NODE_SIZE.notable) + BAND_STROKE / 2
    expect(ROOT_HUB_RADIUS).toBeGreaterThanOrEqual(ROOT_ORBIT_TIER_RADIUS[3] + bandOuter)
    expect(ROOT_HUB_SIZE).toBeGreaterThanOrEqual(600)
    expect(ROOT_HUB_SIZE).toBeLessThanOrEqual(630)
  })

  it('ejects Connect with initialSlot overlapping Root arena', () => {
    const size = NODE_SIZE.connect
    const bodyR = size / 2
    const nodes = [
      rootNode(),
      {
        id: 'c-in',
        type: 'passive',
        position: { x: -bodyR, y: -bodyR },
        data: {
          label: 'C',
          kind: 'connect',
          stages: [],
          symbolId: 'default',
          connectEnabled: true,
          initialSlot: 0,
        },
      } as PassiveFlowNode,
    ]
    const next = applyRootBoundaryEject(nodes)
    const c = next.find((n) => n.id === 'c-in')!
    const cx = c.position.x + bodyR
    const cy = c.position.y + bodyR
    expect(Math.hypot(cx, cy)).toBeGreaterThanOrEqual(
      ROOT_HUB_RADIUS + bodyR + ROOT_BOUNDARY_GAP - 1e-6,
    )
  })
})

describe('Root Orbit Inspector membership label', () => {
  it('formats Root Orbit Notable tier/slot with 1-based slot', () => {
    expect(
      formatRootOrbitMembership({
        label: 'N',
        kind: 'notable',
        stages: [],
        symbolId: 'default',
        rootOrbitTier: 2,
        rootOrbitSlot: 0,
      }),
    ).toBe('2단 · 슬롯 1')
  })

  it('formats Root Orbit Shard the same way', () => {
    expect(
      formatRootOrbitMembership({
        label: 'S',
        kind: 'shard',
        stages: [],
        symbolId: 'default',
        rootOrbitTier: 2,
        rootOrbitSlot: 0,
      }),
    ).toBe('2단 · 슬롯 1')
  })

  it('reports Not on Root Orbit when tier is missing', () => {
    expect(
      formatRootOrbitMembership({
        label: 'X',
        kind: 'notable',
        stages: [],
        symbolId: 'default',
        masteryId: 'm1',
        orbitTier: 1,
      }),
    ).toBe('Not on Root Orbit.')
    expect(
      formatRootOrbitMembership({
        label: 'Y',
        kind: 'shard',
        stages: [],
        symbolId: 'default',
      }),
    ).toBe('Not on Root Orbit.')
  })
})

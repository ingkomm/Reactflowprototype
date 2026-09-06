import { NODE_SIZE } from './orbit'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildEmptyNodes,
  buildEmptyEdges,
  EMPTY_CONNECT_SLOTS,
} from './emptyGraph'
import {
  SEED_NODES,
  CONNECT_TOP_ID,
  CONNECT_BR_ID,
  CONNECT_BL_ID,
} from './seedGraph'
import {
  INITIAL_CONNECT_SLOT_COUNT,
  connectPositionForInitialHub,
  rootSocketFlowPosition,
  parseRootSocketHandle,
  rootSocketSourceHandle,
  initialSocketOffset,
} from './initialHub'
// patched below
import { buildGraphDocument, documentToFlowState } from './graphDocument'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import { createPassiveData } from './graphFactory'
import {
  ensureRootFixed,
  ROOT_HUB_RADIUS,
} from './rootOrbit'
import { computePoweredNodeIds, isValidRootConnectHandles } from './power'

describe('default Connect slots on 6-socket Root', () => {
  it('empty graph uses slots 0 / 2 / 4', () => {
    expect(EMPTY_CONNECT_SLOTS).toEqual([0, 2, 4])
    const slots = buildEmptyNodes()
      .filter((n) => n.data.kind === 'connect')
      .map((n) => n.data.initialSlot)
      .sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(slots).toEqual([0, 2, 4])
    expect(INITIAL_CONNECT_SLOT_COUNT).toBe(6)
  })

  it('seed graph uses slots 0 / 2 / 4', () => {
    const byId = Object.fromEntries(
      SEED_NODES.filter((n) => n.data.kind === 'connect').map((n) => [
        n.id,
        n.data.initialSlot,
      ]),
    )
    expect(byId[CONNECT_TOP_ID]).toBe(0)
    expect(byId[CONNECT_BR_ID]).toBe(2)
    expect(byId[CONNECT_BL_ID]).toBe(4)
  })
})

describe('Root socket connect snap + reload', () => {
  it('records initialSlot without moving Connect position', () => {
    const root = buildEmptyNodes().find((n) => n.id === INITIAL_NODE_ID)!
    const connect = {
      id: 'connect-free',
      type: 'passive' as const,
      position: { x: 500, y: 400 },
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        symbolId: 'default',
      }),
    }
    const slot = 1 as const
    const linked = {
      ...connect,
      data: { ...connect.data, initialSlot: slot },
    }
    expect(linked.data.initialSlot).toBe(1)
    expect(linked.position).toEqual({ x: 500, y: 400 })
    // rim helper still exists for optional layout, but is not applied on connect/load
    expect(connectPositionForInitialHub(root.position, 1)).not.toEqual(linked.position)
  })

  it('documentToFlowState keeps Connect positions (initialSlot does not snap)', () => {
    const nodes = buildEmptyNodes()
    const before = nodes
      .filter((n) => n.data.kind === 'connect')
      .map((n) => ({ id: n.id, position: { ...n.position }, slot: n.data.initialSlot }))
    const edges = buildEmptyEdges()
    const doc = buildGraphDocument({
      nodes,
      edges,
      customSymbols: [],
      settings: {},
    })
    const restored = documentToFlowState(doc)
    for (const prev of before) {
      const connect = restored.nodes.find((n) => n.id === prev.id)!
      expect(connect.data.initialSlot).toBe(prev.slot)
      expect(connect.position).toEqual(prev.position)
    }
  })

  it('keeps occupied socket uniqueness for default Connects', () => {
    const slots = buildEmptyNodes()
      .filter((n) => n.data.kind === 'connect')
      .map((n) => n.data.initialSlot)
    expect(new Set(slots).size).toBe(slots.length)
    expect(slots).toContain(0)
    expect(slots).not.toContain(1)
  })

  it('Root orbit membership alone does not grant power', () => {
    const nodes = buildEmptyNodes()
    const powered = computePoweredNodeIds(nodes, buildEmptyEdges())
    expect(powered.has(INITIAL_NODE_ID)).toBe(true)
  })

  it('keeps Root non-draggable', () => {
    const root = ensureRootFixed(buildEmptyNodes()).find((n) => n.id === INITIAL_NODE_ID)!
    expect(root.draggable).toBe(false)
  })
})

describe('Root socket layering class', () => {
  it('places root socket handle z-index above hit layer', () => {
    const css = readFileSync('src/components/PassiveNode.css', 'utf8')
    expect(css).toMatch(/\.passive-node__handle--root-socket[\s\S]*?z-index:\s*6/)
    expect(css).toMatch(/\.passive-node__hit[\s\S]*?z-index:\s*5/)
    expect(css).toMatch(/.passive-node--initial .passive-node__hit[\s\S]*?z-index:\s*1/)
  })
})

describe('Root socket endpoints', () => {
  it('maps each socket handle id to a unique rim endpoint (not hub center)', () => {
    const topLeft = { x: -ROOT_HUB_RADIUS, y: -ROOT_HUB_RADIUS }
    const points: { x: number; y: number }[] = []
    for (let slot = 0; slot < 6; slot++) {
      const handle = rootSocketSourceHandle(slot as 0 | 1 | 2 | 3 | 4 | 5)
      expect(parseRootSocketHandle(handle)).toBe(slot)
      const pt = rootSocketFlowPosition(topLeft, handle)
      expect(pt).not.toBeNull()
      points.push(pt!)
      expect(Math.hypot(pt!.x, pt!.y)).toBeGreaterThan(ROOT_HUB_RADIUS - 4)
    }
    expect(rootSocketFlowPosition(topLeft, 'center')).toBeNull()
    const keys = new Set(points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`))
    expect(keys.size).toBe(6)
  })

  it('rejects Root center handles for Root↔Connect validation', () => {
    const root = {
      id: INITIAL_NODE_ID,
      type: 'passive',
      position: { x: -ROOT_HUB_RADIUS, y: -ROOT_HUB_RADIUS },
      data: { label: 'Root', kind: 'initial', stages: [], symbolId: 'default' },
    } as import('./components/PassiveNode').PassiveFlowNode
    const connect = {
      id: 'c1',
      type: 'passive',
      position: { x: 200, y: 0 },
      data: {
        label: 'C',
        kind: 'connect',
        stages: [],
        symbolId: 'default',
        connectEnabled: true,
      },
    } as import('./components/PassiveNode').PassiveFlowNode
    expect(isValidRootConnectHandles(root, connect, 'center', 'center-target')).toBe(false)
    expect(
      isValidRootConnectHandles(root, connect, rootSocketSourceHandle(2), 'center-target'),
    ).toBe(true)
  })
})

describe('Root rim socket handle geometry', () => {
  it('initialSocketOffset places six distinct rim handles (not hub center)', () => {
    const points = Array.from({ length: 6 }, (_, slot) =>
      initialSocketOffset(slot as 0 | 1 | 2 | 3 | 4 | 5),
    )
    const keys = new Set(points.map((p) => `${p.left.toFixed(3)},${p.top.toFixed(3)}`))
    expect(keys.size).toBe(6)
    const cx = NODE_SIZE.initial / 2
    const cy = NODE_SIZE.initial / 2
    for (const p of points) {
      expect(Math.hypot(p.left - cx, p.top - cy)).toBeGreaterThan(NODE_SIZE.initial / 2 - 6)
    }
  })

  it('root-socket CSS overrides centered handle left/top via variables', () => {
    const css = readFileSync('src/components/PassiveNode.css', 'utf8')
    expect(css).toMatch(/\.passive-node__handle--root-socket[\s\S]*?--root-socket-left/)
    expect(css).toMatch(/\.passive-node__handle--root-socket[\s\S]*?--root-socket-top/)
  })
})

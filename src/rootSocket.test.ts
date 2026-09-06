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
} from './initialHub'
import { buildGraphDocument, documentToFlowState } from './graphDocument'
import { INITIAL_NODE_ID } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import { createPassiveData } from './graphFactory'
import { ensureRootFixed } from './rootOrbit'
import { computePoweredNodeIds } from './power'

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
  it('assigns initialSlot and snaps Connect via connectPositionForInitialHub', () => {
    const root = buildEmptyNodes().find((n) => n.id === INITIAL_NODE_ID)!
    const connect: PassiveFlowNode = {
      id: 'connect-free',
      type: 'passive',
      position: { x: 500, y: 400 },
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        symbolId: 'default',
      }),
    }
    const slot = 1 as const
    const snapped: PassiveFlowNode = {
      ...connect,
      position: connectPositionForInitialHub(root.position, slot),
      data: { ...connect.data, initialSlot: slot },
    }
    expect(snapped.data.initialSlot).toBe(1)
    expect(snapped.position).toEqual(connectPositionForInitialHub(root.position, 1))
  })

  it('documentToFlowState reseats Connect on the same socket geometry', () => {
    const nodes = buildEmptyNodes()
    const edges = buildEmptyEdges()
    const doc = buildGraphDocument({
      nodes,
      edges,
      customSymbols: [],
      settings: {},
    })
    const restored = documentToFlowState(doc)
    for (const slot of [0, 2, 4] as const) {
      const connect = restored.nodes.find(
        (n) => n.data.kind === 'connect' && n.data.initialSlot === slot,
      )!
      const root = restored.nodes.find((n) => n.id === INITIAL_NODE_ID)!
      expect(connect.position).toEqual(connectPositionForInitialHub(root.position, slot))
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
  })
})

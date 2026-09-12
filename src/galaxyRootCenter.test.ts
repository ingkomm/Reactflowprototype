import { describe, expect, it } from 'vitest'
import { NODE_SIZE } from './orbit'
import { INITIAL_NODE_ID } from './types'
import {
  GALAXY_ENTER_ROOT_ZOOM,
  rootCenterFromNodes,
  universeGatewayOriginPct,
} from './galaxyRootCenter'

describe('galaxy Root centering helpers', () => {
  it('T1: centers on Root even when a far node would skew fitView', () => {
    const rootPos = { x: 10, y: 20 }
    const nodes = [
      { id: INITIAL_NODE_ID, position: rootPos },
      { id: 'far', position: { x: 4000, y: 3000 } },
    ]
    const center = rootCenterFromNodes(nodes)
    expect(center).toEqual({
      x: rootPos.x + NODE_SIZE.initial / 2,
      y: rootPos.y + NODE_SIZE.initial / 2,
    })
    expect(GALAXY_ENTER_ROOT_ZOOM).toBe(1)
  })

  it('T2: each Galaxy Root yields its own center', () => {
    const a = rootCenterFromNodes([{ id: INITIAL_NODE_ID, position: { x: 0, y: 0 } }])
    const b = rootCenterFromNodes([{ id: INITIAL_NODE_ID, position: { x: 200, y: -80 } }])
    expect(a).toEqual({ x: NODE_SIZE.initial / 2, y: NODE_SIZE.initial / 2 })
    expect(b).toEqual({
      x: 200 + NODE_SIZE.initial / 2,
      y: -80 + NODE_SIZE.initial / 2,
    })
    expect(a).not.toEqual(b)
  })

  it('returns null without Root', () => {
    expect(rootCenterFromNodes([{ id: 'other', position: { x: 1, y: 1 } }])).toBeNull()
  })

  it('maps gateway logical position to transform-origin percent', () => {
    expect(universeGatewayOriginPct({ x: 400, y: 250 }, { width: 800, height: 500 })).toEqual({
      x: 50,
      y: 50,
    })
  })
})

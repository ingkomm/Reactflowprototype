import { describe, expect, it } from 'vitest'
import { NODE_SIZE, ROOT_HUB_SIZE, orbitTierRadius } from './orbit'
import {
  connectPositionForInitialHub,
  pinGraphSoRootCenteredAtOrigin,
  rootTopLeftAtOrigin,
  snapSocketedConnectsToRoot,
} from './initialHub'
import { INITIAL_NODE_ID } from './types'

describe('Root hub sizing', () => {
  it('matches Mastery orbit tier-1 diameter', () => {
    expect(ROOT_HUB_SIZE).toBe(orbitTierRadius(1, 1) * 2)
    expect(NODE_SIZE.initial).toBe(ROOT_HUB_SIZE)
  })
})

describe('snapSocketedConnectsToRoot', () => {
  it('re-seats Connect nodes onto the current Root rim', () => {
    const rootPos = rootTopLeftAtOrigin()
    const nodes = [
      {
        id: INITIAL_NODE_ID,
        position: { x: 999, y: 999 },
        data: { kind: 'initial' as const },
      },
      {
        id: 'connect-top',
        position: { x: 0, y: 0 },
        data: { kind: 'connect' as const, initialSlot: 0 as const },
      },
    ]
    const pinned = pinGraphSoRootCenteredAtOrigin(nodes)
    const snapped = snapSocketedConnectsToRoot(pinned)
    const root = snapped.find((n) => n.id === INITIAL_NODE_ID)!
    const connect = snapped.find((n) => n.id === 'connect-top')!
    expect(root.position).toEqual(rootPos)
    expect(connect.position).toEqual(connectPositionForInitialHub(root.position, 0))
  })
})

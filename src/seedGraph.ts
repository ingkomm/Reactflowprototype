import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { OrbitTier } from './types'
import { INITIAL_NODE_ID } from './types'
import { notableStagesFromTotal } from './stage'
import {
  layoutMasteryOrbit,
  mergeOrbitOrderFromTiers,
  withMasteryDragFlags,
} from './orbit'
import {
  createPassiveData,
  orbitAdjacentEdges,
  passiveLinkEdge,
} from './graphFactory'

export { INITIAL_NODE_ID }

export const DANCE_MASTERY_ID = 'mastery-dance'
export const GYM_MASTERY_ID = 'mastery-gym'
export const CONNECT_DANCE_ID = 'connect-dance'
export const CONNECT_GYM_ID = 'connect-gym'

const danceOrbitOrderByTier: Partial<Record<OrbitTier, string[]>> = {
  1: ['notable-hiphop', 'notable-kpop', 'small-basic'],
  2: ['small-footwork', 'small-stretch'],
}
const danceOrbitOrder = mergeOrbitOrderFromTiers(2, danceOrbitOrderByTier)
const danceOrbitStartAngleByTier: Partial<Record<OrbitTier, number>> = {
  1: -90,
  2: 0,
}
const gymOrbitOrder = [
  'notable-strength',
  'notable-cardio',
  'small-legs',
  'small-back',
  'small-run',
  'small-core',
]

function buildSeedNodes(): PassiveFlowNode[] {
  const base: PassiveFlowNode[] = [
    {
      id: INITIAL_NODE_ID,
      type: 'passive',
      position: { x: 20, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('initial', 'Initial', { stages: [], symbolId: 'default' }),
    },
    {
      id: CONNECT_DANCE_ID,
      type: 'passive',
      position: { x: 120, y: 280 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        symbolId: 'default',
      }),
    },
    {
      id: CONNECT_GYM_ID,
      type: 'passive',
      position: { x: 120, y: 360 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        symbolId: 'default',
      }),
    },
    {
      id: DANCE_MASTERY_ID,
      type: 'passive',
      position: { x: 260, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('mastery', '댄스', {
        stages: [],
        orbitStartAngle: -90,
        orbitStartAngleByTier: danceOrbitStartAngleByTier,
        orbitOrder: danceOrbitOrder,
        orbitOrderByTier: danceOrbitOrderByTier,
        orbitCapacityByTier: { 1: 6, 2: 6 },
        orbitTierCount: 2,
        symbolId: 'default',
      }),
    },
    {
      id: 'notable-hiphop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '힙합', {
        stages: notableStagesFromTotal(10),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 1,
        orbitSlot: 0,
        symbolId: 'default',
      }),
    },
    {
      id: 'notable-kpop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', 'K-pop', {
        stages: notableStagesFromTotal(8),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 1,
        orbitSlot: 2,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-basic',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '기본기', {
        stages: [],
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 1,
        orbitSlot: 4,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-footwork',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '풋워크', {
        stages: [],
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 2,
        orbitSlot: 0,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-stretch',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '스트레칭', {
        stages: [],
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 2,
        orbitSlot: 3,
        symbolId: 'default',
      }),
    },
    {
      id: GYM_MASTERY_ID,
      type: 'passive',
      position: { x: 760, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('mastery', '운동', {
        stages: [],
        orbitStartAngle: -90,
        orbitOrder: gymOrbitOrder,
        orbitCapacityByTier: { 1: 8 },
        orbitTierCount: 1,
        symbolId: 'default',
      }),
    },
    {
      id: 'notable-strength',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '근력', {
        stages: notableStagesFromTotal(12),
        masteryId: GYM_MASTERY_ID,
        orbitSlot: 0,
        symbolId: 'default',
      }),
    },
    {
      id: 'notable-cardio',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '유산소', {
        stages: notableStagesFromTotal(7),
        masteryId: GYM_MASTERY_ID,
        orbitSlot: 2,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-legs',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '하체', {
        stages: [],
        masteryId: GYM_MASTERY_ID,
        orbitSlot: 4,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-back',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '등', {
        stages: [],
        masteryId: GYM_MASTERY_ID,
        orbitSlot: 5,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-run',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '러닝', {
        stages: [],
        masteryId: GYM_MASTERY_ID,
        orbitSlot: 6,
        symbolId: 'default',
      }),
    },
    {
      id: 'small-core',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '코어', {
        stages: [],
        masteryId: GYM_MASTERY_ID,
        orbitSlot: 7,
        symbolId: 'default',
      }),
    },
  ]

  return withMasteryDragFlags(
    layoutMasteryOrbit(layoutMasteryOrbit(base, DANCE_MASTERY_ID), GYM_MASTERY_ID),
  )
}

export const SEED_NODES = buildSeedNodes()

/** Initial → Connect → Small; orbit ring links among spaced satellites. */
export const SEED_EDGES: Edge[] = [
  passiveLinkEdge(INITIAL_NODE_ID, CONNECT_DANCE_ID),
  passiveLinkEdge(INITIAL_NODE_ID, CONNECT_GYM_ID),
  passiveLinkEdge(CONNECT_DANCE_ID, 'small-basic'),
  passiveLinkEdge(CONNECT_GYM_ID, 'small-legs'),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[1] ?? [], DANCE_MASTERY_ID),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[2] ?? [], DANCE_MASTERY_ID),
  ...orbitAdjacentEdges(gymOrbitOrder, GYM_MASTERY_ID),
]

/** Default node selected on first load. */
export const DEFAULT_SELECTED_NODE_ID = DANCE_MASTERY_ID

import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { OrbitTier, StageData, TrainingLog } from './types'
import { INITIAL_NODE_ID } from './types'
import {
  connectPositionForInitialHub,
  pinGraphSoRootCenteredAtOrigin,
} from './initialHub'
import { createDailyLog, createNotableStages } from './stage'
import {
  layoutMasteryOrbit,
  mergeOrbitOrderFromTiers,
  withMasteryDragFlags,
} from './orbit'
import {
  createPassiveData,
  orbitAdjacentEdges,
  passiveLinkEdge,
  rootSocketLinkEdge,
} from './graphFactory'

export { INITIAL_NODE_ID }

export const DANCE_MASTERY_ID = 'mastery-dance'
/** Root hub sockets: top → dance, bottom-right spare, bottom-left spare. */
export const CONNECT_TOP_ID = 'connect-top'
export const CONNECT_BR_ID = 'connect-br'
export const CONNECT_BL_ID = 'connect-bl'

/** Temporary layout origin; pinned to world (0,0) after orbit layout. */
const INITIAL_POSITION = { x: 80, y: 80 }

const danceOrbitOrderByTier: Partial<Record<OrbitTier, string[]>> = {
  1: ['notable-hiphop', 'notable-kpop', 'small-basic'],
  2: ['small-footwork', 'small-stretch'],
}
const danceOrbitOrder = mergeOrbitOrderFromTiers(2, danceOrbitOrderByTier)
const danceOrbitStartAngleByTier: Partial<Record<OrbitTier, number>> = {
  1: -90,
  2: 0,
}

function demoLog(date: string, note?: string): TrainingLog {
  return createDailyLog(date, note)
}

function notableDemoStages(dates: string[]): StageData[] {
  return createNotableStages(dates.length, dates.map((date) => demoLog(date)))
}

function smallDemoStages(dates: string[]): StageData[] {
  return [
    {
      id: 'stage-demo',
      index: 1,
      label: '연습',
      goal: 9999,
      completedManually: false,
      logs: dates.map((date) => demoLog(date)),
    },
  ]
}

function buildSeedNodes(): PassiveFlowNode[] {
  const base: PassiveFlowNode[] = [
    {
      id: INITIAL_NODE_ID,
      type: 'passive',
      position: INITIAL_POSITION,
      dragHandle: '.node-drag-handle',
      draggable: false,
      data: createPassiveData('initial', 'Root', { stages: [], symbolId: 'default' }),
    },
    {
      id: CONNECT_TOP_ID,
      type: 'passive',
      position: connectPositionForInitialHub(INITIAL_POSITION, 0),
      dragHandle: '.node-drag-handle',
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        initialSlot: 0,
        symbolId: 'default',
      }),
    },
    {
      id: CONNECT_BR_ID,
      type: 'passive',
      position: connectPositionForInitialHub(INITIAL_POSITION, 1),
      dragHandle: '.node-drag-handle',
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        initialSlot: 1,
        symbolId: 'default',
      }),
    },
    {
      id: CONNECT_BL_ID,
      type: 'passive',
      position: connectPositionForInitialHub(INITIAL_POSITION, 2),
      dragHandle: '.node-drag-handle',
      data: createPassiveData('connect', 'Connect', {
        connectEnabled: true,
        initialSlot: 2,
        symbolId: 'default',
      }),
    },
    {
      id: DANCE_MASTERY_ID,
      type: 'passive',
      position: { x: 280, y: 240 },
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
        stages: notableDemoStages(['2025-03-10', '2025-03-15', '2025-03-20']),
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
        stages: notableDemoStages(['2025-04-01', '2025-04-05']),
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
        stages: smallDemoStages(['2025-05-01']),
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
        stages: smallDemoStages(['2025-05-08', '2025-05-12']),
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
        stages: smallDemoStages(['2025-05-15']),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 2,
        orbitSlot: 3,
        symbolId: 'default',
      }),
    },
  ]

  return withMasteryDragFlags(
    pinGraphSoRootCenteredAtOrigin(layoutMasteryOrbit(base, DANCE_MASTERY_ID)),
  )
}

export const SEED_NODES = buildSeedNodes()

/** Root hub → 3 Connect sockets; dance tree branches from top Connect. */
export const SEED_EDGES: Edge[] = [
  rootSocketLinkEdge(INITIAL_NODE_ID, CONNECT_TOP_ID, 0),
  rootSocketLinkEdge(INITIAL_NODE_ID, CONNECT_BR_ID, 1),
  rootSocketLinkEdge(INITIAL_NODE_ID, CONNECT_BL_ID, 2),
  passiveLinkEdge(CONNECT_TOP_ID, 'small-basic'),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[1] ?? [], DANCE_MASTERY_ID),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[2] ?? [], DANCE_MASTERY_ID),
]

export const DEFAULT_SELECTED_NODE_ID = DANCE_MASTERY_ID

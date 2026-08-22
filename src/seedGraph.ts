import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import type { OrbitTier } from './types'
import { defaultStagesForSeed } from './stage'
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

export const DANCE_MASTERY_ID = 'mastery-dance'
export const GYM_MASTERY_ID = 'mastery-gym'

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
      id: 'initial-main',
      type: 'passive',
      position: { x: 20, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('initial', '시작', { stages: [], classId: 'i-default' }),
    },
    {
      id: DANCE_MASTERY_ID,
      type: 'passive',
      position: { x: 260, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('mastery', '댄스', {
        stages: defaultStagesForSeed([
          { label: '기초 그루브', goal: 4, logged: 4 },
          { label: '안무 리허설', goal: 5, logged: 3 },
          { label: '공연', goal: 3, logged: 1 },
        ]),
        orbitStartAngle: -90,
        orbitStartAngleByTier: danceOrbitStartAngleByTier,
        orbitOrder: danceOrbitOrder,
        orbitOrderByTier: danceOrbitOrderByTier,
        orbitTierCount: 2,
        classId: 'm-dance',
      }),
    },
    {
      id: 'notable-hiphop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '힙합', {
        stages: defaultStagesForSeed([
          { label: '기초 스텝', goal: 5, logged: 4 },
          { label: '프리스타일', goal: 4, logged: 2 },
        ]),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 1,
        classId: 'n-hiphop',
      }),
    },
    {
      id: 'notable-kpop',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', 'K-pop', {
        stages: defaultStagesForSeed([
          { label: '안무 암기', goal: 6, logged: 5 },
          { label: '포인트 안무', goal: 3, logged: 3 },
        ]),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 1,
        classId: 'n-kpop',
      }),
    },
    {
      id: 'small-basic',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '기본기', {
        stages: defaultStagesForSeed([{ label: '아이솔레이션', goal: 4, logged: 4 }]),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 1,
        classId: 's-basic',
      }),
    },
    {
      id: 'small-footwork',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '풋워크', {
        stages: defaultStagesForSeed([{ label: '그루브', goal: 3, logged: 2 }]),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 2,
        classId: 's-footwork',
      }),
    },
    {
      id: 'small-stretch',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '스트레칭', {
        stages: defaultStagesForSeed([{ label: '유연성', goal: 3, logged: 1 }]),
        masteryId: DANCE_MASTERY_ID,
        orbitTier: 2,
        classId: 's-stretch',
      }),
    },
    {
      id: GYM_MASTERY_ID,
      type: 'passive',
      position: { x: 760, y: 300 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('mastery', '운동', {
        stages: defaultStagesForSeed([
          { label: '워밍업', goal: 4, logged: 4 },
          { label: '메인', goal: 5, logged: 2 },
          { label: '쿨다운', goal: 3, logged: 0 },
        ]),
        orbitStartAngle: -90,
        orbitOrder: gymOrbitOrder,
        orbitTierCount: 1,
        classId: 'm-gym',
      }),
    },
    {
      id: 'notable-strength',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '근력', {
        stages: defaultStagesForSeed([
          { label: '스쿼트', goal: 6, logged: 6 },
          { label: '데드리프트', goal: 5, logged: 4 },
        ]),
        masteryId: GYM_MASTERY_ID,
        classId: 'n-strength',
      }),
    },
    {
      id: 'notable-cardio',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('notable', '유산소', {
        stages: defaultStagesForSeed([
          { label: '러닝', goal: 5, logged: 5 },
          { label: '사이클', goal: 4, logged: 2 },
        ]),
        masteryId: GYM_MASTERY_ID,
        classId: 'n-cardio',
      }),
    },
    {
      id: 'small-legs',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '하체', {
        stages: defaultStagesForSeed([{ label: '런지', goal: 4, logged: 4 }]),
        masteryId: GYM_MASTERY_ID,
        classId: 's-legs',
      }),
    },
    {
      id: 'small-back',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '등', {
        stages: defaultStagesForSeed([{ label: '풀업', goal: 5, logged: 4 }]),
        masteryId: GYM_MASTERY_ID,
        classId: 's-back',
      }),
    },
    {
      id: 'small-run',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '러닝', {
        stages: defaultStagesForSeed([{ label: '인터벌', goal: 3, logged: 2 }]),
        masteryId: GYM_MASTERY_ID,
        classId: 's-run',
      }),
    },
    {
      id: 'small-core',
      type: 'passive',
      position: { x: 0, y: 0 },
      dragHandle: '.node-drag-handle',
      data: createPassiveData('small', '코어', {
        stages: defaultStagesForSeed([{ label: '플랭크', goal: 4, logged: 3 }]),
        masteryId: GYM_MASTERY_ID,
        classId: 's-core',
      }),
    },
  ]

  return withMasteryDragFlags(
    layoutMasteryOrbit(layoutMasteryOrbit(base, DANCE_MASTERY_ID), GYM_MASTERY_ID),
  )
}

export const SEED_NODES = buildSeedNodes()

export const SEED_EDGES: Edge[] = [
  passiveLinkEdge('initial-main', 'small-basic'),
  passiveLinkEdge('initial-main', 'small-legs'),
  passiveLinkEdge('notable-hiphop', DANCE_MASTERY_ID),
  passiveLinkEdge('notable-strength', GYM_MASTERY_ID),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[1] ?? [], DANCE_MASTERY_ID),
  ...orbitAdjacentEdges(danceOrbitOrderByTier[2] ?? [], DANCE_MASTERY_ID),
  ...orbitAdjacentEdges(gymOrbitOrder, GYM_MASTERY_ID),
]

/** Default node selected on first load. */
export const DEFAULT_SELECTED_NODE_ID = DANCE_MASTERY_ID

export const MASTERY_ORBIT_ROTATE_EVENT = 'pob:mastery-orbit-rotate'

export type MasteryOrbitRotateDetail = {
  nodeId: string
  angleDeg: number
  phase: 'start' | 'move' | 'end'
}

export function dispatchMasteryOrbitRotate(detail: MasteryOrbitRotateDetail) {
  window.dispatchEvent(
    new CustomEvent<MasteryOrbitRotateDetail>(MASTERY_ORBIT_ROTATE_EVENT, {
      detail,
    }),
  )
}

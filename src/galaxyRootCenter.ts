import { NODE_SIZE } from './orbit'
import { INITIAL_NODE_ID } from './types'

/** Default zoom when landing on Galaxy Root after Universe → Galaxy enter. */
export const GALAXY_ENTER_ROOT_ZOOM = 1

export type FlowNodePosition = {
  id: string
  position: { x: number; y: number }
}

/**
 * Flow-space center of the Root hub.
 * Uses existing NODE_SIZE.initial (ROOT_HUB_SIZE) — no duplicate size constants.
 */
export function rootCenterFromNodes(
  nodes: ReadonlyArray<FlowNodePosition>,
): { x: number; y: number } | null {
  const root = nodes.find((n) => n.id === INITIAL_NODE_ID)
  if (!root) return null
  const size = NODE_SIZE.initial
  return {
    x: root.position.x + size / 2,
    y: root.position.y + size / 2,
  }
}

/** Logical Universe gateway position → CSS transform-origin percentages. */
export function universeGatewayOriginPct(
  position: { x: number; y: number },
  universe: { width: number; height: number },
): { x: number; y: number } {
  const w = Math.max(1, universe.width)
  const h = Math.max(1, universe.height)
  return {
    x: (position.x / w) * 100,
    y: (position.y / h) * 100,
  }
}

import type { InitialConnectSlot } from './types'
import { INITIAL_NODE_ID } from './types'
import { NODE_SIZE } from './orbit'

export const INITIAL_CONNECT_SLOT_COUNT = 3

/** Degrees from center (0° = right, -90° = top). */
export function initialConnectSlotAngle(slot: InitialConnectSlot): number {
  return -90 + slot * 120
}

export function rootSocketSourceHandle(slot: InitialConnectSlot): string {
  return `socket-${slot}`
}

export function rootSocketTargetHandle(slot: InitialConnectSlot): string {
  return `socket-${slot}-target`
}

export function parseRootSocketHandle(
  handleId: string | null | undefined,
): InitialConnectSlot | null {
  if (!handleId) return null
  const match = /^socket-([0-2])(?:-target)?$/.exec(handleId)
  if (!match) return null
  return Number(match[1]) as InitialConnectSlot
}

/** Place a Connect node's top-left so it sits on a Root hub socket. */
export function connectPositionForInitialHub(
  initialTopLeft: { x: number; y: number },
  slot: InitialConnectSlot,
): { x: number; y: number } {
  const initialSize = NODE_SIZE.initial
  const connectSize = NODE_SIZE.connect
  const gap = 8
  const orbitRadius = initialSize / 2 + connectSize / 2 + gap
  const cx = initialTopLeft.x + initialSize / 2
  const cy = initialTopLeft.y + initialSize / 2
  const rad = (initialConnectSlotAngle(slot) * Math.PI) / 180
  return {
    x: cx + orbitRadius * Math.cos(rad) - connectSize / 2,
    y: cy + orbitRadius * Math.sin(rad) - connectSize / 2,
  }
}

/** Socket handle position (px from Root node top-left). */
export function initialSocketOffset(slot: InitialConnectSlot): { left: number; top: number } {
  const size = NODE_SIZE.initial
  const cx = size / 2
  const cy = size / 2
  const socketR = size / 2 - 2
  const rad = (initialConnectSlotAngle(slot) * Math.PI) / 180
  return {
    left: cx + socketR * Math.cos(rad),
    top: cy + socketR * Math.sin(rad),
  }
}

/** Absolute flow position of a Root socket handle. */
export function rootSocketFlowPosition(
  nodeTopLeft: { x: number; y: number },
  handleId: string | null | undefined,
): { x: number; y: number } | null {
  const slot = parseRootSocketHandle(handleId)
  if (slot === null) return null
  const offset = initialSocketOffset(slot)
  return {
    x: nodeTopLeft.x + offset.left,
    y: nodeTopLeft.y + offset.top,
  }
}

/** Flow top-left so the Root node center sits at world (0, 0). */
export function rootTopLeftAtOrigin(): { x: number; y: number } {
  const half = NODE_SIZE.initial / 2
  return { x: -half, y: -half }
}

/**
 * Translate the whole graph so Root's center is at (0, 0).
 * Leaves relative layout intact for legacy documents.
 */
export function pinGraphSoRootCenteredAtOrigin<
  T extends { id: string; position: { x: number; y: number } },
>(nodes: T[]): T[] {
  const root = nodes.find((node) => node.id === INITIAL_NODE_ID)
  if (!root) return nodes
  const target = rootTopLeftAtOrigin()
  const dx = target.x - root.position.x
  const dy = target.y - root.position.y
  if (dx === 0 && dy === 0) return nodes
  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + dx,
      y: node.position.y + dy,
    },
  }))
}

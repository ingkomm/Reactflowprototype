import type { InitialConnectSlot } from './types'
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

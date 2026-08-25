import type { PassiveKind } from './types'

/** Pixel diameter of each node face. */
export const NODE_SIZE: Record<PassiveKind, number> = {
  initial: 56,
  connect: 28,
  small: 48,
  notable: 68,
  mastery: 104,
}

export function isInitialKind(kind: PassiveKind) {
  return kind === 'initial'
}

export function isConnectKind(kind: PassiveKind) {
  return kind === 'connect'
}

export function isMasteryKind(kind: PassiveKind) {
  return kind === 'mastery'
}

/** Small / Notable — may sit on a Mastery orbit. */
export function isSatelliteKind(kind: PassiveKind) {
  return kind === 'small' || kind === 'notable'
}

export function isOrbitMemberKind(kind: PassiveKind) {
  return isSatelliteKind(kind)
}

/** Orbit layout geometry — no React/UI dependencies. */

export const BAND_GAP = 7
export const BAND_STROKE = 3.2
export const BAND_BASE_PAD = 10
export const COUNT_BAND_GAP = 12
export const MASTERY_NEON_RIM_PAD = 7
export const MASTERY_NEON_LABEL_GAP = 14

export function bandCountForStages(stageCount: number) {
  return stageCount
}

/** Radius from node center to the middle of the outermost stage band. */
export function outermostBandRadius(stageCount: number, nodeSize: number) {
  if (stageCount <= 0) return nodeSize / 2
  const baseR = nodeSize / 2 + BAND_BASE_PAD
  return baseR + (stageCount - 1) * BAND_GAP
}

export function masteryNeonOuterRadius(nodeSize: number) {
  return nodeSize / 2 + MASTERY_NEON_RIM_PAD
}

export function labelBelowBandOffset(stageCount: number, nodeSize: number) {
  return outermostBandRadius(stageCount, nodeSize) + COUNT_BAND_GAP
}

export function masteryNeonLabelOffset(nodeSize: number) {
  return masteryNeonOuterRadius(nodeSize) + MASTERY_NEON_LABEL_GAP
}

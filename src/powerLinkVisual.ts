import type { PassiveNodeData } from './types'
import { NODE_SIZE } from './orbit'
import { resolvePowerFlowDirection, type PowerFlowMeta } from './power'

type Point = { x: number; y: number }

/** Map power-flow from/to ids to beam/flare coordinates and target node radius. */
export function orientPowerLinkVisual(
  sourceId: string,
  targetId: string,
  sourcePt: Point,
  targetPt: Point,
  sd: PassiveNodeData,
  td: PassiveNodeData,
  flowMeta: PowerFlowMeta,
) {
  const { fromId, toId } = resolvePowerFlowDirection(sourceId, targetId, flowMeta)
  const fromPt = fromId === sourceId ? sourcePt : targetPt
  const toPt = toId === sourceId ? sourcePt : targetPt
  const toData = toId === sourceId ? sd : td
  return {
    sx: fromPt.x,
    sy: fromPt.y,
    tx: toPt.x,
    ty: toPt.y,
    targetFlareR: NODE_SIZE[toData.kind] / 2,
  }
}

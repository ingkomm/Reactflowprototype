import type { PassiveKind, PassiveNodeData } from './types'
import type { PassiveFlowNode } from './components/PassiveNode'
import { outermostBandRadius, BAND_STROKE } from './components/TrainingBands'

export const NODE_SIZE: Record<PassiveKind, number> = {
  initial: 56,
  small: 48,
  notable: 68,
  mastery: 76,
  voidMastery: 76,
  void: 36,
}

export function isMasteryKind(kind: PassiveKind) {
  return kind === 'mastery' || kind === 'voidMastery'
}

/** Void Node / Void Master — no icon, bands, links, or power. */
export function isStealthPassiveKind(kind: PassiveKind) {
  return kind === 'void' || kind === 'voidMastery'
}

export const DEFAULT_ORBIT_RADIUS = 180
/** Degrees. -90 = top of the circle; layout advances clockwise. */
export const DEFAULT_ORBIT_START_ANGLE = -90
export const ORBIT_ANGLE_STEP = 15

export function isSatelliteKind(kind: PassiveKind) {
  return kind === 'small' || kind === 'notable'
}

/** Nodes that may sit on a mastery orbit (including spacers). */
export function isOrbitMemberKind(kind: PassiveKind) {
  return kind === 'small' || kind === 'notable' || kind === 'void'
}

export function isVoidPassing(data: PassiveNodeData) {
  return data.kind === 'void' && Boolean(data.voidPassing)
}

/** Orbit order with passing void nodes removed (used for link adjacency). */
export function getOrbitAdjacencyMembers(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  return getOrderedOrbitSatellites(nodes, masteryId).filter(
    (sat) => !isVoidPassing(sat.data as PassiveNodeData),
  )
}

export function isMasteryOrbitLocked(nodes: PassiveFlowNode[], masteryId: string) {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return false
  return Boolean((mastery.data as PassiveNodeData).orbitLocked)
}

/** Clockwise neighbors on a mastery orbit ring (passing voids collapse out). */
export function areOrbitAdjacent(
  nodes: PassiveFlowNode[],
  masteryId: string,
  aId: string,
  bId: string,
): boolean {
  const collapsed = getOrbitAdjacencyMembers(nodes, masteryId)
  const ordered = collapsed.map((s) => s.id)
  const ia = ordered.indexOf(aId)
  const ib = ordered.indexOf(bId)
  if (ia < 0 || ib < 0) return false
  const n = ordered.length
  if (n < 2) return false
  const diff = Math.abs(ia - ib)
  return diff === 1 || diff === n - 1
}

/** Outermost training-band edge radius from the satellite node center. */
export function satelliteBandOuterRadius(data: PassiveNodeData): number {
  const nodeSize = NODE_SIZE[data.kind]
  const stageCount = data.stages?.length ?? 0
  if (stageCount <= 0) return nodeSize / 2
  return outermostBandRadius(stageCount, nodeSize) + BAND_STROKE / 2
}

/** Angular trim (radians) so an orbit arc at orbitRadius clears a node's outer band. */
function orbitBandAngularTrim(data: PassiveNodeData, orbitRadius: number) {
  const bandOuter = satelliteBandOuterRadius(data)
  return Math.asin(Math.min(1, (bandOuter + 2) / orbitRadius))
}

function orbitSlotAngle(masteryData: PassiveNodeData, index: number, count: number) {
  const startRad =
    ((masteryData.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE) * Math.PI) / 180
  return startRad + (2 * Math.PI * index) / count
}

/** Short adjacent arc along orbit order; null when nodes are not clockwise neighbors. */
export function orbitAdjacentArcSpec(
  nodes: PassiveFlowNode[],
  masteryId: string,
  sourceId: string,
  targetId: string,
): { a1: number; a2: number; arcRadius: number; clockwise: boolean } | null {
  if (!areOrbitAdjacent(nodes, masteryId, sourceId, targetId)) return null

  const mastery = nodes.find((n) => n.id === masteryId)
  const source = nodes.find((n) => n.id === sourceId)
  const target = nodes.find((n) => n.id === targetId)
  if (!mastery || !source || !target) return null

  const md = mastery.data as PassiveNodeData
  const sd = source.data as PassiveNodeData
  const td = target.data as PassiveNodeData
  const orbitR = md.orbitRadius ?? DEFAULT_ORBIT_RADIUS

  const ordered = getOrderedOrbitSatellites(nodes, masteryId).map((s) => s.id)
  const ia = ordered.indexOf(sourceId)
  const ib = ordered.indexOf(targetId)
  const n = ordered.length

  const a1Raw = orbitSlotAngle(md, ia, n)
  const a2Raw = orbitSlotAngle(md, ib, n)
  const clockwise = (ia + 1) % n === ib
  const trimA = orbitBandAngularTrim(sd, orbitR)
  const trimB = orbitBandAngularTrim(td, orbitR)

  const a1 = clockwise ? a1Raw + trimA : a1Raw - trimA
  const a2 = clockwise ? a2Raw - trimB : a2Raw + trimB

  return {
    a1,
    a2,
    arcRadius: orbitR,
    clockwise,
  }
}

/** Pad straight links so strokes stop outside the outermost training band. */
export function linkEndpointPad(data: PassiveNodeData) {
  return satelliteBandOuterRadius(data) + 4
}

export function trimStraightEndpoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePad: number,
  targetPad: number,
) {
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy)
  if (len <= sourcePad + targetPad + 1) {
    return { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty }
  }
  const ux = dx / len
  const uy = dy / len
  return {
    sourceX: sx + ux * sourcePad,
    sourceY: sy + uy * sourcePad,
    targetX: tx - ux * targetPad,
    targetY: ty - uy * targetPad,
  }
}

/** Same-orbit Notable ↔ its Mastery center link. */
export function isSameOrbitNotableMasteryLink(
  sd: PassiveNodeData,
  td: PassiveNodeData,
  sourceId: string,
  targetId: string,
) {
  if (sd.kind === 'notable' && isMasteryKind(td.kind) && td.kind === 'mastery' && sd.masteryId === targetId) return true
  if (td.kind === 'notable' && isMasteryKind(sd.kind) && sd.kind === 'mastery' && td.masteryId === sourceId) return true
  return false
}

export function linkGlowStyle(color: string, selected: boolean, powered: boolean) {
  const strokeMix = powered ? 82 : 38
  const glowMix = powered ? 50 : 14
  return {
    stroke: `color-mix(in srgb, ${color} ${strokeMix}%, #eef3f7)`,
    strokeWidth: selected ? 3 : 2.5,
    filter: `drop-shadow(0 0 ${powered ? 8 : 4}px color-mix(in srgb, ${color} ${glowMix}%, transparent))`,
    opacity: powered ? 1 : 0.38,
    cursor: 'pointer' as const,
  }
}

export function poweredLinkGlowStyle(color: string, selected: boolean) {
  return linkGlowStyle(color, selected, true)
}

export const CROSS_ORBIT_GLOW_COLOR = '#9fe8dd'

export function snapOrbitAngle(degrees: number) {
  const stepped = Math.round(degrees / ORBIT_ANGLE_STEP) * ORBIT_ANGLE_STEP
  // Normalize to (-180, 180]
  let n = ((stepped + 180) % 360 + 360) % 360 - 180
  if (n === -180) n = 180
  return n
}

export function orbitAngleOptions() {
  const options: number[] = []
  for (let deg = -180; deg < 180; deg += ORBIT_ANGLE_STEP) {
    options.push(deg)
  }
  return options
}

/** Screen/flow atan2 degrees; Y grows downward (clockwise from +X). */
export function pointerAngleDeg(cx: number, cy: number, x: number, y: number) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI
}

export function normalizeAngleDelta(degrees: number) {
  let n = ((degrees + 180) % 360 + 360) % 360 - 180
  if (n === -180) n = 180
  return n
}

/** Half-width (flow px) of the empty orbit ring drag target. */
export const ORBIT_HIT_HALF_WIDTH = 20

/**
 * Radius of the node interaction disk (face + stage bands + link rim).
 * Must stay in sync with PassiveNode `--connect-r`.
 */
export function nodeInteractRadius(data: PassiveNodeData) {
  const nodeSize = NODE_SIZE[data.kind]
  const outerBandR = outermostBandRadius(data.stages?.length ?? 0, nodeSize)
  return Math.max(outerBandR + 8, nodeSize / 2 + 16)
}

/**
 * Hit-test empty mastery orbit ring space in flow coordinates.
 * Returns null when the point is on any node (face / bands / link rim),
 * so node drag and connect always win over orbit rotate.
 */
export function findMasteryOrbitRingAt(
  nodes: PassiveFlowNode[],
  flowPoint: { x: number; y: number },
): { masteryId: string; pointerDeg: number } | null {
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!data?.kind) continue
    const c = nodeCenter(node, nodes)
    if (Math.hypot(flowPoint.x - c.x, flowPoint.y - c.y) <= nodeInteractRadius(data) + 4) {
      return null
    }
  }

  let best: { masteryId: string; pointerDeg: number; err: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind)) continue
    const c = nodeCenter(node, nodes)
    const radius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
    const dist = Math.hypot(flowPoint.x - c.x, flowPoint.y - c.y)
    const err = Math.abs(dist - radius)
    if (err > ORBIT_HIT_HALF_WIDTH) continue
    if (!best || err < best.err) {
      best = {
        masteryId: node.id,
        pointerDeg: pointerAngleDeg(c.x, c.y, flowPoint.x, flowPoint.y),
        err,
      }
    }
  }
  return best ? { masteryId: best.masteryId, pointerDeg: best.pointerDeg } : null
}

/** Walk parentId chain to absolute top-left in flow coords. */
export function absolutePosition(
  node: { id: string; position: { x: number; y: number }; parentId?: string },
  nodes: { id: string; position: { x: number; y: number }; parentId?: string }[],
) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

export function toParentRelative(
  absolute: { x: number; y: number },
  parentId: string,
  nodes: { id: string; position: { x: number; y: number }; parentId?: string }[],
) {
  const parent = nodes.find((n) => n.id === parentId)
  if (!parent) return absolute
  const origin = absolutePosition(parent, nodes)
  return { x: absolute.x - origin.x, y: absolute.y - origin.y }
}

export function nodeCenter(
  node: PassiveFlowNode,
  nodes?: { id: string; position: { x: number; y: number }; parentId?: string }[],
) {
  const size = NODE_SIZE[(node.data as PassiveNodeData).kind]
  const origin = nodes ? absolutePosition(node, nodes) : node.position
  return {
    x: origin.x + size / 2,
    y: origin.y + size / 2,
  }
}

export function positionFromCenter(
  centerX: number,
  centerY: number,
  kind: PassiveKind,
): { x: number; y: number } {
  const size = NODE_SIZE[kind]
  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
  }
}

export function getOrbitSatellites(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  return nodes.filter((n) => {
    const data = n.data as PassiveNodeData
    return data.masteryId === masteryId && isOrbitMemberKind(data.kind)
  })
}

/** Resolve clockwise order from mastery.orbitOrder, appending any missing satellites. */
export function getOrderedOrbitSatellites(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  if (!mastery) return []

  const data = mastery.data as PassiveNodeData
  const satellites = getOrbitSatellites(nodes, masteryId)
  const byId = new Map(satellites.map((s) => [s.id, s]))
  const ordered: PassiveFlowNode[] = []

  for (const id of data.orbitOrder ?? []) {
    const sat = byId.get(id)
    if (sat) {
      ordered.push(sat)
      byId.delete(id)
    }
  }
  for (const sat of byId.values()) {
    ordered.push(sat)
  }
  return ordered
}

export function syncOrbitOrder(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const ordered = getOrderedOrbitSatellites(nodes, masteryId)
  const orderIds = ordered.map((s) => s.id)

  return nodes.map((node) => {
    if (node.id !== masteryId) return node
    const data = node.data as PassiveNodeData
    const prev = data.orbitOrder ?? []
    if (
      prev.length === orderIds.length &&
      prev.every((id, i) => id === orderIds[i])
    ) {
      return node
    }
    return { ...node, data: { ...data, orbitOrder: orderIds } }
  })
}

/** Place satellites evenly on a circular orbit around the mastery center. */
export function layoutMasteryOrbit(
  nodes: PassiveFlowNode[],
  masteryId: string,
): PassiveFlowNode[] {
  const synced = syncOrbitOrder(nodes, masteryId)
  const mastery = synced.find((n) => n.id === masteryId)
  if (!mastery || !isMasteryKind((mastery.data as PassiveNodeData).kind)) {
    return synced
  }

  const data = mastery.data as PassiveNodeData
  const radius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
  const startDeg = data.orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE
  const startRad = (startDeg * Math.PI) / 180
  const center = nodeCenter(mastery, synced)
  const satellites = getOrderedOrbitSatellites(synced, masteryId)

  if (satellites.length === 0) {
    return synced
  }

  const positioned = new Map<string, { x: number; y: number }>()
  satellites.forEach((sat, index) => {
    // Screen Y grows downward, so increasing angle from start is clockwise.
    const angle = startRad + (2 * Math.PI * index) / satellites.length
    const kind = (sat.data as PassiveNodeData).kind
    const abs = positionFromCenter(
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle),
      kind,
    )
    positioned.set(
      sat.id,
      sat.parentId ? toParentRelative(abs, sat.parentId, synced) : abs,
    )
  })

  return synced.map((node) => {
    const next = positioned.get(node.id)
    if (!next) return node
    return {
      ...node,
      position: next,
      draggable: true,
    }
  })
}

export function withMasteryDragFlags(
  nodes: PassiveFlowNode[],
  selectedId: string | null = null,
): PassiveFlowNode[] {
  return nodes.map((node) => {
    const data = node.data as PassiveNodeData
    // Mastery orbits are large; keep them under satellite titles/links visually.
    const baseZ = isMasteryKind(data.kind) ? 1 : 6
    return {
      ...node,
      dragHandle: '.node-drag-handle',
      draggable: true,
      zIndex: node.id === selectedId ? 40 : baseZ,
    }
  })
}

/**
 * Remove nodes, detach orphans from deleted masteries, prune orbitOrder,
 * then evenly re-layout every affected mastery orbit.
 */
export function removeNodesAndRelayout(
  nodes: PassiveFlowNode[],
  removeIds: Iterable<string>,
  selectedId: string | null = null,
): PassiveFlowNode[] {
  const ids = new Set(removeIds)
  if (ids.size === 0) return withMasteryDragFlags(nodes, selectedId)

  const affectedMasteries = new Set<string>()

  for (const node of nodes) {
    if (!ids.has(node.id)) continue
    const data = node.data as PassiveNodeData
    if (data.masteryId) affectedMasteries.add(data.masteryId)
    if (isMasteryKind(data.kind)) affectedMasteries.add(node.id)
  }

  let next = nodes
    .filter((n) => !ids.has(n.id))
    .map((node) => {
      const data = node.data as PassiveNodeData
      if (data.masteryId && ids.has(data.masteryId)) {
        return {
          ...node,
          data: { ...data, masteryId: null },
          draggable: true,
        }
      }
      if (isMasteryKind(data.kind)) {
        const pruned = (data.orbitOrder ?? []).filter((id) => !ids.has(id))
        if (pruned.length !== (data.orbitOrder ?? []).length) {
          affectedMasteries.add(node.id)
          return { ...node, data: { ...data, orbitOrder: pruned } }
        }
      }
      return node
    })

  for (const masteryId of affectedMasteries) {
    if (ids.has(masteryId)) continue
    next = layoutMasteryOrbit(next, masteryId)
  }

  return withMasteryDragFlags(next, selectedId)
}

export function totalTrainingCount(trainings: { count: number }[]) {
  return trainings.reduce((sum, t) => sum + (Number.isFinite(t.count) ? t.count : 0), 0)
}

export function trainingProgressLabel(total: number) {
  const rem = total % 3
  const filled = rem === 0 && total > 0 ? 3 : rem
  return `${filled}/3`
}

/** Fractional band level (3 trainings = 1.0). */
export function trainingBandLevel(total: number) {
  return Math.max(0, total) / 3
}

/** True when both satellites belong to the same Mastery orbit. */
export function shareSameOrbit(
  a: { data: PassiveNodeData },
  b: { data: PassiveNodeData },
) {
  const am = a.data.masteryId
  const bm = b.data.masteryId
  return Boolean(am && bm && am === bm)
}

export const ORBIT_ATTACH_SLACK = 56
export const ORBIT_DETACH_SLACK = 72

export function distanceBetweenCenters(
  a: PassiveFlowNode,
  b: PassiveFlowNode,
  nodes?: PassiveFlowNode[],
) {
  const ca = nodeCenter(a, nodes)
  const cb = nodeCenter(b, nodes)
  return Math.hypot(ca.x - cb.x, ca.y - cb.y)
}

/** Nearest mastery by center distance. */
export function findNearestMastery(nodes: PassiveFlowNode[], satellite: PassiveFlowNode) {
  let best: { mastery: PassiveFlowNode; dist: number; radius: number } | null = null
  for (const node of nodes) {
    const data = node.data as PassiveNodeData
    if (!isMasteryKind(data.kind)) continue
    const dist = distanceBetweenCenters(satellite, node, nodes)
    const radius = data.orbitRadius ?? DEFAULT_ORBIT_RADIUS
    if (!best || dist < best.dist) {
      best = { mastery: node, dist, radius }
    }
  }
  return best
}

/** Insert satellite into clockwise orbit order using drop angle around mastery. */
export function orbitOrderByDropAngle(
  nodes: PassiveFlowNode[],
  masteryId: string,
  satelliteId: string,
): string[] {
  const mastery = nodes.find((n) => n.id === masteryId)
  const satellite = nodes.find((n) => n.id === satelliteId)
  if (!mastery || !satellite) return [satelliteId]

  const mc = nodeCenter(mastery, nodes)
  const start =
    (((mastery.data as PassiveNodeData).orbitStartAngle ?? DEFAULT_ORBIT_START_ANGLE) * Math.PI) /
    180

  const norm = (angle: number) => {
    let rel = angle - start
    while (rel < 0) rel += Math.PI * 2
    while (rel >= Math.PI * 2) rel -= Math.PI * 2
    return rel
  }

  const others = getOrderedOrbitSatellites(nodes, masteryId).filter((s) => s.id !== satelliteId)
  const items = [
    ...others.map((o) => {
      const c = nodeCenter(o, nodes)
      return { id: o.id, rel: norm(Math.atan2(c.y - mc.y, c.x - mc.x)) }
    }),
    (() => {
      const c = nodeCenter(satellite, nodes)
      return { id: satelliteId, rel: norm(Math.atan2(c.y - mc.y, c.x - mc.x)) }
    })(),
  ]
  items.sort((a, b) => a.rel - b.rel)
  return items.map((i) => i.id)
}

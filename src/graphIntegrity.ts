import type { SerializedEdge, SerializedFlowNode } from './graphDocument'
import { INITIAL_NODE_ID } from './types'
import type { PassiveNodeData, OrbitTier } from './types'
import { clampOrbitTierCapacity } from './limits'
import { normalizeOrbitTier, normalizeOrbitTierCount } from './orbit'

const ALLOWED_EDGE_TYPES = new Set(['center', 'orbit', 'notable', undefined])

export type IntegrityIssue = { message: string }

function orbitTierKeys(data: PassiveNodeData): OrbitTier[] {
  const count = normalizeOrbitTierCount(data.orbitTierCount)
  const tiers: OrbitTier[] = []
  for (let t = 1; t <= count; t++) tiers.push(t as OrbitTier)
  return tiers
}

/** Structural checks beyond JSON shape (Root singleton, refs, slots, edge types). */
export function validateGraphIntegrity(
  nodes: SerializedFlowNode[],
  edges: SerializedEdge[],
): IntegrityIssue | null {
  const initialNodes = nodes.filter((n) => n.data.kind === 'initial')
  if (initialNodes.length !== 1) {
    return { message: 'Root(initial) 노드는 정확히 1개여야 합니다.' }
  }
  if (initialNodes[0]!.id !== INITIAL_NODE_ID) {
    return { message: `Root 노드 id는 ${INITIAL_NODE_ID} 이어야 합니다.` }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const masteryIds = new Set(
    nodes.filter((n) => n.data.kind === 'mastery' || n.data.kind === 'voidMastery').map((n) => n.id),
  )

  for (const node of nodes) {
    const data = node.data
    if (data.masteryId && !masteryIds.has(data.masteryId)) {
      return { message: `존재하지 않는 masteryId 참조: ${node.id}` }
    }

    if (data.kind === 'mastery' || data.kind === 'voidMastery') {
      for (const tier of orbitTierKeys(data)) {
        const capacity = clampOrbitTierCapacity(
          data.orbitCapacityByTier?.[tier] ?? 6,
        )
        if (capacity < 1 || capacity > 24) {
          return { message: `오르빗 용량은 1~24 사이여야 합니다 (${node.id}, tier ${tier}).` }
        }
      }
    }
  }

  const slotUsage = new Map<string, Set<number>>()
  for (const node of nodes) {
    const data = node.data
    if (!data.masteryId || data.orbitSlot == null) continue
    const mastery = nodeById.get(data.masteryId)
    if (!mastery) continue
    const tier = normalizeOrbitTier(data.orbitTier, normalizeOrbitTierCount(mastery.data.orbitTierCount))
    const key = `${data.masteryId}:${tier}`
    if (!slotUsage.has(key)) slotUsage.set(key, new Set())
    const used = slotUsage.get(key)!
    if (used.has(data.orbitSlot)) {
      return { message: `오르빗 슬롯 중복: ${data.masteryId} tier ${tier} slot ${data.orbitSlot}` }
    }
    used.add(data.orbitSlot)
  }

  for (const edge of edges) {
    if (!ALLOWED_EDGE_TYPES.has(edge.type as 'center' | 'orbit' | 'notable' | undefined)) {
      return { message: `지원하지 않는 edge type: ${edge.type ?? '(default)'}` }
    }
    if (edge.type === 'orbit') {
      const masteryId = (edge.data as { masteryId?: string } | undefined)?.masteryId
      if (!masteryId || !masteryIds.has(masteryId)) {
        return { message: `orbit 엣지 masteryId 참조가 올바르지 않습니다: ${edge.id}` }
      }
    }
  }

  const connectSlots = new Map<number, string>()
  for (const node of nodes) {
    if (node.data.kind !== 'connect') continue
    const slot = node.data.initialSlot
    if (slot == null) continue
    if (connectSlots.has(slot)) {
      return { message: `Root Connect 소켓 ${slot}이 중복 사용되었습니다.` }
    }
    connectSlots.set(slot, node.id)
  }

  return null
}

import type { SerializedEdge, SerializedFlowNode } from './graphDocument'
import { INITIAL_NODE_ID } from './types'
import type { PassiveNodeData, OrbitTier } from './types'
import {
  MAX_ORBIT_TIER_CAPACITY,
  MIN_ORBIT_TIER_CAPACITY,
} from './limits'
import { normalizeOrbitTier, normalizeOrbitTierCount } from './orbit'
import { parseRootSocketHandle } from './initialHub'
import { isValidRootOrbitMemberKind, normalizeRootOrbitTier, normalizeRootOrbitSlot, getRootOrbitCapacity } from './rootOrbit'

const ALLOWED_EDGE_TYPES = new Set(['center', 'orbit', undefined])

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
        const raw = data.orbitCapacityByTier?.[tier] ?? 6
        if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.floor(raw) !== raw) {
          return { message: `오르빗 용량은 정수여야 합니다 (${node.id}, tier ${tier}).` }
        }
        if (raw < MIN_ORBIT_TIER_CAPACITY || raw > MAX_ORBIT_TIER_CAPACITY) {
          return { message: `오르빗 용량은 ${MIN_ORBIT_TIER_CAPACITY}~${MAX_ORBIT_TIER_CAPACITY} 사이여야 합니다 (${node.id}, tier ${tier}).` }
        }
      }
    }
  }

  const slotUsage = new Map<string, Set<number>>()
  for (const node of nodes) {
    const data = node.data
    if (!data.masteryId || data.orbitSlot == null) continue
    const slot = data.orbitSlot
    if (!Number.isInteger(slot) || slot < 0) {
      return { message: `오르빗 슬롯은 0 이상의 정수여야 합니다 (${node.id}).` }
    }
    const mastery = nodeById.get(data.masteryId)
    if (!mastery) continue
    const tier = normalizeOrbitTier(data.orbitTier, normalizeOrbitTierCount(mastery.data.orbitTierCount))
    const capacity = mastery.data.orbitCapacityByTier?.[tier] ?? 6
    if (slot >= capacity) {
      return { message: `오르빗 슬롯이 용량을 초과합니다 (${node.id}, slot ${slot}, capacity ${capacity}).` }
    }
    const key = `${data.masteryId}:${tier}`
    if (!slotUsage.has(key)) slotUsage.set(key, new Set())
    const used = slotUsage.get(key)!
    if (used.has(slot)) {
      return { message: `오르빗 슬롯 중복: ${data.masteryId} tier ${tier} slot ${slot}` }
    }
    used.add(slot)
  }

  for (const edge of edges) {
    if (!ALLOWED_EDGE_TYPES.has(edge.type as 'center' | 'orbit' | undefined)) {
      return { message: `지원하지 않는 edge type: ${edge.type ?? '(default)'}` }
    }
    if (edge.type === 'orbit') {
      const masteryId = (edge.data as { masteryId?: string } | undefined)?.masteryId
      if (!masteryId || !masteryIds.has(masteryId)) {
        return { message: `orbit 엣지 masteryId 참조가 올바르지 않습니다: ${edge.id}` }
      }
    }
  }

  
  // Root↔Connect: edge.sourceHandle is authoritative after migration.
  // At parse time, allow legacy repair cases (missing handle + initialSlot, or mismatch).
  const rootConnectBySlot = new Map<number, string>()
  const rootConnectByNode = new Map<string, number>()
  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    const rootIsSource = source.data.kind === 'initial'
    const rootIsTarget = target.data.kind === 'initial'
    if (!rootIsSource && !rootIsTarget) continue
    const other = rootIsSource ? target : source
    if (other.data.kind !== 'connect') continue

    const handle = rootIsSource ? edge.sourceHandle : edge.targetHandle
    const slotFromHandle = parseRootSocketHandle(handle ?? null)
    const slotFromData =
      other.data.initialSlot != null && other.data.initialSlot >= 0 && other.data.initialSlot <= 5
        ? other.data.initialSlot
        : null
    const slot = slotFromHandle ?? slotFromData
    if (slot == null) {
      return { message: `Root↔Connect 엣지를 복구할 수 없습니다: ${edge.id}` }
    }
    if (rootConnectBySlot.has(slot) && rootConnectBySlot.get(slot) !== other.id) {
      return { message: `Root Connect 소켓 ${slot}이 중복 사용되었습니다.` }
    }
    if (rootConnectByNode.has(other.id) && rootConnectByNode.get(other.id) !== slot) {
      return { message: `Connect 노드에 Root 소켓 엣지가 둘 이상입니다: ${other.id}` }
    }
    rootConnectBySlot.set(slot, other.id)
    rootConnectByNode.set(other.id, slot)
  }

// Root Orbit member field integrity (after load migration).
  const rootOrbitSlots = new Map<string, Set<number>>()
  const rootData = initialNodes[0]!.data
  for (const node of nodes) {
    const data = node.data
    if (!isValidRootOrbitMemberKind(data.kind)) continue
    const tier = normalizeRootOrbitTier(data.rootOrbitTier)
    if (tier == null) continue
    const slot = normalizeRootOrbitSlot(data.rootOrbitSlot)
    if (slot == null) {
      return { message: `Root Orbit 슬롯이 없습니다: ${node.id}` }
    }
    if (slot < 0) {
      return { message: `Root Orbit 슬롯은 0 이상의 정수여야 합니다: ${node.id}` }
    }
    const capacity = getRootOrbitCapacity(rootData, tier)
    if (slot >= capacity) {
      return { message: `Root Orbit 슬롯이 용량을 초과합니다: ${node.id} tier ${tier} slot ${slot}` }
    }
    const key = `root:${tier}`
    if (!rootOrbitSlots.has(key)) rootOrbitSlots.set(key, new Set())
    const used = rootOrbitSlots.get(key)!
    if (used.has(slot)) {
      return { message: `Root Orbit 슬롯 중복: tier ${tier} slot ${slot}` }
    }
    used.add(slot)
  }

  return null
}

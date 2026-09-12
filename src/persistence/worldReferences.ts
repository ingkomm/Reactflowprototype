/**
 * Pure Reference Library helpers (World-global Source identity).
 */
import { createReferenceId } from '../ids'
import { MAX_REFERENCES } from '../limits'
import type { GraphDocumentV01 } from '../graphDocument'
import type {
  ReferenceDocumentV03,
  WorldDocumentV03,
} from './worldTypes'

export type ReferenceUsageV03 = {
  galaxyId: string
  galaxyName: string
  shardNodeId: string
  shardLabel: string
}

export type ReferenceInput = {
  title: string
  ddc?: string
  creator?: string
  year?: string
  locator?: string
  note?: string
}

function trimOrUndefined(value: string | undefined): string | undefined {
  if (value == null) return undefined
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

export function normalizeReference(raw: ReferenceInput & { id?: string }): ReferenceDocumentV03 {
  const title = raw.title.trim()
  if (!title) {
    throw new Error('Reference title is required')
  }
  return {
    id: raw.id?.trim() || createReferenceId(),
    title,
    ddc: trimOrUndefined(raw.ddc),
    creator: trimOrUndefined(raw.creator),
    year: trimOrUndefined(raw.year),
    locator: trimOrUndefined(raw.locator),
    note: trimOrUndefined(raw.note),
  }
}

export function getReferenceById(
  world: WorldDocumentV03,
  referenceId: string,
): ReferenceDocumentV03 | null {
  return world.references.find((r) => r.id === referenceId) ?? null
}

export function collectReferenceUsages(
  world: WorldDocumentV03,
  referenceId: string,
): ReferenceUsageV03[] {
  const usages: ReferenceUsageV03[] = []
  for (const galaxy of world.galaxies) {
    for (const node of galaxy.graph.nodes) {
      const data = node.data as { kind?: string; label?: string; referenceId?: string | null }
      if (data.kind !== 'shard') continue
      if (data.referenceId !== referenceId) continue
      usages.push({
        galaxyId: galaxy.id,
        galaxyName: galaxy.name,
        shardNodeId: node.id,
        shardLabel: typeof data.label === 'string' ? data.label : node.id,
      })
    }
  }
  return usages
}

export function countReferenceUsages(world: WorldDocumentV03, referenceId: string): number {
  return collectReferenceUsages(world, referenceId).length
}

export function addReference(
  world: WorldDocumentV03,
  input: ReferenceInput,
): WorldDocumentV03 {
  if (world.references.length >= MAX_REFERENCES) {
    throw new Error(`Reference Library exceeds safety cap (${MAX_REFERENCES})`)
  }
  const ref = normalizeReference(input)
  if (world.references.some((r) => r.id === ref.id)) {
    throw new Error(`duplicate reference id: ${ref.id}`)
  }
  return { ...world, references: [...world.references, ref] }
}

export function updateReference(
  world: WorldDocumentV03,
  referenceId: string,
  patch: Partial<ReferenceInput>,
): WorldDocumentV03 {
  const index = world.references.findIndex((r) => r.id === referenceId)
  if (index < 0) throw new Error(`reference not found: ${referenceId}`)
  const prev = world.references[index]!
  const next = normalizeReference({
    id: prev.id,
    title: patch.title ?? prev.title,
    ddc: patch.ddc !== undefined ? patch.ddc : prev.ddc,
    creator: patch.creator !== undefined ? patch.creator : prev.creator,
    year: patch.year !== undefined ? patch.year : prev.year,
    locator: patch.locator !== undefined ? patch.locator : prev.locator,
    note: patch.note !== undefined ? patch.note : prev.note,
  })
  const references = world.references.map((r, i) => (i === index ? next : r))
  return { ...world, references }
}

export function removeReference(
  world: WorldDocumentV03,
  referenceId: string,
): WorldDocumentV03 {
  if (countReferenceUsages(world, referenceId) > 0) {
    throw new Error('Cannot delete a Reference that is used by one or more Shards')
  }
  if (!world.references.some((r) => r.id === referenceId)) {
    throw new Error(`reference not found: ${referenceId}`)
  }
  return {
    ...world,
    references: world.references.filter((r) => r.id !== referenceId),
  }
}

/** DDC-first ascending, then title. Missing DDC sorts after DDC entries. */
export function sortReferences(refs: ReferenceDocumentV03[]): ReferenceDocumentV03[] {
  return [...refs].sort((a, b) => {
    const ad = (a.ddc ?? '').trim()
    const bd = (b.ddc ?? '').trim()
    if (ad && !bd) return -1
    if (!ad && bd) return 1
    if (ad && bd) {
      const cmp = ad.localeCompare(bd, undefined, { numeric: true, sensitivity: 'base' })
      if (cmp !== 0) return cmp
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })
}

export function filterReferences(
  refs: ReferenceDocumentV03[],
  query: string,
): ReferenceDocumentV03[] {
  const q = query.trim().toLowerCase()
  if (!q) return sortReferences(refs)
  return sortReferences(
    refs.filter((r) => {
      const hay = [r.title, r.ddc, r.creator, r.year, r.locator, r.note]
        .filter(Boolean)
        .join('\n')
        .toLowerCase()
      return hay.includes(q)
    }),
  )
}

export function graphHasReferenceId(graph: GraphDocumentV01, referenceId: string): boolean {
  return graph.nodes.some((n) => {
    const data = n.data as { kind?: string; referenceId?: string | null }
    return data.kind === 'shard' && data.referenceId === referenceId
  })
}

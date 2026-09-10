/** Full-UUID entity ids for newly created graph objects. Existing ids are never rewritten. */

export type EntityIdKind = 'node' | 'log' | 'media' | 'edge' | 'symbol' | 'stage'

export function createEntityId(kind: EntityIdKind): string {
  return `${kind}_${crypto.randomUUID()}`
}

export function createNodeId(): string {
  return createEntityId('node')
}

export function createLogId(): string {
  return createEntityId('log')
}

export function createMediaId(): string {
  return createEntityId('media')
}

export function createEdgeId(): string {
  return createEntityId('edge')
}

export function createSymbolId(): string {
  return createEntityId('symbol')
}

export function createStageId(): string {
  return createEntityId('stage')
}

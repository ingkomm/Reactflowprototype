/**
 * Internal World persistence format (v0.3).
 * Separate from portable GraphDocument JSON (schema 0.1)
 * and from WorkspaceManifest v0.2.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import type {
  AssetMetaV02,
  CustomSymbolMetaV02,
  WorkspaceLoadIssue,
} from './workspaceTypes'

export const WORLD_SCHEMA_VERSION = '0.3' as const
export type WorldSchemaVersion = typeof WORLD_SCHEMA_VERSION

/** AppData / manifest storage version for the World store (≠ GraphDocument 0.1). */
export const WORLD_STORAGE_VERSION = '0.3' as const
export type WorldStorageVersion = typeof WORLD_STORAGE_VERSION

export const DEFAULT_UNIVERSE_WIDTH = 1600
export const DEFAULT_UNIVERSE_HEIGHT = 1000

/** Deterministic Galaxy id for 0.2→0.3 migration and first-run bootstrap. */
export const DEFAULT_GALAXY_ID = 'galaxy-main'
export const DEFAULT_GALAXY_NAME = 'Galaxy 1'
export const DEFAULT_GALAXY_POSITION = { x: 800, y: 500 } as const

export type UniverseDocumentV03 = {
  width: number
  height: number
}

export type GalaxyDocumentV03 = {
  id: string
  name: string
  universePosition: { x: number; y: number }
  graph: GraphDocumentV01
}

export type WorldDocumentV03 = {
  schemaVersion: WorldSchemaVersion
  universe: UniverseDocumentV03
  galaxies: GalaxyDocumentV03[]
}

export type GalaxyManifestGraphV03 = Omit<GraphDocumentV01, 'customSymbols'> & {
  customSymbols: CustomSymbolMetaV02[]
}

export type GalaxyManifestV03 = {
  id: string
  name: string
  universePosition: { x: number; y: number }
  graph: GalaxyManifestGraphV03
}

/**
 * Internal World snapshot.
 * Nested GraphDocument fields stay portable-compatible except customSymbols are asset-linked.
 */
export type WorldManifestV03 = {
  storageVersion: WorldStorageVersion
  world: {
    schemaVersion: WorldSchemaVersion
    universe: UniverseDocumentV03
    galaxies: GalaxyManifestV03[]
  }
  assets: AssetMetaV02[]
}

export type WorldLoadIssue = WorkspaceLoadIssue

export type WorldLoadOk = {
  ok: true
  world: WorldDocumentV03
  issues: WorldLoadIssue[]
}

export type WorldLoadErr = {
  ok: false
  reason: 'missing' | 'corrupt' | 'io' | 'missing_asset'
  message: string
  issues?: WorldLoadIssue[]
}

export type WorldLoadResult = WorldLoadOk | WorldLoadErr

export type WorldSaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'too_large' | 'io' | 'invalid'; message?: string }

/** Explicit World runtime held by the app (not a module singleton). */
export type GraphAppWorldState = {
  world: WorldDocumentV03
  activeGalaxyId: string
}

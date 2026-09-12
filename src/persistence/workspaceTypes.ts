/**
 * Internal workspace persistence format (v0.2).
 * Separate from portable GraphDocument JSON (schema 0.1).
 */
import type { GraphDocumentV01 } from '../graphDocument'
import type { CustomSymbol } from '../types'

export const WORKSPACE_STORAGE_VERSION = '0.2' as const
export type WorkspaceStorageVersion = typeof WORKSPACE_STORAGE_VERSION

/** Custom symbol metadata in internal storage — markup lives in Asset Store. */
export type CustomSymbolMetaV02 = Omit<CustomSymbol, 'markup'> & {
  assetId: string
}

export type AssetKindV02 = 'custom-symbol-markup'

export type AssetMetaV02 = {
  assetId: string
  kind: AssetKindV02
  mimeType: string
  byteLength: number
  /** Optional original hint (never an AppData filesystem path). */
  label?: string
}

/**
 * Internal workspace snapshot.
 * GraphDocument fields remain portable-compatible except customSymbols are asset-linked.
 */
export type WorkspaceManifestV02 = {
  storageVersion: WorkspaceStorageVersion
  document: Omit<GraphDocumentV01, 'customSymbols'> & {
    customSymbols: CustomSymbolMetaV02[]
  }
  assets: AssetMetaV02[]
}

export type WorkspaceLoadIssue =
  | { code: 'missing_asset'; assetId: string; symbolId?: string }
  | { code: 'corrupt_asset'; assetId: string; symbolId?: string }
  | { code: 'corrupt_manifest'; message: string }
  | { code: 'io'; message: string }

export type WorkspaceLoadOk = {
  ok: true
  /** Hydrated portable GraphDocument (markup filled from assets). */
  document: GraphDocumentV01
  issues: WorkspaceLoadIssue[]
}

export type WorkspaceLoadErr = {
  ok: false
  reason: 'missing' | 'corrupt' | 'io' | 'missing_asset'
  message: string
  issues?: WorkspaceLoadIssue[]
}

export type WorkspaceLoadResult = WorkspaceLoadOk | WorkspaceLoadErr

export type WorkspaceSaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'too_large' | 'io'; message?: string }

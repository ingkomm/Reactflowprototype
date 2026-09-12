/**
 * Custom Symbol markup ↔ Asset Store for internal workspace storage.
 * Runtime / portable GraphDocument keep hydrated CustomSymbol.markup.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import type { CustomSymbol } from '../types'
import { createAssetId, textToBytes, type AssetStore } from './assetStore'
import type {
  AssetMetaV02,
  CustomSymbolMetaV02,
  WorkspaceLoadIssue,
  WorkspaceManifestV02,
} from './workspaceTypes'
import { WORKSPACE_STORAGE_VERSION } from './workspaceTypes'

export function isCustomSymbolMeta(value: unknown): value is CustomSymbolMetaV02 {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.viewBox === 'string' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    typeof r.assetId === 'string' &&
    typeof r.markup !== 'string'
  )
}

export function isHydratedCustomSymbol(value: unknown): value is CustomSymbol {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return typeof r.markup === 'string' && typeof r.id === 'string'
}

export type ExternalizeOptions = {
  /** Previous symbolId → assetId map for the slot being saved (reuse when markup unchanged). */
  previousAssetIdsBySymbolId?: Map<string, string>
  /**
   * Asset IDs currently referenced by current and/or backup manifests.
   * These must never be overwritten in-place.
   */
  committedAssetIds?: Set<string>
}

export async function externalizeCustomSymbols(
  symbols: CustomSymbol[],
  assets: AssetStore,
  options?: ExternalizeOptions | Map<string, string>,
): Promise<{ metas: CustomSymbolMetaV02[]; assetMetas: AssetMetaV02[] }> {
  // Back-compat: older callers passed a reuse map as the third argument.
  const opts: ExternalizeOptions =
    options instanceof Map ? { previousAssetIdsBySymbolId: options } : (options ?? {})
  const previous = opts.previousAssetIdsBySymbolId
  const committed = opts.committedAssetIds ?? new Set<string>()

  const metas: CustomSymbolMetaV02[] = []
  const assetMetas: AssetMetaV02[] = []

  for (const symbol of symbols) {
    const prevId = previous?.get(symbol.id)
    if (prevId) {
      const existing = await assets.get(prevId)
      if (existing?.text === symbol.markup) {
        const actualLen = textToBytes(existing.text).byteLength
        if (existing.byteLength === actualLen) {
          const { markup: _markup, ...rest } = symbol
          metas.push({ ...rest, assetId: prevId })
          assetMetas.push({
            assetId: prevId,
            kind: existing.kind,
            mimeType: existing.mimeType,
            byteLength: existing.byteLength,
            label: existing.label,
          })
          continue
        }
      }
    }

    // Markup changed (or previous missing/corrupt): always allocate a new assetId.
    // Never put() into an id that current/backup already reference.
    let assetId = createAssetId()
    while (committed.has(assetId) || (prevId != null && assetId === prevId)) {
      assetId = createAssetId()
    }

    const record = await assets.put({
      assetId,
      kind: 'custom-symbol-markup',
      mimeType: 'image/svg+xml',
      bytes: textToBytes(symbol.markup),
      label: symbol.name,
    })
    const { markup: _markup, ...rest } = symbol
    metas.push({ ...rest, assetId: record.assetId })
    assetMetas.push({
      assetId: record.assetId,
      kind: record.kind,
      mimeType: record.mimeType,
      byteLength: record.byteLength,
      label: record.label,
    })
  }

  return { metas, assetMetas }
}

export async function hydrateCustomSymbols(
  metas: CustomSymbolMetaV02[],
  assets: AssetStore,
  expectedByteLengthByAssetId?: Map<string, number>,
): Promise<{ symbols: CustomSymbol[]; issues: WorkspaceLoadIssue[] }> {
  const symbols: CustomSymbol[] = []
  const issues: WorkspaceLoadIssue[] = []

  for (const meta of metas) {
    const record = await assets.get(meta.assetId)
    if (!record) {
      issues.push({ code: 'missing_asset', assetId: meta.assetId, symbolId: meta.id })
      continue
    }
    if (!record.text || record.text.length === 0) {
      issues.push({ code: 'corrupt_asset', assetId: meta.assetId, symbolId: meta.id })
      continue
    }
    const actualLen = textToBytes(record.text).byteLength
    if (record.byteLength !== actualLen) {
      issues.push({ code: 'corrupt_asset', assetId: meta.assetId, symbolId: meta.id })
      continue
    }
    const expected = expectedByteLengthByAssetId?.get(meta.assetId)
    if (expected != null && expected !== actualLen) {
      issues.push({ code: 'corrupt_asset', assetId: meta.assetId, symbolId: meta.id })
      continue
    }
    const { assetId: _assetId, ...rest } = meta
    symbols.push({ ...rest, markup: record.text })
  }

  return { symbols, issues }
}

export async function buildManifestFromDocument(
  document: GraphDocumentV01,
  assets: AssetStore,
  options?: ExternalizeOptions | Map<string, string>,
): Promise<WorkspaceManifestV02> {
  const { metas, assetMetas } = await externalizeCustomSymbols(
    document.customSymbols,
    assets,
    options,
  )
  const { customSymbols: _cs, ...rest } = document
  return {
    storageVersion: WORKSPACE_STORAGE_VERSION,
    document: { ...rest, customSymbols: metas },
    assets: assetMetas,
  }
}

export async function hydrateManifest(
  manifest: WorkspaceManifestV02,
  assets: AssetStore,
): Promise<{ document: GraphDocumentV01; issues: WorkspaceLoadIssue[] }> {
  const expectedByteLengthByAssetId = new Map(
    manifest.assets.map((a) => [a.assetId, a.byteLength] as const),
  )
  const { symbols, issues } = await hydrateCustomSymbols(
    manifest.document.customSymbols,
    assets,
    expectedByteLengthByAssetId,
  )
  return {
    document: { ...manifest.document, customSymbols: symbols },
    issues,
  }
}

export function collectAssetIdsFromManifest(manifest: WorkspaceManifestV02): Set<string> {
  const ids = new Set<string>()
  for (const a of manifest.assets) ids.add(a.assetId)
  for (const s of manifest.document.customSymbols) ids.add(s.assetId)
  return ids
}

export function symbolIdToAssetIdMap(manifest: WorkspaceManifestV02): Map<string, string> {
  const map = new Map<string, string>()
  for (const s of manifest.document.customSymbols) map.set(s.id, s.assetId)
  return map
}

export function parseWorkspaceManifestJson(text: string): WorkspaceManifestV02 | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const r = parsed as Record<string, unknown>
    if (r.storageVersion !== WORKSPACE_STORAGE_VERSION) return null
    if (!r.document || typeof r.document !== 'object') return null
    if (!Array.isArray(r.assets)) return null
    const doc = r.document as Record<string, unknown>
    if (!Array.isArray(doc.customSymbols)) return null
    for (const item of doc.customSymbols) {
      if (!isCustomSymbolMeta(item) && !isHydratedCustomSymbol(item)) return null
    }
    return parsed as WorkspaceManifestV02
  } catch {
    return null
  }
}

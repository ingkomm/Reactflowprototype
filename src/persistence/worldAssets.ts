/**
 * Custom Symbol markup ↔ Asset Store for World (v0.3) internal persistence.
 * Asset identity is scoped per Galaxy — same symbol id in two Galaxies is not the same object.
 */
import type { GraphDocumentV01 } from '../graphDocument'
import type { AssetStore } from './assetStore'
import {
  externalizeCustomSymbols,
  hydrateCustomSymbols,
  isCustomSymbolMeta,
  isHydratedCustomSymbol,
  type ExternalizeOptions,
} from './symbolAssets'
import type { AssetMetaV02, CustomSymbolMetaV02 } from './workspaceTypes'
import {
  WORLD_STORAGE_VERSION,
  type GalaxyManifestV03,
  type WorldDocumentV03,
  type WorldLoadIssue,
  type WorldManifestV03,
} from './worldTypes'

export function galaxySymbolAssetKey(galaxyId: string, symbolId: string): string {
  return `${galaxyId}::${symbolId}`
}

export function collectAssetIdsFromWorldManifest(manifest: WorldManifestV03): Set<string> {
  const ids = new Set<string>()
  for (const a of manifest.assets) ids.add(a.assetId)
  for (const galaxy of manifest.world.galaxies) {
    for (const s of galaxy.graph.customSymbols) ids.add(s.assetId)
  }
  return ids
}

export function galaxySymbolAssetIdMap(manifest: WorldManifestV03): Map<string, string> {
  const map = new Map<string, string>()
  for (const galaxy of manifest.world.galaxies) {
    for (const s of galaxy.graph.customSymbols) {
      map.set(galaxySymbolAssetKey(galaxy.id, s.id), s.assetId)
    }
  }
  return map
}

export async function buildWorldManifestFromDocument(
  world: WorldDocumentV03,
  assets: AssetStore,
  options?: {
    previousAssetIdsByGalaxySymbol?: Map<string, string>
    committedAssetIds?: Set<string>
  },
): Promise<WorldManifestV03> {
  const previous = options?.previousAssetIdsByGalaxySymbol
  const committed = options?.committedAssetIds ?? new Set<string>()
  const galaxies: GalaxyManifestV03[] = []
  const assetMetas: AssetMetaV02[] = []
  const seenAssetIds = new Set<string>()

  for (const galaxy of world.galaxies) {
    const reuse = new Map<string, string>()
    if (previous) {
      for (const symbol of galaxy.graph.customSymbols) {
        const prev = previous.get(galaxySymbolAssetKey(galaxy.id, symbol.id))
        if (prev) reuse.set(symbol.id, prev)
      }
    }
    const extOpts: ExternalizeOptions = {
      previousAssetIdsBySymbolId: reuse,
      committedAssetIds: committed,
    }
    const { metas, assetMetas: galaxyAssets } = await externalizeCustomSymbols(
      galaxy.graph.customSymbols,
      assets,
      extOpts,
    )
    const { customSymbols: _cs, ...rest } = galaxy.graph
    galaxies.push({
      id: galaxy.id,
      name: galaxy.name,
      universePosition: { ...galaxy.universePosition },
      graph: { ...rest, customSymbols: metas },
    })
    for (const meta of galaxyAssets) {
      if (seenAssetIds.has(meta.assetId)) continue
      seenAssetIds.add(meta.assetId)
      assetMetas.push(meta)
    }
  }

  return {
    storageVersion: WORLD_STORAGE_VERSION,
    world: {
      schemaVersion: world.schemaVersion,
      universe: { ...world.universe },
      galaxies,
      references: world.references.map((r) => ({ ...r })),
    },
    assets: assetMetas,
  }
}

export async function hydrateWorldManifest(
  manifest: WorldManifestV03,
  assets: AssetStore,
): Promise<{ world: WorldDocumentV03; issues: WorldLoadIssue[] }> {
  const expectedByteLengthByAssetId = new Map(
    manifest.assets.map((a) => [a.assetId, a.byteLength] as const),
  )
  const issues: WorldLoadIssue[] = []
  const galaxies = []

  for (const galaxy of manifest.world.galaxies) {
    const { symbols, issues: galaxyIssues } = await hydrateCustomSymbols(
      galaxy.graph.customSymbols as CustomSymbolMetaV02[],
      assets,
      expectedByteLengthByAssetId,
    )
    issues.push(...galaxyIssues)
    galaxies.push({
      id: galaxy.id,
      name: galaxy.name,
      universePosition: { ...galaxy.universePosition },
      graph: { ...galaxy.graph, customSymbols: symbols } as GraphDocumentV01,
    })
  }

  return {
    world: {
      schemaVersion: manifest.world.schemaVersion,
      universe: { ...manifest.world.universe },
      galaxies,
      // Missing references on legacy v0.3 manifests → empty library.
      references: Array.isArray(manifest.world.references)
        ? manifest.world.references.map((r) => ({ ...r }))
        : [],
    },
    issues,
  }
}

export function parseWorldManifestJson(text: string): WorldManifestV03 | null {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const r = parsed as Record<string, unknown>
    if (r.storageVersion !== WORLD_STORAGE_VERSION) return null
    if (!r.world || typeof r.world !== 'object') return null
    if (!Array.isArray(r.assets)) return null
    const world = r.world as Record<string, unknown>
    if (world.schemaVersion !== WORLD_STORAGE_VERSION) return null
    if (!world.universe || typeof world.universe !== 'object') return null
    if (!Array.isArray(world.galaxies)) return null
    for (const item of world.galaxies) {
      if (!item || typeof item !== 'object') return null
      const g = item as Record<string, unknown>
      if (typeof g.id !== 'string' || typeof g.name !== 'string') return null
      if (!g.graph || typeof g.graph !== 'object') return null
      const graph = g.graph as Record<string, unknown>
      if (!Array.isArray(graph.customSymbols)) return null
      for (const sym of graph.customSymbols) {
        if (!isCustomSymbolMeta(sym) && !isHydratedCustomSymbol(sym)) return null
      }
    }
    return parsed as WorldManifestV03
  } catch {
    return null
  }
}

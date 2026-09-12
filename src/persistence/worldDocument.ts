/**
 * WorldDocumentV03 validation + pure Galaxy helpers.
 * Composition: World → Galaxy → GraphDocumentV01 (unchanged).
 */
import { validateGraphDocument, type GraphDocumentV01 } from '../graphDocument'
import { MAX_GALAXIES } from '../limits'
import {
  DEFAULT_GALAXY_ID,
  DEFAULT_GALAXY_NAME,
  DEFAULT_GALAXY_POSITION,
  DEFAULT_UNIVERSE_HEIGHT,
  DEFAULT_UNIVERSE_WIDTH,
  WORLD_SCHEMA_VERSION,
  type GalaxyDocumentV03,
  type WorldDocumentV03,
} from './worldTypes'

export type WorldParseResult =
  | { ok: true; world: WorldDocumentV03 }
  | { ok: false; message: string }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositionInUniverse(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && y >= 0 && x <= width && y <= height
}

export function wrapGraphAsDefaultWorld(graph: GraphDocumentV01): WorldDocumentV03 {
  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    universe: {
      width: DEFAULT_UNIVERSE_WIDTH,
      height: DEFAULT_UNIVERSE_HEIGHT,
    },
    galaxies: [
      {
        id: DEFAULT_GALAXY_ID,
        name: DEFAULT_GALAXY_NAME,
        universePosition: {
          x: DEFAULT_GALAXY_POSITION.x,
          y: DEFAULT_GALAXY_POSITION.y,
        },
        graph,
      },
    ],
  }
}

/** Pure helper: replace one Galaxy's nested graph without rebuilding World metadata. */
export function replaceGalaxyGraph(
  world: WorldDocumentV03,
  galaxyId: string,
  graph: GraphDocumentV01,
): WorldDocumentV03 {
  const index = world.galaxies.findIndex((g) => g.id === galaxyId)
  if (index < 0) {
    throw new Error(`replaceGalaxyGraph: galaxy not found (${galaxyId})`)
  }
  const galaxies = world.galaxies.map((galaxy, i) =>
    i === index ? { ...galaxy, graph } : galaxy,
  )
  return { ...world, galaxies }
}

export function getGalaxyById(
  world: WorldDocumentV03,
  galaxyId: string,
): GalaxyDocumentV03 | null {
  return world.galaxies.find((g) => g.id === galaxyId) ?? null
}

export function getActiveGalaxyGraph(
  world: WorldDocumentV03,
  galaxyId: string = DEFAULT_GALAXY_ID,
): GraphDocumentV01 | null {
  return getGalaxyById(world, galaxyId)?.graph ?? null
}

export function validateWorldDocument(value: unknown): WorldParseResult {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'WorldDocument must be an object' }
  }
  const root = value as Record<string, unknown>
  if (root.schemaVersion !== WORLD_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `unsupported world schemaVersion (need ${WORLD_SCHEMA_VERSION})`,
    }
  }

  const universe = root.universe
  if (!universe || typeof universe !== 'object') {
    return { ok: false, message: 'world.universe is required' }
  }
  const u = universe as Record<string, unknown>
  if (!isFiniteNumber(u.width) || u.width <= 0) {
    return { ok: false, message: 'universe.width must be a finite positive number' }
  }
  if (!isFiniteNumber(u.height) || u.height <= 0) {
    return { ok: false, message: 'universe.height must be a finite positive number' }
  }

  if (!Array.isArray(root.galaxies)) {
    return { ok: false, message: 'world.galaxies must be an array' }
  }
  if (root.galaxies.length < 1) {
    return { ok: false, message: 'world must contain at least one Galaxy' }
  }
  if (root.galaxies.length > MAX_GALAXIES) {
    return { ok: false, message: `world exceeds Galaxy safety cap (${MAX_GALAXIES})` }
  }

  const seenIds = new Set<string>()
  const galaxies: GalaxyDocumentV03[] = []

  for (let i = 0; i < root.galaxies.length; i++) {
    const item = root.galaxies[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `galaxies[${i}] must be an object` }
    }
    const g = item as Record<string, unknown>
    if (typeof g.id !== 'string' || g.id.trim().length === 0) {
      return { ok: false, message: `galaxies[${i}].id must be a non-empty string` }
    }
    if (seenIds.has(g.id)) {
      return { ok: false, message: `duplicate galaxy id: ${g.id}` }
    }
    seenIds.add(g.id)

    if (typeof g.name !== 'string') {
      return { ok: false, message: `galaxies[${i}].name must be a string` }
    }

    const pos = g.universePosition
    if (!pos || typeof pos !== 'object') {
      return { ok: false, message: `galaxies[${i}].universePosition is required` }
    }
    const p = pos as Record<string, unknown>
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) {
      return { ok: false, message: `galaxies[${i}].universePosition x/y must be finite` }
    }
    if (!isPositionInUniverse(p.x, p.y, u.width, u.height)) {
      return {
        ok: false,
        message: `galaxies[${i}].universePosition is outside universe bounds`,
      }
    }

    const graphResult = validateGraphDocument(g.graph)
    if (!graphResult.ok) {
      return {
        ok: false,
        message: `galaxies[${i}].graph invalid: ${graphResult.message}`,
      }
    }

    galaxies.push({
      id: g.id,
      name: g.name,
      universePosition: { x: p.x, y: p.y },
      graph: graphResult.document,
    })
  }

  return {
    ok: true,
    world: {
      schemaVersion: WORLD_SCHEMA_VERSION,
      universe: { width: u.width, height: u.height },
      galaxies,
    },
  }
}

export function parseWorldDocumentJson(text: string): WorldParseResult {
  try {
    const parsed = JSON.parse(text) as unknown
    return validateWorldDocument(parsed)
  } catch {
    return { ok: false, message: 'WorldDocument JSON parse failed' }
  }
}

/**
 * Pure Multi-Galaxy helpers (Universe sheet CRUD).
 */
import { buildGraphDocument } from '../graphDocument'
import { EMPTY_GRAPH_EDGES, EMPTY_GRAPH_NODES } from '../emptyGraph'
import { createGalaxyId } from '../ids'
import { MAX_GALAXIES } from '../limits'
import { getGalaxyById, replaceGalaxyGraph } from './worldDocument'
import {
  DEFAULT_GALAXY_ID,
  type GalaxyDocumentV03,
  type WorldDocumentV03,
} from './worldTypes'
import type { GraphDocumentV01 } from '../graphDocument'

export function chooseInitialGalaxyId(world: WorldDocumentV03): string {
  if (world.galaxies.some((g) => g.id === DEFAULT_GALAXY_ID)) {
    return DEFAULT_GALAXY_ID
  }
  return world.galaxies[0]!.id
}

export function buildBlankGalaxyGraph(): GraphDocumentV01 {
  return buildGraphDocument({
    nodes: EMPTY_GRAPH_NODES,
    edges: EMPTY_GRAPH_EDGES,
    customSymbols: [],
    settings: {},
  })
}

function nextGalaxyName(world: WorldDocumentV03): string {
  const used = new Set(world.galaxies.map((g) => g.name.trim().toLowerCase()))
  let n = world.galaxies.length + 1
  while (used.has(`galaxy ${n}`)) n += 1
  return `Galaxy ${n}`
}

/** Deterministic empty-slot pick on an 8×8 candidate grid with margin. */
export function findOpenGalaxyPosition(
  world: WorldDocumentV03,
): { x: number; y: number } {
  const { width, height } = world.universe
  const marginX = Math.max(80, width * 0.08)
  const marginY = Math.max(80, height * 0.08)
  const cols = 8
  const rows = 8
  const minDist = 90
  const existing = world.galaxies.map((g) => g.universePosition)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x =
        marginX + ((width - 2 * marginX) * col) / Math.max(1, cols - 1)
      const y =
        marginY + ((height - 2 * marginY) * row) / Math.max(1, rows - 1)
      const ok = existing.every((p) => {
        const dx = p.x - x
        const dy = p.y - y
        return Math.hypot(dx, dy) >= minDist
      })
      if (ok) {
        return {
          x: Math.round(Math.min(width, Math.max(0, x))),
          y: Math.round(Math.min(height, Math.max(0, y))),
        }
      }
    }
  }
  // Fallback: slight offset from last galaxy, clamped.
  const last = existing[existing.length - 1] ?? { x: width / 2, y: height / 2 }
  return {
    x: Math.round(Math.min(width, Math.max(0, last.x + 40))),
    y: Math.round(Math.min(height, Math.max(0, last.y + 40))),
  }
}

export function clampUniversePosition(
  world: WorldDocumentV03,
  position: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: Math.min(world.universe.width, Math.max(0, position.x)),
    y: Math.min(world.universe.height, Math.max(0, position.y)),
  }
}

export function createGalaxy(
  world: WorldDocumentV03,
  options?: { name?: string; id?: string; position?: { x: number; y: number } },
): { world: WorldDocumentV03; galaxy: GalaxyDocumentV03 } {
  if (world.galaxies.length >= MAX_GALAXIES) {
    throw new Error(`Cannot create Galaxy: safety cap (${MAX_GALAXIES}) reached`)
  }
  const id = options?.id?.trim() || createGalaxyId()
  if (world.galaxies.some((g) => g.id === id)) {
    throw new Error(`duplicate galaxy id: ${id}`)
  }
  const name = (options?.name ?? nextGalaxyName(world)).trim()
  if (!name) throw new Error('Galaxy name is required')
  const universePosition = clampUniversePosition(
    world,
    options?.position ?? findOpenGalaxyPosition(world),
  )
  const galaxy: GalaxyDocumentV03 = {
    id,
    name,
    universePosition,
    graph: buildBlankGalaxyGraph(),
  }
  return {
    world: { ...world, galaxies: [...world.galaxies, galaxy] },
    galaxy,
  }
}

export function renameGalaxy(
  world: WorldDocumentV03,
  galaxyId: string,
  name: string,
): WorldDocumentV03 {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Galaxy name is required')
  if (!getGalaxyById(world, galaxyId)) {
    throw new Error(`galaxy not found: ${galaxyId}`)
  }
  return {
    ...world,
    galaxies: world.galaxies.map((g) =>
      g.id === galaxyId ? { ...g, name: trimmed } : g,
    ),
  }
}

export function moveGalaxy(
  world: WorldDocumentV03,
  galaxyId: string,
  position: { x: number; y: number },
): WorldDocumentV03 {
  if (!getGalaxyById(world, galaxyId)) {
    throw new Error(`galaxy not found: ${galaxyId}`)
  }
  const universePosition = clampUniversePosition(world, position)
  return {
    ...world,
    galaxies: world.galaxies.map((g) =>
      g.id === galaxyId ? { ...g, universePosition } : g,
    ),
  }
}

export function deleteGalaxy(
  world: WorldDocumentV03,
  galaxyId: string,
): WorldDocumentV03 {
  if (world.galaxies.length <= 1) {
    throw new Error('Cannot delete the last Galaxy')
  }
  if (!getGalaxyById(world, galaxyId)) {
    throw new Error(`galaxy not found: ${galaxyId}`)
  }
  return {
    ...world,
    galaxies: world.galaxies.filter((g) => g.id !== galaxyId),
  }
}

export function replaceGalaxyGraphInWorld(
  world: WorldDocumentV03,
  galaxyId: string,
  graph: GraphDocumentV01,
): WorldDocumentV03 {
  return replaceGalaxyGraph(world, galaxyId, graph)
}

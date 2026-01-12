/**
 * Conversion from GridCanvas to MapJSON/EditorFormat
 */

import type {
  MapJSON,
  MapMeta,
  DeckLayout,
  LayoutRoom,
  LayoutConnector,
  Junction,
  Point,
  GenerationRequest,
  RoomProgram,
} from '../types'
import {
  TileType,
  type GridCanvas,
  type RoomPlacement,
  type ZoneDefinition,
} from './types'
import { getTile, getBoundingBox, DIRECTIONS_4 } from './canvas'

// ============================================================================
// MAIN CONVERSION
// ============================================================================

/**
 * Convert GridCanvas to MapJSON format
 */
export function convertToMapJSON(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  zones: ZoneDefinition[],
  request: GenerationRequest,
  roomProgram: RoomProgram
): MapJSON {
  const deckLayout = convertToDeckLayout(canvas, placements, zones)

  return {
    version: '1.0.0',
    meta: buildMeta(request, roomProgram, placements),
    grid: {
      cellSize: canvas.tileSize,
      snapEnabled: true,
    },
    zones: zones.map(z => ({
      id: z.id,
      label: z.label,
      color: z.color,
    })),
    decks: [
      {
        index: 0,
        label: 'Main Deck',
        gridWidth: canvas.width,
        gridHeight: canvas.height,
        rooms: deckLayout.rooms,
        connectors: deckLayout.connectors,
        junctions: deckLayout.junctions,
      },
    ],
  }
}

/**
 * Convert GridCanvas to DeckLayout
 */
export function convertToDeckLayout(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  zones: ZoneDefinition[]
): DeckLayout {
  const rooms = placements.map(p => convertPlacementToLayoutRoom(p, canvas, zones))
  const corridors = extractCorridors(canvas)
  const junctions = extractJunctions(canvas)

  return {
    deckIndex: 0,
    gridWidth: canvas.width,
    gridHeight: canvas.height,
    rooms,
    connectors: corridors,
    junctions,
  }
}

// ============================================================================
// ROOM CONVERSION
// ============================================================================

/**
 * Convert RoomPlacement to LayoutRoom
 */
function convertPlacementToLayoutRoom(
  placement: RoomPlacement,
  canvas: GridCanvas,
  zones: ZoneDefinition[]
): LayoutRoom {
  const tileSize = canvas.tileSize

  // Find door positions as ports
  const ports = placement.doorPositions.map((door, idx) => {
    // Determine which wall the door is on
    const wall = determineDoorWall(door, placement)

    return {
      id: `port-${placement.roomId}-${idx}`,
      x: door.x * tileSize + tileSize / 2,
      y: door.y * tileSize + tileSize / 2,
      wall,
      connectorId: `corridor-${door.x}-${door.y}`,
    }
  })

  return {
    id: placement.roomId,
    roomType: placement.roomType,
    label: placement.label,
    x: placement.bounds.x * tileSize,
    y: placement.bounds.y * tileSize,
    width: placement.bounds.width * tileSize,
    height: placement.bounds.height * tileSize,
    gridX: placement.bounds.x,
    gridY: placement.bounds.y,
    gridWidth: placement.bounds.width,
    gridHeight: placement.bounds.height,
    zone: placement.zone,
    ports,
    isExterior: placement.program.isExterior || false,
    tags: placement.program.tags,
  }
}

/**
 * Determine which wall a door is on
 */
function determineDoorWall(
  door: Point,
  placement: RoomPlacement
): 'top' | 'bottom' | 'left' | 'right' {
  const bounds = placement.bounds

  // Check distances to each edge
  const distTop = door.y - bounds.y
  const distBottom = (bounds.y + bounds.height - 1) - door.y
  const distLeft = door.x - bounds.x
  const distRight = (bounds.x + bounds.width - 1) - door.x

  const minDist = Math.min(distTop, distBottom, distLeft, distRight)

  if (minDist === distTop) return 'top'
  if (minDist === distBottom) return 'bottom'
  if (minDist === distLeft) return 'left'
  return 'right'
}

// ============================================================================
// CORRIDOR EXTRACTION
// ============================================================================

/**
 * Extract corridors from canvas as connected paths
 */
function extractCorridors(canvas: GridCanvas): LayoutConnector[] {
  const corridors: LayoutConnector[] = []
  const visited = new Set<string>()

  // Find all corridor tiles grouped by corridorId
  const corridorGroups = new Map<string, Point[]>()

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || (tile.type !== TileType.CORRIDOR && tile.type !== TileType.JUNCTION)) continue

      const corridorId = tile.corridorId || 'default'
      if (!corridorGroups.has(corridorId)) {
        corridorGroups.set(corridorId, [])
      }
      corridorGroups.get(corridorId)!.push({ x, y })
    }
  }

  // Convert each group to a LayoutConnector
  let idx = 0
  for (const [corridorId, tiles] of corridorGroups) {
    if (tiles.length < 2) continue

    // Find the path through these tiles
    const path = buildCorridorPath(tiles, canvas)

    corridors.push({
      id: `corridor-${idx++}`,
      fromRoomId: 'SPINE',
      toRoomId: 'SPINE',
      kind: 'corridor',
      path: path.map(p => ({
        x: p.x * canvas.tileSize + canvas.tileSize / 2,
        y: p.y * canvas.tileSize + canvas.tileSize / 2,
      })),
      width: canvas.tileSize,
    })
  }

  return corridors
}

/**
 * Build a path through corridor tiles
 */
function buildCorridorPath(tiles: Point[], canvas: GridCanvas): Point[] {
  if (tiles.length === 0) return []
  if (tiles.length === 1) return tiles

  // Find endpoints (tiles with only one neighbor in the group)
  const tileSet = new Set(tiles.map(t => `${t.x},${t.y}`))
  const endpoints: Point[] = []

  for (const tile of tiles) {
    let neighborCount = 0
    for (const dir of DIRECTIONS_4) {
      const key = `${tile.x + dir.x},${tile.y + dir.y}`
      if (tileSet.has(key)) neighborCount++
    }
    if (neighborCount <= 1) {
      endpoints.push(tile)
    }
  }

  // If no clear endpoints, just use first and last
  if (endpoints.length < 2) {
    return tiles
  }

  // Build path from first endpoint to last
  const path: Point[] = []
  const visited = new Set<string>()
  const start = endpoints[0]

  const queue: Point[] = [start]
  const parentMap = new Map<string, Point | null>()
  parentMap.set(`${start.x},${start.y}`, null)

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentKey = `${current.x},${current.y}`

    if (visited.has(currentKey)) continue
    visited.add(currentKey)

    for (const dir of DIRECTIONS_4) {
      const next = { x: current.x + dir.x, y: current.y + dir.y }
      const nextKey = `${next.x},${next.y}`

      if (!visited.has(nextKey) && tileSet.has(nextKey)) {
        queue.push(next)
        parentMap.set(nextKey, current)
      }
    }
  }

  // Reconstruct longest path
  let farthest = start
  let maxDist = 0
  for (const tile of tiles) {
    const dist = visited.has(`${tile.x},${tile.y}`) ?
      Math.abs(tile.x - start.x) + Math.abs(tile.y - start.y) : 0
    if (dist > maxDist) {
      maxDist = dist
      farthest = tile
    }
  }

  // Walk back from farthest to start
  let current: Point | undefined = farthest
  while (current) {
    path.unshift(current)
    current = parentMap.get(`${current.x},${current.y}`) ?? undefined
  }

  return path
}

// ============================================================================
// JUNCTION EXTRACTION
// ============================================================================

/**
 * Extract junctions from canvas
 */
function extractJunctions(canvas: GridCanvas): Junction[] {
  const junctions: Junction[] = []

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.JUNCTION) continue

      // Count corridor neighbors to determine junction type
      let corridorNeighbors = 0
      for (const dir of DIRECTIONS_4) {
        const neighbor = getTile(canvas, x + dir.x, y + dir.y)
        if (neighbor && (neighbor.type === TileType.CORRIDOR || neighbor.type === TileType.JUNCTION)) {
          corridorNeighbors++
        }
      }

      const junctionType: 'tee' | 'cross' | 'hub' =
        corridorNeighbors >= 4 ? 'cross' :
        corridorNeighbors === 3 ? 'tee' : 'hub'

      junctions.push({
        id: `junction-${x}-${y}`,
        x: x * canvas.tileSize + canvas.tileSize / 2,
        y: y * canvas.tileSize + canvas.tileSize / 2,
        connectorIds: [],
        type: junctionType,
      })
    }
  }

  return junctions
}

// ============================================================================
// METADATA
// ============================================================================

/**
 * Build map metadata
 */
function buildMeta(
  request: GenerationRequest,
  roomProgram: RoomProgram,
  placements: RoomPlacement[]
): MapMeta {
  return {
    name: `${request.archetype.charAt(0).toUpperCase() + request.archetype.slice(1)} ${request.subtype}`,
    archetype: request.archetype,
    subtype: request.subtype,
    sizeTier: request.sizeTier,
    seed: String(request.seed),
    generatedAt: new Date().toISOString(),
    ttrpgMetrics: {
      totalRooms: placements.length,
      totalConnectors: 0, // Will be filled by caller
      estimatedCombatEncounters: Math.floor(placements.length / 6),
      estimatedExplorationMinutes: placements.length * 4,
      keyLocations: placements.filter(p => p.program.importance === 'primary').length,
      hiddenAreas: placements.filter(p => p.program.accessLevel >= 3).length,
    },
    tags: [
      request.archetype,
      request.subtype,
      request.sizeTier,
      'grid-generated',
    ],
  }
}

// ============================================================================
// DEBUG OUTPUT
// ============================================================================

/**
 * Generate debug visualization of the canvas
 */
export function generateDebugOutput(canvas: GridCanvas): string {
  const chars: Record<TileType, string> = {
    [TileType.VOID]: ' ',
    [TileType.HULL]: '.',
    [TileType.FLOOR]: '#',
    [TileType.CORRIDOR]: '=',
    [TileType.DOOR]: '+',
    [TileType.JUNCTION]: '*',
    [TileType.AIRLOCK]: 'A',
    [TileType.WALL]: '|',
  }

  let output = ''
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (tile?.roomId) {
        // Show first letter of room type
        output += tile.roomId.charAt(0).toUpperCase()
      } else {
        output += chars[tile?.type ?? TileType.VOID]
      }
    }
    output += '\n'
  }
  return output
}

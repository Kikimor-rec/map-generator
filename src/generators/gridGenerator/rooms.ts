/**
 * Room Placement Algorithm
 * Places rectangular rooms adjacent to corridors
 */

import type { SeededRNG, ProgrammedRoom, RoomProgram } from '../types'
import {
  TileType,
  type GridCanvas,
  type Point,
  type Rect,
  type RoomPlacement,
  type ZoneDefinition,
} from './types'
import {
  getTile,
  isInBounds,
  getBoundingBox,
  DIRECTIONS_4,
} from './canvas'

// ============================================================================
// MAIN ROOM PLACEMENT
// ============================================================================

/**
 * Place all rooms from the room program onto the grid
 */
export function placeRooms(
  canvas: GridCanvas,
  roomProgram: RoomProgram,
  zones: ZoneDefinition[],
  rng: SeededRNG
): RoomPlacement[] {
  const placements: RoomPlacement[] = []

  // Sort rooms by importance (primary first) then by size (larger first)
  const sortedRooms = [...roomProgram.rooms].sort((a, b) => {
    const importanceOrder = { primary: 0, secondary: 1, tertiary: 2 }
    const aImp = importanceOrder[a.importance] ?? 2
    const bImp = importanceOrder[b.importance] ?? 2

    if (aImp !== bImp) return aImp - bImp
    return b.estimatedTiles - a.estimatedTiles
  })

  // Place each room
  for (const room of sortedRooms) {
    const placement = placeRectangularRoom(canvas, room, zones, rng)
    if (placement) {
      placements.push(placement)
    }
  }

  return placements
}

/**
 * Place a rectangular room adjacent to a corridor
 */
function placeRectangularRoom(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  zones: ZoneDefinition[],
  rng: SeededRNG
): RoomPlacement | null {
  // Calculate room dimensions
  const targetTiles = room.estimatedTiles || 16
  let { width, height } = calculateRoomDimensions(targetTiles, room.roomType, rng)

  // Find the best zone for this room
  const targetZone = findBestZone(room, zones)

  // Try progressively smaller sizes if needed
  for (let attempt = 0; attempt < 4; attempt++) {
    // Find all possible placement positions
    const candidates = findPlacementCandidates(canvas, width, height, targetZone)

    if (candidates.length > 0) {
      const shuffled = rng.shuffle(candidates)
      return placeRoomAt(canvas, room, shuffled[0], width, height)
    }

    // Try without zone constraint
    const fallbackCandidates = findPlacementCandidates(canvas, width, height, undefined)
    if (fallbackCandidates.length > 0) {
      return placeRoomAt(canvas, room, rng.pick(fallbackCandidates), width, height)
    }

    // Shrink room size for next attempt
    if (width > height && width > 2) {
      width = Math.max(2, width - 1)
    } else if (height > 2) {
      height = Math.max(2, height - 1)
    } else {
      break // Can't shrink anymore
    }
  }

  console.warn(`Could not find placement for room ${room.id} (${width}x${height})`)
  return null
}

/**
 * Calculate room dimensions based on target tiles
 */
function calculateRoomDimensions(
  targetTiles: number,
  roomType: string,
  rng: SeededRNG
): { width: number; height: number } {
  // Determine aspect ratio based on room type
  let aspectRatio: number

  if (isHorizontalRoom(roomType)) {
    aspectRatio = rng.randomFloat(1.5, 2.5) // Wide rooms
  } else if (isVerticalRoom(roomType)) {
    aspectRatio = rng.randomFloat(0.4, 0.7) // Tall rooms
  } else {
    aspectRatio = rng.randomFloat(0.8, 1.2) // Square-ish rooms
  }

  // Calculate dimensions
  // area = width * height = targetTiles
  // width = aspectRatio * height
  // aspectRatio * height^2 = targetTiles
  // height = sqrt(targetTiles / aspectRatio)
  const height = Math.max(2, Math.round(Math.sqrt(targetTiles / aspectRatio)))
  const width = Math.max(2, Math.round(targetTiles / height))

  return { width, height }
}

/**
 * Find all valid placement positions for a room
 */
function findPlacementCandidates(
  canvas: GridCanvas,
  roomWidth: number,
  roomHeight: number,
  zoneId: string | undefined
): Point[] {
  const candidates: Point[] = []

  // Scan for corridor tiles and check adjacent areas
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || (tile.type !== TileType.CORRIDOR && tile.type !== TileType.JUNCTION)) continue

      // Try placing room on each side of the corridor
      const placements = [
        { x: x - roomWidth, y: y - Math.floor(roomHeight / 2) }, // Left
        { x: x + 1, y: y - Math.floor(roomHeight / 2) },         // Right
        { x: x - Math.floor(roomWidth / 2), y: y - roomHeight }, // Top
        { x: x - Math.floor(roomWidth / 2), y: y + 1 },          // Bottom
      ]

      for (const pos of placements) {
        if (canPlaceRoom(canvas, pos.x, pos.y, roomWidth, roomHeight, zoneId)) {
          candidates.push(pos)
        }
      }
    }
  }

  return candidates
}

/**
 * Check if a room can be placed at the given position
 */
function canPlaceRoom(
  canvas: GridCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  zoneId: string | undefined
): boolean {
  // Check all tiles in the room area
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = x + dx
      const ty = y + dy

      if (!isInBounds(canvas, tx, ty)) return false

      const tile = getTile(canvas, tx, ty)
      if (!tile) return false

      // Must be HULL tile (not already used)
      if (tile.type !== TileType.HULL) return false

      // Check zone if specified
      if (zoneId && tile.zoneId !== zoneId) return false
    }
  }

  // Check that room is adjacent to corridor
  let hasCorridorAdjacent = false
  for (let dy = -1; dy <= height; dy++) {
    for (let dx = -1; dx <= width; dx++) {
      // Skip interior tiles
      if (dx >= 0 && dx < width && dy >= 0 && dy < height) continue

      const tx = x + dx
      const ty = y + dy

      if (!isInBounds(canvas, tx, ty)) continue

      const tile = getTile(canvas, tx, ty)
      if (tile && (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)) {
        hasCorridorAdjacent = true
        break
      }
    }
    if (hasCorridorAdjacent) break
  }

  return hasCorridorAdjacent
}

/**
 * Place a room at the specified position
 */
function placeRoomAt(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  pos: Point,
  width: number,
  height: number
): RoomPlacement {
  const tiles: Point[] = []
  const zoneId = getTile(canvas, pos.x, pos.y)?.zoneId

  // Mark all tiles as FLOOR
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = pos.x + dx
      const ty = pos.y + dy

      tiles.push({ x: tx, y: ty })
      canvas.tiles[ty][tx] = {
        ...canvas.tiles[ty][tx],
        type: TileType.FLOOR,
        roomId: room.id,
      }
    }
  }

  // Find door positions (tiles adjacent to corridor)
  const doorPositions = findDoorPositions(canvas, pos, width, height)

  const bounds: Rect = {
    x: pos.x,
    y: pos.y,
    width,
    height,
  }

  return {
    roomId: room.id,
    roomType: room.roomType,
    label: room.label,
    tiles,
    bounds,
    zone: zoneId || 'default',
    doorPositions,
    program: room,
  }
}

/**
 * Find door positions for a rectangular room
 */
function findDoorPositions(
  canvas: GridCanvas,
  pos: Point,
  width: number,
  height: number
): Point[] {
  const doors: Point[] = []

  // Check each edge of the room
  // Top edge
  for (let dx = 0; dx < width; dx++) {
    const tx = pos.x + dx
    const ty = pos.y - 1
    if (isCorridorTile(canvas, tx, ty)) {
      doors.push({ x: tx, y: pos.y })
    }
  }

  // Bottom edge
  for (let dx = 0; dx < width; dx++) {
    const tx = pos.x + dx
    const ty = pos.y + height
    if (isCorridorTile(canvas, tx, ty)) {
      doors.push({ x: tx, y: pos.y + height - 1 })
    }
  }

  // Left edge
  for (let dy = 0; dy < height; dy++) {
    const tx = pos.x - 1
    const ty = pos.y + dy
    if (isCorridorTile(canvas, tx, ty)) {
      doors.push({ x: pos.x, y: ty })
    }
  }

  // Right edge
  for (let dy = 0; dy < height; dy++) {
    const tx = pos.x + width
    const ty = pos.y + dy
    if (isCorridorTile(canvas, tx, ty)) {
      doors.push({ x: pos.x + width - 1, y: ty })
    }
  }

  return doors
}

/**
 * Check if tile is a corridor
 */
function isCorridorTile(canvas: GridCanvas, x: number, y: number): boolean {
  const tile = getTile(canvas, x, y)
  return tile !== undefined && (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)
}

/**
 * Find the best zone for a room based on its type
 */
function findBestZone(room: ProgrammedRoom, zones: ZoneDefinition[]): string | undefined {
  if (room.zone) {
    const exactZone = zones.find(z => z.id === room.zone)
    if (exactZone) return exactZone.id
  }

  for (const zone of zones) {
    if (zone.roomTypes.includes(room.roomType)) {
      return zone.id
    }
  }

  return zones[0]?.id
}

/**
 * Check if room type prefers horizontal layout
 */
function isHorizontalRoom(roomType: string): boolean {
  const types = ['cargoBay', 'cargo_bay', 'hangar', 'barracks', 'dockingBay', 'docking_bay']
  return types.includes(roomType)
}

/**
 * Check if room type prefers vertical layout
 */
function isVerticalRoom(roomType: string): boolean {
  const types = ['corridor', 'airlock', 'escapePod', 'escape_pod']
  return types.includes(roomType)
}

// ============================================================================
// DOOR PLACEMENT
// ============================================================================

/**
 * Place doors at room-corridor boundaries
 */
export function placeDoors(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): void {
  for (const placement of placements) {
    // Select door positions (limit to 1-2 per room)
    const maxDoors = placement.tiles.length > 30 ? 2 : 1
    const selectedDoors = placement.doorPositions.slice(0, maxDoors)

    for (const doorPos of selectedDoors) {
      canvas.tiles[doorPos.y][doorPos.x] = {
        ...canvas.tiles[doorPos.y][doorPos.x],
        type: TileType.DOOR,
      }
    }
  }
}

// ============================================================================
// CONNECTIVITY
// ============================================================================

/**
 * Check if all rooms are connected via corridors
 */
export function checkConnectivity(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): { connected: boolean; isolated: string[] } {
  if (placements.length === 0) {
    return { connected: true, isolated: [] }
  }

  const connectedRooms = new Set<string>()

  for (const placement of placements) {
    if (placement.doorPositions.length > 0) {
      connectedRooms.add(placement.roomId)
    }
  }

  const isolated = placements
    .filter(p => !connectedRooms.has(p.roomId))
    .map(p => p.roomId)

  return {
    connected: isolated.length === 0,
    isolated,
  }
}

/**
 * Connect isolated rooms by carving additional corridors
 */
export function connectIsolatedRooms(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  isolated: string[]
): void {
  for (const roomId of isolated) {
    const placement = placements.find(p => p.roomId === roomId)
    if (!placement) continue

    // Find center of room
    const centerX = placement.bounds.x + Math.floor(placement.bounds.width / 2)
    const centerY = placement.bounds.y + Math.floor(placement.bounds.height / 2)

    // Find nearest corridor
    const nearestCorridor = findNearestCorridor(canvas, { x: centerX, y: centerY })
    if (!nearestCorridor) continue

    // Carve corridor to connect
    carveConnectingCorridor(canvas, { x: centerX, y: centerY }, nearestCorridor, placement.bounds)
  }
}

/**
 * Find nearest corridor tile to a point
 */
function findNearestCorridor(canvas: GridCanvas, from: Point): Point | null {
  let nearestDist = Infinity
  let nearest: Point | null = null

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || (tile.type !== TileType.CORRIDOR && tile.type !== TileType.JUNCTION)) continue

      const dist = Math.abs(x - from.x) + Math.abs(y - from.y)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = { x, y }
      }
    }
  }

  return nearest
}

/**
 * Carve a connecting corridor between room and corridor
 */
function carveConnectingCorridor(
  canvas: GridCanvas,
  from: Point,
  to: Point,
  roomBounds: Rect
): void {
  // Find exit point from room
  let exitX = from.x
  let exitY = from.y

  // Exit from closest edge
  if (to.x < roomBounds.x) {
    exitX = roomBounds.x - 1
  } else if (to.x >= roomBounds.x + roomBounds.width) {
    exitX = roomBounds.x + roomBounds.width
  } else if (to.y < roomBounds.y) {
    exitY = roomBounds.y - 1
  } else {
    exitY = roomBounds.y + roomBounds.height
  }

  // Carve L-shaped corridor
  const midX = exitX
  const midY = to.y

  // Vertical segment
  const yStart = Math.min(exitY, midY)
  const yEnd = Math.max(exitY, midY)
  for (let y = yStart; y <= yEnd; y++) {
    const tile = getTile(canvas, midX, y)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[y][midX] = {
        ...canvas.tiles[y][midX],
        type: TileType.CORRIDOR,
        corridorId: 'connector',
      }
    }
  }

  // Horizontal segment
  const xStart = Math.min(midX, to.x)
  const xEnd = Math.max(midX, to.x)
  for (let x = xStart; x <= xEnd; x++) {
    const tile = getTile(canvas, x, to.y)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[to.y][x] = {
        ...canvas.tiles[to.y][x],
        type: TileType.CORRIDOR,
        corridorId: 'connector',
      }
    }
  }
}

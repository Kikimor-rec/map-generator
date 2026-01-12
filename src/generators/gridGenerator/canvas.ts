/**
 * Grid Canvas - Core grid manipulation utilities
 */

import type { Archetype, SizeTier, SeededRNG } from '../types'
import {
  TileType,
  type Tile,
  type GridCanvas,
  type Point,
  type Rect,
  ARCHETYPE_DIMENSIONS,
} from './types'

// ============================================================================
// CANVAS CREATION
// ============================================================================

/**
 * Create an empty grid canvas filled with VOID tiles
 */
export function createCanvas(
  archetype: Archetype,
  sizeTier: SizeTier,
  tileSize: number = 40
): GridCanvas {
  const dimensions = ARCHETYPE_DIMENSIONS[archetype][sizeTier]

  const tiles: Tile[][] = []
  for (let y = 0; y < dimensions.height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < dimensions.width; x++) {
      row.push({ type: TileType.VOID })
    }
    tiles.push(row)
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    tileSize,
    tiles,
    archetype,
    sizeTier,
  }
}

/**
 * Create canvas with custom dimensions
 */
export function createCanvasCustom(
  width: number,
  height: number,
  archetype: Archetype,
  sizeTier: SizeTier,
  tileSize: number = 40
): GridCanvas {
  const tiles: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      row.push({ type: TileType.VOID })
    }
    tiles.push(row)
  }

  return {
    width,
    height,
    tileSize,
    tiles,
    archetype,
    sizeTier,
  }
}

// ============================================================================
// TILE ACCESS
// ============================================================================

/**
 * Get tile at position (returns undefined if out of bounds)
 */
export function getTile(canvas: GridCanvas, x: number, y: number): Tile | undefined {
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
    return undefined
  }
  return canvas.tiles[y][x]
}

/**
 * Set tile at position (returns false if out of bounds)
 */
export function setTile(canvas: GridCanvas, x: number, y: number, tile: Tile): boolean {
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
    return false
  }
  canvas.tiles[y][x] = tile
  return true
}

/**
 * Set tile type at position (preserves other properties)
 */
export function setTileType(canvas: GridCanvas, x: number, y: number, type: TileType): boolean {
  const existing = getTile(canvas, x, y)
  if (!existing) return false

  canvas.tiles[y][x] = { ...existing, type }
  return true
}

/**
 * Check if position is within canvas bounds
 */
export function isInBounds(canvas: GridCanvas, x: number, y: number): boolean {
  return x >= 0 && x < canvas.width && y >= 0 && y < canvas.height
}

// ============================================================================
// NEIGHBOR UTILITIES
// ============================================================================

/** 4-directional neighbors */
export const DIRECTIONS_4: Point[] = [
  { x: 0, y: -1 },  // Up
  { x: 1, y: 0 },   // Right
  { x: 0, y: 1 },   // Down
  { x: -1, y: 0 },  // Left
]

/** 8-directional neighbors (including diagonals) */
export const DIRECTIONS_8: Point[] = [
  { x: 0, y: -1 },   // Up
  { x: 1, y: -1 },   // Up-Right
  { x: 1, y: 0 },    // Right
  { x: 1, y: 1 },    // Down-Right
  { x: 0, y: 1 },    // Down
  { x: -1, y: 1 },   // Down-Left
  { x: -1, y: 0 },   // Left
  { x: -1, y: -1 },  // Up-Left
]

/**
 * Get 4-directional neighbors of a position
 */
export function getNeighbors4(canvas: GridCanvas, p: Point): Point[] {
  return DIRECTIONS_4
    .map(d => ({ x: p.x + d.x, y: p.y + d.y }))
    .filter(n => isInBounds(canvas, n.x, n.y))
}

/**
 * Get 8-directional neighbors of a position
 */
export function getNeighbors8(canvas: GridCanvas, p: Point): Point[] {
  return DIRECTIONS_8
    .map(d => ({ x: p.x + d.x, y: p.y + d.y }))
    .filter(n => isInBounds(canvas, n.x, n.y))
}

/**
 * Get all tiles of a specific type
 */
export function getTilesOfType(canvas: GridCanvas, type: TileType): Point[] {
  const result: Point[] = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (canvas.tiles[y][x].type === type) {
        result.push({ x, y })
      }
    }
  }
  return result
}

/**
 * Get all tiles belonging to a room
 */
export function getRoomTiles(canvas: GridCanvas, roomId: string): Point[] {
  const result: Point[] = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (canvas.tiles[y][x].roomId === roomId) {
        result.push({ x, y })
      }
    }
  }
  return result
}

/**
 * Get all tiles in a zone
 */
export function getZoneTiles(canvas: GridCanvas, zoneId: string): Point[] {
  const result: Point[] = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (canvas.tiles[y][x].zoneId === zoneId) {
        result.push({ x, y })
      }
    }
  }
  return result
}

// ============================================================================
// REGION UTILITIES
// ============================================================================

/**
 * Fill a rectangular region with a tile type
 */
export function fillRect(
  canvas: GridCanvas,
  rect: Rect,
  type: TileType,
  properties?: Partial<Tile>
): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (isInBounds(canvas, x, y)) {
        canvas.tiles[y][x] = {
          type,
          ...properties,
        }
      }
    }
  }
}

/**
 * Fill a circular region with a tile type
 */
export function fillCircle(
  canvas: GridCanvas,
  centerX: number,
  centerY: number,
  radius: number,
  type: TileType,
  properties?: Partial<Tile>
): void {
  const r2 = radius * radius
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y++) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= r2 && isInBounds(canvas, x, y)) {
        canvas.tiles[y][x] = {
          type,
          ...properties,
        }
      }
    }
  }
}

/**
 * Draw a line of tiles (Bresenham's algorithm)
 */
export function drawLine(
  canvas: GridCanvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  type: TileType,
  width: number = 1,
  properties?: Partial<Tile>
): Point[] {
  const points: Point[] = []

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  let x = x0
  let y = y0

  while (true) {
    // Draw with width
    const halfWidth = Math.floor(width / 2)
    for (let wy = -halfWidth; wy <= halfWidth; wy++) {
      for (let wx = -halfWidth; wx <= halfWidth; wx++) {
        const px = x + wx
        const py = y + wy
        if (isInBounds(canvas, px, py)) {
          canvas.tiles[py][px] = { type, ...properties }
          points.push({ x: px, y: py })
        }
      }
    }

    if (x === x1 && y === y1) break

    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }

  return points
}

// ============================================================================
// FLOOD FILL
// ============================================================================

/**
 * Flood fill starting from a point
 */
export function floodFill(
  canvas: GridCanvas,
  start: Point,
  newType: TileType,
  targetType: TileType,
  properties?: Partial<Tile>
): Point[] {
  const filled: Point[] = []
  const stack: Point[] = [start]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const p = stack.pop()!
    const key = `${p.x},${p.y}`

    if (visited.has(key)) continue
    visited.add(key)

    const tile = getTile(canvas, p.x, p.y)
    if (!tile || tile.type !== targetType) continue

    canvas.tiles[p.y][p.x] = { type: newType, ...properties }
    filled.push(p)

    // Add neighbors
    for (const dir of DIRECTIONS_4) {
      const neighbor = { x: p.x + dir.x, y: p.y + dir.y }
      if (!visited.has(`${neighbor.x},${neighbor.y}`)) {
        stack.push(neighbor)
      }
    }
  }

  return filled
}

// ============================================================================
// BOUNDING BOX
// ============================================================================

/**
 * Calculate bounding box of a set of points
 */
export function getBoundingBox(points: Point[]): Rect {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

/**
 * Get center of canvas
 */
export function getCanvasCenter(canvas: GridCanvas): Point {
  return {
    x: Math.floor(canvas.width / 2),
    y: Math.floor(canvas.height / 2),
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Count tiles by type
 */
export function countTileTypes(canvas: GridCanvas): Record<TileType, number> {
  const counts: Record<TileType, number> = {
    [TileType.VOID]: 0,
    [TileType.HULL]: 0,
    [TileType.FLOOR]: 0,
    [TileType.CORRIDOR]: 0,
    [TileType.DOOR]: 0,
    [TileType.JUNCTION]: 0,
    [TileType.AIRLOCK]: 0,
    [TileType.WALL]: 0,
  }

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      counts[canvas.tiles[y][x].type]++
    }
  }

  return counts
}

// ============================================================================
// DEBUG/VISUALIZATION
// ============================================================================

/**
 * Convert canvas to ASCII art for debugging
 */
export function canvasToAscii(canvas: GridCanvas): string {
  const chars: Record<TileType, string> = {
    [TileType.VOID]: '.',
    [TileType.HULL]: '#',
    [TileType.FLOOR]: ' ',
    [TileType.CORRIDOR]: '=',
    [TileType.DOOR]: '+',
    [TileType.JUNCTION]: '*',
    [TileType.AIRLOCK]: 'A',
    [TileType.WALL]: '|',
  }

  let result = ''
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      result += chars[canvas.tiles[y][x].type]
    }
    result += '\n'
  }
  return result
}

/**
 * Convert canvas to colored ASCII with room IDs
 */
export function canvasToDetailedAscii(canvas: GridCanvas): string {
  let result = ''
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = canvas.tiles[y][x]
      if (tile.roomId) {
        // Show first char of room ID
        result += tile.roomId.charAt(0).toUpperCase()
      } else if (tile.type === TileType.CORRIDOR) {
        result += '='
      } else if (tile.type === TileType.JUNCTION) {
        result += '+'
      } else if (tile.type === TileType.DOOR) {
        result += 'D'
      } else if (tile.type === TileType.HULL) {
        result += '#'
      } else if (tile.type === TileType.AIRLOCK) {
        result += 'A'
      } else {
        result += '.'
      }
    }
    result += '\n'
  }
  return result
}

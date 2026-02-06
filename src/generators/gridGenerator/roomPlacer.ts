/**
 * Graph-First Room Placement
 *
 * NEW APPROACH: Place rooms first based on adjacency rules and zone logic,
 * then route corridors between them. This replaces the old "spine-first"
 * approach that produced boring linear layouts.
 *
 * Algorithm:
 * 1. Sort rooms by importance (primary > secondary > tertiary)
 * 2. Place primary rooms in their zones first (anchor rooms)
 * 3. Place secondary rooms near their preferred adjacencies
 * 4. Place tertiary rooms in remaining space
 * 5. Route corridors between connected rooms (see corridorRouter.ts)
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
  getTilesOfType,
} from './canvas'
import { getAdjacencyWeight, mustBeExterior, SHIP_ZONE_ORDER } from './adjacency'

// ============================================================================
// MAIN ROOM PLACEMENT
// ============================================================================

/**
 * Place all rooms using constraint-based approach.
 * Rooms are placed based on zone assignment, adjacency preferences,
 * and importance level — NOT based on corridor positions.
 */
export function placeRoomsGraphFirst(
  canvas: GridCanvas,
  roomProgram: RoomProgram,
  zones: ZoneDefinition[],
  rng: SeededRNG
): RoomPlacement[] {
  const placements: RoomPlacement[] = []
  const placedRects: Rect[] = []

  // Sort rooms: primary first, then by estimated size (larger first)
  const sortedRooms = [...roomProgram.rooms].sort((a, b) => {
    const importanceOrder = { primary: 0, secondary: 1, tertiary: 2 }
    const aImp = importanceOrder[a.importance] ?? 2
    const bImp = importanceOrder[b.importance] ?? 2
    if (aImp !== bImp) return aImp - bImp
    return b.estimatedTiles - a.estimatedTiles
  })

  // Get hull bounding info
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return placements
  const hullBounds = getBoundingBox(hullTiles)

  // Calculate zone regions on the canvas
  const zoneRegions = calculateZoneRegions(canvas, zones, hullBounds)

  // Place each room
  for (const room of sortedRooms) {
    const placement = placeRoom(
      canvas, room, zones, zoneRegions,
      placements, placedRects, hullBounds, rng
    )
    if (placement) {
      placements.push(placement)
      placedRects.push(placement.bounds)
    }
  }

  return placements
}

// ============================================================================
// ZONE REGION CALCULATION
// ============================================================================

interface ZoneRegion {
  zoneId: string
  yStart: number
  yEnd: number
  xCenter: number
  xSpan: number
}

function calculateZoneRegions(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  hullBounds: Rect
): ZoneRegion[] {
  const regions: ZoneRegion[] = []

  if (canvas.archetype === 'ship') {
    // Ship: zones are distributed bow (top) to stern (bottom)
    const sortedZones = [...zones].sort((a, b) => {
      const orderA = SHIP_ZONE_ORDER[a.id] ?? 3
      const orderB = SHIP_ZONE_ORDER[b.id] ?? 3
      return orderA - orderB
    })

    let currentY = hullBounds.y + 2
    const usableHeight = hullBounds.height - 4

    for (const zone of sortedZones) {
      const height = Math.floor(usableHeight * zone.sizePercent)
      regions.push({
        zoneId: zone.id,
        yStart: currentY,
        yEnd: currentY + height,
        xCenter: Math.floor(canvas.width / 2),
        xSpan: Math.floor(hullBounds.width * 0.8),
      })
      currentY += height
    }
  } else if (canvas.archetype === 'station') {
    // Station: zones are radial (hub center, others around)
    const centerX = Math.floor(canvas.width / 2)
    const centerY = Math.floor(canvas.height / 2)
    const radius = Math.min(hullBounds.width, hullBounds.height) / 2

    for (const zone of zones) {
      if (zone.position === 'hub' || zone.position === 'center') {
        regions.push({
          zoneId: zone.id,
          yStart: centerY - Math.floor(radius * 0.3),
          yEnd: centerY + Math.floor(radius * 0.3),
          xCenter: centerX,
          xSpan: Math.floor(radius * 0.6),
        })
      } else {
        // Spread other zones around
        const angle = zones.indexOf(zone) * (Math.PI * 2 / zones.length)
        const dist = radius * 0.5
        regions.push({
          zoneId: zone.id,
          yStart: centerY + Math.floor(Math.sin(angle) * dist) - Math.floor(radius * 0.3),
          yEnd: centerY + Math.floor(Math.sin(angle) * dist) + Math.floor(radius * 0.3),
          xCenter: centerX + Math.floor(Math.cos(angle) * dist),
          xSpan: Math.floor(radius * 0.5),
        })
      }
    }
  } else {
    // Outpost: single region for each zone
    const sortedZones = [...zones]
    let currentY = hullBounds.y + 2
    const usableHeight = hullBounds.height - 4

    for (const zone of sortedZones) {
      const height = Math.floor(usableHeight * zone.sizePercent)
      regions.push({
        zoneId: zone.id,
        yStart: currentY,
        yEnd: currentY + height,
        xCenter: Math.floor(canvas.width / 2),
        xSpan: Math.floor(hullBounds.width * 0.8),
      })
      currentY += height
    }
  }

  return regions
}

// ============================================================================
// SINGLE ROOM PLACEMENT
// ============================================================================

function placeRoom(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  zones: ZoneDefinition[],
  zoneRegions: ZoneRegion[],
  existingPlacements: RoomPlacement[],
  placedRects: Rect[],
  hullBounds: Rect,
  rng: SeededRNG
): RoomPlacement | null {
  // Calculate room dimensions
  const targetTiles = room.estimatedTiles || 16
  let { width, height } = calculateRoomDimensions(targetTiles, room.roomType, rng)

  // Find the target zone region
  const targetZone = findTargetZoneRegion(room, zoneRegions, zones)

  // Try to place with adjacency preference first
  for (let attempt = 0; attempt < 5; attempt++) {
    // Strategy 1: Place near a preferred adjacent room (if any exist already)
    if (existingPlacements.length > 0) {
      const adjacencyPlacement = tryPlaceNearPreferredRoom(
        canvas, room, width, height,
        existingPlacements, placedRects, targetZone, rng
      )
      if (adjacencyPlacement) {
        return stampRoom(canvas, room, adjacencyPlacement, width, height)
      }
    }

    // Strategy 2: Place in target zone region
    if (targetZone) {
      const zonePlacement = tryPlaceInZone(
        canvas, width, height, targetZone, placedRects, hullBounds, rng
      )
      if (zonePlacement) {
        return stampRoom(canvas, room, zonePlacement, width, height)
      }
    }

    // Strategy 3: Place anywhere in hull
    const anyPlacement = tryPlaceAnywhere(
      canvas, width, height, placedRects, hullBounds, rng
    )
    if (anyPlacement) {
      return stampRoom(canvas, room, anyPlacement, width, height)
    }

    // Shrink and retry
    if (width > height && width > 3) {
      width = Math.max(3, width - 1)
    } else if (height > 3) {
      height = Math.max(3, height - 1)
    } else {
      break
    }
  }

  return null
}

// ============================================================================
// PLACEMENT STRATEGIES
// ============================================================================

/**
 * Try to place room near a room it has high adjacency preference with
 */
function tryPlaceNearPreferredRoom(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  width: number,
  height: number,
  existingPlacements: RoomPlacement[],
  placedRects: Rect[],
  targetZone: ZoneRegion | null,
  rng: SeededRNG
): Point | null {
  // Score existing placements by adjacency preference
  const scored = existingPlacements
    .map(p => ({
      placement: p,
      weight: getAdjacencyWeight(room.roomType, p.roomType),
    }))
    .filter(s => s.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  // Try placing near top-scored rooms
  for (const { placement } of scored.slice(0, 3)) {
    const b = placement.bounds
    const GAP = 2 // Gap for corridor between rooms

    // Try positions around the existing room
    const candidates: Point[] = [
      { x: b.x + b.width + GAP, y: b.y },                          // Right
      { x: b.x - width - GAP, y: b.y },                             // Left
      { x: b.x, y: b.y + b.height + GAP },                          // Below
      { x: b.x, y: b.y - height - GAP },                            // Above
      { x: b.x + b.width + GAP, y: b.y + Math.floor(b.height / 2) - Math.floor(height / 2) }, // Right-center
      { x: b.x - width - GAP, y: b.y + Math.floor(b.height / 2) - Math.floor(height / 2) },   // Left-center
    ]

    // Shuffle to add variety
    const shuffled = rng.shuffle(candidates)

    for (const pos of shuffled) {
      if (canPlaceRoomAt(canvas, pos.x, pos.y, width, height, placedRects)) {
        // Check zone preference if we have one
        if (targetZone) {
          const centerY = pos.y + Math.floor(height / 2)
          if (centerY < targetZone.yStart - 5 || centerY > targetZone.yEnd + 5) {
            continue // Too far from target zone
          }
        }
        return pos
      }
    }
  }

  return null
}

/**
 * Try to place room within its target zone region
 */
function tryPlaceInZone(
  canvas: GridCanvas,
  width: number,
  height: number,
  zone: ZoneRegion,
  placedRects: Rect[],
  hullBounds: Rect,
  rng: SeededRNG
): Point | null {
  const attempts = 30

  for (let i = 0; i < attempts; i++) {
    const x = rng.randomInt(
      Math.max(hullBounds.x + 1, zone.xCenter - Math.floor(zone.xSpan / 2)),
      Math.min(hullBounds.x + hullBounds.width - width - 1, zone.xCenter + Math.floor(zone.xSpan / 2) - width)
    )
    const y = rng.randomInt(zone.yStart, Math.max(zone.yStart, zone.yEnd - height))

    if (canPlaceRoomAt(canvas, x, y, width, height, placedRects)) {
      return { x, y }
    }
  }

  return null
}

/**
 * Try to place room anywhere in the hull
 */
function tryPlaceAnywhere(
  canvas: GridCanvas,
  width: number,
  height: number,
  placedRects: Rect[],
  hullBounds: Rect,
  rng: SeededRNG
): Point | null {
  const attempts = 50

  for (let i = 0; i < attempts; i++) {
    const x = rng.randomInt(hullBounds.x + 1, hullBounds.x + hullBounds.width - width - 1)
    const y = rng.randomInt(hullBounds.y + 1, hullBounds.y + hullBounds.height - height - 1)

    if (canPlaceRoomAt(canvas, x, y, width, height, placedRects)) {
      return { x, y }
    }
  }

  return null
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a room can be placed at given position.
 * All tiles must be HULL, and must not overlap with placed rooms (with padding).
 */
function canPlaceRoomAt(
  canvas: GridCanvas,
  x: number,
  y: number,
  width: number,
  height: number,
  placedRects: Rect[]
): boolean {
  // Check all tiles are HULL
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = x + dx
      const ty = y + dy
      if (!isInBounds(canvas, tx, ty)) return false
      const tile = getTile(canvas, tx, ty)
      if (!tile || tile.type !== TileType.HULL) return false
    }
  }

  // Check no overlap with existing rooms (with 2-tile padding for corridors)
  const PAD = 2
  for (const rect of placedRects) {
    if (
      x < rect.x + rect.width + PAD &&
      x + width + PAD > rect.x &&
      y < rect.y + rect.height + PAD &&
      y + height + PAD > rect.y
    ) {
      return false
    }
  }

  return true
}

// ============================================================================
// ROOM STAMPING
// ============================================================================

/**
 * Stamp a room onto the canvas (mark tiles as FLOOR)
 */
function stampRoom(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  pos: Point,
  width: number,
  height: number
): RoomPlacement {
  const tiles: Point[] = []

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = pos.x + dx
      const ty = pos.y + dy
      tiles.push({ x: tx, y: ty })
      canvas.tiles[ty][tx] = {
        type: TileType.FLOOR,
        roomId: room.id,
      }
    }
  }

  return {
    roomId: room.id,
    roomType: room.roomType,
    label: room.label,
    tiles,
    bounds: { x: pos.x, y: pos.y, width, height },
    zone: room.zone || 'default',
    doorPositions: [], // Filled later by corridor router
    program: room,
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function findTargetZoneRegion(
  room: ProgrammedRoom,
  zoneRegions: ZoneRegion[],
  zones: ZoneDefinition[]
): ZoneRegion | null {
  // Direct zone match
  if (room.zone) {
    const region = zoneRegions.find(r => r.zoneId === room.zone)
    if (region) return region
  }

  // Match by room type in zone definition
  for (const zone of zones) {
    if (zone.roomTypes.includes(room.roomType)) {
      const region = zoneRegions.find(r => r.zoneId === zone.id)
      if (region) return region
    }
  }

  return zoneRegions[0] || null
}

function calculateRoomDimensions(
  targetTiles: number,
  roomType: string,
  rng: SeededRNG
): { width: number; height: number } {
  let aspectRatio: number

  if (isWideRoom(roomType)) {
    aspectRatio = rng.randomFloat(1.5, 2.5)
  } else if (isTallRoom(roomType)) {
    aspectRatio = rng.randomFloat(0.4, 0.7)
  } else {
    aspectRatio = rng.randomFloat(0.8, 1.3)
  }

  const height = Math.max(3, Math.round(Math.sqrt(targetTiles / aspectRatio)))
  const width = Math.max(3, Math.round(targetTiles / height))

  return { width, height }
}

function isWideRoom(roomType: string): boolean {
  return ['cargoBay', 'hangar', 'barracks', 'dockingBay', 'messHall'].includes(roomType)
}

function isTallRoom(roomType: string): boolean {
  return ['airlock', 'escapePod', 'maintenance'].includes(roomType)
}

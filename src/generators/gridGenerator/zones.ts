/**
 * Zone Partitioning
 * Divides hull interior into logical zones (command, crew, engineering, etc.)
 */

import type { SeededRNG, Archetype } from '../types'
import {
  TileType,
  type GridCanvas,
  type ZoneDefinition,
  type ZonePosition,
  type Point,
  SHIP_ZONES,
  STATION_ZONES,
  OUTPOST_ZONES,
} from './types'
import { getTile, getTilesOfType, getCanvasCenter, getBoundingBox } from './canvas'

// ============================================================================
// MAIN ZONE PARTITIONING
// ============================================================================

/**
 * Partition hull tiles into zones
 */
export function partitionZones(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  rng: SeededRNG
): void {
  switch (canvas.archetype) {
    case 'ship':
      partitionShipZones(canvas, zones, rng)
      break
    case 'station':
      partitionStationZones(canvas, zones, rng)
      break
    case 'outpost':
      partitionOutpostZones(canvas, zones, rng)
      break
    default:
      partitionShipZones(canvas, zones, rng)
  }
}

// ============================================================================
// SHIP ZONE PARTITIONING (Linear Y-axis)
// ============================================================================

/**
 * Partition ship zones along Y axis (bow to stern)
 */
function partitionShipZones(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  _rng: SeededRNG
): void {
  // Get all hull tiles
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return

  // Get bounding box of hull
  const bounds = getBoundingBox(hullTiles)

  // Sort zones by position (bow first)
  const positionOrder: ZonePosition[] = ['bow', 'mid', 'stern', 'port', 'starboard', 'center']
  const sortedZones = [...zones].sort((a, b) => {
    return positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position)
  })

  // Calculate Y ranges for each zone
  const yRanges = calculateYRanges(sortedZones, bounds.y, bounds.y + bounds.height)

  // Assign zones to tiles
  for (const tile of hullTiles) {
    const { x, y } = tile
    const tileData = getTile(canvas, x, y)
    if (!tileData || tileData.type !== TileType.HULL) continue

    // Find which zone this Y belongs to
    for (let i = 0; i < sortedZones.length; i++) {
      const zone = sortedZones[i]
      const range = yRanges[i]

      if (y >= range.start && y < range.end) {
        canvas.tiles[y][x].zoneId = zone.id
        break
      }
    }
  }
}

/**
 * Calculate Y ranges for zones based on their size percentages
 */
function calculateYRanges(
  zones: ZoneDefinition[],
  minY: number,
  maxY: number
): Array<{ start: number; end: number }> {
  const totalHeight = maxY - minY
  const ranges: Array<{ start: number; end: number }> = []

  // Group zones by position type
  const bowZones = zones.filter(z => z.position === 'bow')
  const midZones = zones.filter(z => z.position === 'mid' || z.position === 'center')
  const sternZones = zones.filter(z => z.position === 'stern')

  let currentY = minY

  // Bow zones
  for (const zone of bowZones) {
    const height = Math.floor(totalHeight * zone.sizePercent)
    ranges.push({ start: currentY, end: currentY + height })
    currentY += height
  }

  // Mid zones (share remaining middle space)
  const midTotalPercent = midZones.reduce((sum, z) => sum + z.sizePercent, 0)
  const remainingForMid = totalHeight - (currentY - minY) -
    sternZones.reduce((sum, z) => sum + Math.floor(totalHeight * z.sizePercent), 0)

  for (const zone of midZones) {
    const height = Math.floor(remainingForMid * (zone.sizePercent / midTotalPercent))
    ranges.push({ start: currentY, end: currentY + height })
    currentY += height
  }

  // Stern zones
  for (const zone of sternZones) {
    const height = maxY - currentY // Last zone gets remaining space
    ranges.push({ start: currentY, end: currentY + height })
    currentY += height
  }

  // Ensure we cover all space (adjust last range)
  if (ranges.length > 0) {
    ranges[ranges.length - 1].end = maxY
  }

  return ranges
}

// ============================================================================
// STATION ZONE PARTITIONING (Radial)
// ============================================================================

/**
 * Partition station zones radially (hub -> inner -> outer)
 */
function partitionStationZones(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  _rng: SeededRNG
): void {
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return

  const center = getCanvasCenter(canvas)

  // Calculate max radius
  let maxRadius = 0
  for (const tile of hullTiles) {
    const dx = tile.x - center.x
    const dy = tile.y - center.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    maxRadius = Math.max(maxRadius, dist)
  }

  // Sort zones by position (hub -> inner -> outer)
  const positionOrder: ZonePosition[] = ['hub', 'center', 'inner', 'outer']
  const sortedZones = [...zones].sort((a, b) => {
    return positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position)
  })

  // Calculate radius ranges
  const radiusRanges = calculateRadiusRanges(sortedZones, maxRadius)

  // Assign zones to tiles
  for (const tile of hullTiles) {
    const { x, y } = tile
    const tileData = getTile(canvas, x, y)
    if (!tileData || tileData.type !== TileType.HULL) continue

    const dx = x - center.x
    const dy = y - center.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Find which zone this radius belongs to
    for (let i = 0; i < sortedZones.length; i++) {
      const zone = sortedZones[i]
      const range = radiusRanges[i]

      if (dist >= range.start && dist < range.end) {
        canvas.tiles[y][x].zoneId = zone.id
        break
      }
    }
  }
}

/**
 * Calculate radius ranges for zones
 */
function calculateRadiusRanges(
  zones: ZoneDefinition[],
  maxRadius: number
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let currentRadius = 0

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const radiusSpan = maxRadius * zone.sizePercent

    ranges.push({
      start: currentRadius,
      end: currentRadius + radiusSpan,
    })

    currentRadius += radiusSpan
  }

  // Ensure last zone reaches max radius
  if (ranges.length > 0) {
    ranges[ranges.length - 1].end = maxRadius + 1 // +1 to include edge
  }

  return ranges
}

// ============================================================================
// OUTPOST ZONE PARTITIONING (Cluster-based)
// ============================================================================

/**
 * Partition outpost zones using clustering/distance from center
 */
function partitionOutpostZones(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  rng: SeededRNG
): void {
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return

  const center = getCanvasCenter(canvas)

  // Find connected components (modules)
  const components = findConnectedComponents(canvas, hullTiles)

  if (components.length === 0) return

  // Sort components by distance from center
  components.sort((a, b) => {
    const aCenterDist = getComponentCenterDistance(a, center)
    const bCenterDist = getComponentCenterDistance(b, center)
    return aCenterDist - bCenterDist
  })

  // Assign zones to components
  const zoneAssignments = assignZonesToComponents(components, zones, rng)

  // Apply zone assignments to tiles
  for (let i = 0; i < components.length; i++) {
    const zoneId = zoneAssignments[i]
    for (const tile of components[i]) {
      canvas.tiles[tile.y][tile.x].zoneId = zoneId
    }
  }
}

/**
 * Find connected components of hull tiles
 */
function findConnectedComponents(
  canvas: GridCanvas,
  hullTiles: Point[]
): Point[][] {
  const visited = new Set<string>()
  const components: Point[][] = []

  for (const start of hullTiles) {
    const key = `${start.x},${start.y}`
    if (visited.has(key)) continue

    // BFS to find all connected tiles
    const component: Point[] = []
    const queue: Point[] = [start]

    while (queue.length > 0) {
      const current = queue.shift()!
      const currentKey = `${current.x},${current.y}`

      if (visited.has(currentKey)) continue
      visited.add(currentKey)

      const tile = getTile(canvas, current.x, current.y)
      if (!tile || tile.type !== TileType.HULL) continue

      component.push(current)

      // Add neighbors
      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
      ]

      for (const n of neighbors) {
        const nKey = `${n.x},${n.y}`
        if (!visited.has(nKey)) {
          queue.push(n)
        }
      }
    }

    if (component.length > 0) {
      components.push(component)
    }
  }

  return components
}

/**
 * Get distance from component center to a point
 */
function getComponentCenterDistance(component: Point[], center: Point): number {
  if (component.length === 0) return Infinity

  let sumX = 0
  let sumY = 0
  for (const p of component) {
    sumX += p.x
    sumY += p.y
  }
  const centerX = sumX / component.length
  const centerY = sumY / component.length

  const dx = centerX - center.x
  const dy = centerY - center.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Assign zones to components based on position and size
 */
function assignZonesToComponents(
  components: Point[][],
  zones: ZoneDefinition[],
  rng: SeededRNG
): string[] {
  const assignments: string[] = []

  // First component (closest to center) gets 'main' or 'center' zone
  const centerZone = zones.find(z => z.position === 'center' || z.position === 'hub')
  const otherZones = zones.filter(z => z.position !== 'center' && z.position !== 'hub')

  for (let i = 0; i < components.length; i++) {
    if (i === 0 && centerZone) {
      assignments.push(centerZone.id)
    } else if (otherZones.length > 0) {
      // Cycle through other zones
      const zoneIndex = (i - 1) % otherZones.length
      assignments.push(otherZones[zoneIndex].id)
    } else if (zones.length > 0) {
      // Fallback: random zone
      assignments.push(rng.pick(zones).id)
    } else {
      assignments.push('default')
    }
  }

  return assignments
}

// ============================================================================
// ZONE HELPERS
// ============================================================================

/**
 * Get default zones for archetype
 */
export function getDefaultZones(archetype: Archetype, subtype?: string): ZoneDefinition[] {
  if (archetype === 'ship') {
    return SHIP_ZONES[subtype || 'default'] || SHIP_ZONES.default
  }
  if (archetype === 'station') {
    return STATION_ZONES[subtype || 'default'] || STATION_ZONES.default
  }
  if (archetype === 'outpost') {
    return OUTPOST_ZONES[subtype || 'default'] || OUTPOST_ZONES.default
  }
  return SHIP_ZONES.default
}

/**
 * Get zone for a specific tile
 */
export function getTileZone(canvas: GridCanvas, x: number, y: number): string | undefined {
  const tile = getTile(canvas, x, y)
  return tile?.zoneId
}

/**
 * Check if a point is in a specific zone
 */
export function isInZone(
  canvas: GridCanvas,
  x: number,
  y: number,
  zoneId: string
): boolean {
  const tile = getTile(canvas, x, y)
  return tile?.zoneId === zoneId
}

/**
 * Get all zones present in canvas
 */
export function getAllZones(canvas: GridCanvas): string[] {
  const zones = new Set<string>()

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const zoneId = canvas.tiles[y][x].zoneId
      if (zoneId) {
        zones.add(zoneId)
      }
    }
  }

  return Array.from(zones)
}

/**
 * Get zone statistics
 */
export function getZoneStats(canvas: GridCanvas): Record<string, number> {
  const stats: Record<string, number> = {}

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const zoneId = canvas.tiles[y][x].zoneId
      if (zoneId) {
        stats[zoneId] = (stats[zoneId] || 0) + 1
      }
    }
  }

  return stats
}

/**
 * Spine/Corridor Carving
 * Creates the main corridor network on the tile grid
 */

import type { SeededRNG, Archetype } from '../types'
import {
  TileType,
  type GridCanvas,
  type SpineConfig,
  type SpinePattern,
  type Point,
} from './types'
import {
  getTile,
  setTileType,
  isInBounds,
  drawLine,
  getCanvasCenter,
  getTilesOfType,
  getBoundingBox,
  getNeighbors4,
  DIRECTIONS_4,
} from './canvas'

// ============================================================================
// MAIN SPINE CARVING
// ============================================================================

/**
 * Carve main corridor spine into hull
 * Returns junction positions
 */
export function carveSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  switch (config.pattern) {
    case 'linear':
      return carveLinearSpine(canvas, config, rng)
    case 'branching':
      return carveBranchingSpine(canvas, config, rng)
    case 'dual':
      return carveDualSpine(canvas, config, rng)
    case 'grid':
      return carveGridSpine(canvas, config, rng)
    case 'hub-spoke':
      return carveHubSpokeSpine(canvas, config, rng)
    case 'hub-ring':
      return carveHubRingSpine(canvas, config, rng)
    case 'loop':
      return carveLoopSpine(canvas, config, rng)
    case 'organic':
      return carveOrganicSpine(canvas, config, rng)
    default:
      return carveLinearSpine(canvas, config, rng)
  }
}

// ============================================================================
// LINEAR SPINE (Ships)
// ============================================================================

/**
 * Carve a single main corridor through the ship center
 */
function carveLinearSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  _rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return junctions

  const bounds = getBoundingBox(hullTiles)
  const centerX = Math.floor(canvas.width / 2)

  // Find actual hull extent at each Y
  const margin = 2

  // Carve main spine from bow to stern
  for (let y = bounds.y + margin; y < bounds.y + bounds.height - margin; y++) {
    // Check if there's hull at this Y level
    const tile = getTile(canvas, centerX, y)
    if (!tile || tile.type !== TileType.HULL) continue

    // Carve corridor with width
    for (let dx = -Math.floor(config.mainWidth / 2); dx <= Math.floor(config.mainWidth / 2); dx++) {
      const x = centerX + dx
      if (isInBounds(canvas, x, y)) {
        const t = getTile(canvas, x, y)
        if (t && t.type === TileType.HULL) {
          canvas.tiles[y][x] = {
            ...canvas.tiles[y][x],
            type: TileType.CORRIDOR,
            corridorId: 'spine_main',
            spineLevel: 0,
          }
        }
      }
    }
  }

  return junctions
}

// ============================================================================
// BRANCHING SPINE (Most Ships)
// ============================================================================

/**
 * Carve main spine with perpendicular branches
 */
function carveBranchingSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return junctions

  const bounds = getBoundingBox(hullTiles)
  const centerX = Math.floor(canvas.width / 2)
  const margin = 2

  // First, carve the main spine
  const spineYs: number[] = []

  for (let y = bounds.y + margin; y < bounds.y + bounds.height - margin; y++) {
    const tile = getTile(canvas, centerX, y)
    if (!tile || tile.type !== TileType.HULL) continue

    // Carve main corridor
    for (let dx = -Math.floor(config.mainWidth / 2); dx <= Math.floor(config.mainWidth / 2); dx++) {
      const x = centerX + dx
      if (isInBounds(canvas, x, y)) {
        const t = getTile(canvas, x, y)
        if (t && t.type === TileType.HULL) {
          canvas.tiles[y][x] = {
            ...canvas.tiles[y][x],
            type: TileType.CORRIDOR,
            corridorId: 'spine_main',
            spineLevel: 0,
          }
        }
      }
    }
    spineYs.push(y)
  }

  if (spineYs.length < 4) return junctions

  // Calculate branch positions
  const spineLength = spineYs.length
  const branchInterval = Math.floor(spineLength / (config.branchCount + 1))

  for (let i = 1; i <= config.branchCount; i++) {
    const branchY = spineYs[Math.min(i * branchInterval, spineYs.length - 1)]

    // Branch to left
    const leftBranch = carveBranch(
      canvas,
      centerX,
      branchY,
      'left',
      config.branchWidth,
      `branch_${i}_left`
    )

    // Branch to right
    const rightBranch = carveBranch(
      canvas,
      centerX,
      branchY,
      'right',
      config.branchWidth,
      `branch_${i}_right`
    )

    // Mark junction
    junctions.push({ x: centerX, y: branchY })
    canvas.tiles[branchY][centerX] = {
      ...canvas.tiles[branchY][centerX],
      type: TileType.JUNCTION,
      corridorId: 'spine_main',
    }
  }

  return junctions
}

/**
 * Carve a single branch from spine
 * Stops 3 tiles before hull edge to leave room for rooms
 */
function carveBranch(
  canvas: GridCanvas,
  startX: number,
  y: number,
  direction: 'left' | 'right',
  width: number,
  corridorId: string
): number {
  const dx = direction === 'left' ? -1 : 1
  let x = startX + dx

  // First, find how far the hull extends in this direction
  let hullEnd = x
  while (isInBounds(canvas, hullEnd, y)) {
    const tile = getTile(canvas, hullEnd, y)
    if (!tile || tile.type !== TileType.HULL) break
    hullEnd += dx
  }

  // Calculate branch length - leave space for rooms (at least 3 tiles)
  const totalHullLength = Math.abs(hullEnd - startX)
  const roomMargin = Math.min(3, Math.floor(totalHullLength * 0.3))
  const branchLength = Math.max(1, totalHullLength - roomMargin)

  let carved = 0
  while (isInBounds(canvas, x, y) && carved < branchLength) {
    const tile = getTile(canvas, x, y)
    if (!tile || tile.type !== TileType.HULL) break

    // Carve with width
    for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
      if (isInBounds(canvas, x, y + dy)) {
        const t = getTile(canvas, x, y + dy)
        if (t && t.type === TileType.HULL) {
          canvas.tiles[y + dy][x] = {
            ...canvas.tiles[y + dy][x],
            type: TileType.CORRIDOR,
            corridorId,
            spineLevel: 1,
          }
        }
      }
    }

    x += dx
    carved++
  }

  return carved
}

// ============================================================================
// DUAL SPINE (Large Ships)
// ============================================================================

/**
 * Carve two parallel spines with cross-connections
 */
function carveDualSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return junctions

  const bounds = getBoundingBox(hullTiles)
  const centerX = Math.floor(canvas.width / 2)
  const offset = Math.floor(bounds.width * 0.2) // Spines at 20% from center
  const margin = 2

  // Carve left spine
  const leftSpineX = centerX - offset
  const leftSpineYs: number[] = []

  for (let y = bounds.y + margin; y < bounds.y + bounds.height - margin; y++) {
    const tile = getTile(canvas, leftSpineX, y)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[y][leftSpineX] = {
        ...canvas.tiles[y][leftSpineX],
        type: TileType.CORRIDOR,
        corridorId: 'spine_left',
        spineLevel: 0,
      }
      leftSpineYs.push(y)
    }
  }

  // Carve right spine
  const rightSpineX = centerX + offset
  const rightSpineYs: number[] = []

  for (let y = bounds.y + margin; y < bounds.y + bounds.height - margin; y++) {
    const tile = getTile(canvas, rightSpineX, y)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[y][rightSpineX] = {
        ...canvas.tiles[y][rightSpineX],
        type: TileType.CORRIDOR,
        corridorId: 'spine_right',
        spineLevel: 0,
      }
      rightSpineYs.push(y)
    }
  }

  // Add cross-connections
  const crossCount = Math.min(config.branchCount, Math.floor(leftSpineYs.length / 4))
  const crossInterval = Math.floor(leftSpineYs.length / (crossCount + 1))

  for (let i = 1; i <= crossCount; i++) {
    const crossY = leftSpineYs[Math.min(i * crossInterval, leftSpineYs.length - 1)]

    // Carve cross-connection
    for (let x = leftSpineX; x <= rightSpineX; x++) {
      const tile = getTile(canvas, x, crossY)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[crossY][x] = {
          ...canvas.tiles[crossY][x],
          type: TileType.CORRIDOR,
          corridorId: `cross_${i}`,
          spineLevel: 1,
        }
      }
    }

    // Mark junctions
    junctions.push({ x: leftSpineX, y: crossY })
    junctions.push({ x: rightSpineX, y: crossY })
  }

  return junctions
}

// ============================================================================
// GRID SPINE (Large Military Ships)
// ============================================================================

/**
 * Carve a grid pattern of corridors
 */
function carveGridSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return junctions

  const bounds = getBoundingBox(hullTiles)
  const spacingX = config.branchSpacing || 8
  const spacingY = config.branchSpacing || 8
  const margin = 3

  // Calculate grid line positions
  const verticalLines: number[] = []
  const horizontalLines: number[] = []

  for (let x = bounds.x + margin; x < bounds.x + bounds.width - margin; x += spacingX) {
    verticalLines.push(x)
  }

  for (let y = bounds.y + margin; y < bounds.y + bounds.height - margin; y += spacingY) {
    horizontalLines.push(y)
  }

  // Carve vertical lines
  for (const x of verticalLines) {
    for (let y = bounds.y + margin; y < bounds.y + bounds.height - margin; y++) {
      const tile = getTile(canvas, x, y)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[y][x] = {
          ...canvas.tiles[y][x],
          type: TileType.CORRIDOR,
          corridorId: `grid_v_${x}`,
          spineLevel: x === verticalLines[Math.floor(verticalLines.length / 2)] ? 0 : 1,
        }
      }
    }
  }

  // Carve horizontal lines
  for (const y of horizontalLines) {
    for (let x = bounds.x + margin; x < bounds.x + bounds.width - margin; x++) {
      const tile = getTile(canvas, x, y)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[y][x] = {
          ...canvas.tiles[y][x],
          type: TileType.CORRIDOR,
          corridorId: `grid_h_${y}`,
          spineLevel: 1,
        }
      }
    }
  }

  // Mark junctions at intersections
  for (const x of verticalLines) {
    for (const y of horizontalLines) {
      const tile = getTile(canvas, x, y)
      if (tile && (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)) {
        canvas.tiles[y][x].type = TileType.JUNCTION
        junctions.push({ x, y })
      }
    }
  }

  return junctions
}

// ============================================================================
// HUB-SPOKE SPINE (Stations)
// ============================================================================

/**
 * Carve hub with radiating spokes
 */
function carveHubSpokeSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const center = getCanvasCenter(canvas)

  // Find maximum radius within hull
  let maxRadius = 0
  for (const dir of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
    for (let r = 0; r < Math.max(canvas.width, canvas.height); r++) {
      const x = center.x + dir.x * r
      const y = center.y + dir.y * r
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.HULL) {
        maxRadius = Math.max(maxRadius, r - 1)
        break
      }
    }
  }

  // Carve central hub (small area)
  const hubRadius = Math.max(2, Math.floor(maxRadius * 0.15))
  for (let dy = -hubRadius; dy <= hubRadius; dy++) {
    for (let dx = -hubRadius; dx <= hubRadius; dx++) {
      if (dx * dx + dy * dy <= hubRadius * hubRadius) {
        const x = center.x + dx
        const y = center.y + dy
        const tile = getTile(canvas, x, y)
        if (tile && tile.type === TileType.HULL) {
          canvas.tiles[y][x] = {
            ...canvas.tiles[y][x],
            type: TileType.CORRIDOR,
            corridorId: 'hub',
            spineLevel: 0,
          }
        }
      }
    }
  }

  junctions.push(center)

  // Carve spokes
  const spokeCount = config.branchCount || 6
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2

    for (let r = hubRadius; r < maxRadius; r++) {
      const x = Math.round(center.x + Math.cos(angle) * r)
      const y = Math.round(center.y + Math.sin(angle) * r)

      const tile = getTile(canvas, x, y)
      if (!tile || tile.type === TileType.VOID) break

      if (tile.type === TileType.HULL) {
        canvas.tiles[y][x] = {
          ...canvas.tiles[y][x],
          type: TileType.CORRIDOR,
          corridorId: `spoke_${i}`,
          spineLevel: 1,
        }
      }
    }
  }

  return junctions
}

// ============================================================================
// HUB-RING SPINE (Stations)
// ============================================================================

/**
 * Carve hub with concentric rings
 */
function carveHubRingSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const center = getCanvasCenter(canvas)

  // First create hub-spoke base
  const spokeJunctions = carveHubSpokeSpine(canvas, config, rng)
  junctions.push(...spokeJunctions)

  // Find max radius
  let maxRadius = 0
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  for (const tile of hullTiles) {
    const dx = tile.x - center.x
    const dy = tile.y - center.y
    maxRadius = Math.max(maxRadius, Math.sqrt(dx * dx + dy * dy))
  }

  // Add concentric rings
  const ringCount = 2
  for (let ring = 1; ring <= ringCount; ring++) {
    const radius = maxRadius * (ring / (ringCount + 1))

    // Carve ring
    const circumference = Math.round(2 * Math.PI * radius)
    for (let i = 0; i < circumference; i++) {
      const angle = (i / circumference) * Math.PI * 2
      const x = Math.round(center.x + Math.cos(angle) * radius)
      const y = Math.round(center.y + Math.sin(angle) * radius)

      const tile = getTile(canvas, x, y)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[y][x] = {
          ...canvas.tiles[y][x],
          type: TileType.CORRIDOR,
          corridorId: `ring_${ring}`,
          spineLevel: 2,
        }
      }
    }
  }

  return junctions
}

// ============================================================================
// LOOP SPINE (Small Stations)
// ============================================================================

/**
 * Carve a single circular loop
 */
function carveLoopSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const center = getCanvasCenter(canvas)

  // Calculate loop radius
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  const bounds = getBoundingBox(hullTiles)
  const radius = Math.min(bounds.width, bounds.height) * 0.35

  // Carve loop
  const circumference = Math.round(2 * Math.PI * radius)
  for (let i = 0; i < circumference; i++) {
    const angle = (i / circumference) * Math.PI * 2
    const x = Math.round(center.x + Math.cos(angle) * radius)
    const y = Math.round(center.y + Math.sin(angle) * radius)

    const tile = getTile(canvas, x, y)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[y][x] = {
        ...canvas.tiles[y][x],
        type: TileType.CORRIDOR,
        corridorId: 'loop_main',
        spineLevel: 0,
      }
    }
  }

  return junctions
}

// ============================================================================
// ORGANIC SPINE (Outposts)
// ============================================================================

/**
 * Carve irregular, organic corridor pattern
 */
function carveOrganicSpine(
  canvas: GridCanvas,
  config: SpineConfig,
  rng: SeededRNG
): Point[] {
  const junctions: Point[] = []
  const hullTiles = getTilesOfType(canvas, TileType.HULL)
  if (hullTiles.length === 0) return junctions

  // Find connected components
  const components = findHullComponents(canvas)
  if (components.length === 0) return junctions

  // Get centers of each component
  const centers: Point[] = components.map(comp => {
    let sumX = 0
    let sumY = 0
    for (const p of comp) {
      sumX += p.x
      sumY += p.y
    }
    return {
      x: Math.round(sumX / comp.length),
      y: Math.round(sumY / comp.length),
    }
  })

  // Connect components with corridors
  for (let i = 0; i < centers.length - 1; i++) {
    const from = centers[i]
    const to = centers[i + 1]

    // Use A* to find path through hull
    const path = findPathThroughHull(canvas, from, to)

    for (const p of path) {
      const tile = getTile(canvas, p.x, p.y)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[p.y][p.x] = {
          ...canvas.tiles[p.y][p.x],
          type: TileType.CORRIDOR,
          corridorId: `organic_${i}`,
          spineLevel: 1,
        }
      }
    }
  }

  // Add internal corridors within each component
  for (let i = 0; i < components.length; i++) {
    const comp = components[i]
    if (comp.length < 20) continue // Skip small components

    const bounds = getBoundingBox(comp)
    const center = centers[i]

    // Simple cross pattern within component
    // Horizontal line through center
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const tile = getTile(canvas, x, center.y)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[center.y][x] = {
          ...canvas.tiles[center.y][x],
          type: TileType.CORRIDOR,
          corridorId: `internal_h_${i}`,
          spineLevel: 0,
        }
      }
    }

    // Vertical line through center
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      const tile = getTile(canvas, center.x, y)
      if (tile && tile.type === TileType.HULL) {
        canvas.tiles[y][center.x] = {
          ...canvas.tiles[y][center.x],
          type: TileType.CORRIDOR,
          corridorId: `internal_v_${i}`,
          spineLevel: 0,
        }
      }
    }

    junctions.push(center)
  }

  return junctions
}

/**
 * Find connected hull components
 */
function findHullComponents(canvas: GridCanvas): Point[][] {
  const visited = new Set<string>()
  const components: Point[][] = []

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const key = `${x},${y}`
      if (visited.has(key)) continue

      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.HULL) continue

      // BFS to find component
      const component: Point[] = []
      const queue: Point[] = [{ x, y }]

      while (queue.length > 0) {
        const p = queue.shift()!
        const pKey = `${p.x},${p.y}`
        if (visited.has(pKey)) continue
        visited.add(pKey)

        const t = getTile(canvas, p.x, p.y)
        if (!t || t.type !== TileType.HULL) continue

        component.push(p)

        for (const dir of DIRECTIONS_4) {
          const next = { x: p.x + dir.x, y: p.y + dir.y }
          if (!visited.has(`${next.x},${next.y}`)) {
            queue.push(next)
          }
        }
      }

      if (component.length > 0) {
        components.push(component)
      }
    }
  }

  return components
}

/**
 * Simple A* pathfinding through hull tiles
 */
function findPathThroughHull(
  canvas: GridCanvas,
  from: Point,
  to: Point
): Point[] {
  const openSet: Array<{ point: Point; g: number; f: number; parent?: Point }> = []
  const closedSet = new Set<string>()
  const parentMap = new Map<string, Point>()

  const heuristic = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

  openSet.push({ point: from, g: 0, f: heuristic(from, to) })

  while (openSet.length > 0) {
    // Sort by f score
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()!
    const currentKey = `${current.point.x},${current.point.y}`

    if (current.point.x === to.x && current.point.y === to.y) {
      // Reconstruct path
      const path: Point[] = []
      let p: Point | undefined = current.point
      while (p) {
        path.unshift(p)
        p = parentMap.get(`${p.x},${p.y}`)
      }
      return path
    }

    closedSet.add(currentKey)

    for (const dir of DIRECTIONS_4) {
      const next = { x: current.point.x + dir.x, y: current.point.y + dir.y }
      const nextKey = `${next.x},${next.y}`

      if (closedSet.has(nextKey)) continue

      const tile = getTile(canvas, next.x, next.y)
      if (!tile || tile.type !== TileType.HULL) continue

      const g = current.g + 1
      const f = g + heuristic(next, to)

      const existing = openSet.find(n => n.point.x === next.x && n.point.y === next.y)
      if (existing) {
        if (g < existing.g) {
          existing.g = g
          existing.f = f
          parentMap.set(nextKey, current.point)
        }
      } else {
        openSet.push({ point: next, g, f })
        parentMap.set(nextKey, current.point)
      }
    }
  }

  // No path found, return direct line
  return [from, to]
}

// ============================================================================
// SPINE CONFIG HELPERS
// ============================================================================

/**
 * Get default spine config for archetype and size
 */
export function getDefaultSpineConfig(
  archetype: Archetype,
  subtype?: string,
  sizeTier?: string
): SpineConfig {
  // Adjust complexity based on size
  const sizeMultiplier = getSizeMultiplier(sizeTier)

  if (archetype === 'ship') {
    // For small ships, use simpler patterns
    if (sizeTier === 'xs' || sizeTier === 'sm') {
      return {
        pattern: 'branching',
        mainWidth: 1,
        branchWidth: 1,
        branchCount: Math.max(2, Math.floor(3 * sizeMultiplier)),
        branchSpacing: 4,
      }
    }

    switch (subtype) {
      case 'military':
        return {
          pattern: 'grid',
          mainWidth: 2,
          branchWidth: 1,
          branchCount: Math.floor(4 * sizeMultiplier),
          branchSpacing: Math.max(5, Math.floor(6 * sizeMultiplier)),
        }
      case 'cargo':
        return {
          pattern: 'dual',
          mainWidth: 2,
          branchWidth: 1,
          branchCount: Math.floor(3 * sizeMultiplier),
          branchSpacing: Math.max(6, Math.floor(8 * sizeMultiplier)),
        }
      default:
        return {
          pattern: 'branching',
          mainWidth: 2,
          branchWidth: 1,
          branchCount: Math.max(3, Math.floor(4 * sizeMultiplier)),
          branchSpacing: Math.max(5, Math.floor(6 * sizeMultiplier)),
        }
    }
  }

  if (archetype === 'station') {
    const spokeCount = sizeTier === 'xs' ? 4 : sizeTier === 'sm' ? 5 : 6
    return {
      pattern: 'hub-spoke',
      mainWidth: sizeTier === 'xs' ? 1 : 2,
      branchWidth: 1,
      branchCount: spokeCount,
      branchSpacing: Math.max(6, Math.floor(8 * sizeMultiplier)),
    }
  }

  if (archetype === 'outpost') {
    return {
      pattern: 'organic',
      mainWidth: 1,
      branchWidth: 1,
      branchCount: Math.max(2, Math.floor(3 * sizeMultiplier)),
      branchSpacing: Math.max(4, Math.floor(6 * sizeMultiplier)),
    }
  }

  return {
    pattern: 'branching',
    mainWidth: 2,
    branchWidth: 1,
    branchCount: 4,
    branchSpacing: 6,
  }
}

/**
 * Get size multiplier for scaling spine parameters
 */
function getSizeMultiplier(sizeTier?: string): number {
  switch (sizeTier) {
    case 'xs': return 0.6
    case 'sm': return 0.8
    case 'md': return 1.0
    case 'lg': return 1.3
    case 'xl': return 1.6
    default: return 1.0
  }
}

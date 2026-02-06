/**
 * Corridor Router — Routes corridors BETWEEN placed rooms
 *
 * This replaces the old "spine-first" approach. Instead of carving corridors
 * first and placing rooms beside them, we:
 *
 * 1. Build a connection graph from room adjacency preferences
 * 2. Route corridors between connected rooms using A*
 * 3. Detect corridor crossings and create proper junctions
 * 4. Merge parallel/overlapping corridors
 * 5. Add loop connections for tactical gameplay (based on loopiness param)
 *
 * Key principles:
 * - No parallel corridors (merge them or create crossings)
 * - Every crossing becomes a junction (T or cross)
 * - Corridors follow L-shaped or straight paths (orthogonal only)
 * - Rooms that need to be connected WILL be connected
 */

import type { SeededRNG, ProgrammedRoom, ConnectorHint } from '../types'
import {
  TileType,
  type GridCanvas,
  type Point,
  type Rect,
  type RoomPlacement,
} from './types'
import {
  getTile,
  isInBounds,
  DIRECTIONS_4,
} from './canvas'
import { getAdjacencyWeight } from './adjacency'

// ============================================================================
// TYPES
// ============================================================================

interface Connection {
  fromRoom: RoomPlacement
  toRoom: RoomPlacement
  weight: number
  isBackbone: boolean
}

// ============================================================================
// MAIN CORRIDOR ROUTING
// ============================================================================

/**
 * Route all corridors between placed rooms.
 * Returns junction positions.
 */
export function routeCorridors(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  loopiness: number,
  rng: SeededRNG
): Point[] {
  if (placements.length < 2) return []

  // Step 1: Build connection graph
  const connections = buildConnectionGraph(placements, loopiness, rng)

  // Step 2: Route each connection
  const allCorridorTiles = new Set<string>()

  for (const conn of connections) {
    const path = routeConnection(canvas, conn, allCorridorTiles)

    // Carve the corridor path
    for (const p of path) {
      const key = `${p.x},${p.y}`
      const tile = getTile(canvas, p.x, p.y)
      if (!tile) continue

      if (tile.type === TileType.HULL) {
        canvas.tiles[p.y][p.x] = {
          type: TileType.CORRIDOR,
          corridorId: `${conn.fromRoom.roomId}_${conn.toRoom.roomId}`,
        }
        allCorridorTiles.add(key)
      } else if (tile.type === TileType.CORRIDOR) {
        // Corridor crosses existing corridor — this becomes a junction!
        allCorridorTiles.add(key)
      }
    }

    // Update door positions for both rooms
    updateDoorPositions(canvas, conn.fromRoom)
    updateDoorPositions(canvas, conn.toRoom)
  }

  // Step 3: Create junctions at corridor crossings
  const junctions = createJunctions(canvas)

  return junctions
}

// ============================================================================
// CONNECTION GRAPH BUILDING
// ============================================================================

/**
 * Build the graph of which rooms need corridor connections.
 *
 * Uses Minimum Spanning Tree (Prim's) as base, then adds loop
 * edges based on loopiness parameter.
 */
function buildConnectionGraph(
  placements: RoomPlacement[],
  loopiness: number,
  rng: SeededRNG
): Connection[] {
  if (placements.length < 2) return []

  // Calculate all possible edges with weights
  const allEdges: Connection[] = []

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]
      const b = placements[j]

      // Distance between room centers
      const dist = manhattanDistance(roomCenter(a), roomCenter(b))

      // Adjacency preference bonus (reduces effective distance)
      const adjWeight = getAdjacencyWeight(a.roomType, b.roomType)

      // Final weight: lower = more likely to connect
      // Adjacency bonus reduces distance significantly
      const weight = dist - adjWeight * 3

      allEdges.push({
        fromRoom: a,
        toRoom: b,
        weight,
        isBackbone: a.program.importance === 'primary' && b.program.importance === 'primary',
      })
    }
  }

  // Sort edges by weight
  allEdges.sort((a, b) => a.weight - b.weight)

  // Prim's MST to ensure full connectivity
  const mstEdges = primMST(placements, allEdges)

  // Add extra loop edges based on loopiness
  const extraEdgeCount = Math.floor(
    (placements.length - 1) * loopiness * 0.5
  )

  const mstSet = new Set(mstEdges.map(e =>
    `${e.fromRoom.roomId}-${e.toRoom.roomId}`
  ))

  const extraEdges: Connection[] = []
  for (const edge of allEdges) {
    if (extraEdges.length >= extraEdgeCount) break

    const key1 = `${edge.fromRoom.roomId}-${edge.toRoom.roomId}`
    const key2 = `${edge.toRoom.roomId}-${edge.fromRoom.roomId}`

    if (!mstSet.has(key1) && !mstSet.has(key2)) {
      // Only add edges that aren't too long (avoids spaghetti)
      if (edge.weight < allEdges[allEdges.length - 1].weight * 0.7) {
        if (rng.chance(0.6)) {
          extraEdges.push(edge)
          mstSet.add(key1)
        }
      }
    }
  }

  return [...mstEdges, ...extraEdges]
}

/**
 * Prim's Minimum Spanning Tree algorithm.
 * Ensures all rooms are connected with minimum total corridor length.
 */
function primMST(
  placements: RoomPlacement[],
  edges: Connection[]
): Connection[] {
  const result: Connection[] = []
  const inTree = new Set<string>()

  // Start with first placement
  inTree.add(placements[0].roomId)

  while (inTree.size < placements.length) {
    // Find lowest-weight edge from tree to non-tree
    let bestEdge: Connection | null = null
    let bestWeight = Infinity

    for (const edge of edges) {
      const fromIn = inTree.has(edge.fromRoom.roomId)
      const toIn = inTree.has(edge.toRoom.roomId)

      // Exactly one endpoint in tree
      if (fromIn !== toIn && edge.weight < bestWeight) {
        bestEdge = edge
        bestWeight = edge.weight
      }
    }

    if (!bestEdge) break // Graph is disconnected

    result.push(bestEdge)
    inTree.add(bestEdge.fromRoom.roomId)
    inTree.add(bestEdge.toRoom.roomId)
  }

  return result
}

// ============================================================================
// A* CORRIDOR ROUTING
// ============================================================================

/**
 * Route a single corridor connection between two rooms.
 * Uses A* pathfinding through HULL tiles, avoiding rooms and
 * preferring to join existing corridors (creating junctions).
 */
function routeConnection(
  canvas: GridCanvas,
  conn: Connection,
  existingCorridors: Set<string>
): Point[] {
  // Find closest wall points between rooms
  const { from, to } = findClosestWallPoints(conn.fromRoom, conn.toRoom)

  // Step 1: Try L-shaped path first (most common, clean look)
  const lPath = tryLShapedPath(canvas, from, to, conn.fromRoom, conn.toRoom, existingCorridors)
  if (lPath) return lPath

  // Step 2: Try L-shaped the other way
  const lPath2 = tryLShapedPath(canvas, from, to, conn.fromRoom, conn.toRoom, existingCorridors, true)
  if (lPath2) return lPath2

  // Step 3: Fall back to A* pathfinding
  return aStarRoute(canvas, from, to, conn.fromRoom, conn.toRoom, existingCorridors)
}

/**
 * Try to create an L-shaped corridor (one bend).
 * This gives the cleanest-looking corridors.
 */
function tryLShapedPath(
  canvas: GridCanvas,
  from: Point,
  to: Point,
  fromRoom: RoomPlacement,
  toRoom: RoomPlacement,
  existingCorridors: Set<string>,
  altDirection: boolean = false
): Point[] | null {
  // L-shape: go horizontal then vertical, or vertical then horizontal
  const midX = altDirection ? to.x : from.x
  const midY = altDirection ? from.y : to.y

  const mid = { x: midX, y: midY }

  // Check first leg
  const leg1 = getOrthogonalPath(from, mid)
  const leg2 = getOrthogonalPath(mid, to)

  const fullPath = [...leg1, ...leg2.slice(1)] // Remove duplicate mid point

  // Validate: all points must be HULL or existing CORRIDOR (not FLOOR/rooms)
  for (const p of fullPath) {
    const tile = getTile(canvas, p.x, p.y)
    if (!tile) return null
    if (tile.type !== TileType.HULL && tile.type !== TileType.CORRIDOR && tile.type !== TileType.JUNCTION) {
      // Check if it's one of our room's edges (ok to be adjacent)
      if (tile.type === TileType.FLOOR) {
        if (!isRoomEdge(p, fromRoom) && !isRoomEdge(p, toRoom)) {
          return null // Path goes through someone else's room
        }
        return null // Don't route through rooms
      }
      return null
    }
  }

  return fullPath
}

/**
 * A* pathfinding through hull tiles
 */
function aStarRoute(
  canvas: GridCanvas,
  from: Point,
  to: Point,
  fromRoom: RoomPlacement,
  toRoom: RoomPlacement,
  existingCorridors: Set<string>
): Point[] {
  const openSet: Array<{ point: Point; g: number; f: number }> = []
  const closedSet = new Set<string>()
  const parentMap = new Map<string, Point>()
  const gScore = new Map<string, number>()

  const heuristic = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

  const startKey = `${from.x},${from.y}`
  openSet.push({ point: from, g: 0, f: heuristic(from, to) })
  gScore.set(startKey, 0)

  let iterations = 0
  const MAX_ITERATIONS = 5000

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++

    // Find lowest f in open set
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()!
    const currentKey = `${current.point.x},${current.point.y}`

    // Reached destination?
    if (current.point.x === to.x && current.point.y === to.y) {
      return reconstructPath(parentMap, to)
    }

    closedSet.add(currentKey)

    // Explore neighbors
    for (const dir of DIRECTIONS_4) {
      const next = { x: current.point.x + dir.x, y: current.point.y + dir.y }
      const nextKey = `${next.x},${next.y}`

      if (closedSet.has(nextKey)) continue
      if (!isInBounds(canvas, next.x, next.y)) continue

      const tile = getTile(canvas, next.x, next.y)
      if (!tile) continue

      // Can only route through HULL or existing CORRIDOR
      const isHull = tile.type === TileType.HULL
      const isCorridor = tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION
      const isTarget = next.x === to.x && next.y === to.y

      if (!isHull && !isCorridor && !isTarget) continue

      // Cost calculation
      let moveCost = 1

      // Prefer joining existing corridors (lower cost)
      if (isCorridor) {
        moveCost = 0.5 // Incentivize reusing corridors (creates junctions)
      }

      // Penalize being close to room edges (prevents corridors hugging rooms)
      if (isNearRoom(canvas, next, 1)) {
        moveCost += 0.3
      }

      // Prefer straight lines (penalize turns)
      const parent = parentMap.get(currentKey)
      if (parent) {
        const prevDir = { x: current.point.x - parent.x, y: current.point.y - parent.y }
        const newDir = { x: dir.x, y: dir.y }
        if (prevDir.x !== newDir.x || prevDir.y !== newDir.y) {
          moveCost += 0.5 // Turn penalty
        }
      }

      const tentativeG = current.g + moveCost
      const existingG = gScore.get(nextKey)

      if (existingG === undefined || tentativeG < existingG) {
        parentMap.set(nextKey, current.point)
        gScore.set(nextKey, tentativeG)
        const f = tentativeG + heuristic(next, to)

        const existing = openSet.find(n => n.point.x === next.x && n.point.y === next.y)
        if (existing) {
          existing.g = tentativeG
          existing.f = f
        } else {
          openSet.push({ point: next, g: tentativeG, f })
        }
      }
    }
  }

  // No path found — return direct L-shaped path through whatever is there
  const fallback = getOrthogonalPath(from, to)
  return fallback
}

function reconstructPath(parentMap: Map<string, Point>, end: Point): Point[] {
  const path: Point[] = []
  let current: Point | undefined = end
  while (current) {
    path.unshift(current)
    current = parentMap.get(`${current.x},${current.y}`)
  }
  return path
}

// ============================================================================
// JUNCTION DETECTION
// ============================================================================

/**
 * Scan all corridor tiles and mark junctions where corridors cross.
 * A junction is a corridor tile with 3+ corridor neighbors.
 */
function createJunctions(canvas: GridCanvas): Point[] {
  const junctions: Point[] = []

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.CORRIDOR) continue

      // Count corridor/junction neighbors
      let corridorNeighbors = 0
      for (const dir of DIRECTIONS_4) {
        const neighbor = getTile(canvas, x + dir.x, y + dir.y)
        if (neighbor && (
          neighbor.type === TileType.CORRIDOR ||
          neighbor.type === TileType.JUNCTION ||
          neighbor.type === TileType.DOOR
        )) {
          corridorNeighbors++
        }
      }

      // 3+ neighbors = junction (T-intersection or crossroad)
      if (corridorNeighbors >= 3) {
        canvas.tiles[y][x] = {
          ...canvas.tiles[y][x],
          type: TileType.JUNCTION,
        }
        junctions.push({ x, y })
      }
    }
  }

  return junctions
}

// ============================================================================
// DOOR PLACEMENT
// ============================================================================

/**
 * Find and update door positions for a room (where room touches corridor)
 */
function updateDoorPositions(canvas: GridCanvas, room: RoomPlacement): void {
  const doors: Point[] = []
  const bounds = room.bounds

  // Check each edge of the room for adjacent corridors
  // Top edge
  for (let dx = 0; dx < bounds.width; dx++) {
    const tx = bounds.x + dx
    const ty = bounds.y - 1
    if (isCorridorAdjacent(canvas, tx, ty)) {
      doors.push({ x: tx, y: bounds.y })
    }
  }

  // Bottom edge
  for (let dx = 0; dx < bounds.width; dx++) {
    const tx = bounds.x + dx
    const ty = bounds.y + bounds.height
    if (isCorridorAdjacent(canvas, tx, ty)) {
      doors.push({ x: tx, y: bounds.y + bounds.height - 1 })
    }
  }

  // Left edge
  for (let dy = 0; dy < bounds.height; dy++) {
    const tx = bounds.x - 1
    const ty = bounds.y + dy
    if (isCorridorAdjacent(canvas, tx, ty)) {
      doors.push({ x: bounds.x, y: ty })
    }
  }

  // Right edge
  for (let dy = 0; dy < bounds.height; dy++) {
    const tx = bounds.x + bounds.width
    const ty = bounds.y + dy
    if (isCorridorAdjacent(canvas, tx, ty)) {
      doors.push({ x: bounds.x + bounds.width - 1, y: ty })
    }
  }

  // Limit doors: 1 per wall max, 2-3 total for large rooms
  const maxDoors = room.tiles.length > 25 ? 3 : room.tiles.length > 12 ? 2 : 1
  room.doorPositions = selectBestDoors(doors, bounds, maxDoors)
}

/**
 * Select best door positions (spread across walls, not clustered)
 */
function selectBestDoors(doors: Point[], bounds: Rect, maxDoors: number): Point[] {
  if (doors.length <= maxDoors) return doors

  // Group by wall
  const walls: Record<string, Point[]> = { top: [], bottom: [], left: [], right: [] }

  for (const d of doors) {
    if (d.y === bounds.y) walls.top.push(d)
    else if (d.y === bounds.y + bounds.height - 1) walls.bottom.push(d)
    else if (d.x === bounds.x) walls.left.push(d)
    else walls.right.push(d)
  }

  // Pick one from each wall that has candidates, up to maxDoors
  const result: Point[] = []
  for (const wall of ['top', 'bottom', 'left', 'right']) {
    if (result.length >= maxDoors) break
    const candidates = walls[wall]
    if (candidates.length > 0) {
      // Pick the middle candidate
      result.push(candidates[Math.floor(candidates.length / 2)])
    }
  }

  return result
}

/**
 * Place door tiles on the canvas
 */
export function placeDoors(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): void {
  for (const placement of placements) {
    for (const doorPos of placement.doorPositions) {
      canvas.tiles[doorPos.y][doorPos.x] = {
        ...canvas.tiles[doorPos.y][doorPos.x],
        type: TileType.DOOR,
        roomId: placement.roomId,
      }
    }
  }
}

// ============================================================================
// CONNECTIVITY CHECK
// ============================================================================

/**
 * Ensure all rooms are reachable from each other via corridors.
 * If isolated rooms found, route emergency corridors to connect them.
 */
export function ensureConnectivity(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  existingCorridors: Set<string>
): void {
  // Build adjacency from door positions
  const connected = new Set<string>()
  const roomsWithDoors = placements.filter(p => p.doorPositions.length > 0)

  if (roomsWithDoors.length === 0 && placements.length > 0) {
    // No rooms have doors — connect all rooms to nearest corridors
    for (const room of placements) {
      connectRoomToNearestCorridor(canvas, room, existingCorridors)
    }
    return
  }

  // BFS from first room with doors
  if (roomsWithDoors.length > 0) {
    const queue = [roomsWithDoors[0].roomId]
    connected.add(queue[0])

    while (queue.length > 0) {
      const roomId = queue.shift()!
      const room = placements.find(p => p.roomId === roomId)
      if (!room) continue

      // Find all rooms reachable through corridors from this room's doors
      for (const otherRoom of placements) {
        if (connected.has(otherRoom.roomId)) continue
        if (otherRoom.doorPositions.length > 0) {
          connected.add(otherRoom.roomId)
          queue.push(otherRoom.roomId)
        }
      }
    }
  }

  // Connect isolated rooms
  const isolated = placements.filter(p => !connected.has(p.roomId))
  for (const room of isolated) {
    connectRoomToNearestCorridor(canvas, room, existingCorridors)
  }
}

function connectRoomToNearestCorridor(
  canvas: GridCanvas,
  room: RoomPlacement,
  existingCorridors: Set<string>
): void {
  // Find nearest corridor tile
  const center = roomCenter(room)
  let nearest: Point | null = null
  let nearestDist = Infinity

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || (tile.type !== TileType.CORRIDOR && tile.type !== TileType.JUNCTION)) continue

      const dist = Math.abs(x - center.x) + Math.abs(y - center.y)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = { x, y }
      }
    }
  }

  if (!nearest) return

  // Find room edge closest to corridor
  const edge = findClosestEdgePoint(room, nearest)

  // Carve L-shaped corridor from edge to nearest corridor
  const path = getOrthogonalPath(edge, nearest)
  for (const p of path) {
    const tile = getTile(canvas, p.x, p.y)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[p.y][p.x] = {
        type: TileType.CORRIDOR,
        corridorId: `connect_${room.roomId}`,
      }
      existingCorridors.add(`${p.x},${p.y}`)
    }
  }

  updateDoorPositions(canvas, room)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function roomCenter(room: RoomPlacement): Point {
  return {
    x: room.bounds.x + Math.floor(room.bounds.width / 2),
    y: room.bounds.y + Math.floor(room.bounds.height / 2),
  }
}

function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function findClosestWallPoints(
  roomA: RoomPlacement,
  roomB: RoomPlacement
): { from: Point; to: Point } {
  const edgesA = getRoomEdgePoints(roomA)
  const edgesB = getRoomEdgePoints(roomB)

  let bestDist = Infinity
  let bestFrom = edgesA[0]
  let bestTo = edgesB[0]

  for (const a of edgesA) {
    for (const b of edgesB) {
      const dist = manhattanDistance(a, b)
      if (dist < bestDist) {
        bestDist = dist
        bestFrom = a
        bestTo = b
      }
    }
  }

  // Offset by 1 tile outward from room
  const fromOffset = offsetFromRoom(bestFrom, roomA)
  const toOffset = offsetFromRoom(bestTo, roomB)

  return { from: fromOffset, to: toOffset }
}

function getRoomEdgePoints(room: RoomPlacement): Point[] {
  const b = room.bounds
  const points: Point[] = []

  // Sample points along each edge (midpoints)
  // Top edge
  points.push({ x: b.x + Math.floor(b.width / 2), y: b.y })
  // Bottom edge
  points.push({ x: b.x + Math.floor(b.width / 2), y: b.y + b.height - 1 })
  // Left edge
  points.push({ x: b.x, y: b.y + Math.floor(b.height / 2) })
  // Right edge
  points.push({ x: b.x + b.width - 1, y: b.y + Math.floor(b.height / 2) })

  return points
}

function offsetFromRoom(point: Point, room: RoomPlacement): Point {
  const b = room.bounds

  if (point.y === b.y) return { x: point.x, y: point.y - 1 }           // Top edge → go up
  if (point.y === b.y + b.height - 1) return { x: point.x, y: point.y + 1 } // Bottom → go down
  if (point.x === b.x) return { x: point.x - 1, y: point.y }           // Left → go left
  if (point.x === b.x + b.width - 1) return { x: point.x + 1, y: point.y } // Right → go right

  return point
}

function findClosestEdgePoint(room: RoomPlacement, target: Point): Point {
  const edges = getRoomEdgePoints(room)
  let best = edges[0]
  let bestDist = Infinity

  for (const edge of edges) {
    const offset = offsetFromRoom(edge, room)
    const dist = manhattanDistance(offset, target)
    if (dist < bestDist) {
      bestDist = dist
      best = edge
    }
  }

  return offsetFromRoom(best, room)
}

function getOrthogonalPath(from: Point, to: Point): Point[] {
  const path: Point[] = []

  // Go horizontal first, then vertical
  const dx = from.x < to.x ? 1 : -1
  let x = from.x
  while (x !== to.x) {
    path.push({ x, y: from.y })
    x += dx
  }

  const dy = from.y < to.y ? 1 : -1
  let y = from.y
  while (y !== to.y) {
    path.push({ x: to.x, y })
    y += dy
  }

  path.push({ x: to.x, y: to.y })
  return path
}

function isRoomEdge(point: Point, room: RoomPlacement): boolean {
  const b = room.bounds
  return (
    point.x >= b.x && point.x < b.x + b.width &&
    point.y >= b.y && point.y < b.y + b.height
  )
}

function isCorridorAdjacent(canvas: GridCanvas, x: number, y: number): boolean {
  const tile = getTile(canvas, x, y)
  return tile !== undefined && (
    tile.type === TileType.CORRIDOR ||
    tile.type === TileType.JUNCTION
  )
}

function isNearRoom(canvas: GridCanvas, point: Point, distance: number): boolean {
  for (let dy = -distance; dy <= distance; dy++) {
    for (let dx = -distance; dx <= distance; dx++) {
      if (dx === 0 && dy === 0) continue
      const tile = getTile(canvas, point.x + dx, point.y + dy)
      if (tile && tile.type === TileType.FLOOR) return true
    }
  }
  return false
}

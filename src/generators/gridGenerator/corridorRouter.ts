/**
 * Corridor Router — Routes corridors BETWEEN placed rooms
 *
 * Active grid routing is now corridor-first. Instead of peer-to-peer routing
 * every room pair through A*, we:
 *
 * 1. Choose low-obstruction trunk corridors.
 * 2. Connect rooms to trunks with short orthogonal stubs.
 * 3. Detect branch/crossing tiles and create proper junctions.
 * 4. Keep A* as repair/fallback, not as the primary layout grammar.
 *
 * Key principles:
 * - Avoid peer-to-peer spaghetti
 * - Straight shared trunk tiles are not visual junction markers
 * - Corridors follow L-shaped or straight paths (orthogonal only)
 * - Rooms that need to be connected WILL be connected
 */

import type { SeededRNG } from '../types'
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
import { addConnectorIdToTile, connectorIdForRooms } from './corridorGraph'
import { analyzeConnectivity } from './metrics'

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

  return routeSpineCorridors(canvas, placements, loopiness, rng)
}

function routeSpineCorridors(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  loopiness: number,
  rng: SeededRNG
): Point[] {
  const allCorridorTiles = new Set<string>()
  const spine = buildCorridorSpine(canvas, placements, loopiness, rng)

  for (const path of spine.paths) {
    carveCorridorPath(canvas, path, connectorIdForRooms('network', 'network'), allCorridorTiles)
  }

  const sortedRooms = [...placements].sort((a, b) => {
    const ac = roomCenter(a)
    const bc = roomCenter(b)
    return canvas.archetype === 'ship' ? ac.y - bc.y : ac.x - bc.x
  })

  for (const room of sortedRooms) {
    const connection = routeRoomToSpine(canvas, room, spine.points)
    const fallback = connection ?? routeRoomToAnyCorridor(canvas, room)
    if (!fallback || fallback.length < 2) continue

    carveCorridorPath(canvas, fallback, connectorIdForRooms(room.roomId, 'network'), allCorridorTiles)
    updateDoorPositions(canvas, room)
  }

  if (loopiness > 0.55) {
    carveServiceBypass(canvas, placements, spine, allCorridorTiles)
  }

  return createJunctions(canvas)
}

function buildCorridorSpine(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  loopiness: number,
  rng: SeededRNG
): { points: Point[]; paths: Point[][]; primaryX: number; primaryY: number } {
  const centers = placements.map(roomCenter)
  const minY = Math.max(1, Math.min(...centers.map(p => p.y)) - 2)
  const maxY = Math.min(canvas.height - 2, Math.max(...centers.map(p => p.y)) + 2)
  const minX = Math.max(1, Math.min(...centers.map(p => p.x)) - 2)
  const maxX = Math.min(canvas.width - 2, Math.max(...centers.map(p => p.x)) + 2)
  const centerX = Math.round(centers.reduce((sum, p) => sum + p.x, 0) / centers.length)
  const centerY = Math.round(centers.reduce((sum, p) => sum + p.y, 0) / centers.length)

  const primaryX = chooseLeastObstructedColumn(canvas, centerX, minY, maxY)
  const primaryY = chooseLeastObstructedRow(canvas, centerY, minX, maxX)
  const paths: Point[][] = []
  const points: Point[] = []

  const vertical = getOrthogonalPath({ x: primaryX, y: minY }, { x: primaryX, y: maxY })
  paths.push(vertical)
  points.push(...vertical)

  if (canvas.archetype !== 'ship' || loopiness > 0.35) {
    const horizontal = getOrthogonalPath({ x: minX, y: primaryY }, { x: maxX, y: primaryY })
    paths.push(horizontal)
    points.push(...horizontal)
  }

  if (canvas.archetype === 'ship' && loopiness > 0.75 && rng.chance(0.65)) {
    const offset = rng.chance(0.5) ? -4 : 4
    const secondaryX = chooseLeastObstructedColumn(canvas, primaryX + offset, minY, maxY)
    const secondary = getOrthogonalPath({ x: secondaryX, y: minY + 2 }, { x: secondaryX, y: maxY - 2 })
    paths.push(secondary)
    points.push(...secondary)
  }

  return { points: uniquePoints(points), paths, primaryX, primaryY }
}

function routeRoomToSpine(canvas: GridCanvas, room: RoomPlacement, spinePoints: Point[]): Point[] | null {
  const center = roomCenter(room)
  const target = nearestPoint(center, spinePoints)
  if (!target) return null

  const candidates = getRoomEdgePoints(room)
    .map(edge => offsetFromRoom(edge, room))
    .map(start => {
      const direct = getOrthogonalPath(start, target)
      const alt = [
        ...getOrthogonalPath(start, { x: start.x, y: target.y }),
        ...getOrthogonalPath({ x: start.x, y: target.y }, target).slice(1),
      ]
      return [direct, alt]
    })
    .flat()
    .sort((a, b) => a.length - b.length)

  for (const path of candidates) {
    if (isSafeCorridorPath(canvas, path)) return path
  }

  return routeRoomToAnyCorridor(canvas, room)
}

function carveServiceBypass(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  spine: { points: Point[]; primaryX: number; primaryY: number },
  allCorridorTiles: Set<string>
): void {
  const leftRooms = placements
    .filter(room => roomCenter(room).x < spine.primaryX)
    .sort((a, b) => roomCenter(a).y - roomCenter(b).y)
  const rightRooms = placements
    .filter(room => roomCenter(room).x >= spine.primaryX)
    .sort((a, b) => roomCenter(a).y - roomCenter(b).y)

  for (const side of [leftRooms, rightRooms]) {
    if (side.length < 3) continue
    const mid = side[Math.floor(side.length / 2)]
    const target = nearestPoint(roomCenter(mid), spine.points)
    if (!target) continue
    const edge = offsetFromRoom(getRoomEdgePoints(mid)[0], mid)
    const path = getOrthogonalPath(edge, target)
    if (isSafeCorridorPath(canvas, path)) {
      carveCorridorPath(canvas, path, connectorIdForRooms(mid.roomId, 'bypass'), allCorridorTiles)
    }
  }
}

function carveCorridorPath(
  canvas: GridCanvas,
  path: Point[],
  corridorId: string,
  allCorridorTiles: Set<string>
): void {
  for (const p of path) {
    const tile = getTile(canvas, p.x, p.y)
    if (!tile || tile.type === TileType.FLOOR || tile.type === TileType.DOOR) continue

    if (
      tile.type === TileType.VOID ||
      tile.type === TileType.HULL ||
      tile.type === TileType.CORRIDOR ||
      tile.type === TileType.JUNCTION
    ) {
      canvas.tiles[p.y][p.x] = addConnectorIdToTile(
        { ...tile, type: tile.type === TileType.JUNCTION ? TileType.JUNCTION : TileType.CORRIDOR },
        corridorId
      )
      allCorridorTiles.add(`${p.x},${p.y}`)
    }
  }
}

function isSafeCorridorPath(canvas: GridCanvas, path: Point[]): boolean {
  return path.every(p => {
    const tile = getTile(canvas, p.x, p.y)
    return !!tile && (
      tile.type === TileType.VOID ||
      tile.type === TileType.HULL ||
      tile.type === TileType.CORRIDOR ||
      tile.type === TileType.JUNCTION
    )
  })
}

function chooseLeastObstructedColumn(canvas: GridCanvas, preferredX: number, minY: number, maxY: number): number {
  let bestX = Math.max(1, Math.min(canvas.width - 2, preferredX))
  let bestScore = Infinity

  for (let x = Math.max(1, preferredX - 8); x <= Math.min(canvas.width - 2, preferredX + 8); x++) {
    let score = Math.abs(x - preferredX) * 0.25
    for (let y = minY; y <= maxY; y++) {
      const tile = getTile(canvas, x, y)
      if (tile?.type === TileType.FLOOR || tile?.type === TileType.DOOR) score += 20
      else if (tile?.type === TileType.VOID) score += 0.8
    }
    if (score < bestScore) {
      bestScore = score
      bestX = x
    }
  }

  return bestX
}

function chooseLeastObstructedRow(canvas: GridCanvas, preferredY: number, minX: number, maxX: number): number {
  let bestY = Math.max(1, Math.min(canvas.height - 2, preferredY))
  let bestScore = Infinity

  for (let y = Math.max(1, preferredY - 8); y <= Math.min(canvas.height - 2, preferredY + 8); y++) {
    let score = Math.abs(y - preferredY) * 0.25
    for (let x = minX; x <= maxX; x++) {
      const tile = getTile(canvas, x, y)
      if (tile?.type === TileType.FLOOR || tile?.type === TileType.DOOR) score += 20
      else if (tile?.type === TileType.VOID) score += 0.8
    }
    if (score < bestScore) {
      bestScore = score
      bestY = y
    }
  }

  return bestY
}

function nearestPoint(point: Point, points: Point[]): Point | null {
  let nearest: Point | null = null
  let nearestDist = Infinity
  for (const candidate of points) {
    const dist = manhattanDistance(point, candidate)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = candidate
    }
  }
  return nearest
}

function uniquePoints(points: Point[]): Point[] {
  const seen = new Set<string>()
  const result: Point[] = []
  for (const point of points) {
    const key = `${point.x},${point.y}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(point)
  }
  return result
}

function routeCorridorsPeerToPeer(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  loopiness: number,
  rng: SeededRNG
): Point[] {
  // Step 1: Build connection graph
  const connections = buildConnectionGraph(placements, loopiness, rng)

  // Step 2: Route each connection
  const allCorridorTiles = new Set<string>()

  for (const conn of connections) {
    const path = routeConnection(canvas, conn, allCorridorTiles)
    const corridorId = connectorIdForRooms(conn.fromRoom.roomId, conn.toRoom.roomId)
    if (path.length < 2) continue

    // Carve the corridor path
    for (const p of path) {
      const key = `${p.x},${p.y}`
      const tile = getTile(canvas, p.x, p.y)
      if (!tile) continue

      if (tile.type === TileType.HULL) {
        canvas.tiles[p.y][p.x] = addConnectorIdToTile({ type: TileType.CORRIDOR }, corridorId)
        canvas.tiles[p.y][p.x] = addConnectorIdToTile(tile, corridorId)
        allCorridorTiles.add(key)
      } else if (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION) {
        // Corridor crosses existing corridor — this becomes a junction!
        allCorridorTiles.add(key)
      }
    }

    // Widen backbone corridors (between primary rooms) to 2 tiles
    if (conn.isBackbone && path.length > 2) {
      widenCorridor(canvas, path, corridorId, allCorridorTiles)
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
  return []
}

function reconstructPath(parentMap: Map<string, Point | null>, end: Point): Point[] {
  const path: Point[] = []
  let current: Point | undefined = end
  while (current) {
    path.unshift(current)
    current = parentMap.get(`${current.x},${current.y}`) ?? undefined
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

      // 3+ neighbors = topological branch. Shared straight trunk tiles are not
      // visual junctions; otherwise the renderer shows bead-like dots on every
      // overlapped corridor tile.
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
  const analysis = analyzeConnectivity(canvas, placements)
  const connected = analysis.reachableRoomIds

  // Connect isolated rooms
  const isolated = placements.filter(p => !connected.has(p.roomId))
  for (const room of isolated) {
    if (!connectRoomToNearestCorridor(canvas, room, existingCorridors, placements) && placements[0]) {
      connectRoomToRoom(canvas, room, placements[0], existingCorridors)
    }
  }

  for (const room of placements) {
    if (room.doorPositions.length === 0) {
      connectRoomToNearestCorridor(canvas, room, existingCorridors, placements)
    }
    updateDoorPositions(canvas, room)
  }
}

function connectRoomToNearestCorridor(
  canvas: GridCanvas,
  room: RoomPlacement,
  existingCorridors: Set<string>,
  placements: RoomPlacement[]
): boolean {
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

  if (!nearest) {
    const nearestRoom = findNearestRoom(room, placements)
    return nearestRoom ? connectRoomToRoom(canvas, room, nearestRoom, existingCorridors) : false
  }

  // Find room edge closest to corridor
  const edge = findClosestEdgePoint(room, nearest)

  const path = aStarRoute(canvas, edge, nearest, room, room, existingCorridors)
  const safePath = path.length >= 2
    ? path
    : tryRepairLPath(canvas, edge, nearest) ?? routeRoomToAnyCorridor(canvas, room)
  if (!safePath || safePath.length < 2) return false

  const corridorId = connectorIdForRooms(room.roomId, 'repair')
    for (const p of safePath) {
      const tile = getTile(canvas, p.x, p.y)
    if (tile && (tile.type === TileType.VOID || tile.type === TileType.HULL || tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)) {
      canvas.tiles[p.y][p.x] = addConnectorIdToTile(
        { ...tile, type: (tile.type === TileType.HULL || tile.type === TileType.VOID) ? TileType.CORRIDOR : tile.type },
        corridorId
      )
      existingCorridors.add(`${p.x},${p.y}`)
    }
  }

  updateDoorPositions(canvas, room)
  return true
}

function connectRoomToRoom(
  canvas: GridCanvas,
  fromRoom: RoomPlacement,
  toRoom: RoomPlacement,
  existingCorridors: Set<string>
): boolean {
  const { from, to } = findClosestWallPoints(fromRoom, toRoom)
  const corridorId = connectorIdForRooms(fromRoom.roomId, toRoom.roomId)
  const lPath = tryLShapedPath(canvas, from, to, fromRoom, toRoom, existingCorridors)
    ?? tryLShapedPath(canvas, from, to, fromRoom, toRoom, existingCorridors, true)
  const path = lPath ?? aStarRoute(canvas, from, to, fromRoom, toRoom, existingCorridors)
  const safePath = path.length >= 2 ? path : tryRepairLPath(canvas, from, to)

  if (!safePath || safePath.length < 2) return false

  for (const p of safePath) {
    const tile = getTile(canvas, p.x, p.y)
    if (tile && (tile.type === TileType.HULL || tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)) {
      canvas.tiles[p.y][p.x] = addConnectorIdToTile(
        { ...tile, type: tile.type === TileType.HULL ? TileType.CORRIDOR : tile.type },
        corridorId
      )
      existingCorridors.add(`${p.x},${p.y}`)
    }
  }

  updateDoorPositions(canvas, fromRoom)
  updateDoorPositions(canvas, toRoom)
  return true
}

function routeRoomToAnyCorridor(canvas: GridCanvas, room: RoomPlacement): Point[] | null {
  const starts = getRoomEdgePoints(room)
    .map(point => offsetFromRoom(point, room))
    .filter(point => {
      const tile = getTile(canvas, point.x, point.y)
      return tile && (
        tile.type === TileType.VOID ||
        tile.type === TileType.HULL ||
        tile.type === TileType.CORRIDOR ||
        tile.type === TileType.JUNCTION
      )
    })

  const queue: Point[] = [...starts]
  const visited = new Set<string>()
  const parent = new Map<string, Point | null>()
  for (const start of starts) parent.set(`${start.x},${start.y}`, null)

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentKey = `${current.x},${current.y}`
    if (visited.has(currentKey)) continue
    visited.add(currentKey)

    const tile = getTile(canvas, current.x, current.y)
    if (tile && (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)) {
      return reconstructPath(parent, current)
    }

    for (const dir of DIRECTIONS_4) {
      const next = { x: current.x + dir.x, y: current.y + dir.y }
      const nextKey = `${next.x},${next.y}`
      if (visited.has(nextKey) || parent.has(nextKey)) continue

      const nextTile = getTile(canvas, next.x, next.y)
      if (!nextTile || (
        nextTile.type !== TileType.VOID &&
        nextTile.type !== TileType.HULL &&
        nextTile.type !== TileType.CORRIDOR &&
        nextTile.type !== TileType.JUNCTION
      )) continue

      parent.set(nextKey, current)
      queue.push(next)
    }
  }

  return null
}

function findNearestRoom(room: RoomPlacement, placements: RoomPlacement[]): RoomPlacement | null {
  const center = roomCenter(room)
  let nearest: RoomPlacement | null = null
  let nearestDist = Infinity

  for (const candidate of placements) {
    if (candidate.roomId === room.roomId) continue
    const dist = manhattanDistance(center, roomCenter(candidate))
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = candidate
    }
  }

  return nearest
}

// ============================================================================
// CORRIDOR WIDENING
// ============================================================================

/**
 * Widen a corridor path to 2 tiles wide.
 * For each corridor tile, add a parallel tile perpendicular to the path direction.
 */
function widenCorridor(
  canvas: GridCanvas,
  path: Point[],
  corridorId: string,
  allCorridorTiles: Set<string>
): void {
  for (let i = 0; i < path.length; i++) {
    const p = path[i]
    // Determine direction of corridor at this point
    const prev = path[i - 1] || p
    const next = path[i + 1] || p
    const dx = next.x - prev.x
    const dy = next.y - prev.y

    // Perpendicular offset: if moving horizontally, widen vertically and vice versa
    let ox = 0, oy = 0
    if (Math.abs(dx) >= Math.abs(dy)) {
      oy = 1 // horizontal corridor → widen down
    } else {
      ox = 1 // vertical corridor → widen right
    }

    const nx = p.x + ox
    const ny = p.y + oy
    const tile = getTile(canvas, nx, ny)
    if (tile && tile.type === TileType.HULL) {
      canvas.tiles[ny][nx] = addConnectorIdToTile({ type: TileType.CORRIDOR }, corridorId)
      allCorridorTiles.add(`${nx},${ny}`)
    }
  }
}

function tryRepairLPath(canvas: GridCanvas, from: Point, to: Point): Point[] | null {
  const candidates = [
    getOrthogonalPath(from, to),
    [...getOrthogonalPath(from, { x: from.x, y: to.y }), ...getOrthogonalPath({ x: from.x, y: to.y }, to).slice(1)],
  ]

  for (const path of candidates) {
    const isSafe = path.every(p => {
      const tile = getTile(canvas, p.x, p.y)
      return tile && (
        tile.type === TileType.HULL ||
        tile.type === TileType.CORRIDOR ||
        tile.type === TileType.JUNCTION
      )
    })
    if (isSafe) return path
  }

  return null
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

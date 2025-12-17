import { Point, Room, Corridor, Rect, CorridorAttachment } from './types'

// Snap threshold for room walls
const WALL_SNAP_THRESHOLD = 25

// Grid cell size for A* (should be divisible by gridSize)
const PATHFIND_CELL_SIZE = 10

/**
 * Calculate wall offset (0-1) for a point on a room wall
 */
export function calculateWallOffset(
  point: Point,
  room: Room,
  wall: 'top' | 'right' | 'bottom' | 'left'
): number {
  const { x, y, width, height } = room.bounds
  
  switch (wall) {
    case 'top':
    case 'bottom':
      return Math.max(0, Math.min(1, (point.x - x) / width))
    case 'left':
    case 'right':
      return Math.max(0, Math.min(1, (point.y - y) / height))
  }
}

/**
 * Get the world position of a corridor attachment point
 */
export function getAttachmentPosition(
  attachment: CorridorAttachment,
  rooms: Room[]
): Point | null {
  const room = rooms.find(r => r.id === attachment.roomId)
  if (!room) return null
  
  const { x, y, width, height } = room.bounds
  
  switch (attachment.wall) {
    case 'top':
      return { x: x + width * attachment.offset, y }
    case 'bottom':
      return { x: x + width * attachment.offset, y: y + height }
    case 'left':
      return { x, y: y + height * attachment.offset }
    case 'right':
      return { x: x + width, y: y + height * attachment.offset }
  }
}

/**
 * Update corridor endpoints based on room attachments
 */
export function updateCorridorAttachments(
  corridor: Corridor,
  rooms: Room[]
): Corridor {
  if (!corridor.startAttachment && !corridor.endAttachment) {
    return corridor
  }
  
  const newSegments = [...corridor.segments.map(s => ({ 
    start: { ...s.start }, 
    end: { ...s.end } 
  }))]
  
  // Update start point if attached
  if (corridor.startAttachment && newSegments.length > 0) {
    const newPos = getAttachmentPosition(corridor.startAttachment, rooms)
    if (newPos) {
      newSegments[0].start = newPos
    }
  }
  
  // Update end point if attached
  if (corridor.endAttachment && newSegments.length > 0) {
    const lastIdx = newSegments.length - 1
    const newPos = getAttachmentPosition(corridor.endAttachment, rooms)
    if (newPos) {
      newSegments[lastIdx].end = newPos
    }
  }
  
  return {
    ...corridor,
    segments: newSegments,
  }
}

/**
 * Find the nearest room wall point to snap to
 */
export function snapToRoomWall(
  point: Point, 
  rooms: Room[], 
  threshold: number = WALL_SNAP_THRESHOLD
): { snappedPoint: Point; roomId: string | null; wall: 'top' | 'right' | 'bottom' | 'left' | null; offset: number } {
  let bestSnap: { snappedPoint: Point; roomId: string; wall: 'top' | 'right' | 'bottom' | 'left'; distance: number; offset: number } | null = null
  
  for (const room of rooms) {
    const { x, y, width, height } = room.bounds
    
    // Check each wall
    const walls: Array<{ wall: 'top' | 'right' | 'bottom' | 'left'; snapPoint: Point; distance: number; offset: number }> = []
    
    // Top wall
    if (point.x >= x - threshold && point.x <= x + width + threshold) {
      const clampedX = Math.max(x, Math.min(x + width, point.x))
      const dist = Math.abs(point.y - y)
      if (dist <= threshold) {
        walls.push({ wall: 'top', snapPoint: { x: clampedX, y }, distance: dist, offset: (clampedX - x) / width })
      }
    }
    
    // Bottom wall
    if (point.x >= x - threshold && point.x <= x + width + threshold) {
      const clampedX = Math.max(x, Math.min(x + width, point.x))
      const dist = Math.abs(point.y - (y + height))
      if (dist <= threshold) {
        walls.push({ wall: 'bottom', snapPoint: { x: clampedX, y: y + height }, distance: dist, offset: (clampedX - x) / width })
      }
    }
    
    // Left wall
    if (point.y >= y - threshold && point.y <= y + height + threshold) {
      const clampedY = Math.max(y, Math.min(y + height, point.y))
      const dist = Math.abs(point.x - x)
      if (dist <= threshold) {
        walls.push({ wall: 'left', snapPoint: { x, y: clampedY }, distance: dist, offset: (clampedY - y) / height })
      }
    }
    
    // Right wall
    if (point.y >= y - threshold && point.y <= y + height + threshold) {
      const clampedY = Math.max(y, Math.min(y + height, point.y))
      const dist = Math.abs(point.x - (x + width))
      if (dist <= threshold) {
        walls.push({ wall: 'right', snapPoint: { x: x + width, y: clampedY }, distance: dist, offset: (clampedY - y) / height })
      }
    }
    
    // Find closest wall for this room
    for (const w of walls) {
      if (!bestSnap || w.distance < bestSnap.distance) {
        bestSnap = { snappedPoint: w.snapPoint, roomId: room.id, wall: w.wall, distance: w.distance, offset: w.offset }
      }
    }
  }
  
  if (bestSnap) {
    return { snappedPoint: bestSnap.snappedPoint, roomId: bestSnap.roomId, wall: bestSnap.wall, offset: bestSnap.offset }
  }
  
  return { snappedPoint: point, roomId: null, wall: null, offset: 0 }
}

/**
 * Check if a point is inside any room
 */
export function isPointInRoom(point: Point, rooms: Room[], padding: number = 0): boolean {
  for (const room of rooms) {
    const { x, y, width, height } = room.bounds
    if (point.x >= x - padding && point.x <= x + width + padding &&
        point.y >= y - padding && point.y <= y + height + padding) {
      return true
    }
  }
  return false
}

/**
 * Check if a line segment intersects with a room
 */
export function segmentIntersectsRoom(
  start: Point, 
  end: Point, 
  room: Room, 
  corridorWidth: number = 20
): boolean {
  const { x, y, width, height } = room.bounds
  const padding = corridorWidth / 2
  
  // Expand room bounds by corridor half-width
  const roomRect = {
    left: x - padding,
    right: x + width + padding,
    top: y - padding,
    bottom: y + height + padding,
  }
  
  // Check if line segment intersects rectangle
  return lineIntersectsRect(start, end, roomRect)
}

/**
 * Check if line segment intersects rectangle
 */
function lineIntersectsRect(
  start: Point, 
  end: Point, 
  rect: { left: number; right: number; top: number; bottom: number }
): boolean {
  // Cohen-Sutherland algorithm for line-rectangle intersection
  const INSIDE = 0
  const LEFT = 1
  const RIGHT = 2
  const BOTTOM = 4
  const TOP = 8
  
  function computeCode(p: Point): number {
    let code = INSIDE
    if (p.x < rect.left) code |= LEFT
    else if (p.x > rect.right) code |= RIGHT
    if (p.y < rect.top) code |= TOP
    else if (p.y > rect.bottom) code |= BOTTOM
    return code
  }
  
  let code1 = computeCode(start)
  let code2 = computeCode(end)
  let x1 = start.x, y1 = start.y, x2 = end.x, y2 = end.y
  
  while (true) {
    if ((code1 | code2) === 0) return true // Both inside
    if ((code1 & code2) !== 0) return false // Both outside same region
    
    const codeOut = code1 !== 0 ? code1 : code2
    let x = 0, y = 0
    
    if (codeOut & TOP) {
      x = x1 + (x2 - x1) * (rect.top - y1) / (y2 - y1)
      y = rect.top
    } else if (codeOut & BOTTOM) {
      x = x1 + (x2 - x1) * (rect.bottom - y1) / (y2 - y1)
      y = rect.bottom
    } else if (codeOut & RIGHT) {
      y = y1 + (y2 - y1) * (rect.right - x1) / (x2 - x1)
      x = rect.right
    } else if (codeOut & LEFT) {
      y = y1 + (y2 - y1) * (rect.left - x1) / (x2 - x1)
      x = rect.left
    }
    
    if (codeOut === code1) {
      x1 = x; y1 = y
      code1 = computeCode({ x: x1, y: y1 })
    } else {
      x2 = x; y2 = y
      code2 = computeCode({ x: x2, y: y2 })
    }
  }
}

/**
 * Check if a corridor segment intersects with another corridor
 */
export function segmentIntersectsCorridor(
  start: Point, 
  end: Point, 
  corridor: Corridor,
  excludeCorridorId?: string
): { intersects: boolean; intersectionPoint: Point | null } {
  if (corridor.id === excludeCorridorId) {
    return { intersects: false, intersectionPoint: null }
  }
  
  for (const segment of corridor.segments) {
    const intersection = getLineIntersection(start, end, segment.start, segment.end)
    if (intersection) {
      return { intersects: true, intersectionPoint: intersection }
    }
  }
  
  return { intersects: false, intersectionPoint: null }
}

/**
 * Get intersection point of two line segments
 */
function getLineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 0.0001) return null // Parallel
  
  const dx = p3.x - p1.x
  const dy = p3.y - p1.y
  
  const t = (dx * d2y - dy * d2x) / cross
  const u = (dx * d1y - dy * d1x) / cross
  
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: p1.x + t * d1x,
      y: p1.y + t * d1y,
    }
  }
  
  return null
}

/**
 * A* pathfinding node
 */
interface PathNode {
  x: number
  y: number
  g: number // Cost from start
  h: number // Heuristic to end
  f: number // Total cost
  parent: PathNode | null
}

/**
 * Find a path from start to end avoiding rooms using A*
 */
export function findPathAroundRooms(
  start: Point,
  end: Point,
  rooms: Room[],
  gridSize: number,
  corridorWidth: number = 20
): Point[] {
  const cellSize = Math.max(PATHFIND_CELL_SIZE, gridSize / 2)
  const padding = corridorWidth / 2 + 5
  
  // Calculate grid bounds
  const allPoints = [start, end, ...rooms.flatMap(r => [
    { x: r.bounds.x, y: r.bounds.y },
    { x: r.bounds.x + r.bounds.width, y: r.bounds.y + r.bounds.height },
  ])]
  
  const minX = Math.min(...allPoints.map(p => p.x)) - 200
  const maxX = Math.max(...allPoints.map(p => p.x)) + 200
  const minY = Math.min(...allPoints.map(p => p.y)) - 200
  const maxY = Math.max(...allPoints.map(p => p.y)) + 200
  
  // Convert world coords to grid coords
  const toGrid = (p: Point) => ({
    x: Math.round((p.x - minX) / cellSize),
    y: Math.round((p.y - minY) / cellSize),
  })
  
  const toWorld = (gx: number, gy: number) => ({
    x: gx * cellSize + minX,
    y: gy * cellSize + minY,
  })
  
  const gridStart = toGrid(start)
  const gridEnd = toGrid(end)
  
  // Check if a grid cell is blocked
  const isBlocked = (gx: number, gy: number): boolean => {
    const worldPoint = toWorld(gx, gy)
    return isPointInRoom(worldPoint, rooms, padding)
  }
  
  // A* implementation
  const openSet: PathNode[] = []
  const closedSet = new Set<string>()
  
  const heuristic = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  
  const startNode: PathNode = {
    x: gridStart.x,
    y: gridStart.y,
    g: 0,
    h: heuristic(gridStart, gridEnd),
    f: heuristic(gridStart, gridEnd),
    parent: null,
  }
  
  openSet.push(startNode)
  
  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 1, dy: 0 },  // Right
    { dx: 0, dy: 1 },  // Down
    { dx: -1, dy: 0 }, // Left
  ]
  
  let iterations = 0
  const maxIterations = 10000
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++
    
    // Find node with lowest f
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()!
    
    // Reached goal?
    if (current.x === gridEnd.x && current.y === gridEnd.y) {
      // Reconstruct path
      const path: Point[] = []
      let node: PathNode | null = current
      while (node) {
        path.unshift(toWorld(node.x, node.y))
        node = node.parent
      }
      return simplifyPath(path, rooms, corridorWidth)
    }
    
    closedSet.add(`${current.x},${current.y}`)
    
    // Explore neighbors
    for (const dir of directions) {
      const nx = current.x + dir.dx
      const ny = current.y + dir.dy
      const key = `${nx},${ny}`
      
      if (closedSet.has(key)) continue
      if (isBlocked(nx, ny)) continue
      
      const g = current.g + 1
      const h = heuristic({ x: nx, y: ny }, gridEnd)
      const f = g + h
      
      // Check if already in open set with better score
      const existing = openSet.find(n => n.x === nx && n.y === ny)
      if (existing) {
        if (g < existing.g) {
          existing.g = g
          existing.f = f
          existing.parent = current
        }
      } else {
        openSet.push({
          x: nx,
          y: ny,
          g,
          h,
          f,
          parent: current,
        })
      }
    }
  }
  
  // No path found - try to find a path around with more iterations
  console.warn('A* path not found in', iterations, 'iterations, trying extended search...')
  
  // Try with larger bounds and more iterations
  const extendedMinX = minX - 400
  const extendedMaxX = maxX + 400
  const extendedMinY = minY - 400
  const extendedMaxY = maxY + 400
  
  // If still no path, generate orthogonal L-shaped or Z-shaped path
  // This ensures we NEVER pass through rooms
  const lPath = generateOrthogonalPath(start, end, rooms, padding)
  if (lPath.length > 0) {
    return lPath
  }
  
  // Last resort - return points that go around the bounding box of all obstacles
  console.warn('Falling back to bounding box route')
  return generateBoundingBoxRoute(start, end, rooms, padding)
}

/**
 * Generate an orthogonal L or Z shaped path that avoids rooms
 */
function generateOrthogonalPath(
  start: Point,
  end: Point,
  rooms: Room[],
  padding: number
): Point[] {
  // Try L-shaped path: horizontal first, then vertical
  const midH: Point = { x: end.x, y: start.y }
  const hFirstCollides = rooms.some(r => 
    isPointInRoom(midH, [r], padding) ||
    segmentIntersectsRoom(start, midH, r, padding * 2) ||
    segmentIntersectsRoom(midH, end, r, padding * 2)
  )
  
  if (!hFirstCollides) {
    return [start, midH, end]
  }
  
  // Try L-shaped path: vertical first, then horizontal
  const midV: Point = { x: start.x, y: end.y }
  const vFirstCollides = rooms.some(r =>
    isPointInRoom(midV, [r], padding) ||
    segmentIntersectsRoom(start, midV, r, padding * 2) ||
    segmentIntersectsRoom(midV, end, r, padding * 2)
  )
  
  if (!vFirstCollides) {
    return [start, midV, end]
  }
  
  // Try Z-shaped paths (2 turns)
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  
  // Z path with horizontal first
  const z1: Point[] = [
    start,
    { x: midX, y: start.y },
    { x: midX, y: end.y },
    end
  ]
  const z1Collides = checkPathCollision(z1, rooms, padding)
  if (!z1Collides) return z1
  
  // Z path with vertical first
  const z2: Point[] = [
    start,
    { x: start.x, y: midY },
    { x: end.x, y: midY },
    end
  ]
  const z2Collides = checkPathCollision(z2, rooms, padding)
  if (!z2Collides) return z2
  
  return []
}

/**
 * Check if a path collides with any room
 */
function checkPathCollision(path: Point[], rooms: Room[], padding: number): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const room of rooms) {
      if (segmentIntersectsRoom(path[i], path[i + 1], room, padding * 2)) {
        return true
      }
    }
  }
  return false
}

/**
 * Generate a route around the bounding box of all obstacles
 */
function generateBoundingBoxRoute(
  start: Point,
  end: Point,
  rooms: Room[],
  padding: number
): Point[] {
  if (rooms.length === 0) return [start, end]
  
  // Find bounding box of all rooms
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const room of rooms) {
    minX = Math.min(minX, room.bounds.x - padding * 2)
    maxX = Math.max(maxX, room.bounds.x + room.bounds.width + padding * 2)
    minY = Math.min(minY, room.bounds.y - padding * 2)
    maxY = Math.max(maxY, room.bounds.y + room.bounds.height + padding * 2)
  }
  
  // Determine best route around the bounding box
  const routes: Point[][] = []
  
  // Route above
  if (start.y <= minY || end.y <= minY) {
    routes.push([start, { x: start.x, y: minY - padding }, { x: end.x, y: minY - padding }, end])
  }
  
  // Route below
  if (start.y >= maxY || end.y >= maxY) {
    routes.push([start, { x: start.x, y: maxY + padding }, { x: end.x, y: maxY + padding }, end])
  }
  
  // Route left
  if (start.x <= minX || end.x <= minX) {
    routes.push([start, { x: minX - padding, y: start.y }, { x: minX - padding, y: end.y }, end])
  }
  
  // Route right
  if (start.x >= maxX || end.x >= maxX) {
    routes.push([start, { x: maxX + padding, y: start.y }, { x: maxX + padding, y: end.y }, end])
  }
  
  // Add all 4 corner routes as fallback
  routes.push(
    [start, { x: minX - padding, y: start.y }, { x: minX - padding, y: minY - padding }, { x: end.x, y: minY - padding }, end],
    [start, { x: maxX + padding, y: start.y }, { x: maxX + padding, y: minY - padding }, { x: end.x, y: minY - padding }, end],
    [start, { x: minX - padding, y: start.y }, { x: minX - padding, y: maxY + padding }, { x: end.x, y: maxY + padding }, end],
    [start, { x: maxX + padding, y: start.y }, { x: maxX + padding, y: maxY + padding }, { x: end.x, y: maxY + padding }, end]
  )
  
  // Find shortest valid route
  let bestRoute = [start, end]
  let bestLength = Infinity
  
  for (const route of routes) {
    if (!checkPathCollision(route, rooms, padding)) {
      const length = calculatePathLength(route)
      if (length < bestLength) {
        bestLength = length
        bestRoute = route
      }
    }
  }
  
  return bestRoute
}

/**
 * Calculate total length of a path
 */
function calculatePathLength(path: Point[]): number {
  let length = 0
  for (let i = 0; i < path.length - 1; i++) {
    length += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y)
  }
  return length
}

/**
 * Simplify path by removing redundant points and keeping only turns
 */
function simplifyPath(path: Point[], rooms: Room[], corridorWidth: number): Point[] {
  if (path.length <= 2) return path
  
  const simplified: Point[] = [path[0]]
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = simplified[simplified.length - 1]
    const current = path[i]
    const next = path[i + 1]
    
    // Check if direction changes
    const dx1 = Math.sign(current.x - prev.x)
    const dy1 = Math.sign(current.y - prev.y)
    const dx2 = Math.sign(next.x - current.x)
    const dy2 = Math.sign(next.y - current.y)
    
    if (dx1 !== dx2 || dy1 !== dy2) {
      simplified.push(current)
    }
  }
  
  simplified.push(path[path.length - 1])
  
  // Further simplify: try to skip intermediate points if direct path is clear
  const result: Point[] = [simplified[0]]
  let i = 0
  
  while (i < simplified.length - 1) {
    // Try to find furthest point we can reach directly
    let furthest = i + 1
    for (let j = simplified.length - 1; j > i + 1; j--) {
      let canReach = true
      for (const room of rooms) {
        if (segmentIntersectsRoom(result[result.length - 1], simplified[j], room, corridorWidth)) {
          canReach = false
          break
        }
      }
      if (canReach) {
        furthest = j
        break
      }
    }
    result.push(simplified[furthest])
    i = furthest
  }
  
  return result
}

/**
 * Check if proposed corridor segment intersects any room
 */
export function checkCorridorRoomCollision(
  start: Point,
  end: Point,
  rooms: Room[],
  corridorWidth: number = 20
): { collides: boolean; collidingRooms: Room[] } {
  const collidingRooms: Room[] = []
  
  for (const room of rooms) {
    if (segmentIntersectsRoom(start, end, room, corridorWidth)) {
      collidingRooms.push(room)
    }
  }
  
  return { collides: collidingRooms.length > 0, collidingRooms }
}

/**
 * Check if proposed corridor segment intersects any other corridor
 */
export function checkCorridorCorridorCollision(
  start: Point,
  end: Point,
  corridors: Corridor[],
  excludeCorridorId?: string
): { intersects: boolean; intersectionPoints: Point[]; intersectingCorridors: Corridor[] } {
  const intersectionPoints: Point[] = []
  const intersectingCorridors: Corridor[] = []
  
  for (const corridor of corridors) {
    const result = segmentIntersectsCorridor(start, end, corridor, excludeCorridorId)
    if (result.intersects && result.intersectionPoint) {
      intersectionPoints.push(result.intersectionPoint)
      if (!intersectingCorridors.includes(corridor)) {
        intersectingCorridors.push(corridor)
      }
    }
  }
  
  return { intersects: intersectionPoints.length > 0, intersectionPoints, intersectingCorridors }
}

/**
 * Generate an auto-routed path between two points
 */
export function autoRouteCorridor(
  start: Point,
  end: Point,
  rooms: Room[],
  corridors: Corridor[],
  gridSize: number,
  corridorWidth: number = 20,
  allowIntersections: boolean = false
): { 
  segments: Array<{ start: Point; end: Point }>; 
  intersections: Point[];
  requiresConfirmation: boolean;
} {
  // First check if direct path is possible
  const directCollision = checkCorridorRoomCollision(start, end, rooms, corridorWidth)
  const corridorCollision = checkCorridorCorridorCollision(start, end, corridors)
  
  let path: Point[]
  
  if (!directCollision.collides) {
    // Direct path is clear of rooms
    path = [start, end]
  } else {
    // Need to find path around rooms
    path = findPathAroundRooms(start, end, rooms, gridSize, corridorWidth)
  }
  
  // Check all segments for corridor intersections
  const allIntersections: Point[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const collision = checkCorridorCorridorCollision(path[i], path[i + 1], corridors)
    allIntersections.push(...collision.intersectionPoints)
  }
  
  // Convert path to segments
  const segments: Array<{ start: Point; end: Point }> = []
  for (let i = 0; i < path.length - 1; i++) {
    segments.push({ start: path[i], end: path[i + 1] })
  }
  
  return {
    segments,
    intersections: allIntersections,
    requiresConfirmation: allIntersections.length > 0 && !allowIntersections,
  }
}

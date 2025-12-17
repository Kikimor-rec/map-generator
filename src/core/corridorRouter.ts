/**
 * Enhanced Corridor Router
 * Based on specification from 16_corridor_editor_spec.md
 * 
 * Provides orthogonal auto-routing with:
 * - Room and corridor avoidance
 * - Turn minimization
 * - Stub generation from ports
 * - Waypoint support (locked/auto)
 * - Incremental re-routing
 */

import type { Point, Room, Corridor } from './types'
import type {
  Waypoint,
  WaypointKind,
  RouteRequest,
  RouteResult,
  CorridorRouterSettings,
  PortSide,
  IntersectionPolicy,
  CorridorWidthClass,
  CORRIDOR_WIDTHS,
} from './corridorTypes'
import { DEFAULT_ROUTER_SETTINGS } from './corridorTypes'

// ============================================================================
// A* NODE
// ============================================================================

interface AStarNode {
  x: number
  y: number
  g: number
  h: number
  f: number
  parent: AStarNode | null
  direction: 'H' | 'V' | null // Horizontal or Vertical approach
  turnCount: number
  crossingCount: number       // Number of corridor crossings
  reuseCount: number          // Number of reused segments
}

// ============================================================================
// CORRIDOR ROUTER CLASS
// ============================================================================

export class CorridorRouter {
  private settings: CorridorRouterSettings
  private rooms: Room[]
  private corridors: Corridor[]
  private gridSize: number
  
  constructor(
    rooms: Room[] = [],
    corridors: Corridor[] = [],
    settings: Partial<CorridorRouterSettings> = {}
  ) {
    this.settings = { ...DEFAULT_ROUTER_SETTINGS, ...settings }
    this.rooms = rooms
    this.corridors = corridors
    this.gridSize = this.settings.gridSize
  }
  
  /**
   * Update obstacles (rooms and corridors)
   */
  updateObstacles(rooms: Room[], corridors: Corridor[]): void {
    this.rooms = rooms
    this.corridors = corridors
  }
  
  /**
   * Route a corridor between two points
   */
  route(request: RouteRequest): RouteResult {
    const { from, to, lockedWaypoints, widthClass, clearance } = request
    const corridorWidth = this.getCorridorWidth(widthClass)
    
    // Generate stubs from ports
    const stubFrom = this.generateStub(from, request.fromSide)
    const stubTo = this.generateStub(to, request.toSide)
    
    // If we have locked waypoints, route through them
    if (lockedWaypoints.length > 0) {
      return this.routeThroughWaypoints(stubFrom, stubTo, lockedWaypoints, corridorWidth, clearance)
    }
    
    // Direct routing
    return this.findRoute(stubFrom, stubTo, corridorWidth, clearance, request.intersectionPolicy)
  }
  
  /**
   * Route through a series of locked waypoints
   */
  private routeThroughWaypoints(
    from: Point,
    to: Point,
    waypoints: Waypoint[],
    corridorWidth: number,
    clearance: number
  ): RouteResult {
    const allPoints: Point[] = [from]
    const allWaypoints: Waypoint[] = []
    const warnings: string[] = []
    
    // Sort waypoints by position on path (approximate)
    const sortedWaypoints = [...waypoints]
    
    let current = from
    for (const wp of sortedWaypoints) {
      // Route from current to waypoint
      const segmentResult = this.findRoute(current, wp, corridorWidth, clearance, 'avoid')
      
      if (!segmentResult.success) {
        warnings.push(`Could not route to waypoint at (${wp.x}, ${wp.y})`)
        // Fall back to direct line
        allPoints.push(wp)
      } else {
        // Add path points (skip first as it's current)
        for (let i = 1; i < segmentResult.path.length; i++) {
          allPoints.push(segmentResult.path[i])
        }
      }
      
      allWaypoints.push({ ...wp, kind: 'locked' })
      current = wp
    }
    
    // Route from last waypoint to destination
    const finalResult = this.findRoute(current, to, corridorWidth, clearance, 'avoid')
    if (!finalResult.success) {
      warnings.push('Could not complete route to destination')
      allPoints.push(to)
    } else {
      for (let i = 1; i < finalResult.path.length; i++) {
        allPoints.push(finalResult.path[i])
      }
    }
    
    return {
      success: true,
      path: this.simplifyOrthogonalPath(allPoints),
      waypoints: allWaypoints,
      intersections: [],
      warnings,
    }
  }
  
  /**
   * Find route between two points using A*
   */
  private findRoute(
    from: Point,
    to: Point,
    corridorWidth: number,
    clearance: number,
    intersectionPolicy: IntersectionPolicy
  ): RouteResult {
    const cellSize = Math.max(10, this.gridSize / 4)
    const padding = corridorWidth / 2 + clearance * this.gridSize
    
    // Calculate bounds
    const bounds = this.calculateRoutingBounds(from, to, padding)
    
    // Convert to grid
    const toGrid = (p: Point) => ({
      x: Math.round((p.x - bounds.minX) / cellSize),
      y: Math.round((p.y - bounds.minY) / cellSize),
    })
    
    const toWorld = (gx: number, gy: number) => ({
      x: gx * cellSize + bounds.minX,
      y: gy * cellSize + bounds.minY,
    })
    
    const gridStart = toGrid(from)
    const gridEnd = toGrid(to)
    
    // A* search
    const openSet: AStarNode[] = []
    const closedSet = new Map<string, AStarNode>()
    
    const startNode: AStarNode = {
      x: gridStart.x,
      y: gridStart.y,
      g: 0,
      h: this.heuristic(gridStart, gridEnd),
      f: this.heuristic(gridStart, gridEnd),
      parent: null,
      direction: null,
      turnCount: 0,
      crossingCount: 0,
      reuseCount: 0,
    }
    
    openSet.push(startNode)
    
    // Get cost config
    const costs = this.settings.costs
    
    const directions: Array<{ dx: number; dy: number; dir: 'H' | 'V' }> = [
      { dx: 0, dy: -1, dir: 'V' }, // Up
      { dx: 1, dy: 0, dir: 'H' },  // Right
      { dx: 0, dy: 1, dir: 'V' },  // Down
      { dx: -1, dy: 0, dir: 'H' }, // Left
    ]
    
    let iterations = 0
    const maxIterations = 50000
    
    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++
      
      // Get node with lowest f
      openSet.sort((a, b) => a.f - b.f)
      const current = openSet.shift()!
      
      // Check if reached goal
      if (current.x === gridEnd.x && current.y === gridEnd.y) {
        const rawPath = this.reconstructPath(current, toWorld)
        const path = this.simplifyOrthogonalPath(rawPath)
        
        return {
          success: true,
          path,
          waypoints: this.extractAutoWaypoints(path),
          intersections: [],
          warnings: [],
        }
      }
      
      const key = `${current.x},${current.y}`
      closedSet.set(key, current)
      
      // Explore neighbors
      for (const dir of directions) {
        const nx = current.x + dir.dx
        const ny = current.y + dir.dy
        const nKey = `${nx},${ny}`
        
        if (closedSet.has(nKey)) continue
        
        // Check if blocked
        const worldPos = toWorld(nx, ny)
        if (this.isBlocked(worldPos, padding)) continue
        
        // Calculate advanced cost using RoutingCostConfig
        const isTurn = current.direction !== null && current.direction !== dir.dir
        
        // Base move cost (distance based)
        const moveCost = costs.lengthCost * cellSize
        
        // Bend penalty (for turns)
        const bendCost = isTurn ? costs.bendPenalty : 0
        
        // Near-miss penalty (close to room walls)
        const nearMissCost = this.getNearMissPenalty(worldPos, costs.nearMissDistance, costs.nearMissPenalty)
        
        // Crossing penalty (intersecting existing corridors)
        const { crossingCost, isCrossing } = this.getCrossingPenalty(
          worldPos, 
          current.direction, 
          dir.dir,
          costs.crossingPenalty,
          costs.crossingPolicy
        )
        
        // Reuse bonus (if on existing corridor path)
        const { reuseBonus, isReuse } = costs.preferReuseEnabled
          ? this.getReuseBonus(worldPos, costs.reuseBonus, costs.reuseBonusStrength)
          : { reuseBonus: 0, isReuse: false }
        
        // Total g cost
        const g = current.g + moveCost + bendCost + nearMissCost + crossingCost + reuseBonus
        const h = this.heuristic({ x: nx, y: ny }, gridEnd) * costs.lengthCost * cellSize
        const f = g + h
        
        // Track crossing and reuse counts
        const newCrossingCount = current.crossingCount + (isCrossing ? 1 : 0)
        const newReuseCount = current.reuseCount + (isReuse ? 1 : 0)
        
        // Check if in open set with better score
        const existing = openSet.find(n => n.x === nx && n.y === ny)
        if (existing) {
          if (g < existing.g) {
            existing.g = g
            existing.f = f
            existing.parent = current
            existing.direction = dir.dir
            existing.turnCount = current.turnCount + (isTurn ? 1 : 0)
            existing.crossingCount = newCrossingCount
            existing.reuseCount = newReuseCount
          }
        } else {
          openSet.push({
            x: nx,
            y: ny,
            g,
            h,
            f,
            parent: current,
            direction: dir.dir,
            turnCount: current.turnCount + (isTurn ? 1 : 0),
            crossingCount: newCrossingCount,
            reuseCount: newReuseCount,
          })
        }
      }
    }
    
    // No path found
    return {
      success: false,
      path: [from, to],
      waypoints: [],
      intersections: [],
      warnings: [],
      error: iterations >= maxIterations 
        ? 'Route search exceeded maximum iterations'
        : 'No valid path found',
    }
  }
  
  /**
   * Generate a stub from a port
   */
  private generateStub(point: Point, side?: PortSide): Point {
    if (!side) return point
    
    const stubLen = this.settings.stubLength * this.gridSize
    
    switch (side) {
      case 'N': return { x: point.x, y: point.y - stubLen }
      case 'S': return { x: point.x, y: point.y + stubLen }
      case 'W': return { x: point.x - stubLen, y: point.y }
      case 'E': return { x: point.x + stubLen, y: point.y }
    }
  }
  
  /**
   * Get corridor width in pixels
   */
  private getCorridorWidth(widthClass: CorridorWidthClass): number {
    const widths: Record<CorridorWidthClass, number> = {
      narrow: 20,
      standard: 40,
      wide: 60,
    }
    return widths[widthClass]
  }
  
  /**
   * Calculate routing bounds
   */
  private calculateRoutingBounds(from: Point, to: Point, padding: number) {
    const allPoints = [from, to]
    
    // Include room corners
    for (const room of this.rooms) {
      allPoints.push(
        { x: room.bounds.x, y: room.bounds.y },
        { x: room.bounds.x + room.bounds.width, y: room.bounds.y + room.bounds.height }
      )
    }
    
    return {
      minX: Math.min(...allPoints.map(p => p.x)) - padding - 200,
      maxX: Math.max(...allPoints.map(p => p.x)) + padding + 200,
      minY: Math.min(...allPoints.map(p => p.y)) - padding - 200,
      maxY: Math.max(...allPoints.map(p => p.y)) + padding + 200,
    }
  }
  
  /**
   * Manhattan distance heuristic
   */
  private heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }
  
  /**
   * Check if a point is blocked by a room
   */
  private isBlocked(point: Point, padding: number): boolean {
    for (const room of this.rooms) {
      const { x, y, width, height } = room.bounds
      if (
        point.x >= x - padding &&
        point.x <= x + width + padding &&
        point.y >= y - padding &&
        point.y <= y + height + padding
      ) {
        return true
      }
    }
    return false
  }
  
  /**
   * Calculate near-miss penalty for being close to room walls
   */
  private getNearMissPenalty(point: Point, nearMissDistance: number, penaltyValue: number): number {
    let minDist = Infinity
    
    for (const room of this.rooms) {
      const { x, y, width, height } = room.bounds
      
      // Distance to each edge
      const distLeft = Math.abs(point.x - x)
      const distRight = Math.abs(point.x - (x + width))
      const distTop = Math.abs(point.y - y)
      const distBottom = Math.abs(point.y - (y + height))
      
      // Only count if within x/y range of the room
      if (point.y >= y && point.y <= y + height) {
        minDist = Math.min(minDist, distLeft, distRight)
      }
      if (point.x >= x && point.x <= x + width) {
        minDist = Math.min(minDist, distTop, distBottom)
      }
    }
    
    if (minDist < nearMissDistance) {
      // Linear falloff: closer = higher penalty
      const factor = 1 - (minDist / nearMissDistance)
      return penaltyValue * factor
    }
    
    return 0
  }
  
  /**
   * Calculate crossing penalty for intersecting existing corridors
   */
  private getCrossingPenalty(
    point: Point,
    prevDirection: 'H' | 'V' | null,
    newDirection: 'H' | 'V',
    crossingPenalty: number,
    crossingPolicy: 'forbidden' | 'bridgeJump' | 'allowFreely'
  ): { crossingCost: number; isCrossing: boolean } {
    // Check if point is on an existing corridor segment
    for (const corridor of this.corridors) {
      for (const segment of corridor.segments) {
        if (this.isPointOnSegment(point, segment.start, segment.end, this.gridSize / 2)) {
          // Determine if this is a crossing or parallel
          const segDir = this.getSegmentDirection(segment.start, segment.end)
          const isPerpendicular = segDir !== newDirection
          
          if (isPerpendicular) {
            // True crossing
            switch (crossingPolicy) {
              case 'forbidden':
                return { crossingCost: 100000, isCrossing: true } // Effectively blocked
              case 'bridgeJump':
                return { crossingCost: crossingPenalty * 0.5, isCrossing: true } // Reduced penalty
              case 'allowFreely':
                return { crossingCost: 0, isCrossing: true }
            }
          }
        }
      }
    }
    
    return { crossingCost: 0, isCrossing: false }
  }
  
  /**
   * Calculate reuse bonus for following existing corridor paths
   */
  private getReuseBonus(
    point: Point,
    bonusValue: number,
    strength: number
  ): { reuseBonus: number; isReuse: boolean } {
    // Check if point is on an existing corridor segment
    for (const corridor of this.corridors) {
      for (const segment of corridor.segments) {
        if (this.isPointOnSegment(point, segment.start, segment.end, this.gridSize / 2)) {
          // Apply bonus (negative cost)
          return { reuseBonus: bonusValue * strength, isReuse: true }
        }
      }
    }
    
    return { reuseBonus: 0, isReuse: false }
  }
  
  /**
   * Check if a point lies on a line segment
   */
  private isPointOnSegment(point: Point, start: Point, end: Point, tolerance: number): boolean {
    // Check if point is within bounding box of segment + tolerance
    const minX = Math.min(start.x, end.x) - tolerance
    const maxX = Math.max(start.x, end.x) + tolerance
    const minY = Math.min(start.y, end.y) - tolerance
    const maxY = Math.max(start.y, end.y) + tolerance
    
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
      return false
    }
    
    // Check perpendicular distance to line
    const dx = end.x - start.x
    const dy = end.y - start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    
    if (len < 0.001) {
      // Point segment - just check distance
      const d = Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2)
      return d <= tolerance
    }
    
    // Cross product gives area of parallelogram, divide by base for height
    const cross = Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx)
    const distance = cross / len
    
    return distance <= tolerance
  }
  
  /**
   * Determine if a segment is horizontal or vertical
   */
  private getSegmentDirection(start: Point, end: Point): 'H' | 'V' {
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    return dx > dy ? 'H' : 'V'
  }

  /**
   * Reconstruct path from A* result
   */
  private reconstructPath(
    node: AStarNode,
    toWorld: (gx: number, gy: number) => Point
  ): Point[] {
    const path: Point[] = []
    let current: AStarNode | null = node
    
    while (current) {
      path.unshift(toWorld(current.x, current.y))
      current = current.parent
    }
    
    return path
  }
  
  /**
   * Simplify path to only include turn points
   */
  private simplifyOrthogonalPath(path: Point[]): Point[] {
    if (path.length <= 2) return path
    
    const simplified: Point[] = [path[0]]
    
    for (let i = 1; i < path.length - 1; i++) {
      const prev = simplified[simplified.length - 1]
      const curr = path[i]
      const next = path[i + 1]
      
      // Check for direction change
      const dx1 = Math.sign(curr.x - prev.x)
      const dy1 = Math.sign(curr.y - prev.y)
      const dx2 = Math.sign(next.x - curr.x)
      const dy2 = Math.sign(next.y - curr.y)
      
      // Add point if direction changes
      if (dx1 !== dx2 || dy1 !== dy2) {
        simplified.push(curr)
      }
    }
    
    simplified.push(path[path.length - 1])
    
    return simplified
  }
  
  /**
   * Extract auto-generated waypoints from path
   */
  private extractAutoWaypoints(path: Point[]): Waypoint[] {
    if (path.length <= 2) return []
    
    // Waypoints are all intermediate points (turns)
    return path.slice(1, -1).map(p => ({
      x: p.x,
      y: p.y,
      kind: 'auto' as WaypointKind,
    }))
  }
  
  /**
   * Snap a point to grid
   */
  snapToGrid(point: Point): Point {
    if (!this.settings.gridSnap) return point
    
    return {
      x: Math.round(point.x / this.gridSize) * this.gridSize,
      y: Math.round(point.y / this.gridSize) * this.gridSize,
    }
  }
  
  /**
   * Check if a segment collides with any room
   */
  checkSegmentCollision(start: Point, end: Point, corridorWidth: number): Room[] {
    const collidingRooms: Room[] = []
    const padding = corridorWidth / 2
    
    for (const room of this.rooms) {
      if (this.segmentIntersectsRect(start, end, room.bounds, padding)) {
        collidingRooms.push(room)
      }
    }
    
    return collidingRooms
  }
  
  /**
   * Check if a line segment intersects a rectangle
   */
  private segmentIntersectsRect(
    start: Point,
    end: Point,
    rect: { x: number; y: number; width: number; height: number },
    padding: number
  ): boolean {
    const expandedRect = {
      left: rect.x - padding,
      right: rect.x + rect.width + padding,
      top: rect.y - padding,
      bottom: rect.y + rect.height + padding,
    }
    
    // Cohen-Sutherland algorithm
    const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8
    
    const computeCode = (p: Point): number => {
      let code = INSIDE
      if (p.x < expandedRect.left) code |= LEFT
      else if (p.x > expandedRect.right) code |= RIGHT
      if (p.y < expandedRect.top) code |= TOP
      else if (p.y > expandedRect.bottom) code |= BOTTOM
      return code
    }
    
    let code1 = computeCode(start)
    let code2 = computeCode(end)
    let x1 = start.x, y1 = start.y, x2 = end.x, y2 = end.y
    
    while (true) {
      if ((code1 | code2) === 0) return true
      if ((code1 & code2) !== 0) return false
      
      const codeOut = code1 !== 0 ? code1 : code2
      let x = 0, y = 0
      
      if (codeOut & TOP) {
        x = x1 + (x2 - x1) * (expandedRect.top - y1) / (y2 - y1)
        y = expandedRect.top
      } else if (codeOut & BOTTOM) {
        x = x1 + (x2 - x1) * (expandedRect.bottom - y1) / (y2 - y1)
        y = expandedRect.bottom
      } else if (codeOut & RIGHT) {
        y = y1 + (y2 - y1) * (expandedRect.right - x1) / (x2 - x1)
        x = expandedRect.right
      } else if (codeOut & LEFT) {
        y = y1 + (y2 - y1) * (expandedRect.left - x1) / (x2 - x1)
        x = expandedRect.left
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
   * Find intersection points with other corridors
   */
  findCorridorIntersections(
    path: Point[],
    excludeCorridorId?: string
  ): Array<{ point: Point; corridorId: string }> {
    const intersections: Array<{ point: Point; corridorId: string }> = []
    
    for (let i = 0; i < path.length - 1; i++) {
      const segStart = path[i]
      const segEnd = path[i + 1]
      
      for (const corridor of this.corridors) {
        if (corridor.id === excludeCorridorId) continue
        
        for (const segment of corridor.segments) {
          const intersection = this.getLineIntersection(
            segStart, segEnd,
            segment.start, segment.end
          )
          
          if (intersection) {
            intersections.push({
              point: intersection,
              corridorId: corridor.id,
            })
          }
        }
      }
    }
    
    return intersections
  }
  
  /**
   * Get intersection point of two line segments
   */
  private getLineIntersection(
    p1: Point, p2: Point,
    p3: Point, p4: Point
  ): Point | null {
    const d1x = p2.x - p1.x
    const d1y = p2.y - p1.y
    const d2x = p4.x - p3.x
    const d2y = p4.y - p3.y
    
    const cross = d1x * d2y - d1y * d2x
    if (Math.abs(cross) < 0.0001) return null
    
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
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Create a router instance with default settings
 */
export function createCorridorRouter(
  rooms: Room[] = [],
  corridors: Corridor[] = [],
  settings?: Partial<CorridorRouterSettings>
): CorridorRouter {
  return new CorridorRouter(rooms, corridors, settings)
}

/**
 * Quick route between two points (stateless)
 */
export function quickRoute(
  from: Point,
  to: Point,
  rooms: Room[],
  gridSize: number = 40
): Point[] {
  const router = new CorridorRouter(rooms, [], { gridSize })
  const result = router.route({
    from,
    to,
    lockedWaypoints: [],
    widthClass: 'standard',
    clearance: 1,
    intersectionPolicy: 'avoid',
  })
  
  return result.path
}

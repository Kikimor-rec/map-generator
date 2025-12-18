/**
 * Quality Pipeline Validators
 * 
 * Hard constraints that candidates must satisfy to be valid.
 * A candidate failing ANY of these is rejected.
 */

import type {
  ValidationResult,
  ValidationError,
  ConstraintType,
  CandidateData,
  PlacedRoom,
  RoutedCorridor,
  JunctionData,
} from './types'

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

interface Segment {
  start: Point
  end: Point
}

/**
 * Check if two rectangles overlap
 */
function rectsOverlap(a: Rect, b: Rect, clearance: number = 0): boolean {
  return !(
    a.x + a.width + clearance <= b.x ||
    b.x + b.width + clearance <= a.x ||
    a.y + a.height + clearance <= b.y ||
    b.y + b.height + clearance <= a.y
  )
}

/**
 * Check if a point is inside a rectangle
 * Uses strict inequality to allow paths along exact boundaries
 */
function pointInRect(p: Point, r: Rect, inflation: number = 0): boolean {
  return (
    p.x > r.x - inflation &&
    p.x < r.x + r.width + inflation &&
    p.y > r.y - inflation &&
    p.y < r.y + r.height + inflation
  )
}

/**
 * Check if a line segment intersects a rectangle
 */
function segmentIntersectsRect(seg: Segment, rect: Rect, inflation: number = 0): boolean {
  // Expand rect by inflation
  const r: Rect = {
    x: rect.x - inflation,
    y: rect.y - inflation,
    width: rect.width + inflation * 2,
    height: rect.height + inflation * 2,
  }
  
  // Check if either endpoint is inside
  if (pointInRect(seg.start, r, 0) || pointInRect(seg.end, r, 0)) {
    return true
  }
  
  // Check intersection with each edge
  const edges: Segment[] = [
    { start: { x: r.x, y: r.y }, end: { x: r.x + r.width, y: r.y } }, // Top
    { start: { x: r.x + r.width, y: r.y }, end: { x: r.x + r.width, y: r.y + r.height } }, // Right
    { start: { x: r.x, y: r.y + r.height }, end: { x: r.x + r.width, y: r.y + r.height } }, // Bottom
    { start: { x: r.x, y: r.y }, end: { x: r.x, y: r.y + r.height } }, // Left
  ]
  
  for (const edge of edges) {
    if (segmentsIntersect(seg, edge)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(a: Segment, b: Segment): boolean {
  const d1 = direction(b.start, b.end, a.start)
  const d2 = direction(b.start, b.end, a.end)
  const d3 = direction(a.start, a.end, b.start)
  const d4 = direction(a.start, a.end, b.end)
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  
  if (d1 === 0 && onSegment(b.start, b.end, a.start)) return true
  if (d2 === 0 && onSegment(b.start, b.end, a.end)) return true
  if (d3 === 0 && onSegment(a.start, a.end, b.start)) return true
  if (d4 === 0 && onSegment(a.start, a.end, b.end)) return true
  
  return false
}

function direction(a: Point, b: Point, c: Point): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y)
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)
  )
}

/**
 * Calculate segment length
 */
function segmentLength(seg: Segment): number {
  const dx = seg.end.x - seg.start.x
  const dy = seg.end.y - seg.start.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ============================================================================
// VALIDATOR OPTIONS
// ============================================================================

export interface ValidatorOptions {
  /** Minimum clearance between rooms (grid units) */
  roomClearance?: number
  /** Corridor clearance from room walls */
  corridorClearance?: number
  /** Maximum junction degree allowed */
  maxJunctionDegree?: number
  /** Minimum segment length (below = micro segment) */
  minSegmentLength?: number
  /** Maximum micro segments allowed */
  maxMicroSegments?: number
  /** Strictness level (0-1, 1 = all checks) */
  strictness?: number
}

const DEFAULT_OPTIONS: Required<ValidatorOptions> = {
  roomClearance: 1,
  corridorClearance: 0,
  maxJunctionDegree: 4,
  minSegmentLength: 10,
  maxMicroSegments: 5,
  strictness: 1.0,
}

// ============================================================================
// INDIVIDUAL VALIDATORS
// ============================================================================

/**
 * Check for room overlaps (RoomsOverlap constraint)
 */
export function validateNoRoomOverlaps(
  rooms: PlacedRoom[],
  clearance: number = 0
): ValidationError[] {
  const errors: ValidationError[] = []
  
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]
      const b = rooms[j]
      
      const rectA: Rect = { x: a.x, y: a.y, width: a.width, height: a.height }
      const rectB: Rect = { x: b.x, y: b.y, width: b.width, height: b.height }
      
      if (rectsOverlap(rectA, rectB, clearance)) {
        errors.push({
          type: 'RoomsOverlap',
          message: `Room "${a.id}" overlaps with room "${b.id}"`,
          severity: 'error',
          location: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          relatedIds: [a.id, b.id],
        })
      }
    }
  }
  
  return errors
}

/**
 * Check for corridor-room intersections (CorridorIntersectsRoom constraint)
 */
export function validateNoCorridorRoomIntersections(
  rooms: PlacedRoom[],
  corridors: RoutedCorridor[],
  clearance: number = 0
): ValidationError[] {
  const errors: ValidationError[] = []
  
  for (const corridor of corridors) {
    // Get corridor segments
    const path = corridor.path
    if (!path || path.length < 2) continue
    
    // Get connected room IDs to exclude from intersection checks
    const connectedRoomIds = new Set<string>()
    if (corridor.fromRoomId) connectedRoomIds.add(corridor.fromRoomId)
    if (corridor.toRoomId) connectedRoomIds.add(corridor.toRoomId)
    
    for (let i = 0; i < path.length - 1; i++) {
      const seg: Segment = {
        start: path[i],
        end: path[i + 1],
      }
      
      for (const room of rooms) {
        // Skip rooms that this corridor connects
        if (connectedRoomIds.has(room.id)) continue
        
        const rect: Rect = { x: room.x, y: room.y, width: room.width, height: room.height }
        
        // Check if corridor segment passes through room interior
        // (endpoints at ports are allowed)
        const startOnPort = isPointOnRoomPort(seg.start, room)
        const endOnPort = isPointOnRoomPort(seg.end, room)
        
        // If both endpoints are on ports, allow
        if (startOnPort && endOnPort) continue
        
        // Check intersection with inflated rect
        if (segmentIntersectsRect(seg, rect, clearance)) {
          // Allow if start is on port and segment goes away from room
          if (startOnPort && !pointInRect(seg.end, rect, clearance)) continue
          if (endOnPort && !pointInRect(seg.start, rect, clearance)) continue
          
          errors.push({
            type: 'CorridorIntersectsRoom',
            message: `Corridor "${corridor.id}" intersects room "${room.id}"`,
            severity: 'error',
            location: seg.start,
            relatedIds: [corridor.id, room.id],
          })
        }
      }
    }
  }
  
  return errors
}

/**
 * Check if a point is on a room's port
 */
function isPointOnRoomPort(p: Point, room: PlacedRoom, tolerance: number = 5): boolean {
  for (const port of room.ports) {
    const dx = Math.abs(p.x - port.x)
    const dy = Math.abs(p.y - port.y)
    if (dx <= tolerance && dy <= tolerance) {
      return true
    }
  }
  return false
}

/**
 * Check for disconnected graph (DisconnectedGraph constraint)
 */
export function validateConnectedGraph(
  rooms: PlacedRoom[],
  corridors: RoutedCorridor[]
): ValidationError[] {
  const errors: ValidationError[] = []
  
  if (rooms.length === 0) return errors
  
  // Build adjacency from corridors
  const adjacency = new Map<string, Set<string>>()
  
  for (const room of rooms) {
    adjacency.set(room.id, new Set())
  }
  
  for (const corridor of corridors) {
    // Find rooms connected by this corridor's ports
    const fromRoom = rooms.find(r => r.ports.some(p => p.id === corridor.fromPortId))
    const toRoom = rooms.find(r => r.ports.some(p => p.id === corridor.toPortId))
    
    if (fromRoom && toRoom && fromRoom.id !== toRoom.id) {
      adjacency.get(fromRoom.id)!.add(toRoom.id)
      adjacency.get(toRoom.id)!.add(fromRoom.id)
    }
  }
  
  // BFS from first room
  const visited = new Set<string>()
  const queue = [rooms[0].id]
  visited.add(rooms[0].id)
  
  while (queue.length > 0) {
    const current = queue.shift()!
    const neighbors = adjacency.get(current) || new Set()
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  
  // Check for unreachable rooms
  for (const room of rooms) {
    if (!visited.has(room.id)) {
      errors.push({
        type: 'DisconnectedGraph',
        message: `Room "${room.id}" is not reachable from other rooms`,
        severity: 'error',
        location: { x: room.x, y: room.y },
        relatedIds: [room.id],
      })
    }
  }
  
  return errors
}

/**
 * Check for too many micro segments (TooManyMicroSegments constraint)
 */
export function validateNoExcessiveMicroSegments(
  corridors: RoutedCorridor[],
  minLength: number,
  maxCount: number
): ValidationError[] {
  const errors: ValidationError[] = []
  let microCount = 0
  
  for (const corridor of corridors) {
    const path = corridor.path
    if (!path || path.length < 2) continue
    
    for (let i = 0; i < path.length - 1; i++) {
      const seg: Segment = { start: path[i], end: path[i + 1] }
      if (segmentLength(seg) < minLength) {
        microCount++
      }
    }
  }
  
  if (microCount > maxCount) {
    errors.push({
      type: 'TooManyMicroSegments',
      message: `Too many micro segments: ${microCount} (max ${maxCount})`,
      severity: 'warning',
      relatedIds: [],
    })
  }
  
  return errors
}

/**
 * Check for invalid ports (InvalidPorts constraint)
 */
export function validateValidPorts(
  rooms: PlacedRoom[],
  corridors: RoutedCorridor[]
): ValidationError[] {
  const errors: ValidationError[] = []
  
  // Collect all valid port IDs
  const validPortIds = new Set<string>()
  for (const room of rooms) {
    for (const port of room.ports) {
      validPortIds.add(port.id)
    }
  }
  
  // Check each corridor
  for (const corridor of corridors) {
    if (!validPortIds.has(corridor.fromPortId)) {
      errors.push({
        type: 'InvalidPorts',
        message: `Corridor "${corridor.id}" has invalid fromPortId: ${corridor.fromPortId}`,
        severity: 'error',
        relatedIds: [corridor.id],
      })
    }
    
    if (!validPortIds.has(corridor.toPortId)) {
      errors.push({
        type: 'InvalidPorts',
        message: `Corridor "${corridor.id}" has invalid toPortId: ${corridor.toPortId}`,
        severity: 'error',
        relatedIds: [corridor.id],
      })
    }
  }
  
  return errors
}

/**
 * Check for junction degree exceeded (JunctionDegreeExceeded constraint)
 */
export function validateJunctionDegrees(
  junctions: JunctionData[],
  maxDegree: number
): ValidationError[] {
  const errors: ValidationError[] = []
  
  for (const junction of junctions) {
    if (junction.degree > maxDegree) {
      errors.push({
        type: 'JunctionDegreeExceeded',
        message: `Junction at (${junction.x}, ${junction.y}) has degree ${junction.degree} (max ${maxDegree})`,
        severity: 'warning',
        location: { x: junction.x, y: junction.y },
        relatedIds: [junction.id],
      })
    }
  }
  
  return errors
}

/**
 * Check clearance violations
 */
export function validateClearance(
  rooms: PlacedRoom[],
  corridors: RoutedCorridor[],
  clearance: number
): ValidationError[] {
  // This is covered by validateNoRoomOverlaps and validateNoCorridorRoomIntersections
  // with the clearance parameter, but we can add explicit checks here
  return []
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate a candidate against all constraints
 */
export function validateCandidate(
  data: CandidateData,
  options: ValidatorOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  const allErrors: ValidationError[] = []
  const checks: Record<ConstraintType, { passed: number; failed: number }> = {
    RoomsOverlap: { passed: 0, failed: 0 },
    CorridorIntersectsRoom: { passed: 0, failed: 0 },
    DisconnectedGraph: { passed: 0, failed: 0 },
    TooManyMicroSegments: { passed: 0, failed: 0 },
    InvalidPorts: { passed: 0, failed: 0 },
    JunctionDegreeExceeded: { passed: 0, failed: 0 },
    ClearanceViolation: { passed: 0, failed: 0 },
  }
  
  // Always run critical checks (strictness >= 0)
  const roomOverlapErrors = validateNoRoomOverlaps(data.placedRooms, opts.roomClearance)
  allErrors.push(...roomOverlapErrors)
  checks.RoomsOverlap.failed = roomOverlapErrors.length
  checks.RoomsOverlap.passed = roomOverlapErrors.length === 0 ? 1 : 0
  
  // Corridor-room intersections: error for high strictness, warning for low
  const corridorRoomErrors = validateNoCorridorRoomIntersections(
    data.placedRooms,
    data.corridors,
    opts.corridorClearance
  )
  // Downgrade to warnings if strictness is low (draft mode)
  if (opts.strictness < 0.7) {
    for (const err of corridorRoomErrors) {
      err.severity = 'warning'
    }
  }
  allErrors.push(...corridorRoomErrors)
  checks.CorridorIntersectsRoom.failed = corridorRoomErrors.length
  checks.CorridorIntersectsRoom.passed = corridorRoomErrors.length === 0 ? 1 : 0
  
  // Graph connectivity (always important)
  if (opts.strictness >= 0.3) {
    const graphErrors = validateConnectedGraph(data.placedRooms, data.corridors)
    allErrors.push(...graphErrors)
    checks.DisconnectedGraph.failed = graphErrors.length
    checks.DisconnectedGraph.passed = graphErrors.length === 0 ? 1 : 0
  }
  
  // Port validity
  if (opts.strictness >= 0.5) {
    const portErrors = validateValidPorts(data.placedRooms, data.corridors)
    allErrors.push(...portErrors)
    checks.InvalidPorts.failed = portErrors.length
    checks.InvalidPorts.passed = portErrors.length === 0 ? 1 : 0
  }
  
  // Less critical checks
  if (opts.strictness >= 0.7) {
    const microErrors = validateNoExcessiveMicroSegments(
      data.corridors,
      opts.minSegmentLength,
      opts.maxMicroSegments
    )
    allErrors.push(...microErrors)
    checks.TooManyMicroSegments.failed = microErrors.length
    checks.TooManyMicroSegments.passed = microErrors.length === 0 ? 1 : 0
  }
  
  if (opts.strictness >= 0.8) {
    const junctionErrors = validateJunctionDegrees(data.junctions, opts.maxJunctionDegree)
    allErrors.push(...junctionErrors)
    checks.JunctionDegreeExceeded.failed = junctionErrors.length
    checks.JunctionDegreeExceeded.passed = junctionErrors.length === 0 ? 1 : 0
  }
  
  // Separate errors and warnings
  const errors = allErrors.filter(e => e.severity === 'error')
  const warnings = allErrors.filter(e => e.severity === 'warning')
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checks,
  }
}

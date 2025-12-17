/**
 * Quality Pipeline Scoring
 * 
 * Calculates quality score for valid candidates.
 * Higher score = better candidate.
 */

import type {
  CandidateData,
  ScoreBreakdown,
  ScoringConfig,
  QualityStyleProfile,
  PlacedRoom,
  RoutedCorridor,
  JunctionData,
  TopologyEdge,
} from './types'
import { DEFAULT_SCORING_CONFIG, STYLE_SCORING_ADJUSTMENTS } from './types'

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

interface Point {
  x: number
  y: number
}

function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

function pathLength(path: Point[]): number {
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    total += distance(path[i], path[i + 1])
  }
  return total
}

// ============================================================================
// METRIC CALCULATORS
// ============================================================================

/**
 * Calculate total corridor length
 */
export function calculateTotalCorridorLength(corridors: RoutedCorridor[]): number {
  return corridors.reduce((sum, c) => sum + pathLength(c.path), 0)
}

/**
 * Calculate total bend count
 */
export function calculateTotalBends(corridors: RoutedCorridor[]): number {
  return corridors.reduce((sum, c) => sum + c.bends, 0)
}

/**
 * Calculate dead end count
 * A dead end is a room with only one connection
 */
export function calculateDeadEndCount(
  rooms: PlacedRoom[],
  corridors: RoutedCorridor[]
): number {
  // Count connections per room
  const connectionCount = new Map<string, number>()
  
  for (const room of rooms) {
    connectionCount.set(room.id, 0)
  }
  
  for (const corridor of corridors) {
    // Find rooms for this corridor's ports
    for (const room of rooms) {
      const hasFrom = room.ports.some(p => p.id === corridor.fromPortId)
      const hasTo = room.ports.some(p => p.id === corridor.toPortId)
      
      if (hasFrom) {
        connectionCount.set(room.id, (connectionCount.get(room.id) || 0) + 1)
      }
      if (hasTo) {
        connectionCount.set(room.id, (connectionCount.get(room.id) || 0) + 1)
      }
    }
  }
  
  // Count rooms with only one connection
  let deadEnds = 0
  for (const [, count] of connectionCount) {
    if (count === 1) deadEnds++
  }
  
  return deadEnds
}

/**
 * Calculate cycle count in the graph
 * Uses Euler formula: cycles = edges - nodes + components
 */
export function calculateCycleCount(
  rooms: PlacedRoom[],
  edges: TopologyEdge[]
): number {
  const nodeCount = rooms.length
  const edgeCount = edges.length
  
  // For connected graph, cycles = edges - nodes + 1
  // For multiple components, we'd need to count them
  // Assuming connected graph here
  return Math.max(0, edgeCount - nodeCount + 1)
}

/**
 * Calculate chokepoint count
 * A chokepoint is an edge whose removal disconnects the graph
 */
export function calculateChokepointCount(
  rooms: PlacedRoom[],
  edges: TopologyEdge[]
): number {
  // Build adjacency list
  const adj = new Map<string, Set<string>>()
  
  for (const room of rooms) {
    adj.set(room.id, new Set())
  }
  
  for (const edge of edges) {
    adj.get(edge.fromRoomId)?.add(edge.toRoomId)
    adj.get(edge.toRoomId)?.add(edge.fromRoomId)
  }
  
  // For each edge, check if removing it disconnects the graph
  let chokepoints = 0
  
  for (const edge of edges) {
    // Remove edge temporarily
    adj.get(edge.fromRoomId)?.delete(edge.toRoomId)
    adj.get(edge.toRoomId)?.delete(edge.fromRoomId)
    
    // Check connectivity
    const visited = new Set<string>()
    const queue = [rooms[0].id]
    visited.add(rooms[0].id)
    
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    
    if (visited.size < rooms.length) {
      chokepoints++
    }
    
    // Restore edge
    adj.get(edge.fromRoomId)?.add(edge.toRoomId)
    adj.get(edge.toRoomId)?.add(edge.fromRoomId)
  }
  
  return chokepoints
}

/**
 * Calculate junction degree distribution
 */
export function calculateJunctionDegreeStats(junctions: JunctionData[]): {
  distribution: Record<number, number>
  overBudget: number
  maxDegree: number
} {
  const distribution: Record<number, number> = {}
  let overBudget = 0
  let maxDegree = 0
  const degreeLimit = 4
  
  for (const junction of junctions) {
    const degree = junction.degree
    distribution[degree] = (distribution[degree] || 0) + 1
    maxDegree = Math.max(maxDegree, degree)
    
    if (degree > degreeLimit) {
      overBudget += degree - degreeLimit
    }
  }
  
  return { distribution, overBudget, maxDegree }
}

/**
 * Calculate corridor reuse ratio
 * How much of new corridors share paths with existing ones
 */
export function calculateReuseRatio(corridors: RoutedCorridor[]): number {
  if (corridors.length <= 1) return 0
  
  // Simple heuristic: count shared segments
  // A more accurate version would use the coalesce algorithm
  const segmentSet = new Set<string>()
  let sharedCount = 0
  let totalCount = 0
  
  for (const corridor of corridors) {
    const path = corridor.path
    
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i]
      const p2 = path[i + 1]
      
      // Create normalized segment key
      const key = p1.x < p2.x || (p1.x === p2.x && p1.y < p2.y)
        ? `${p1.x},${p1.y}-${p2.x},${p2.y}`
        : `${p2.x},${p2.y}-${p1.x},${p1.y}`
      
      if (segmentSet.has(key)) {
        sharedCount++
      } else {
        segmentSet.add(key)
      }
      
      totalCount++
    }
  }
  
  return totalCount > 0 ? sharedCount / totalCount : 0
}

/**
 * Calculate compactness score
 * Ratio of actual area used vs bounding box
 */
export function calculateCompactness(rooms: PlacedRoom[]): number {
  if (rooms.length === 0) return 0
  
  // Calculate bounding box
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity
  let totalRoomArea = 0
  
  for (const room of rooms) {
    minX = Math.min(minX, room.x)
    minY = Math.min(minY, room.y)
    maxX = Math.max(maxX, room.x + room.width)
    maxY = Math.max(maxY, room.y + room.height)
    totalRoomArea += room.width * room.height
  }
  
  const boundingArea = (maxX - minX) * (maxY - minY)
  
  return boundingArea > 0 ? totalRoomArea / boundingArea : 0
}

/**
 * Calculate zone adherence score
 * How well rooms are grouped by zone
 */
export function calculateZoneAdherence(
  rooms: PlacedRoom[],
  programRooms: Array<{ id: string; zone: string }>
): number {
  if (rooms.length < 2) return 1
  
  // Map room IDs to zones
  const roomZones = new Map<string, string>()
  for (const pr of programRooms) {
    roomZones.set(pr.id, pr.zone)
  }
  
  // Calculate average distance between same-zone rooms vs different-zone rooms
  let sameZoneDist = 0
  let diffZoneDist = 0
  let sameZoneCount = 0
  let diffZoneCount = 0
  
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]
      const b = rooms[j]
      const zoneA = roomZones.get(a.programId)
      const zoneB = roomZones.get(b.programId)
      
      const dist = distance(
        { x: a.x + a.width / 2, y: a.y + a.height / 2 },
        { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      )
      
      if (zoneA === zoneB) {
        sameZoneDist += dist
        sameZoneCount++
      } else {
        diffZoneDist += dist
        diffZoneCount++
      }
    }
  }
  
  // Score: same-zone rooms should be closer than different-zone
  const avgSame = sameZoneCount > 0 ? sameZoneDist / sameZoneCount : 0
  const avgDiff = diffZoneCount > 0 ? diffZoneDist / diffZoneCount : 1
  
  if (avgDiff === 0) return 0.5
  
  // Ratio > 1 means same-zone rooms are farther (bad)
  // Ratio < 1 means same-zone rooms are closer (good)
  const ratio = avgSame / avgDiff
  
  // Convert to 0-1 score (lower ratio = higher score)
  return Math.max(0, Math.min(1, 1 - ratio + 0.5))
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export interface ScoreOptions {
  /** Scoring weights */
  config?: Partial<ScoringConfig>
  /** Style profile for adjustments */
  styleProfile?: QualityStyleProfile
  /** Target dead ends (0 = minimize) */
  targetDeadEnds?: number
}

/**
 * Calculate score for a candidate
 */
export function scoreCandidate(
  data: CandidateData,
  options: ScoreOptions = {}
): ScoreBreakdown {
  // Build config with defaults and style adjustments
  let config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...options.config }
  
  if (options.styleProfile) {
    const adjustment = STYLE_SCORING_ADJUSTMENTS[options.styleProfile]
    config = { ...config, ...adjustment }
  }
  
  const targetDeadEnds = options.targetDeadEnds ?? 0
  
  // Calculate metrics
  const corridorLength = calculateTotalCorridorLength(data.corridors)
  const bendsCount = calculateTotalBends(data.corridors)
  const deadEndsCount = calculateDeadEndCount(data.placedRooms, data.corridors)
  const cycleCount = calculateCycleCount(data.placedRooms, data.graph)
  const chokepointCount = calculateChokepointCount(data.placedRooms, data.graph)
  const junctionStats = calculateJunctionDegreeStats(data.junctions)
  const reuseRatio = calculateReuseRatio(data.corridors)
  const compactness = calculateCompactness(data.placedRooms)
  const zoneAdherence = calculateZoneAdherence(data.placedRooms, data.rooms)
  
  // Calculate component scores
  const components = {
    corridorLength: corridorLength * config.wLength,
    bends: bendsCount * config.wBends,
    deadEnds: Math.max(0, deadEndsCount - targetDeadEnds) * config.wDeadEnds,
    cycles: cycleCount * config.wCycles,
    chokepoints: chokepointCount * config.wChokepoints,
    junctionDegree: junctionStats.overBudget * config.wJunctionDegree,
    reuse: reuseRatio * config.wReuse,
    compactness: compactness * config.wCompactness,
    zoneAdherence: zoneAdherence * config.wZoneAdherence,
  }
  
  // Style adjustment factor
  const styleAdjustment = options.styleProfile === 'futurism' ? 1.1 : 1.0
  
  // Calculate total
  const total = (
    components.corridorLength +
    components.bends +
    components.deadEnds +
    components.cycles +
    components.chokepoints +
    components.junctionDegree +
    components.reuse +
    components.compactness +
    components.zoneAdherence
  ) * styleAdjustment
  
  return {
    total,
    components,
    styleAdjustment,
  }
}

/**
 * Compare two candidates by score
 */
export function compareCandidates(a: ScoreBreakdown, b: ScoreBreakdown): number {
  return b.total - a.total // Higher score is better
}

/**
 * Normalize score to 0-1 range (for quality threshold comparison)
 */
export function normalizeScore(score: number, min: number = -100, max: number = 100): number {
  return Math.max(0, Math.min(1, (score - min) / (max - min)))
}

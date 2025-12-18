/**
 * Segment Graph - Segment-based corridor routing system
 * 
 * Each corridor is broken into segments (point-to-point lines).
 * Segments can be shared between multiple corridors.
 * Junctions are created where segments meet or cross.
 */

import type { RoutedCorridor, JunctionData, PlacedRoom, PortData } from './types'

// ============================================================================
// TYPES
// ============================================================================

export interface Segment {
  id: string
  from: Point
  to: Point
  /** IDs of corridors using this segment */
  corridorIds: Set<string>
  /** Is this a trunk (shared by 2+ corridors)? */
  isTrunk: boolean
}

export interface Point {
  x: number
  y: number
}

export interface SegmentGraphNode {
  point: Point
  key: string
  /** Connected segment IDs */
  segmentIds: Set<string>
  /** Is this a junction (3+ connections or 2+ corridors)? */
  isJunction: boolean
  /** Corridor IDs passing through this point */
  corridorIds: Set<string>
}

// ============================================================================
// SEGMENT GRAPH CLASS
// ============================================================================

export class SegmentGraph {
  private segments: Map<string, Segment> = new Map()
  private nodes: Map<string, SegmentGraphNode> = new Map()
  private nextSegmentId = 0
  private tolerance: number

  constructor(tolerance: number = 5) {
    this.tolerance = tolerance
  }

  /**
   * Get point key for lookups (snapped to tolerance grid)
   */
  private pointKey(p: Point): string {
    const x = Math.round(p.x / this.tolerance) * this.tolerance
    const y = Math.round(p.y / this.tolerance) * this.tolerance
    return `${x},${y}`
  }

  /**
   * Snap point to tolerance grid
   */
  private snapPoint(p: Point): Point {
    return {
      x: Math.round(p.x / this.tolerance) * this.tolerance,
      y: Math.round(p.y / this.tolerance) * this.tolerance
    }
  }

  /**
   * Get or create a node at a point
   */
  private getOrCreateNode(p: Point): SegmentGraphNode {
    const snapped = this.snapPoint(p)
    const key = this.pointKey(snapped)
    
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        point: snapped,
        key,
        segmentIds: new Set(),
        isJunction: false,
        corridorIds: new Set()
      })
    }
    
    return this.nodes.get(key)!
  }

  /**
   * Check if two segments are collinear and overlapping
   */
  private segmentsOverlap(s1: Segment, s2: Segment): boolean {
    // Check if same line (collinear)
    const d1x = s1.to.x - s1.from.x
    const d1y = s1.to.y - s1.from.y
    const d2x = s2.to.x - s2.from.x
    const d2y = s2.to.y - s2.from.y
    
    // Cross product should be ~0 for parallel
    const cross = d1x * d2y - d1y * d2x
    if (Math.abs(cross) > 0.001) return false
    
    // Check if on same line
    const dx = s2.from.x - s1.from.x
    const dy = s2.from.y - s1.from.y
    const cross2 = dx * d1y - dy * d1x
    if (Math.abs(cross2) > this.tolerance) return false
    
    // Check overlap in parameter space
    // Project both segments onto the line
    const len1 = Math.sqrt(d1x * d1x + d1y * d1y)
    if (len1 < 0.001) return false
    
    const project = (p: Point) => {
      const px = p.x - s1.from.x
      const py = p.y - s1.from.y
      return (px * d1x + py * d1y) / (len1 * len1)
    }
    
    const t1 = 0
    const t2 = 1
    const t3 = project(s2.from)
    const t4 = project(s2.to)
    
    const min1 = Math.min(t1, t2)
    const max1 = Math.max(t1, t2)
    const min2 = Math.min(t3, t4)
    const max2 = Math.max(t3, t4)
    
    return max1 > min2 && max2 > min1
  }

  /**
   * Find intersection point of two segments (if any)
   */
  private findIntersection(s1: Segment, s2: Segment): Point | null {
    const x1 = s1.from.x, y1 = s1.from.y
    const x2 = s1.to.x, y2 = s1.to.y
    const x3 = s2.from.x, y3 = s2.from.y
    const x4 = s2.to.x, y4 = s2.to.y
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(denom) < 0.0001) return null // Parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
    
    // Check if intersection is within both segments (not at endpoints)
    const eps = 0.01
    if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) {
      return this.snapPoint({
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      })
    }
    
    return null
  }

  /**
   * Add a segment to the graph
   */
  private addSegment(from: Point, to: Point, corridorId: string): Segment {
    const snappedFrom = this.snapPoint(from)
    const snappedTo = this.snapPoint(to)
    
    // Don't add zero-length segments
    if (snappedFrom.x === snappedTo.x && snappedFrom.y === snappedTo.y) {
      return null!
    }
    
    // Create segment key (normalized direction)
    const fromKey = this.pointKey(snappedFrom)
    const toKey = this.pointKey(snappedTo)
    const segKey = fromKey < toKey ? `${fromKey}->${toKey}` : `${toKey}->${fromKey}`
    
    // Check if segment already exists
    for (const [id, seg] of this.segments) {
      const existingFromKey = this.pointKey(seg.from)
      const existingToKey = this.pointKey(seg.to)
      const existingKey = existingFromKey < existingToKey 
        ? `${existingFromKey}->${existingToKey}` 
        : `${existingToKey}->${existingFromKey}`
      
      if (segKey === existingKey) {
        // Reuse existing segment
        seg.corridorIds.add(corridorId)
        seg.isTrunk = seg.corridorIds.size >= 2
        return seg
      }
    }
    
    // Create new segment
    const segment: Segment = {
      id: `seg-${this.nextSegmentId++}`,
      from: snappedFrom,
      to: snappedTo,
      corridorIds: new Set([corridorId]),
      isTrunk: false
    }
    
    this.segments.set(segment.id, segment)
    
    // Register with nodes
    const fromNode = this.getOrCreateNode(snappedFrom)
    const toNode = this.getOrCreateNode(snappedTo)
    
    fromNode.segmentIds.add(segment.id)
    fromNode.corridorIds.add(corridorId)
    toNode.segmentIds.add(segment.id)
    toNode.corridorIds.add(corridorId)
    
    return segment
  }

  /**
   * Split a segment at a point, creating two new segments
   */
  private splitSegment(segment: Segment, splitPoint: Point): [Segment, Segment] {
    const snapped = this.snapPoint(splitPoint)
    
    // Remove old segment from nodes
    const fromNode = this.nodes.get(this.pointKey(segment.from))
    const toNode = this.nodes.get(this.pointKey(segment.to))
    if (fromNode) fromNode.segmentIds.delete(segment.id)
    if (toNode) toNode.segmentIds.delete(segment.id)
    
    // Create two new segments
    const seg1: Segment = {
      id: `seg-${this.nextSegmentId++}`,
      from: segment.from,
      to: snapped,
      corridorIds: new Set(segment.corridorIds),
      isTrunk: segment.isTrunk
    }
    
    const seg2: Segment = {
      id: `seg-${this.nextSegmentId++}`,
      from: snapped,
      to: segment.to,
      corridorIds: new Set(segment.corridorIds),
      isTrunk: segment.isTrunk
    }
    
    // Remove old, add new
    this.segments.delete(segment.id)
    this.segments.set(seg1.id, seg1)
    this.segments.set(seg2.id, seg2)
    
    // Update nodes
    const midNode = this.getOrCreateNode(snapped)
    midNode.segmentIds.add(seg1.id)
    midNode.segmentIds.add(seg2.id)
    for (const cid of segment.corridorIds) {
      midNode.corridorIds.add(cid)
    }
    
    if (fromNode) fromNode.segmentIds.add(seg1.id)
    if (toNode) toNode.segmentIds.add(seg2.id)
    
    return [seg1, seg2]
  }

  /**
   * Add a corridor path to the graph
   * Returns the segment IDs that make up this corridor
   */
  addCorridorPath(corridorId: string, path: Point[]): string[] {
    if (!path || path.length < 2) return []
    
    const segmentIds: string[] = []
    
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]
      const to = path[i + 1]
      
      // Check for intersections with existing segments
      const existingSegments = Array.from(this.segments.values())
      
      for (const existing of existingSegments) {
        const intersection = this.findIntersection(
          { id: '', from, to, corridorIds: new Set(), isTrunk: false },
          existing
        )
        
        if (intersection) {
          // Split the existing segment at intersection
          this.splitSegment(existing, intersection)
          
          // Mark intersection as junction
          const node = this.getOrCreateNode(intersection)
          node.isJunction = true
        }
      }
      
      // Add this segment
      const segment = this.addSegment(from, to, corridorId)
      if (segment) {
        segmentIds.push(segment.id)
      }
    }
    
    return segmentIds
  }

  /**
   * Find a path between two points using existing segments if possible
   */
  findPathThroughGraph(
    from: Point,
    to: Point,
    rooms: PlacedRoom[],
    excludeRoomIds: string[]
  ): Point[] | null {
    const fromKey = this.pointKey(from)
    const toKey = this.pointKey(to)
    
    // If no segments yet, return null
    if (this.nodes.size === 0) return null
    
    // Check if both points are in the graph
    const fromNode = this.nodes.get(fromKey)
    const toNode = this.nodes.get(toKey)
    
    if (!fromNode || !toNode) return null
    
    // BFS to find path through existing segments
    const visited = new Set<string>()
    const queue: Array<{ nodeKey: string; path: Point[] }> = []
    
    queue.push({ nodeKey: fromKey, path: [from] })
    visited.add(fromKey)
    
    while (queue.length > 0) {
      const { nodeKey, path } = queue.shift()!
      const node = this.nodes.get(nodeKey)
      if (!node) continue
      
      if (nodeKey === toKey) {
        return path
      }
      
      // Explore connected segments
      for (const segId of node.segmentIds) {
        const seg = this.segments.get(segId)
        if (!seg) continue
        
        // Find the other end of the segment
        const otherKey = this.pointKey(seg.from) === nodeKey 
          ? this.pointKey(seg.to) 
          : this.pointKey(seg.from)
        
        if (visited.has(otherKey)) continue
        
        const otherNode = this.nodes.get(otherKey)
        if (!otherNode) continue
        
        visited.add(otherKey)
        queue.push({ 
          nodeKey: otherKey, 
          path: [...path, otherNode.point] 
        })
      }
    }
    
    return null
  }

  /**
   * Get all junctions (nodes with 3+ connections or 2+ corridors)
   */
  getJunctions(): JunctionData[] {
    const junctions: JunctionData[] = []
    
    for (const [key, node] of this.nodes) {
      const isJunction = node.isJunction || 
                         node.segmentIds.size >= 3 || 
                         node.corridorIds.size >= 2
      
      if (isJunction) {
        junctions.push({
          id: `junction-${junctions.length}`,
          x: node.point.x,
          y: node.point.y,
          degree: node.segmentIds.size,
          corridorIds: Array.from(node.corridorIds),
          segmentIds: Array.from(node.segmentIds)
        })
      }
    }
    
    return junctions
  }

  /**
   * Get all segments
   */
  getSegments(): Segment[] {
    return Array.from(this.segments.values())
  }

  /**
   * Get trunk segments (used by 2+ corridors)
   */
  getTrunkSegments(): Segment[] {
    return Array.from(this.segments.values()).filter(s => s.isTrunk)
  }

  /**
   * Update corridor paths to use shared waypoints
   */
  updateCorridorPaths(corridors: RoutedCorridor[]): RoutedCorridor[] {
    return corridors.map(corridor => {
      if (!corridor.path || corridor.path.length < 2) return corridor
      
      // Snap all waypoints to graph nodes
      const snappedPath = corridor.path.map(p => this.snapPoint(p))
      
      // Remove consecutive duplicates
      const uniquePath: Point[] = [snappedPath[0]]
      for (let i = 1; i < snappedPath.length; i++) {
        const prev = uniquePath[uniquePath.length - 1]
        const curr = snappedPath[i]
        if (prev.x !== curr.x || prev.y !== curr.y) {
          uniquePath.push(curr)
        }
      }
      
      return {
        ...corridor,
        path: uniquePath,
        bends: Math.max(0, uniquePath.length - 2)
      }
    })
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a segment graph from corridors and extract junctions
 */
export function buildSegmentGraph(
  corridors: RoutedCorridor[],
  tolerance: number = 10
): { 
  graph: SegmentGraph
  updatedCorridors: RoutedCorridor[]
  junctions: JunctionData[]
} {
  const graph = new SegmentGraph(tolerance)
  
  // Add all corridor paths to the graph
  for (const corridor of corridors) {
    if (corridor.path && corridor.path.length >= 2) {
      const segmentIds = graph.addCorridorPath(corridor.id, corridor.path)
      // Could store segmentIds on corridor if needed
    }
  }
  
  // Update corridor paths to use shared waypoints
  const updatedCorridors = graph.updateCorridorPaths(corridors)
  
  // Extract junctions
  const junctions = graph.getJunctions()
  
  return { graph, updatedCorridors, junctions }
}

/**
 * Route a new corridor through existing graph if possible
 */
export function routeThroughGraph(
  graph: SegmentGraph,
  fromPort: PortData,
  toPort: PortData,
  rooms: PlacedRoom[],
  excludeRoomIds: string[]
): Point[] | null {
  return graph.findPathThroughGraph(
    { x: fromPort.x, y: fromPort.y },
    { x: toPort.x, y: toPort.y },
    rooms,
    excludeRoomIds
  )
}

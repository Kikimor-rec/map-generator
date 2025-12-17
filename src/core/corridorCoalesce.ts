/**
 * Corridor Coalesce - Merge overlapping/duplicate corridor segments
 * 
 * Algorithm:
 * 1. Canonization - normalize all segments for comparison
 * 2. Deduplication - remove exact duplicate segments
 * 3. Partial overlap detection - split and merge overlapping segments
 * 4. Junction creation - create junctions at merge points
 */

import type { Point } from './types'
import type { Corridor, CorridorSegment } from './types'
import type {
  CoalesceSettings,
  CoalesceResult,
  NormalizedSegment,
  Junction,
  JunctionKind,
  CorridorLayer,
  CorridorKind,
} from './corridorTypes'
import {
  normalizeSegment,
  segmentHashKey,
  DEFAULT_COALESCE_SETTINGS,
  determineJunctionKind,
} from './corridorTypes'

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

/**
 * Calculate distance between two points
 */
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Check if two points are equal within tolerance
 */
function pointsEqual(p1: Point, p2: Point, tolerance: number): boolean {
  return Math.abs(p1.x - p2.x) <= tolerance && Math.abs(p1.y - p2.y) <= tolerance
}

/**
 * Check if a point lies on a segment (within tolerance)
 */
function pointOnSegment(p: Point, seg: NormalizedSegment, tolerance: number): boolean {
  const d1 = distance(seg.p1, p)
  const d2 = distance(p, seg.p2)
  const segLen = distance(seg.p1, seg.p2)
  return Math.abs(d1 + d2 - segLen) <= tolerance
}

/**
 * Check if two segments are collinear (on the same line)
 */
function areCollinear(seg1: NormalizedSegment, seg2: NormalizedSegment, tolerance: number): boolean {
  // Check if all 4 points are collinear
  // Using cross product: if (p2-p1) × (p3-p1) ≈ 0 for all combinations
  const cross = (a: Point, b: Point, c: Point): number => {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  }
  
  const c1 = Math.abs(cross(seg1.p1, seg1.p2, seg2.p1))
  const c2 = Math.abs(cross(seg1.p1, seg1.p2, seg2.p2))
  
  // Normalize by segment length to get perpendicular distance
  const len = distance(seg1.p1, seg1.p2)
  if (len < tolerance) return false
  
  return (c1 / len) <= tolerance && (c2 / len) <= tolerance
}

/**
 * Check if two collinear segments overlap
 * Returns the overlap range [start, end] as 0-1 parameters along seg1, or null
 */
function getOverlapRange(
  seg1: NormalizedSegment,
  seg2: NormalizedSegment,
  tolerance: number
): { start: number; end: number } | null {
  // Project seg2 endpoints onto seg1's direction
  const dx = seg1.p2.x - seg1.p1.x
  const dy = seg1.p2.y - seg1.p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  
  if (len < tolerance) return null
  
  // Unit direction
  const ux = dx / len
  const uy = dy / len
  
  // Project seg2.p1 and seg2.p2 onto the line of seg1
  const t1 = ((seg2.p1.x - seg1.p1.x) * ux + (seg2.p1.y - seg1.p1.y) * uy) / len
  const t2 = ((seg2.p2.x - seg1.p1.x) * ux + (seg2.p2.y - seg1.p1.y) * uy) / len
  
  const minT = Math.min(t1, t2)
  const maxT = Math.max(t1, t2)
  
  // Check for overlap with [0, 1]
  const overlapStart = Math.max(0, minT)
  const overlapEnd = Math.min(1, maxT)
  
  if (overlapEnd - overlapStart < tolerance / len) {
    return null // No significant overlap
  }
  
  return { start: overlapStart, end: overlapEnd }
}

/**
 * Interpolate a point along a segment
 */
function interpolatePoint(seg: NormalizedSegment, t: number): Point {
  return {
    x: seg.p1.x + t * (seg.p2.x - seg.p1.x),
    y: seg.p1.y + t * (seg.p2.y - seg.p1.y),
  }
}

// ============================================================================
// POLICY CHECKS
// ============================================================================

/**
 * Check if two segments can be merged based on type policy
 */
function canMergeByType(
  seg1: NormalizedSegment,
  seg2: NormalizedSegment,
  policy: CoalesceSettings['typeMergePolicy']
): boolean {
  switch (policy) {
    case 'shareIfSameType':
      return seg1.kind === seg2.kind
    case 'shareAndPromotePriority':
      return true // Will pick by priority later
    case 'neverShareDifferentTypes':
      return seg1.kind === seg2.kind
    default:
      return seg1.kind === seg2.kind
  }
}

/**
 * Check if two segments can be merged based on layer policy
 */
function canMergeByLayer(
  seg1: NormalizedSegment,
  seg2: NormalizedSegment,
  policy: CoalesceSettings['layerMergePolicy']
): boolean {
  switch (policy) {
    case 'mergeAll':
      return true
    case 'mergeWithinLayer':
      return seg1.layer === seg2.layer
    case 'neverMergeLayers':
      return seg1.layer === seg2.layer
    default:
      return seg1.layer === seg2.layer
  }
}

/**
 * Get priority for corridor kind (for shareAndPromotePriority)
 */
function getKindPriority(kind: CorridorKind): number {
  const priorities: Record<CorridorKind, number> = {
    corridor: 5,
    airlock: 4,
    bulkheadDoor: 3,
    serviceHatch: 2,
    verticalLink: 1,
  }
  return priorities[kind] ?? 0
}

// ============================================================================
// MAIN COALESCE ALGORITHM
// ============================================================================

/**
 * Extract all segments from corridors as normalized segments
 */
function extractNormalizedSegments(
  corridors: Corridor[],
  defaultLayer: CorridorLayer = 'main',
  defaultKind: CorridorKind = 'corridor'
): NormalizedSegment[] {
  const segments: NormalizedSegment[] = []
  
  for (const corridor of corridors) {
    for (let i = 0; i < corridor.segments.length; i++) {
      const seg = corridor.segments[i]
      segments.push(
        normalizeSegment(
          seg.start,
          seg.end,
          corridor.id,
          i,
          defaultLayer,
          defaultKind
        )
      )
    }
  }
  
  return segments
}

/**
 * Build a hash map of segments for quick lookup
 */
function buildSegmentMap(
  segments: NormalizedSegment[],
  tolerance: number
): Map<string, NormalizedSegment[]> {
  const map = new Map<string, NormalizedSegment[]>()
  
  for (const seg of segments) {
    const key = segmentHashKey(seg, tolerance)
    const existing = map.get(key) || []
    existing.push(seg)
    map.set(key, existing)
  }
  
  return map
}

/**
 * Find exact duplicate segments
 */
function findDuplicates(
  segmentMap: Map<string, NormalizedSegment[]>,
  settings: CoalesceSettings
): Array<{ keep: NormalizedSegment; remove: NormalizedSegment[] }> {
  const duplicates: Array<{ keep: NormalizedSegment; remove: NormalizedSegment[] }> = []
  
  for (const [, segments] of segmentMap) {
    if (segments.length <= 1) continue
    
    // Group by mergeable pairs
    const processed = new Set<number>()
    
    for (let i = 0; i < segments.length; i++) {
      if (processed.has(i)) continue
      
      const seg1 = segments[i]
      const toRemove: NormalizedSegment[] = []
      
      for (let j = i + 1; j < segments.length; j++) {
        if (processed.has(j)) continue
        
        const seg2 = segments[j]
        
        // Check if they're truly duplicates (same endpoints within tolerance)
        if (!pointsEqual(seg1.p1, seg2.p1, settings.tolerancePx)) continue
        if (!pointsEqual(seg1.p2, seg2.p2, settings.tolerancePx)) continue
        
        // Check merge policies
        if (!canMergeByType(seg1, seg2, settings.typeMergePolicy)) continue
        if (!canMergeByLayer(seg1, seg2, settings.layerMergePolicy)) continue
        
        toRemove.push(seg2)
        processed.add(j)
      }
      
      if (toRemove.length > 0) {
        processed.add(i)
        duplicates.push({ keep: seg1, remove: toRemove })
      }
    }
  }
  
  return duplicates
}

/**
 * Find partial overlaps between segments
 */
function findPartialOverlaps(
  segments: NormalizedSegment[],
  settings: CoalesceSettings
): Array<{
  seg1: NormalizedSegment
  seg2: NormalizedSegment
  overlap: { start: number; end: number }
}> {
  const overlaps: Array<{
    seg1: NormalizedSegment
    seg2: NormalizedSegment
    overlap: { start: number; end: number }
  }> = []
  
  // Check all pairs (O(n²) but typically small n)
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const seg1 = segments[i]
      const seg2 = segments[j]
      
      // Skip same corridor
      if (seg1.corridorId === seg2.corridorId) continue
      
      // Check merge policies
      if (!canMergeByType(seg1, seg2, settings.typeMergePolicy)) continue
      if (!canMergeByLayer(seg1, seg2, settings.layerMergePolicy)) continue
      
      // Check collinearity
      if (!areCollinear(seg1, seg2, settings.tolerancePx)) continue
      
      // Check for overlap
      const overlap = getOverlapRange(seg1, seg2, settings.tolerancePx)
      if (!overlap) continue
      
      // Check minimum shared length
      const seg1Len = distance(seg1.p1, seg1.p2)
      const overlapLen = (overlap.end - overlap.start) * seg1Len
      if (overlapLen < settings.minSharedLength) continue
      
      overlaps.push({ seg1, seg2, overlap })
    }
  }
  
  return overlaps
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a junction at a point
 */
function createJunctionAt(
  pos: Point,
  corridorIds: string[],
  deckLevel: number = 0
): Junction {
  const kind: JunctionKind = determineJunctionKind(corridorIds.length)
  
  return {
    id: generateId(),
    pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
    kind,
    rules: {},
    connectedCorridorIds: corridorIds,
    deckLevel,
  }
}

/**
 * Main coalesce function
 */
export function coalesceCorridors(
  corridors: Corridor[],
  settings: CoalesceSettings = DEFAULT_COALESCE_SETTINGS
): { corridors: Corridor[]; result: CoalesceResult } {
  if (!settings.enabled || corridors.length === 0) {
    return {
      corridors,
      result: {
        segmentsRemoved: 0,
        segmentsSplit: 0,
        junctionsCreated: 0,
        modifiedCorridorIds: [],
        removedCorridorIds: [],
        newJunctions: [],
      },
    }
  }
  
  // Phase 1: Extract and normalize all segments
  const allSegments = extractNormalizedSegments(corridors)
  
  // Phase 2: Build hash map for quick lookup
  const segmentMap = buildSegmentMap(allSegments, settings.tolerancePx)
  
  // Phase 3: Find exact duplicates
  const duplicates = findDuplicates(segmentMap, settings)
  
  // Phase 4: Find partial overlaps
  const overlaps = findPartialOverlaps(allSegments, settings)
  
  // Track modifications
  const modifiedCorridorIds = new Set<string>()
  const removedCorridorIds = new Set<string>()
  const newJunctions: Junction[] = []
  let segmentsRemoved = 0
  let segmentsSplit = 0
  
  // Process duplicates - mark segments for removal
  const segmentsToRemove = new Map<string, Set<number>>() // corridorId -> segment indices
  
  for (const dup of duplicates) {
    for (const toRemove of dup.remove) {
      const existing = segmentsToRemove.get(toRemove.corridorId) || new Set()
      existing.add(toRemove.segmentIndex)
      segmentsToRemove.set(toRemove.corridorId, existing)
      modifiedCorridorIds.add(toRemove.corridorId)
      segmentsRemoved++
    }
  }
  
  // Process overlaps - create junctions at merge points
  if (settings.createJunctionsAtMerge) {
    const junctionPoints = new Map<string, { pos: Point; corridorIds: Set<string> }>()
    
    for (const { seg1, seg2, overlap } of overlaps) {
      // Create junction at overlap start
      const startPoint = interpolatePoint(seg1, overlap.start)
      const startKey = `${Math.round(startPoint.x / settings.tolerancePx)},${Math.round(startPoint.y / settings.tolerancePx)}`
      
      if (!junctionPoints.has(startKey)) {
        junctionPoints.set(startKey, { pos: startPoint, corridorIds: new Set() })
      }
      junctionPoints.get(startKey)!.corridorIds.add(seg1.corridorId)
      junctionPoints.get(startKey)!.corridorIds.add(seg2.corridorId)
      
      // Create junction at overlap end
      const endPoint = interpolatePoint(seg1, overlap.end)
      const endKey = `${Math.round(endPoint.x / settings.tolerancePx)},${Math.round(endPoint.y / settings.tolerancePx)}`
      
      if (!junctionPoints.has(endKey)) {
        junctionPoints.set(endKey, { pos: endPoint, corridorIds: new Set() })
      }
      junctionPoints.get(endKey)!.corridorIds.add(seg1.corridorId)
      junctionPoints.get(endKey)!.corridorIds.add(seg2.corridorId)
      
      modifiedCorridorIds.add(seg1.corridorId)
      modifiedCorridorIds.add(seg2.corridorId)
      segmentsSplit += 2
    }
    
    // Create junction objects
    for (const [, data] of junctionPoints) {
      if (data.corridorIds.size >= 2) {
        newJunctions.push(createJunctionAt(data.pos, Array.from(data.corridorIds)))
      }
    }
  }
  
  // Apply modifications to corridors
  const resultCorridors: Corridor[] = []
  
  for (const corridor of corridors) {
    const toRemoveIndices = segmentsToRemove.get(corridor.id)
    
    if (!toRemoveIndices || toRemoveIndices.size === 0) {
      resultCorridors.push(corridor)
      continue
    }
    
    // Filter out removed segments
    const newSegments = corridor.segments.filter((_, idx) => !toRemoveIndices.has(idx))
    
    if (newSegments.length === 0) {
      // Entire corridor was merged away
      removedCorridorIds.add(corridor.id)
    } else {
      resultCorridors.push({
        ...corridor,
        segments: newSegments,
      })
    }
  }
  
  return {
    corridors: resultCorridors,
    result: {
      segmentsRemoved,
      segmentsSplit,
      junctionsCreated: newJunctions.length,
      modifiedCorridorIds: Array.from(modifiedCorridorIds),
      removedCorridorIds: Array.from(removedCorridorIds),
      newJunctions,
    },
  }
}

/**
 * Simplify a corridor by removing redundant waypoints
 * (points that are collinear with their neighbors)
 */
export function simplifyCorridorPath(
  segments: CorridorSegment[],
  tolerance: number = 2
): CorridorSegment[] {
  if (segments.length <= 1) return segments
  
  // Convert to point list
  const points: Point[] = [segments[0].start]
  for (const seg of segments) {
    points.push(seg.end)
  }
  
  // Douglas-Peucker-like simplification
  const simplified: Point[] = [points[0]]
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = simplified[simplified.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    
    // Check if curr is collinear with prev and next
    const cross = Math.abs(
      (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x)
    )
    const len = distance(prev, next)
    
    if (len > 0 && cross / len > tolerance) {
      // Keep this point - it's a significant bend
      simplified.push(curr)
    }
  }
  
  simplified.push(points[points.length - 1])
  
  // Convert back to segments
  const result: CorridorSegment[] = []
  for (let i = 0; i < simplified.length - 1; i++) {
    result.push({ start: simplified[i], end: simplified[i + 1] })
  }
  
  return result
}

/**
 * Post-process all corridors: coalesce + simplify
 */
export function postProcessCorridors(
  corridors: Corridor[],
  settings: CoalesceSettings = DEFAULT_COALESCE_SETTINGS
): { corridors: Corridor[]; result: CoalesceResult } {
  // Step 1: Coalesce
  const { corridors: coalesced, result } = coalesceCorridors(corridors, settings)
  
  // Step 2: Simplify each corridor
  const simplified = coalesced.map(corridor => ({
    ...corridor,
    segments: simplifyCorridorPath(corridor.segments, settings.tolerancePx / 2),
  }))
  
  return { corridors: simplified, result }
}

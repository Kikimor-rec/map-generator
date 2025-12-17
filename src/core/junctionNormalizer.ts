/**
 * Junction Normalization
 * 
 * Normalizes junctions according to JunctionNormConfig:
 * - Split overloaded junctions (too many arms)
 * - Merge too-close junctions
 * - Snap to grid
 * - Enforce allowed angles
 */

import type { Point, Corridor } from './types'
import type {
  Junction,
  JunctionKind,
  JunctionNormConfig,
} from './corridorTypes'
import {
  DEFAULT_JUNCTION_NORM_CONFIG,
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
 * Snap a point to grid
 */
function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  }
}

/**
 * Calculate angle from p1 to p2 in degrees (0-360)
 */
function calculateAngle(from: Point, to: Point): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  let angle = Math.atan2(dy, dx) * (180 / Math.PI)
  if (angle < 0) angle += 360
  return angle
}

/**
 * Find closest allowed angle
 */
function snapToAllowedAngle(angle: number, allowedAngles: number[]): number {
  // Generate all allowed directions (0, 90, 180, 270 for 90° allowed)
  const allAllowed: number[] = []
  for (const a of allowedAngles) {
    for (let i = 0; i < 360; i += a) {
      allAllowed.push(i)
    }
  }
  
  // Find closest
  let closest = allAllowed[0]
  let minDiff = 360
  
  for (const allowed of allAllowed) {
    const diff = Math.min(
      Math.abs(angle - allowed),
      Math.abs(angle - allowed - 360),
      Math.abs(angle - allowed + 360)
    )
    if (diff < minDiff) {
      minDiff = diff
      closest = allowed
    }
  }
  
  return closest
}

// ============================================================================
// JUNCTION ANALYSIS
// ============================================================================

export interface JunctionAnalysis {
  junction: Junction
  armCount: number
  isOverloaded: boolean
  isUnderloaded: boolean
  nearbyJunctions: Junction[]
  angles: number[]
  angleViolations: number
}

/**
 * Analyze a junction for violations
 */
export function analyzeJunction(
  junction: Junction,
  allJunctions: Junction[],
  corridors: Corridor[],
  config: JunctionNormConfig = DEFAULT_JUNCTION_NORM_CONFIG
): JunctionAnalysis {
  const armCount = junction.connectedCorridorIds.length
  const isOverloaded = armCount > config.maxArmsAbsolute
  const isUnderloaded = armCount < 2
  
  // Find nearby junctions
  const nearbyJunctions = allJunctions.filter(j => 
    j.id !== junction.id && 
    distance(j.pos, junction.pos) < config.minSpacing
  )
  
  // Calculate arm angles
  const angles: number[] = []
  for (const corridorId of junction.connectedCorridorIds) {
    const corridor = corridors.find(c => c.id === corridorId)
    if (!corridor) continue
    
    // Find the segment connected to this junction
    for (const segment of corridor.segments) {
      if (distance(segment.start, junction.pos) < 5) {
        angles.push(calculateAngle(junction.pos, segment.end))
      } else if (distance(segment.end, junction.pos) < 5) {
        angles.push(calculateAngle(junction.pos, segment.start))
      }
    }
  }
  
  // Count angle violations
  let angleViolations = 0
  for (const angle of angles) {
    const snapped = snapToAllowedAngle(angle, config.allowedAngles)
    if (Math.abs(angle - snapped) > 5) { // 5 degree tolerance
      angleViolations++
    }
  }
  
  return {
    junction,
    armCount,
    isOverloaded,
    isUnderloaded,
    nearbyJunctions,
    angles,
    angleViolations,
  }
}

// ============================================================================
// NORMALIZATION RESULT
// ============================================================================

export interface NormalizationResult {
  junctions: Junction[]
  junctionsSplit: number
  junctionsMerged: number
  junctionsSnapped: number
  warnings: string[]
}

// ============================================================================
// MAIN NORMALIZATION FUNCTION
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `jnc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Split an overloaded junction into multiple smaller junctions
 */
function splitJunction(
  junction: Junction,
  config: JunctionNormConfig,
  gridSize: number
): Junction[] {
  const arms = junction.connectedCorridorIds
  const maxArms = config.maxArmsOptimal
  
  if (arms.length <= maxArms) {
    return [junction]
  }
  
  // Split into groups of maxArms
  const groups: string[][] = []
  for (let i = 0; i < arms.length; i += maxArms) {
    groups.push(arms.slice(i, i + maxArms))
  }
  
  // Create new junctions, offset from original position
  const result: Junction[] = []
  const spacing = config.minSpacing / 2
  
  for (let i = 0; i < groups.length; i++) {
    // Offset in a circle around original position
    const angle = (i / groups.length) * 2 * Math.PI
    const offset = {
      x: Math.cos(angle) * spacing,
      y: Math.sin(angle) * spacing,
    }
    
    let newPos = {
      x: junction.pos.x + offset.x,
      y: junction.pos.y + offset.y,
    }
    
    if (config.snapToGrid) {
      newPos = snapToGrid(newPos, gridSize)
    }
    
    result.push({
      id: i === 0 ? junction.id : generateId(),
      pos: newPos,
      kind: determineJunctionKind(groups[i].length),
      rules: junction.rules,
      connectedCorridorIds: groups[i],
      deckLevel: junction.deckLevel,
    })
  }
  
  return result
}

/**
 * Merge two nearby junctions
 */
function mergeJunctions(j1: Junction, j2: Junction): Junction {
  // Keep the first junction's ID and position
  // Merge connected corridors
  const merged = new Set([...j1.connectedCorridorIds, ...j2.connectedCorridorIds])
  
  return {
    id: j1.id,
    pos: j1.pos, // Keep first position
    kind: determineJunctionKind(merged.size),
    rules: { ...j2.rules, ...j1.rules }, // j1 rules take precedence
    connectedCorridorIds: Array.from(merged),
    deckLevel: j1.deckLevel,
  }
}

/**
 * Normalize all junctions according to config
 */
export function normalizeJunctions(
  junctions: Junction[],
  corridors: Corridor[],
  config: JunctionNormConfig = DEFAULT_JUNCTION_NORM_CONFIG,
  gridSize: number = 40
): NormalizationResult {
  const warnings: string[] = []
  let junctionsSplit = 0
  let junctionsMerged = 0
  let junctionsSnapped = 0
  
  // Work with a copy
  let result = [...junctions]
  
  // Phase 1: Split overloaded junctions
  const afterSplit: Junction[] = []
  for (const junction of result) {
    const split = splitJunction(junction, config, gridSize)
    if (split.length > 1) {
      junctionsSplit++
      warnings.push(`Split junction ${junction.id} into ${split.length} junctions`)
    }
    afterSplit.push(...split)
  }
  result = afterSplit
  
  // Phase 2: Merge nearby junctions
  const merged = new Set<string>()
  const afterMerge: Junction[] = []
  
  for (let i = 0; i < result.length; i++) {
    if (merged.has(result[i].id)) continue
    
    let current = result[i]
    
    for (let j = i + 1; j < result.length; j++) {
      if (merged.has(result[j].id)) continue
      
      if (distance(current.pos, result[j].pos) < config.minSpacing) {
        current = mergeJunctions(current, result[j])
        merged.add(result[j].id)
        junctionsMerged++
        warnings.push(`Merged junction ${result[j].id} into ${current.id}`)
      }
    }
    
    afterMerge.push(current)
  }
  result = afterMerge
  
  // Phase 3: Snap to grid
  if (config.snapToGrid) {
    result = result.map(j => {
      const snapped = snapToGrid(j.pos, gridSize)
      if (snapped.x !== j.pos.x || snapped.y !== j.pos.y) {
        junctionsSnapped++
      }
      return { ...j, pos: snapped }
    })
  }
  
  // Phase 4: Check for remaining violations (report only)
  for (const junction of result) {
    const analysis = analyzeJunction(junction, result, corridors, config)
    
    if (analysis.angleViolations > 0) {
      warnings.push(`Junction ${junction.id} has ${analysis.angleViolations} non-orthogonal arm(s)`)
    }
    
    if (analysis.isOverloaded) {
      warnings.push(`Junction ${junction.id} is still overloaded (${analysis.armCount} arms)`)
    }
  }
  
  return {
    junctions: result,
    junctionsSplit,
    junctionsMerged,
    junctionsSnapped,
    warnings,
  }
}

/**
 * Validate junctions against config (for UI warnings)
 */
export function validateJunctions(
  junctions: Junction[],
  corridors: Corridor[],
  config: JunctionNormConfig = DEFAULT_JUNCTION_NORM_CONFIG
): { valid: boolean; issues: JunctionAnalysis[] } {
  const issues: JunctionAnalysis[] = []
  
  for (const junction of junctions) {
    const analysis = analyzeJunction(junction, junctions, corridors, config)
    
    if (
      analysis.isOverloaded ||
      analysis.isUnderloaded ||
      analysis.nearbyJunctions.length > 0 ||
      analysis.angleViolations > 0
    ) {
      issues.push(analysis)
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  }
}

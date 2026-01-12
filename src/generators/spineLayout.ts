/**
 * Spine-Based Layout Generator
 * 
 * Creates structured layouts based on archetype:
 * - Ship: Linear spine(s) from bow to stern, may branch or loop
 * - Station: Hub-and-spoke with optional ring connections
 * - Outpost: Terrain-dependent (underground, surface, ruins)
 * 
 * Key principles:
 * 1. Define the "spine" (main corridor axis) first
 * 2. Place anchor rooms along the spine
 * 3. Attach secondary rooms to anchors
 * 4. All corridors connect to the spine, not peer-to-peer
 * 
 * Ship spine patterns based on size:
 * - XS/SM: Single spine
 * - MD: Single or dual spine
 * - LG/XL: Dual spine or loop
 * 
 * Station patterns:
 * - Small: Hub + 3-4 spokes
 * - Medium: Hub + spokes + partial ring
 * - Large: Hub + spokes + full ring(s)
 * 
 * Outpost patterns:
 * - Underground: Main tunnel + side chambers
 * - Surface: Clustered modules
 * - Ruins: Irregular, blocked paths
 */

import type { Point } from '@core/types'
import type { GenerationRequest, SeededRNG } from './types'

// ============================================================================
// TYPES
// ============================================================================

interface SpineNode {
  id: string
  position: Point  // Grid position
  type: 'anchor' | 'junction' | 'terminal' | 'ring'
  zone?: string
  roomId?: string  // If this node hosts a room
}

interface SpineSegment {
  from: string  // SpineNode id
  to: string    // SpineNode id
  direction: 'H' | 'V' | 'D'  // Horizontal, Vertical, Diagonal (for rings)
  isSpine: boolean  // Main spine vs branch
}

export interface SpineStructure {
  nodes: SpineNode[]
  segments: SpineSegment[]
  bounds: { width: number; height: number }
  pattern: SpinePattern
}

export type SpinePattern = 
  | 'single'       // One main corridor
  | 'dual'         // Two parallel main corridors
  | 'loop'         // Main corridor forms a loop
  | 'branching'    // Y or T shaped
  | 'hub-spoke'    // Central hub with radiating spokes
  | 'hub-ring'     // Hub + spoke + ring
  | 'multi-ring'   // Multiple concentric rings
  | 'tunnel'       // Main tunnel with chambers
  | 'cluster'      // Irregular cluster
  | 'ruins'        // Broken/blocked paths

interface ZonePlacement {
  zone: string
  anchor: 'bow' | 'stern' | 'port' | 'starboard' | 'center' | 'hub'
  priority: number
}

type ShipSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type OutpostTerrain = 'underground' | 'surface' | 'ruins'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine ship size from room count
 */
function getShipSize(roomCount: number): ShipSize {
  if (roomCount <= 5) return 'xs'
  if (roomCount <= 10) return 'sm'
  if (roomCount <= 20) return 'md'
  if (roomCount <= 35) return 'lg'
  return 'xl'
}

/**
 * Determine ship spine pattern based on size and randomness
 */
function selectShipPattern(size: ShipSize, loopiness: number, rng: SeededRNG): SpinePattern {
  const roll = rng.random()
  
  switch (size) {
    case 'xs':
    case 'sm':
      // Small ships: always single spine
      return 'single'
    
    case 'md':
      // Medium ships: single or dual
      if (roll < 0.6) return 'single'
      if (roll < 0.9) return 'branching'  // Y/T shape
      return 'dual'
    
    case 'lg':
      // Large ships: dual or branching
      if (roll < 0.3) return 'single'
      if (roll < 0.6) return 'dual'
      if (roll < 0.85) return 'branching'
      return loopiness > 0.5 ? 'loop' : 'dual'
    
    case 'xl':
      // Extra large: prefer dual/loop
      if (roll < 0.2) return 'dual'
      if (roll < 0.5) return 'branching'
      if (roll < 0.7 || loopiness > 0.3) return 'loop'
      return 'dual'
  }
}

/**
 * Determine outpost terrain type
 */
function selectOutpostTerrain(subtype: string, rng: SeededRNG): OutpostTerrain {
  // If subtype hints at terrain, use it
  const lowerSubtype = subtype.toLowerCase()
  if (lowerSubtype.includes('mine') || lowerSubtype.includes('bunker') || lowerSubtype.includes('underground')) {
    return 'underground'
  }
  if (lowerSubtype.includes('ruin') || lowerSubtype.includes('abandoned') || lowerSubtype.includes('derelict')) {
    return 'ruins'
  }
  
  // Otherwise random
  const roll = rng.random()
  if (roll < 0.4) return 'underground'
  if (roll < 0.8) return 'surface'
  return 'ruins'
}

// ============================================================================
// SHIP LAYOUT - Multiple Spine Patterns
// ============================================================================

/**
 * Generate a ship layout structure with pattern selection
 * 
 * Ship design principles:
 * - Bridge/Ops at the bow (front)
 * - Engineering/Power at the stern (rear)  
 * - Crew quarters in the middle
 * - Cargo near exterior access
 * - Main corridor(s) run bow-to-stern
 * - Larger ships may have dual spines or loops
 */
export function generateShipSpine(
  roomCount: number,
  request: GenerationRequest,
  rng: SeededRNG
): SpineStructure {
  const size = getShipSize(roomCount)
  const loopiness = request.loopiness ?? 0.3
  const pattern = selectShipPattern(size, loopiness, rng)
  
  switch (pattern) {
    case 'dual':
      return generateShipDualSpine(roomCount, rng)
    case 'loop':
      return generateShipLoopSpine(roomCount, rng)
    case 'branching':
      return generateShipBranchingSpine(roomCount, rng)
    case 'single':
    default:
      return generateShipSingleSpine(roomCount, rng)
  }
}

/**
 * Single spine - classic linear layout
 */
function generateShipSingleSpine(roomCount: number, rng: SeededRNG): SpineStructure {
  const length = Math.max(8, Math.ceil(roomCount * 0.8))
  const width = Math.max(4, Math.ceil(length / 2.5))
  
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  // Create main spine (horizontal, bow to stern)
  const spineY = Math.floor(width / 2)
  const spineNodes = Math.max(3, Math.ceil(roomCount / 4))
  
  for (let i = 0; i < spineNodes; i++) {
    const x = Math.floor((i / (spineNodes - 1)) * (length - 2)) + 1
    const nodeType = i === 0 ? 'terminal' : i === spineNodes - 1 ? 'terminal' : 'junction'
    
    nodes.push({
      id: `spine-${i}`,
      position: { x, y: spineY },
      type: nodeType,
      zone: i === 0 ? 'command' : i === spineNodes - 1 ? 'engineering' : undefined
    })
    
    if (i > 0) {
      segments.push({
        from: `spine-${i-1}`,
        to: `spine-${i}`,
        direction: 'H',
        isSpine: true
      })
    }
  }
  
  // Add side branches at junction points
  addShipBranches(nodes, segments, width, rng)
  
  return { nodes, segments, bounds: { width: length, height: width }, pattern: 'single' }
}

/**
 * Dual spine - two parallel main corridors (port and starboard)
 */
function generateShipDualSpine(roomCount: number, rng: SeededRNG): SpineStructure {
  const length = Math.max(10, Math.ceil(roomCount * 0.7))
  const width = Math.max(6, Math.ceil(length / 2))
  
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  const portY = Math.floor(width / 3)
  const starboardY = Math.floor(width * 2 / 3)
  const spineNodes = Math.max(4, Math.ceil(roomCount / 5))
  
  // Create port spine (upper)
  for (let i = 0; i < spineNodes; i++) {
    const x = Math.floor((i / (spineNodes - 1)) * (length - 2)) + 1
    const nodeType = i === 0 || i === spineNodes - 1 ? 'terminal' : 'junction'
    
    nodes.push({
      id: `port-${i}`,
      position: { x, y: portY },
      type: nodeType,
      zone: i === 0 ? 'command' : undefined
    })
    
    if (i > 0) {
      segments.push({
        from: `port-${i-1}`,
        to: `port-${i}`,
        direction: 'H',
        isSpine: true
      })
    }
  }
  
  // Create starboard spine (lower)
  for (let i = 0; i < spineNodes; i++) {
    const x = Math.floor((i / (spineNodes - 1)) * (length - 2)) + 1
    const nodeType = i === 0 || i === spineNodes - 1 ? 'terminal' : 'junction'
    
    nodes.push({
      id: `starboard-${i}`,
      position: { x, y: starboardY },
      type: nodeType,
      zone: i === spineNodes - 1 ? 'engineering' : undefined
    })
    
    if (i > 0) {
      segments.push({
        from: `starboard-${i-1}`,
        to: `starboard-${i}`,
        direction: 'H',
        isSpine: true
      })
    }
  }
  
  // Connect the two spines at bow and stern
  segments.push({ from: 'port-0', to: 'starboard-0', direction: 'V', isSpine: true })
  segments.push({ 
    from: `port-${spineNodes-1}`, 
    to: `starboard-${spineNodes-1}`, 
    direction: 'V', 
    isSpine: true 
  })
  
  // Add cross-connections at some junctions
  for (let i = 1; i < spineNodes - 1; i++) {
    if (rng.random() > 0.5) {
      segments.push({ from: `port-${i}`, to: `starboard-${i}`, direction: 'V', isSpine: false })
    }
  }
  
  return { nodes, segments, bounds: { width: length, height: width }, pattern: 'dual' }
}

/**
 * Loop spine - main corridor forms a racetrack pattern
 */
function generateShipLoopSpine(roomCount: number, rng: SeededRNG): SpineStructure {
  const length = Math.max(12, Math.ceil(roomCount * 0.6))
  const width = Math.max(6, Math.ceil(length / 2.2))
  
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  const topY = Math.floor(width / 4)
  const bottomY = Math.floor(width * 3 / 4)
  const loopNodes = Math.max(4, Math.ceil(roomCount / 6))
  
  // Create top edge of loop
  for (let i = 0; i < loopNodes; i++) {
    const x = Math.floor((i / (loopNodes - 1)) * (length - 4)) + 2
    nodes.push({
      id: `top-${i}`,
      position: { x, y: topY },
      type: i === 0 ? 'junction' : i === loopNodes - 1 ? 'junction' : 'anchor',
      zone: i === 0 ? 'command' : undefined
    })
    
    if (i > 0) {
      segments.push({ from: `top-${i-1}`, to: `top-${i}`, direction: 'H', isSpine: true })
    }
  }
  
  // Create bottom edge of loop
  for (let i = 0; i < loopNodes; i++) {
    const x = Math.floor((i / (loopNodes - 1)) * (length - 4)) + 2
    nodes.push({
      id: `bottom-${i}`,
      position: { x, y: bottomY },
      type: i === 0 || i === loopNodes - 1 ? 'junction' : 'anchor',
      zone: i === loopNodes - 1 ? 'engineering' : undefined
    })
    
    if (i > 0) {
      segments.push({ from: `bottom-${i-1}`, to: `bottom-${i}`, direction: 'H', isSpine: true })
    }
  }
  
  // Connect front (bow)
  segments.push({ from: 'top-0', to: 'bottom-0', direction: 'V', isSpine: true })
  // Connect back (stern)
  segments.push({ 
    from: `top-${loopNodes-1}`, 
    to: `bottom-${loopNodes-1}`, 
    direction: 'V', 
    isSpine: true 
  })
  
  // Optional center crossover for variety
  if (rng.random() > 0.4) {
    const mid = Math.floor(loopNodes / 2)
    segments.push({ from: `top-${mid}`, to: `bottom-${mid}`, direction: 'V', isSpine: false })
  }
  
  return { nodes, segments, bounds: { width: length, height: width }, pattern: 'loop' }
}

/**
 * Branching spine - Y or T shaped main corridors
 */
function generateShipBranchingSpine(roomCount: number, rng: SeededRNG): SpineStructure {
  const length = Math.max(10, Math.ceil(roomCount * 0.7))
  const width = Math.max(6, Math.ceil(length / 2))
  
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  const centerY = Math.floor(width / 2)
  const isY = rng.random() > 0.5  // Y-shape vs T-shape
  
  // Main spine segment (bow to branch point)
  const branchX = Math.floor(length * (isY ? 0.6 : 0.5))
  const spineNodes = Math.max(3, Math.ceil(roomCount / 6))
  
  for (let i = 0; i < spineNodes; i++) {
    const x = Math.floor((i / (spineNodes - 1)) * (branchX - 1)) + 1
    nodes.push({
      id: `main-${i}`,
      position: { x, y: centerY },
      type: i === 0 ? 'terminal' : i === spineNodes - 1 ? 'junction' : 'anchor',
      zone: i === 0 ? 'command' : undefined
    })
    
    if (i > 0) {
      segments.push({ from: `main-${i-1}`, to: `main-${i}`, direction: 'H', isSpine: true })
    }
  }
  
  const branchPointId = `main-${spineNodes - 1}`
  
  if (isY) {
    // Y-shape: two branches going back diagonally
    const branchLength = Math.max(2, Math.floor((length - branchX) / 2))
    
    // Upper branch
    nodes.push({
      id: 'branch-upper',
      position: { x: branchX + branchLength, y: Math.floor(width / 4) },
      type: 'terminal',
      zone: 'habitation'
    })
    segments.push({ from: branchPointId, to: 'branch-upper', direction: 'D', isSpine: true })
    
    // Lower branch
    nodes.push({
      id: 'branch-lower',
      position: { x: branchX + branchLength, y: Math.floor(width * 3 / 4) },
      type: 'terminal',
      zone: 'engineering'
    })
    segments.push({ from: branchPointId, to: 'branch-lower', direction: 'D', isSpine: true })
  } else {
    // T-shape: continue straight back, with perpendicular branch
    const sternX = length - 2
    
    // Continue to stern
    nodes.push({
      id: 'stern',
      position: { x: sternX, y: centerY },
      type: 'terminal',
      zone: 'engineering'
    })
    segments.push({ from: branchPointId, to: 'stern', direction: 'H', isSpine: true })
    
    // Upper perpendicular branch
    nodes.push({
      id: 'branch-upper',
      position: { x: branchX, y: 1 },
      type: 'terminal'
    })
    segments.push({ from: branchPointId, to: 'branch-upper', direction: 'V', isSpine: true })
    
    // Lower perpendicular branch
    nodes.push({
      id: 'branch-lower',
      position: { x: branchX, y: width - 2 },
      type: 'terminal'
    })
    segments.push({ from: branchPointId, to: 'branch-lower', direction: 'V', isSpine: true })
  }
  
  return { nodes, segments, bounds: { width: length, height: width }, pattern: 'branching' }
}

/**
 * Add side branches to ship nodes
 */
function addShipBranches(
  nodes: SpineNode[], 
  segments: SpineSegment[], 
  width: number, 
  rng: SeededRNG
): void {
  const junctions = nodes.filter(n => n.type === 'junction')
  
  for (let i = 0; i < junctions.length; i++) {
    const junction = junctions[i]
    
    // Add port (upper) branch
    if (rng.random() > 0.3) {
      const portY = junction.position.y - 2
      if (portY > 0) {
        const portId = `branch-port-${i}`
        nodes.push({
          id: portId,
          position: { x: junction.position.x, y: portY },
          type: 'anchor'
        })
        segments.push({ from: junction.id, to: portId, direction: 'V', isSpine: false })
      }
    }
    
    // Add starboard (lower) branch
    if (rng.random() > 0.3) {
      const starboardY = junction.position.y + 2
      if (starboardY < width) {
        const starboardId = `branch-starboard-${i}`
        nodes.push({
          id: starboardId,
          position: { x: junction.position.x, y: starboardY },
          type: 'anchor'
        })
        segments.push({ from: junction.id, to: starboardId, direction: 'V', isSpine: false })
      }
    }
  }
}

// ============================================================================
// STATION LAYOUT - Hub, Spoke and Ring Patterns
// ============================================================================

/**
 * Generate a station layout structure with pattern selection
 * 
 * Station design principles:
 * - Central hub/ops
 * - Spokes radiating outward (docking, habitation, etc.)
 * - Can have ring structure connecting spokes
 * - More modular than ships
 * 
 * Pattern selection based on size:
 * - Small: Hub + 3-4 spokes
 * - Medium: Hub + spokes + partial ring
 * - Large: Hub + spokes + full ring(s)
 */
export function generateStationSpine(
  roomCount: number,
  request: GenerationRequest,
  rng: SeededRNG
): SpineStructure {
  const loopiness = request.loopiness ?? 0.3
  
  // Select pattern based on size and loopiness
  if (roomCount <= 8) {
    return generateStationHubSpoke(roomCount, rng)
  } else if (roomCount <= 20) {
    if (loopiness > 0.4 || rng.random() > 0.5) {
      return generateStationHubRing(roomCount, rng)
    }
    return generateStationHubSpoke(roomCount, rng)
  } else {
    // Large stations: multi-ring
    if (loopiness > 0.3) {
      return generateStationMultiRing(roomCount, rng)
    }
    return generateStationHubRing(roomCount, rng)
  }
}

/**
 * Simple hub and spoke pattern
 */
function generateStationHubSpoke(roomCount: number, rng: SeededRNG): SpineStructure {
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  const radius = Math.max(4, Math.ceil(Math.sqrt(roomCount)))
  const size = radius * 2 + 1
  const centerX = Math.floor(size / 2)
  const centerY = Math.floor(size / 2)
  
  // Central hub
  nodes.push({
    id: 'hub',
    position: { x: centerX, y: centerY },
    type: 'junction',
    zone: 'command'
  })
  
  // Determine number of spokes (3-6 based on size)
  const spokeCount = Math.min(6, Math.max(3, Math.ceil(roomCount / 5)))
  
  // Create spokes
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2 - Math.PI / 2
    const spokeLength = Math.max(2, Math.ceil(radius * 0.7))
    
    for (let j = 1; j <= Math.ceil(spokeLength / 2); j++) {
      const dist = j * 2
      const x = Math.round(centerX + Math.cos(angle) * dist)
      const y = Math.round(centerY + Math.sin(angle) * dist)
      
      const nodeId = `spoke-${i}-${j}`
      const prevNodeId = j === 1 ? 'hub' : `spoke-${i}-${j-1}`
      
      nodes.push({
        id: nodeId,
        position: { x, y },
        type: j === Math.ceil(spokeLength / 2) ? 'terminal' : 'anchor'
      })
      
      segments.push({
        from: prevNodeId,
        to: nodeId,
        direction: Math.abs(Math.cos(angle)) > 0.5 ? 'H' : 'V',
        isSpine: true
      })
    }
  }
  
  return { nodes, segments, bounds: { width: size, height: size }, pattern: 'hub-spoke' }
}

/**
 * Hub + spoke + ring pattern
 */
function generateStationHubRing(roomCount: number, rng: SeededRNG): SpineStructure {
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  const radius = Math.max(5, Math.ceil(Math.sqrt(roomCount) * 1.2))
  const size = radius * 2 + 3
  const centerX = Math.floor(size / 2)
  const centerY = Math.floor(size / 2)
  
  // Central hub
  nodes.push({
    id: 'hub',
    position: { x: centerX, y: centerY },
    type: 'junction',
    zone: 'command'
  })
  
  const spokeCount = Math.min(6, Math.max(4, Math.ceil(roomCount / 6)))
  const ringRadius = Math.max(3, Math.floor(radius * 0.6))
  
  // Create spokes with ring nodes
  const ringNodes: string[] = []
  
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2 - Math.PI / 2
    
    // Midpoint on spoke (junction with ring)
    const ringX = Math.round(centerX + Math.cos(angle) * ringRadius)
    const ringY = Math.round(centerY + Math.sin(angle) * ringRadius)
    const ringNodeId = `ring-${i}`
    
    nodes.push({
      id: ringNodeId,
      position: { x: ringX, y: ringY },
      type: 'ring'
    })
    ringNodes.push(ringNodeId)
    
    // Connect hub to ring node
    segments.push({
      from: 'hub',
      to: ringNodeId,
      direction: Math.abs(Math.cos(angle)) > 0.5 ? 'H' : 'V',
      isSpine: true
    })
    
    // Terminal at end of spoke (beyond ring)
    const termX = Math.round(centerX + Math.cos(angle) * (ringRadius + 2))
    const termY = Math.round(centerY + Math.sin(angle) * (ringRadius + 2))
    const termNodeId = `spoke-${i}-end`
    
    nodes.push({
      id: termNodeId,
      position: { x: termX, y: termY },
      type: 'terminal'
    })
    
    segments.push({
      from: ringNodeId,
      to: termNodeId,
      direction: Math.abs(Math.cos(angle)) > 0.5 ? 'H' : 'V',
      isSpine: true
    })
  }
  
  // Connect ring nodes to form the ring
  for (let i = 0; i < ringNodes.length; i++) {
    const nextI = (i + 1) % ringNodes.length
    segments.push({
      from: ringNodes[i],
      to: ringNodes[nextI],
      direction: 'D',  // Ring segments can be diagonal
      isSpine: true
    })
  }
  
  return { nodes, segments, bounds: { width: size, height: size }, pattern: 'hub-ring' }
}

/**
 * Multiple concentric rings pattern (large stations)
 */
function generateStationMultiRing(roomCount: number, rng: SeededRNG): SpineStructure {
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  const outerRadius = Math.max(6, Math.ceil(Math.sqrt(roomCount) * 1.3))
  const size = outerRadius * 2 + 3
  const centerX = Math.floor(size / 2)
  const centerY = Math.floor(size / 2)
  
  // Central hub
  nodes.push({
    id: 'hub',
    position: { x: centerX, y: centerY },
    type: 'junction',
    zone: 'command'
  })
  
  const ringCount = roomCount > 30 ? 2 : 1
  const spokeCount = Math.min(8, Math.max(4, Math.ceil(roomCount / 5)))
  
  // Create rings
  for (let r = 0; r < ringCount; r++) {
    const ringRadius = Math.floor(outerRadius * (r + 1) / (ringCount + 0.5))
    const ringNodes: string[] = []
    
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2 - Math.PI / 2
      const x = Math.round(centerX + Math.cos(angle) * ringRadius)
      const y = Math.round(centerY + Math.sin(angle) * ringRadius)
      const nodeId = `ring${r}-${i}`
      
      nodes.push({
        id: nodeId,
        position: { x, y },
        type: 'ring'
      })
      ringNodes.push(nodeId)
      
      // Connect to hub (inner ring) or previous ring
      if (r === 0) {
        segments.push({
          from: 'hub',
          to: nodeId,
          direction: Math.abs(Math.cos(angle)) > 0.5 ? 'H' : 'V',
          isSpine: true
        })
      } else {
        // Connect to corresponding node on inner ring
        segments.push({
          from: `ring${r-1}-${i}`,
          to: nodeId,
          direction: Math.abs(Math.cos(angle)) > 0.5 ? 'H' : 'V',
          isSpine: true
        })
      }
    }
    
    // Connect ring nodes
    for (let i = 0; i < ringNodes.length; i++) {
      const nextI = (i + 1) % ringNodes.length
      segments.push({
        from: ringNodes[i],
        to: ringNodes[nextI],
        direction: 'D',
        isSpine: true
      })
    }
  }
  
  // Add terminals at outer ring
  const outerRingPrefix = ringCount > 1 ? `ring${ringCount - 1}` : 'ring0'
  for (let i = 0; i < spokeCount; i += 2) {
    const angle = (i / spokeCount) * Math.PI * 2 - Math.PI / 2
    const termRadius = Math.floor(outerRadius * 0.9)
    const x = Math.round(centerX + Math.cos(angle) * (termRadius + 2))
    const y = Math.round(centerY + Math.sin(angle) * (termRadius + 2))
    
    nodes.push({
      id: `terminal-${i}`,
      position: { x, y },
      type: 'terminal',
      zone: i === 0 ? 'docking' : undefined
    })
    
    segments.push({
      from: `${outerRingPrefix}-${i}`,
      to: `terminal-${i}`,
      direction: Math.abs(Math.cos(angle)) > 0.5 ? 'H' : 'V',
      isSpine: false
    })
  }
  
  return { nodes, segments, bounds: { width: size, height: size }, pattern: 'multi-ring' }
}

// ============================================================================
// OUTPOST LAYOUT - Terrain-Dependent Patterns
// ============================================================================

/**
 * Generate an outpost layout structure based on terrain type
 * 
 * Outpost design principles:
 * - Compact, utilitarian
 * - Single entry point (airlock)
 * - Layout depends heavily on terrain:
 *   - Underground: Main tunnel with chambers
 *   - Surface: Clustered modules
 *   - Ruins: Irregular, blocked paths
 */
export function generateOutpostSpine(
  roomCount: number,
  request: GenerationRequest,
  rng: SeededRNG
): SpineStructure {
  const terrain = selectOutpostTerrain(request.subtype || '', rng)
  
  switch (terrain) {
    case 'underground':
      return generateOutpostUnderground(roomCount, rng)
    case 'ruins':
      return generateOutpostRuins(roomCount, rng)
    case 'surface':
    default:
      return generateOutpostSurface(roomCount, rng)
  }
}

/**
 * Underground outpost - main tunnel with side chambers
 */
function generateOutpostUnderground(roomCount: number, rng: SeededRNG): SpineStructure {
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  // Underground = long tunnel
  const length = Math.max(6, Math.ceil(roomCount * 0.8))
  const width = Math.max(4, Math.ceil(length / 3))
  
  const tunnelY = Math.floor(width / 2)
  const tunnelNodes = Math.max(3, Math.ceil(roomCount / 3))
  
  // Entry point
  nodes.push({
    id: 'entry',
    position: { x: 0, y: tunnelY },
    type: 'terminal',
    zone: 'utility'
  })
  
  // Main tunnel
  for (let i = 1; i <= tunnelNodes; i++) {
    const x = Math.floor((i / tunnelNodes) * (length - 1))
    
    nodes.push({
      id: `tunnel-${i}`,
      position: { x, y: tunnelY },
      type: i === tunnelNodes ? 'terminal' : 'junction'
    })
    
    const prevId = i === 1 ? 'entry' : `tunnel-${i-1}`
    segments.push({ from: prevId, to: `tunnel-${i}`, direction: 'H', isSpine: true })
    
    // Add chambers on alternating sides
    if (i < tunnelNodes && rng.random() > 0.3) {
      const side = i % 2 === 0 ? -2 : 2
      const chamberY = tunnelY + side
      if (chamberY > 0 && chamberY < width) {
        const chamberId = `chamber-${i}`
        nodes.push({
          id: chamberId,
          position: { x, y: chamberY },
          type: 'anchor'
        })
        segments.push({ from: `tunnel-${i}`, to: chamberId, direction: 'V', isSpine: false })
      }
    }
  }
  
  return { nodes, segments, bounds: { width: length, height: width }, pattern: 'tunnel' }
}

/**
 * Surface outpost - clustered modules
 */
function generateOutpostSurface(roomCount: number, rng: SeededRNG): SpineStructure {
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  // Surface = more compact, irregular cluster
  const size = Math.max(5, Math.ceil(Math.sqrt(roomCount * 2)))
  const centerX = Math.floor(size / 2)
  const centerY = Math.floor(size / 2)
  
  // Central hub (main module)
  nodes.push({
    id: 'main',
    position: { x: centerX, y: centerY },
    type: 'junction',
    zone: 'utility'
  })
  
  // Scatter modules around main
  const moduleCount = Math.min(5, Math.ceil(roomCount / 3))
  const placedPositions: Point[] = [{ x: centerX, y: centerY }]
  
  for (let i = 0; i < moduleCount; i++) {
    // Try to place near an existing module
    let placed = false
    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      const baseIdx = Math.floor(rng.random() * placedPositions.length)
      const base = placedPositions[baseIdx]
      
      // Random direction
      const dx = Math.floor(rng.random() * 3) - 1  // -1, 0, 1
      const dy = Math.floor(rng.random() * 3) - 1
      if (dx === 0 && dy === 0) continue
      
      const newX = base.x + dx * 2
      const newY = base.y + dy * 2
      
      // Check bounds and not too close
      if (newX < 1 || newX >= size - 1 || newY < 1 || newY >= size - 1) continue
      
      const tooClose = placedPositions.some(p => 
        Math.abs(p.x - newX) < 2 && Math.abs(p.y - newY) < 2
      )
      if (tooClose) continue
      
      const nodeId = `module-${i}`
      nodes.push({
        id: nodeId,
        position: { x: newX, y: newY },
        type: 'anchor'
      })
      placedPositions.push({ x: newX, y: newY })
      
      // Connect to nearest existing node
      let nearestId = 'main'
      let nearestDist = Math.abs(centerX - newX) + Math.abs(centerY - newY)
      
      for (const node of nodes) {
        if (node.id === nodeId) continue
        const dist = Math.abs(node.position.x - newX) + Math.abs(node.position.y - newY)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestId = node.id
        }
      }
      
      const direction = Math.abs(newX - (nodes.find(n => n.id === nearestId)?.position.x ?? 0)) >
                        Math.abs(newY - (nodes.find(n => n.id === nearestId)?.position.y ?? 0))
                        ? 'H' : 'V'
      
      segments.push({ from: nearestId, to: nodeId, direction, isSpine: false })
      placed = true
    }
  }
  
  // Entry point
  nodes.push({
    id: 'entry',
    position: { x: 0, y: centerY },
    type: 'terminal'
  })
  segments.push({ from: 'entry', to: 'main', direction: 'H', isSpine: true })
  
  return { nodes, segments, bounds: { width: size, height: size }, pattern: 'cluster' }
}

/**
 * Ruins outpost - irregular layout with blocked paths
 */
function generateOutpostRuins(roomCount: number, rng: SeededRNG): SpineStructure {
  const nodes: SpineNode[] = []
  const segments: SpineSegment[] = []
  
  // Ruins = asymmetric, with dead ends and alternate routes
  const size = Math.max(6, Math.ceil(Math.sqrt(roomCount * 2.5)))
  
  // Start with a grid of potential nodes
  const gridPoints: Point[] = []
  for (let x = 1; x < size - 1; x += 2) {
    for (let y = 1; y < size - 1; y += 2) {
      gridPoints.push({ x, y })
    }
  }
  
  // Randomly select nodes (not all - it's ruins!)
  const nodeCount = Math.min(gridPoints.length, Math.max(4, Math.ceil(roomCount / 2)))
  const shuffled = [...gridPoints].sort(() => rng.random() - 0.5)
  const selectedPoints = shuffled.slice(0, nodeCount)
  
  // Create nodes
  for (let i = 0; i < selectedPoints.length; i++) {
    const p = selectedPoints[i]
    nodes.push({
      id: `ruin-${i}`,
      position: p,
      type: i === 0 ? 'terminal' : 'anchor',
      zone: i === 0 ? 'utility' : undefined
    })
  }
  
  // Connect nearby nodes (creates irregular layout)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    
    // Find nearest node not yet connected to this one
    for (const other of nodes) {
      if (other.id === node.id) continue
      
      const dist = Math.abs(other.position.x - node.position.x) + 
                   Math.abs(other.position.y - node.position.y)
      
      // Connect if close enough
      if (dist <= 3) {
        // Check if already connected
        const alreadyConnected = segments.some(s =>
          (s.from === node.id && s.to === other.id) ||
          (s.from === other.id && s.to === node.id)
        )
        
        if (!alreadyConnected && rng.random() > 0.3) {
          const direction = Math.abs(other.position.x - node.position.x) >
                           Math.abs(other.position.y - node.position.y) ? 'H' : 'V'
          segments.push({ from: node.id, to: other.id, direction, isSpine: false })
        }
      }
    }
  }
  
  // Ensure connectivity - find isolated nodes and connect them
  const connected = new Set<string>()
  if (nodes.length > 0) {
    connected.add(nodes[0].id)
    let changed = true
    while (changed) {
      changed = false
      for (const seg of segments) {
        if (connected.has(seg.from) && !connected.has(seg.to)) {
          connected.add(seg.to)
          changed = true
        } else if (connected.has(seg.to) && !connected.has(seg.from)) {
          connected.add(seg.from)
          changed = true
        }
      }
    }
    
    // Connect isolated nodes
    for (const node of nodes) {
      if (!connected.has(node.id)) {
        // Find nearest connected node
        let nearest: SpineNode | null = null
        let nearestDist = Infinity
        
        for (const other of nodes) {
          if (!connected.has(other.id)) continue
          const dist = Math.abs(other.position.x - node.position.x) +
                       Math.abs(other.position.y - node.position.y)
          if (dist < nearestDist) {
            nearestDist = dist
            nearest = other
          }
        }
        
        if (nearest) {
          const direction = Math.abs(nearest.position.x - node.position.x) >
                           Math.abs(nearest.position.y - node.position.y) ? 'H' : 'V'
          segments.push({ from: nearest.id, to: node.id, direction, isSpine: false })
          connected.add(node.id)
        }
      }
    }
  }
  
  return { nodes, segments, bounds: { width: size, height: size }, pattern: 'ruins' }
}

// ============================================================================
// ZONE PLACEMENT RULES
// ============================================================================

/**
 * Get zone placement rules for an archetype
 */
export function getZonePlacement(archetype: string, subtype: string): ZonePlacement[] {
  switch (archetype) {
    case 'ship':
      return [
        { zone: 'command', anchor: 'bow', priority: 1 },
        { zone: 'engineering', anchor: 'stern', priority: 1 },
        { zone: 'power', anchor: 'stern', priority: 2 },
        { zone: 'habitation', anchor: 'center', priority: 2 },
        { zone: 'medical', anchor: 'center', priority: 3 },
        { zone: 'cargo', anchor: 'stern', priority: 3 },
        { zone: 'docking', anchor: 'port', priority: 2 },
        { zone: 'science', anchor: 'bow', priority: 3 },
        { zone: 'security', anchor: 'center', priority: 3 },
      ]
    
    case 'station':
      return [
        { zone: 'command', anchor: 'hub', priority: 1 },
        { zone: 'docking', anchor: 'port', priority: 1 },
        { zone: 'habitation', anchor: 'starboard', priority: 2 },
        { zone: 'engineering', anchor: 'stern', priority: 2 },
        { zone: 'cargo', anchor: 'port', priority: 3 },
        { zone: 'science', anchor: 'bow', priority: 3 },
      ]
    
    case 'outpost':
      return [
        { zone: 'utility', anchor: 'center', priority: 1 },
        { zone: 'habitation', anchor: 'center', priority: 2 },
        { zone: 'power', anchor: 'stern', priority: 2 },
        { zone: 'storage', anchor: 'stern', priority: 3 },
      ]
    
    default:
      return []
  }
}

// ============================================================================
// CORRIDOR GENERATION FROM SPINE
// ============================================================================

/**
 * Generate corridors from spine structure
 * 
 * Instead of routing each room-to-room connection separately,
 * we generate corridors along the spine first, then connect rooms to spine.
 */
export function generateCorridorsFromSpine(
  spine: SpineStructure,
  roomPositions: Map<string, { x: number; y: number; width: number; height: number }>,
  gridSize: number
): Array<{ path: Point[]; isSpine: boolean }> {
  const corridors: Array<{ path: Point[]; isSpine: boolean }> = []
  
  // First: Generate spine corridors (these are the main arteries)
  for (const segment of spine.segments) {
    const fromNode = spine.nodes.find(n => n.id === segment.from)
    const toNode = spine.nodes.find(n => n.id === segment.to)
    
    if (!fromNode || !toNode) continue
    
    const path: Point[] = [
      { x: fromNode.position.x * gridSize, y: fromNode.position.y * gridSize },
      { x: toNode.position.x * gridSize, y: toNode.position.y * gridSize }
    ]
    
    corridors.push({ path, isSpine: true })
  }
  
  // Second: Connect each room to the nearest spine node
  for (const [roomId, bounds] of roomPositions) {
    const roomCenter = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    }
    
    // Find nearest spine node
    let nearestNode: SpineNode | null = null
    let nearestDist = Infinity
    
    for (const node of spine.nodes) {
      const nodeWorld = {
        x: node.position.x * gridSize,
        y: node.position.y * gridSize
      }
      const dist = Math.abs(roomCenter.x - nodeWorld.x) + Math.abs(roomCenter.y - nodeWorld.y)
      
      if (dist < nearestDist) {
        nearestDist = dist
        nearestNode = node
      }
    }
    
    if (nearestNode) {
      const nodeWorld = {
        x: nearestNode.position.x * gridSize,
        y: nearestNode.position.y * gridSize
      }
      
      // Create L-shaped connector from room to spine
      const path: Point[] = [
        roomCenter,
        { x: nodeWorld.x, y: roomCenter.y },  // First go horizontal
        nodeWorld  // Then vertical to spine
      ]
      
      corridors.push({ path, isSpine: false })
    }
  }
  
  return corridors
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function generateSpineForArchetype(
  archetype: string,
  roomCount: number,
  request: GenerationRequest,
  rng: SeededRNG
): SpineStructure {
  switch (archetype) {
    case 'ship':
      return generateShipSpine(roomCount, request, rng)
    case 'station':
      return generateStationSpine(roomCount, request, rng)
    case 'outpost':
      return generateOutpostSpine(roomCount, request, rng)
    default:
      return generateShipSpine(roomCount, request, rng)
  }
}

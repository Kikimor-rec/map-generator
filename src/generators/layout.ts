/**
 * Layout Geometry Generator
 * Stage 4-5 of the generation pipeline: Position rooms and route connectors
 * Based on specification from 05_layout_geometry.md
 * 
 * Key improvements:
 * - Spine-based layout for ships (bow-to-stern main corridor)
 * - Hub-and-spoke for stations
 * - Zone-aware placement (command at bow, engineering at stern)
 */

import type {
  GenerationRequest,
  TopologyGraph,
  DeckLayout,
  LayoutRoom,
  LayoutConnector,
  Junction,
  Point,
  Rect,
  Port,
  GraphConnector,
  SizeTier
} from './types'
import type { SeededRNG } from './types'
import { createRNG, generateStableId } from './rng'
import { 
  generateSpineForArchetype, 
  getZonePlacement,
  type SpineStructure 
} from './spineLayout'

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE = 40 // Base grid unit in pixels
const MIN_ROOM_GAP = 2 // Minimum tiles between rooms (reduced for tighter layout)
const CORRIDOR_WIDTH = 1.2 // Width in tiles (match corridor gap)
const CORRIDOR_CLEARANCE = 1 // Tiles to keep clear around corridors
const SNAP_STEP = GRID_SIZE / 2

// ============================================================================
// LAYOUT GENERATOR
// ============================================================================

export interface LayoutOptions {
  request: GenerationRequest
  topology: TopologyGraph
}

export function generateLayout(options: LayoutOptions): DeckLayout[] {
  const { request, topology } = options
  const rng = createRNG(request.seed + '-layout')
  
  const layouts: DeckLayout[] = []
  
  // Process each deck separately
  for (let deckIndex = 0; deckIndex < topology.deckCount; deckIndex++) {
    const deckRoomIds = topology.roomsByDeck[deckIndex] || []
    const deckRooms = topology.rooms.filter(r => deckRoomIds.includes(r.id))
    
    // Get connectors relevant to this deck
    const deckConnectors = topology.connectors.filter(c => {
      const fromRoom = topology.rooms.find(r => r.id === c.fromRoomId)
      const toRoom = topology.rooms.find(r => r.id === c.toRoomId)
      
      if (!fromRoom || !toRoom) return false
      
      // Include if both rooms are on this deck, or if it's a vertical connector touching this deck
      if (deckRoomIds.includes(c.fromRoomId) && deckRoomIds.includes(c.toRoomId)) {
        return true
      }
      
      // For vertical connectors, include on both decks
      if (c.isVertical) {
        const fromDeck = deckRoomIds.includes(c.fromRoomId) ? deckIndex : -1
        const toDeck = deckRoomIds.includes(c.toRoomId) ? deckIndex : -1
        return fromDeck === deckIndex || toDeck === deckIndex
      }
      
      return false
    })
    
    const layout = generateDeckLayout(
      deckIndex,
      deckRooms,
      deckConnectors,
      topology,
      request,
      rng
    )
    
    layouts.push(layout)
  }
  
  return layouts
}

// ============================================================================
// DECK LAYOUT GENERATION
// ============================================================================

interface PlacedRoom {
  room: LayoutRoom
  rect: Rect
}

function generateDeckLayout(
  deckIndex: number,
  rooms: Array<{ id: string; roomType: string; label: string; estimatedWidth: number; estimatedHeight: number; zone: string; importance: string; isExterior?: boolean }>,
  connectors: GraphConnector[],
  topology: TopologyGraph,
  request: GenerationRequest,
  rng: SeededRNG
): DeckLayout {
  // Phase 1: Calculate grid bounds based on total room area
  const totalTiles = rooms.reduce((sum, r) => sum + r.estimatedWidth * r.estimatedHeight, 0)
  
  // Phase 1b: Generate spine structure for this archetype
  const spine = generateSpineForArchetype(
    request.archetype,
    rooms.length,
    request,
    rng
  )
  
  // Calculate dimensions based on spine bounds and archetype
  let gridWidth: number
  let gridHeight: number
  
  if (request.archetype === 'ship') {
    // Ships are elongated (2.5:1 to 3:1 ratio, horizontal)
    const area = totalTiles * 2.2  // More compact
    gridWidth = Math.max(spine.bounds.width + 4, Math.ceil(Math.sqrt(area * 2.5)))
    gridHeight = Math.max(spine.bounds.height + 4, Math.ceil(gridWidth / 2.5))
  } else if (request.archetype === 'station') {
    // Stations are roughly square with hub
    const gridDimension = Math.ceil(Math.sqrt(totalTiles * 2.5))
    gridWidth = Math.max(spine.bounds.width + 4, gridDimension)
    gridHeight = Math.max(spine.bounds.height + 4, gridDimension)
  } else {
    // Outposts are compact squares
    const gridDimension = Math.ceil(Math.sqrt(totalTiles * 2))
    gridWidth = Math.max(spine.bounds.width + 4, gridDimension)
    gridHeight = Math.max(spine.bounds.height + 4, gridDimension)
  }
  
  // Phase 2: Place rooms using spine-aware placement
  const placedRooms = placeRoomsWithSpine(rooms, connectors, gridWidth, gridHeight, spine, request, rng)
  
  // Phase 3: Calculate ports for each room
  for (const placed of placedRooms) {
    placed.room.ports = calculatePorts(placed.room, placed.rect, placedRooms, connectors)
  }
  
  // Phase 4: Route connectors between rooms (spine-aware)
  const layoutConnectors = routeConnectorsWithSpine(
    connectors,
    placedRooms,
    gridWidth,
    gridHeight,
    spine,
    request,
    rng
  )
  
  // Phase 5: Generate junctions at corridor intersections
  const junctions = generateJunctions(layoutConnectors, placedRooms, request, rng)
  
  return {
    deckIndex,
    gridWidth,
    gridHeight,
    rooms: placedRooms.map(p => p.room),
    connectors: layoutConnectors,
    junctions
  }
}

// ============================================================================
// ROOM PLACEMENT
// ============================================================================

function placeRooms(
  rooms: Array<{ id: string; roomType: string; label: string; estimatedWidth: number; estimatedHeight: number; zone: string; importance: string; isExterior?: boolean }>,
  connectors: GraphConnector[],
  gridWidth: number,
  gridHeight: number,
  request: GenerationRequest,
  rng: SeededRNG
): PlacedRoom[] {
  const placed: PlacedRoom[] = []
  const occupiedCells = new Set<string>()
  
  // Sort rooms: primary first, then by size (larger first)
  const sortedRooms = [...rooms].sort((a, b) => {
    const importanceOrder = { primary: 0, secondary: 1, tertiary: 2 }
    const aOrder = importanceOrder[a.importance as keyof typeof importanceOrder] ?? 2
    const bOrder = importanceOrder[b.importance as keyof typeof importanceOrder] ?? 2
    
    if (aOrder !== bOrder) return aOrder - bOrder
    return (b.estimatedWidth * b.estimatedHeight) - (a.estimatedWidth * a.estimatedHeight)
  })
  
  // Choose layout pattern based on archetype
  const pattern = getLayoutPattern(request)
  
  for (const room of sortedRooms) {
    const width = room.estimatedWidth
    const height = room.estimatedHeight
    
    // Find valid position
    const position = findRoomPosition(
      width,
      height,
      placed,
      occupiedCells,
      connectors,
      room,
      gridWidth,
      gridHeight,
      pattern,
      rng
    )
    
    if (position) {
      const rect: Rect = {
        x: position.x,
        y: position.y,
        width,
        height
      }
      
      // Mark cells as occupied
      for (let dx = -1; dx <= width; dx++) {
        for (let dy = -1; dy <= height; dy++) {
          occupiedCells.add(`${position.x + dx},${position.y + dy}`)
        }
      }
      
      const layoutRoom: LayoutRoom = {
        id: room.id,
        roomType: room.roomType,
        label: room.label,
        x: position.x * GRID_SIZE,
        y: position.y * GRID_SIZE,
        width: width * GRID_SIZE,
        height: height * GRID_SIZE,
        gridX: position.x,
        gridY: position.y,
        gridWidth: width,
        gridHeight: height,
        zone: room.zone,
        ports: [],
        isExterior: room.isExterior || false
      }
      
      placed.push({ room: layoutRoom, rect })
    }
  }
  
  return placed
}

// ============================================================================
// SPINE-AWARE ROOM PLACEMENT
// ============================================================================

/**
 * Place rooms using spine structure as guide
 * Rooms are placed near spine nodes based on their zone
 */
function placeRoomsWithSpine(
  rooms: Array<{ id: string; roomType: string; label: string; estimatedWidth: number; estimatedHeight: number; zone: string; importance: string; isExterior?: boolean }>,
  connectors: GraphConnector[],
  gridWidth: number,
  gridHeight: number,
  spine: SpineStructure,
  request: GenerationRequest,
  rng: SeededRNG
): PlacedRoom[] {
  const placed: PlacedRoom[] = []
  const occupiedCells = new Set<string>()
  
  // Get zone placement rules
  const zonePlacements = getZonePlacement(request.archetype, request.subtype || '')
  
  // Sort rooms: primary first, then by zone priority
  const sortedRooms = [...rooms].sort((a, b) => {
    const importanceOrder = { primary: 0, secondary: 1, tertiary: 2 }
    const aOrder = importanceOrder[a.importance as keyof typeof importanceOrder] ?? 2
    const bOrder = importanceOrder[b.importance as keyof typeof importanceOrder] ?? 2
    
    if (aOrder !== bOrder) return aOrder - bOrder
    
    // Sort by zone priority
    const aZonePriority = zonePlacements.find(z => z.zone === a.zone)?.priority ?? 10
    const bZonePriority = zonePlacements.find(z => z.zone === b.zone)?.priority ?? 10
    if (aZonePriority !== bZonePriority) return aZonePriority - bZonePriority
    
    return (b.estimatedWidth * b.estimatedHeight) - (a.estimatedWidth * a.estimatedHeight)
  })
  
  // Calculate spine offset to center it in grid
  const spineOffsetX = Math.floor((gridWidth - spine.bounds.width) / 2)
  const spineOffsetY = Math.floor((gridHeight - spine.bounds.height) / 2)
  
  // Mark spine corridor cells as occupied (with clearance)
  for (const segment of spine.segments) {
    const fromNode = spine.nodes.find(n => n.id === segment.from)
    const toNode = spine.nodes.find(n => n.id === segment.to)
    if (!fromNode || !toNode) continue
    
    // Mark cells along spine segment
    const x1 = fromNode.position.x + spineOffsetX
    const y1 = fromNode.position.y + spineOffsetY
    const x2 = toNode.position.x + spineOffsetX
    const y2 = toNode.position.y + spineOffsetY
    
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      const x = Math.round(x1 + (x2 - x1) * t)
      const y = Math.round(y1 + (y2 - y1) * t)
      
      // Mark with clearance
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          occupiedCells.add(`${x + dx},${y + dy}`)
        }
      }
    }
  }
  
  for (const room of sortedRooms) {
    const width = room.estimatedWidth
    const height = room.estimatedHeight
    
    // Find best spine node for this room's zone
    const targetNode = findTargetSpineNode(room.zone, spine, zonePlacements, spineOffsetX, spineOffsetY)
    
    // Find position near the target node
    const position = findPositionNearSpineNode(
      width,
      height,
      targetNode,
      placed,
      occupiedCells,
      connectors,
      room,
      gridWidth,
      gridHeight,
      spine,
      spineOffsetX,
      spineOffsetY,
      rng
    )
    
    if (position) {
      const rect: Rect = {
        x: position.x,
        y: position.y,
        width,
        height
      }
      
      // Mark cells as occupied
      for (let dx = -1; dx <= width; dx++) {
        for (let dy = -1; dy <= height; dy++) {
          occupiedCells.add(`${position.x + dx},${position.y + dy}`)
        }
      }
      
      const layoutRoom: LayoutRoom = {
        id: room.id,
        roomType: room.roomType,
        label: room.label,
        x: position.x * GRID_SIZE,
        y: position.y * GRID_SIZE,
        width: width * GRID_SIZE,
        height: height * GRID_SIZE,
        gridX: position.x,
        gridY: position.y,
        gridWidth: width,
        gridHeight: height,
        zone: room.zone,
        ports: [],
        isExterior: room.isExterior || false
      }
      
      placed.push({ room: layoutRoom, rect })
    }
  }
  
  return placed
}

/**
 * Find the best spine node for a room based on its zone
 */
function findTargetSpineNode(
  zone: string,
  spine: SpineStructure,
  zonePlacements: Array<{ zone: string; anchor: string; priority: number }>,
  offsetX: number,
  offsetY: number
): Point | null {
  const placement = zonePlacements.find(z => z.zone === zone)
  if (!placement) {
    // Default: center of spine
    const centerNode = spine.nodes.find(n => n.type === 'junction') || spine.nodes[0]
    return centerNode ? { 
      x: centerNode.position.x + offsetX, 
      y: centerNode.position.y + offsetY 
    } : null
  }
  
  // Find node matching the anchor
  let targetNode: typeof spine.nodes[0] | undefined
  
  switch (placement.anchor) {
    case 'bow':
      // First terminal or leftmost node
      targetNode = spine.nodes.find(n => n.zone === 'command') ||
                   spine.nodes.reduce((min, n) => n.position.x < min.position.x ? n : min, spine.nodes[0])
      break
    case 'stern':
      // Last terminal or rightmost node
      targetNode = spine.nodes.find(n => n.zone === 'engineering') ||
                   spine.nodes.reduce((max, n) => n.position.x > max.position.x ? n : max, spine.nodes[0])
      break
    case 'hub':
      // Central hub node
      targetNode = spine.nodes.find(n => n.id === 'hub') ||
                   spine.nodes.find(n => n.type === 'junction')
      break
    case 'port':
      // Upper nodes (lower Y)
      targetNode = spine.nodes.find(n => n.id.includes('port') || n.id.includes('upper')) ||
                   spine.nodes.reduce((min, n) => n.position.y < min.position.y ? n : min, spine.nodes[0])
      break
    case 'starboard':
      // Lower nodes (higher Y)
      targetNode = spine.nodes.find(n => n.id.includes('starboard') || n.id.includes('lower')) ||
                   spine.nodes.reduce((max, n) => n.position.y > max.position.y ? n : max, spine.nodes[0])
      break
    case 'center':
    default:
      // Middle junction
      const junctions = spine.nodes.filter(n => n.type === 'junction' || n.type === 'anchor')
      targetNode = junctions[Math.floor(junctions.length / 2)] || spine.nodes[0]
  }
  
  return targetNode ? { 
    x: targetNode.position.x + offsetX, 
    y: targetNode.position.y + offsetY 
  } : null
}

/**
 * Find a valid position near a spine node
 */
function findPositionNearSpineNode(
  width: number,
  height: number,
  targetNode: Point | null,
  placed: PlacedRoom[],
  occupied: Set<string>,
  connectors: GraphConnector[],
  room: { id: string; importance: string; zone: string },
  gridWidth: number,
  gridHeight: number,
  spine: SpineStructure,
  spineOffsetX: number,
  spineOffsetY: number,
  rng: SeededRNG
): Point | null {
  const candidates: Array<{ pos: Point; score: number }> = []
  
  // If we have a target node, search around it
  if (targetNode) {
    // Search in expanding rings around target node
    for (let radius = 2; radius <= 8; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Only check perimeter of ring
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
          
          const pos = { x: targetNode.x + dx, y: targetNode.y + dy }
          
          if (isPositionValid(pos, width, height, occupied, gridWidth, gridHeight)) {
            const score = scorePositionNearSpine(pos, width, height, targetNode, spine, spineOffsetX, spineOffsetY, placed, room)
            candidates.push({ pos, score })
          }
        }
      }
      
      // If we found enough candidates, stop expanding
      if (candidates.length >= 5) break
    }
  }
  
  // Fallback: check positions near already placed rooms
  if (candidates.length === 0) {
    const connectedTo = connectors
      .filter(c => c.fromRoomId === room.id || c.toRoomId === room.id)
      .map(c => c.fromRoomId === room.id ? c.toRoomId : c.fromRoomId)
    
    const connectedPlaced = placed.filter(p => connectedTo.includes(p.room.id))
    
    for (const connected of connectedPlaced) {
      const adjacentPositions = getAdjacentPositions(connected.rect, width, height, MIN_ROOM_GAP)
      
      for (const pos of adjacentPositions) {
        if (isPositionValid(pos, width, height, occupied, gridWidth, gridHeight)) {
          const score = scorePositionNearSpine(
            pos, width, height, 
            targetNode || { x: connected.rect.x, y: connected.rect.y }, 
            spine, spineOffsetX, spineOffsetY, placed, room
          )
          candidates.push({ pos, score })
        }
      }
    }
  }
  
  // Last resort: random valid positions
  if (candidates.length === 0) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const pos = {
        x: rng.randomInt(2, gridWidth - width - 2),
        y: rng.randomInt(2, gridHeight - height - 2)
      }
      
      if (isPositionValid(pos, width, height, occupied, gridWidth, gridHeight)) {
        candidates.push({ pos, score: 0 })
        if (candidates.length >= 5) break
      }
    }
  }
  
  if (candidates.length === 0) {
    // Absolute last resort: scan grid
    for (let y = 1; y < gridHeight - height - 1; y++) {
      for (let x = 1; x < gridWidth - width - 1; x++) {
        if (isPositionValid({ x, y }, width, height, occupied, gridWidth, gridHeight)) {
          return { x, y }
        }
      }
    }
    return null
  }
  
  // Pick best candidate
  candidates.sort((a, b) => b.score - a.score)
  return rng.pick(candidates.slice(0, Math.min(3, candidates.length))).pos
}

/**
 * Score a position based on proximity to spine and target node
 */
function scorePositionNearSpine(
  pos: Point,
  width: number,
  height: number,
  targetNode: Point,
  spine: SpineStructure,
  spineOffsetX: number,
  spineOffsetY: number,
  placed: PlacedRoom[],
  room: { zone?: string }
): number {
  let score = 100
  
  const centerX = pos.x + width / 2
  const centerY = pos.y + height / 2
  
  // Prefer positions close to target node
  const distToTarget = Math.abs(centerX - targetNode.x) + Math.abs(centerY - targetNode.y)
  score -= distToTarget * 3
  
  // Prefer positions perpendicular to spine (not blocking it)
  // Find nearest spine segment and check if we're beside it, not on it
  let minDistToSpine = Infinity
  for (const node of spine.nodes) {
    const nodeX = node.position.x + spineOffsetX
    const nodeY = node.position.y + spineOffsetY
    const dist = Math.abs(centerX - nodeX) + Math.abs(centerY - nodeY)
    minDistToSpine = Math.min(minDistToSpine, dist)
  }
  
  // Sweet spot: 2-4 tiles from spine (close but not blocking)
  if (minDistToSpine >= 2 && minDistToSpine <= 4) {
    score += 20
  } else if (minDistToSpine < 2) {
    score -= 30  // Too close, might block spine
  }
  
  // Prefer positions close to already placed rooms (for compactness)
  for (const p of placed) {
    const pCenterX = p.rect.x + p.rect.width / 2
    const pCenterY = p.rect.y + p.rect.height / 2
    const dist = Math.sqrt((centerX - pCenterX) ** 2 + (centerY - pCenterY) ** 2)
    if (dist < 6) {
      score += 10 - dist  // Bonus for being close to other rooms
    }
  }
  
  return score
}

type LayoutPattern = 'linear' | 'hub' | 'grid' | 'organic'

function getLayoutPattern(request: GenerationRequest): LayoutPattern {
  switch (request.archetype) {
    case 'ship':
      return 'linear'
    case 'station':
      return 'hub'
    case 'outpost':
      return 'grid'
    default:
      return 'organic'
  }
}

function findRoomPosition(
  width: number,
  height: number,
  placed: PlacedRoom[],
  occupied: Set<string>,
  connectors: GraphConnector[],
  room: { id: string; importance: string; zone: string },
  gridWidth: number,
  gridHeight: number,
  pattern: LayoutPattern,
  rng: SeededRNG
): Point | null {
  // For first room, place based on pattern and zone
  if (placed.length === 0) {
    if (pattern === 'linear') {
      // Ships: command at bow (left), engineering at stern (right)
      if (room.zone === 'command') {
        return {
          x: 2,  // Near left edge (bow)
          y: Math.floor((gridHeight - height) / 2)  // Centered vertically
        }
      } else if (room.zone === 'engineering' || room.zone === 'power') {
        return {
          x: gridWidth - width - 2,  // Near right edge (stern)
          y: Math.floor((gridHeight - height) / 2)
        }
      }
    }
    // Default: center
    return {
      x: Math.floor((gridWidth - width) / 2),
      y: Math.floor((gridHeight - height) / 2)
    }
  }
  
  // Find connected rooms that are already placed
  const connectedTo = connectors
    .filter(c => c.fromRoomId === room.id || c.toRoomId === room.id)
    .map(c => c.fromRoomId === room.id ? c.toRoomId : c.fromRoomId)
  
  const connectedPlaced = placed.filter(p => connectedTo.includes(p.room.id))
  
  // Generate candidate positions
  const candidates: Array<{ pos: Point; score: number }> = []
  
  // If connected rooms exist, try positions adjacent to them
  if (connectedPlaced.length > 0) {
    for (const connected of connectedPlaced) {
      const adjacentPositions = getAdjacentPositions(connected.rect, width, height, MIN_ROOM_GAP)
      
      for (const pos of adjacentPositions) {
        if (isPositionValid(pos, width, height, occupied, gridWidth, gridHeight)) {
          const score = scorePosition(pos, width, height, connectedPlaced, pattern, gridWidth, gridHeight, room)
          candidates.push({ pos, score })
        }
      }
    }
  }
  
  // If no valid adjacent positions, try random positions
  if (candidates.length === 0) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const pos = {
        x: rng.randomInt(1, gridWidth - width - 1),
        y: rng.randomInt(1, gridHeight - height - 1)
      }
      
      if (isPositionValid(pos, width, height, occupied, gridWidth, gridHeight)) {
        const score = scorePosition(pos, width, height, connectedPlaced, pattern, gridWidth, gridHeight, room)
        candidates.push({ pos, score })
        
        if (candidates.length >= 10) break
      }
    }
  }
  
  if (candidates.length === 0) {
    // Last resort: find any valid position
    for (let y = 1; y < gridHeight - height - 1; y++) {
      for (let x = 1; x < gridWidth - width - 1; x++) {
        if (isPositionValid({ x, y }, width, height, occupied, gridWidth, gridHeight)) {
          return { x, y }
        }
      }
    }
    return null
  }
  
  // Sort by score and pick best (or randomly from top candidates)
  candidates.sort((a, b) => b.score - a.score)
  
  // Pick from top 3
  const topCandidates = candidates.slice(0, Math.min(3, candidates.length))
  return rng.pick(topCandidates).pos
}

function getAdjacentPositions(rect: Rect, roomWidth: number, roomHeight: number, gap: number): Point[] {
  const positions: Point[] = []
  
  // Right of rect
  positions.push({ x: rect.x + rect.width + gap, y: rect.y })
  // Left of rect
  positions.push({ x: rect.x - roomWidth - gap, y: rect.y })
  // Below rect
  positions.push({ x: rect.x, y: rect.y + rect.height + gap })
  // Above rect
  positions.push({ x: rect.x, y: rect.y - roomHeight - gap })
  
  // Diagonal positions
  positions.push({ x: rect.x + rect.width + gap, y: rect.y + rect.height + gap })
  positions.push({ x: rect.x - roomWidth - gap, y: rect.y - roomHeight - gap })
  
  return positions
}

function isPositionValid(
  pos: Point,
  width: number,
  height: number,
  occupied: Set<string>,
  gridWidth: number,
  gridHeight: number
): boolean {
  // Check bounds
  if (pos.x < 0 || pos.y < 0) return false
  if (pos.x + width >= gridWidth || pos.y + height >= gridHeight) return false
  
  // Check no overlap with occupied cells
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      if (occupied.has(`${pos.x + dx},${pos.y + dy}`)) {
        return false
      }
    }
  }
  
  return true
}

function scorePosition(
  pos: Point,
  width: number,
  height: number,
  connectedRooms: PlacedRoom[],
  pattern: LayoutPattern,
  gridWidth: number,
  gridHeight: number,
  room?: { zone?: string; importance?: string }
): number {
  let score = 100
  
  const centerX = pos.x + width / 2
  const centerY = pos.y + height / 2
  
  // Prefer positions close to connected rooms
  for (const connected of connectedRooms) {
    const connCenterX = connected.rect.x + connected.rect.width / 2
    const connCenterY = connected.rect.y + connected.rect.height / 2
    const dist = Math.sqrt((centerX - connCenterX) ** 2 + (centerY - connCenterY) ** 2)
    score -= dist * 0.5
  }
  
  // Apply pattern preferences
  const gridCenterX = gridWidth / 2
  const gridCenterY = gridHeight / 2
  
  // Zone-based placement for ships (bow = left, stern = right)
  if (pattern === 'linear' && room?.zone) {
    const normalizedX = centerX / gridWidth // 0 = bow, 1 = stern
    
    switch (room.zone) {
      case 'command':
        // Command (bridge) should be at bow (left side)
        score += (1 - normalizedX) * 40  // Higher score for lower X
        break
      case 'engineering':
      case 'power':
        // Engineering should be at stern (right side)
        score += normalizedX * 40  // Higher score for higher X
        break
      case 'habitation':
      case 'medical':
      case 'social':
        // Habitation in the middle
        score += (1 - Math.abs(normalizedX - 0.5) * 2) * 25
        break
      case 'cargo':
      case 'docking':
        // Cargo/docking toward stern but not at the end
        score += normalizedX * 0.6 * 30
        break
    }
    
    // For ships: prefer positions near the center Y axis (spine)
    const distFromSpine = Math.abs(centerY - gridCenterY)
    score -= distFromSpine * 2  // Penalty for being far from spine
  }
  
  switch (pattern) {
    case 'linear':
      // Prefer horizontal alignment along spine
      score += 20 - Math.abs(centerY - gridCenterY) * 1.5
      // Slight preference for elongated shape
      score -= Math.abs(centerX - gridCenterX) * 0.1
      break
    case 'hub':
      // Prefer positions around center for hub
      const distFromCenter = Math.sqrt((centerX - gridCenterX) ** 2 + (centerY - gridCenterY) ** 2)
      score += 30 - distFromCenter * 0.5
      break
    case 'grid':
      // Prefer aligned positions
      score += 10 - (pos.x % 5) - (pos.y % 5)
      break
  }
  
  return score
}

// ============================================================================
// PORT CALCULATION
// ============================================================================

function calculatePorts(
  room: LayoutRoom,
  rect: Rect,
  allRooms: PlacedRoom[],
  connectors: GraphConnector[]
): Port[] {
  const ports: Port[] = []
  
  // Find all connectors for this room
  const roomConnectors = connectors.filter(
    c => c.fromRoomId === room.id || c.toRoomId === room.id
  )
  
  for (const connector of roomConnectors) {
    const otherRoomId = connector.fromRoomId === room.id ? connector.toRoomId : connector.fromRoomId
    const otherRoom = allRooms.find(p => p.room.id === otherRoomId)
    
    if (!otherRoom) continue
    
    // Determine which wall faces the other room
    const port = calculatePortToRoom(rect, otherRoom.rect, connector.id)
    if (port) {
      ports.push(port)
    }
  }
  
  return ports
}

function calculatePortToRoom(fromRect: Rect, toRect: Rect, connectorId: string): Port | null {
  const fromCenterX = fromRect.x + fromRect.width / 2
  const fromCenterY = fromRect.y + fromRect.height / 2
  const toCenterX = toRect.x + toRect.width / 2
  const toCenterY = toRect.y + toRect.height / 2
  
  const dx = toCenterX - fromCenterX
  const dy = toCenterY - fromCenterY
  
  let wall: 'top' | 'bottom' | 'left' | 'right'
  let x: number
  let y: number
  
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      wall = 'right'
      x = (fromRect.x + fromRect.width) * GRID_SIZE
      y = (fromRect.y + fromRect.height / 2) * GRID_SIZE
    } else {
      wall = 'left'
      x = fromRect.x * GRID_SIZE
      y = (fromRect.y + fromRect.height / 2) * GRID_SIZE
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      wall = 'bottom'
      x = (fromRect.x + fromRect.width / 2) * GRID_SIZE
      y = (fromRect.y + fromRect.height) * GRID_SIZE
    } else {
      wall = 'top'
      x = (fromRect.x + fromRect.width / 2) * GRID_SIZE
      y = fromRect.y * GRID_SIZE
    }
  }
  
  return {
    id: `port-${connectorId}`,
    x,
    y,
    wall,
    connectorId
  }
}

// ============================================================================
// SPINE-AWARE CONNECTOR ROUTING
// ============================================================================

/**
 * Route connectors using spine structure as the backbone
 * 
 * Strategy:
 * 1. First, create corridors along spine segments
 * 2. Then route each room connection via the nearest spine node
 * 3. This creates a tree-like structure instead of spaghetti
 */
function routeConnectorsWithSpine(
  connectors: GraphConnector[],
  placedRooms: PlacedRoom[],
  gridWidth: number,
  gridHeight: number,
  spine: SpineStructure,
  request: GenerationRequest,
  rng: SeededRNG
): LayoutConnector[] {
  const layoutConnectors: LayoutConnector[] = []
  
  // Calculate spine offset to center it in grid
  const spineOffsetX = Math.floor((gridWidth - spine.bounds.width) / 2)
  const spineOffsetY = Math.floor((gridHeight - spine.bounds.height) / 2)
  
  // Build spine corridor paths - these form the backbone
  const spinePaths: Point[][] = []
  
  for (const segment of spine.segments) {
    if (!segment.isSpine) continue  // Only main spine segments
    
    const fromNode = spine.nodes.find(n => n.id === segment.from)
    const toNode = spine.nodes.find(n => n.id === segment.to)
    if (!fromNode || !toNode) continue
    
    const fromWorld = {
      x: (fromNode.position.x + spineOffsetX) * GRID_SIZE,
      y: (fromNode.position.y + spineOffsetY) * GRID_SIZE
    }
    const toWorld = {
      x: (toNode.position.x + spineOffsetX) * GRID_SIZE,
      y: (toNode.position.y + spineOffsetY) * GRID_SIZE
    }
    
    spinePaths.push([fromWorld, toWorld])
  }
  
  // Create existing paths from spine for reuse in A*
  const existingPaths: Point[][] = [...spinePaths]
  
  // Sort connectors: backbone first, then by distance
  const sortedConnectors = [...connectors].sort((a, b) => {
    if (a.isBackbone && !b.isBackbone) return -1
    if (!a.isBackbone && b.isBackbone) return 1
    
    const aFrom = placedRooms.find(p => p.room.id === a.fromRoomId)
    const aTo = placedRooms.find(p => p.room.id === a.toRoomId)
    const bFrom = placedRooms.find(p => p.room.id === b.fromRoomId)
    const bTo = placedRooms.find(p => p.room.id === b.toRoomId)
    
    if (aFrom && aTo && bFrom && bTo) {
      const aDist = Math.abs(aFrom.rect.x - aTo.rect.x) + Math.abs(aFrom.rect.y - aTo.rect.y)
      const bDist = Math.abs(bFrom.rect.x - bTo.rect.x) + Math.abs(bFrom.rect.y - bTo.rect.y)
      return aDist - bDist
    }
    return 0
  })
  
  for (const connector of sortedConnectors) {
    const fromRoom = placedRooms.find(p => p.room.id === connector.fromRoomId)
    const toRoom = placedRooms.find(p => p.room.id === connector.toRoomId)
    
    if (!fromRoom || !toRoom) continue
    
    // Find ports
    const fromPort = fromRoom.room.ports.find(p => p.connectorId === connector.id)
    const toPort = toRoom.room.ports.find(p => p.connectorId === connector.id)
    
    if (!fromPort || !toPort) continue
    
    // Route via spine if rooms are not adjacent
    const path = routeViaSpine(
      { x: fromPort.x, y: fromPort.y },
      { x: toPort.x, y: toPort.y },
      fromPort.wall,
      toPort.wall,
      spine,
      spineOffsetX,
      spineOffsetY,
      placedRooms,
      gridWidth,
      gridHeight,
      existingPaths
    )
    
    layoutConnectors.push({
      id: connector.id,
      fromRoomId: connector.fromRoomId,
      toRoomId: connector.toRoomId,
      kind: connector.kind,
      path: simplifyPath(path),
      width: CORRIDOR_WIDTH * GRID_SIZE
    })
    
    // Add this path to existing paths for reuse
    existingPaths.push(path)
  }
  
  return layoutConnectors
}

/**
 * Route a corridor via the spine structure
 */
function routeViaSpine(
  from: Point,
  to: Point,
  fromWall: 'top' | 'bottom' | 'left' | 'right',
  toWall: 'top' | 'bottom' | 'left' | 'right',
  spine: SpineStructure,
  spineOffsetX: number,
  spineOffsetY: number,
  rooms: PlacedRoom[],
  gridWidth: number,
  gridHeight: number,
  existingPaths: Point[][]
): Point[] {
  const extendDist = GRID_SIZE * 1.5
  
  // Extend out from walls
  let p1 = { x: from.x, y: from.y }
  let p2 = { x: to.x, y: to.y }
  
  switch (fromWall) {
    case 'left': p1.x -= extendDist; break
    case 'right': p1.x += extendDist; break
    case 'top': p1.y -= extendDist; break
    case 'bottom': p1.y += extendDist; break
  }
  
  switch (toWall) {
    case 'left': p2.x -= extendDist; break
    case 'right': p2.x += extendDist; break
    case 'top': p2.y -= extendDist; break
    case 'bottom': p2.y += extendDist; break
  }
  
  // Find nearest spine node to each point
  const nearestSpineFrom = findNearestSpineNode(p1, spine, spineOffsetX, spineOffsetY)
  const nearestSpineTo = findNearestSpineNode(p2, spine, spineOffsetX, spineOffsetY)
  
  // If both points are close to the same spine node, route directly
  const distBetweenRooms = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y)
  const distFromToSpine = nearestSpineFrom ? 
    Math.abs(p1.x - nearestSpineFrom.x) + Math.abs(p1.y - nearestSpineFrom.y) : Infinity
  const distToToSpine = nearestSpineTo ?
    Math.abs(p2.x - nearestSpineTo.x) + Math.abs(p2.y - nearestSpineTo.y) : Infinity
  
  // If rooms are close together, route directly
  if (distBetweenRooms < GRID_SIZE * 6) {
    return calculateConnectorPathDirect(from, to, fromWall, toWall, rooms, gridWidth, gridHeight, existingPaths)
  }
  
  // Route via spine:
  // from -> p1 -> spine_from -> (along spine) -> spine_to -> p2 -> to
  const path: Point[] = [from, p1]
  
  if (nearestSpineFrom && nearestSpineTo) {
    // Route to spine
    if (Math.abs(p1.x - nearestSpineFrom.x) > GRID_SIZE || 
        Math.abs(p1.y - nearestSpineFrom.y) > GRID_SIZE) {
      // L-shape to spine
      path.push({ x: nearestSpineFrom.x, y: p1.y })
      path.push(nearestSpineFrom)
    }
    
    // Along spine (if different nodes)
    if (Math.abs(nearestSpineFrom.x - nearestSpineTo.x) > GRID_SIZE ||
        Math.abs(nearestSpineFrom.y - nearestSpineTo.y) > GRID_SIZE) {
      // Find path along spine between nodes
      const spinePath = findSpinePath(nearestSpineFrom, nearestSpineTo, spine, spineOffsetX, spineOffsetY)
      path.push(...spinePath)
    }
    
    // Route from spine to target
    if (Math.abs(p2.x - nearestSpineTo.x) > GRID_SIZE ||
        Math.abs(p2.y - nearestSpineTo.y) > GRID_SIZE) {
      path.push(nearestSpineTo)
      path.push({ x: nearestSpineTo.x, y: p2.y })
    }
  }
  
  path.push(p2, to)
  
  return simplifyPath(path)
}

/**
 * Find the nearest spine node to a point
 */
function findNearestSpineNode(
  point: Point,
  spine: SpineStructure,
  offsetX: number,
  offsetY: number
): Point | null {
  let nearest: Point | null = null
  let nearestDist = Infinity
  
  for (const node of spine.nodes) {
    const nodeWorld = {
      x: (node.position.x + offsetX) * GRID_SIZE,
      y: (node.position.y + offsetY) * GRID_SIZE
    }
    
    const dist = Math.abs(point.x - nodeWorld.x) + Math.abs(point.y - nodeWorld.y)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = nodeWorld
    }
  }
  
  return nearest
}

/**
 * Find a path along the spine between two points
 */
function findSpinePath(
  from: Point,
  to: Point,
  spine: SpineStructure,
  offsetX: number,
  offsetY: number
): Point[] {
  // Simple: just return intermediate spine nodes between from and to
  // For now, return a direct connection (spine segments are already straight)
  
  // For more complex spines (loops, branches), would need BFS/DFS
  // For MVP, return direct L-path along spine
  const path: Point[] = []
  
  // Prefer horizontal movement along spine
  if (Math.abs(from.x - to.x) > GRID_SIZE) {
    path.push({ x: to.x, y: from.y })
  }
  
  return path
}

/**
 * Calculate direct path between ports (for close rooms)
 */
function calculateConnectorPathDirect(
  from: Point,
  to: Point,
  fromWall: 'top' | 'bottom' | 'left' | 'right',
  toWall: 'top' | 'bottom' | 'left' | 'right',
  rooms: PlacedRoom[],
  gridWidth: number,
  gridHeight: number,
  existingPaths: Point[][] = []
): Point[] {
  const extendDist = GRID_SIZE * 1.5
  
  let p1 = { x: from.x, y: from.y }
  let p2 = { x: to.x, y: to.y }
  
  switch (fromWall) {
    case 'left': p1.x -= extendDist; break
    case 'right': p1.x += extendDist; break
    case 'top': p1.y -= extendDist; break
    case 'bottom': p1.y += extendDist; break
  }
  
  switch (toWall) {
    case 'left': p2.x -= extendDist; break
    case 'right': p2.x += extendDist; break
    case 'top': p2.y -= extendDist; break
    case 'bottom': p2.y += extendDist; break
  }
  
  // Use A* pathfinding
  const astarPath = findPathWithAStar(p1, p2, rooms, GRID_SIZE, existingPaths)
  
  const path: Point[] = [from, p1, ...astarPath.slice(1, -1), p2, to]
  
  return simplifyPath(path)
}

// ============================================================================
// CONNECTOR ROUTING (Legacy - kept for reference)
// ============================================================================

function routeConnectors(
  connectors: GraphConnector[],
  placedRooms: PlacedRoom[],
  gridWidth: number,
  gridHeight: number,
  request: GenerationRequest,
  rng: SeededRNG
): LayoutConnector[] {
  const layoutConnectors: LayoutConnector[] = []
  
  // For ships, create a main spine corridor along the horizontal center
  const isShip = request.archetype === 'ship'
  const spineY = Math.floor(gridHeight / 2) * GRID_SIZE
  
  // Build existing paths for reuse - start with spine for ships
  const existingPaths: Point[][] = []
  
  if (isShip && placedRooms.length > 0) {
    // Find leftmost and rightmost rooms
    let minX = Infinity, maxX = -Infinity
    for (const placed of placedRooms) {
      const roomLeft = placed.room.x
      const roomRight = placed.room.x + placed.room.width
      if (roomLeft < minX) minX = roomLeft
      if (roomRight > maxX) maxX = roomRight
    }
    
    // Create main spine path
    const spinePath: Point[] = [
      { x: minX - GRID_SIZE * 2, y: spineY },
      { x: maxX + GRID_SIZE * 2, y: spineY }
    ]
    existingPaths.push(spinePath)
  }
  
  // Sort connectors: backbone first, then by distance (shorter first for better reuse)
  const sortedConnectors = [...connectors].sort((a, b) => {
    // Backbone corridors first
    if (a.isBackbone && !b.isBackbone) return -1
    if (!a.isBackbone && b.isBackbone) return 1
    
    // Then by estimated distance (prefer shorter corridors first)
    const aFrom = placedRooms.find(p => p.room.id === a.fromRoomId)
    const aTo = placedRooms.find(p => p.room.id === a.toRoomId)
    const bFrom = placedRooms.find(p => p.room.id === b.fromRoomId)
    const bTo = placedRooms.find(p => p.room.id === b.toRoomId)
    
    if (aFrom && aTo && bFrom && bTo) {
      const aDist = Math.abs(aFrom.rect.x - aTo.rect.x) + Math.abs(aFrom.rect.y - aTo.rect.y)
      const bDist = Math.abs(bFrom.rect.x - bTo.rect.x) + Math.abs(bFrom.rect.y - bTo.rect.y)
      return aDist - bDist
    }
    return 0
  })
  
  for (const connector of sortedConnectors) {
    const fromRoom = placedRooms.find(p => p.room.id === connector.fromRoomId)
    const toRoom = placedRooms.find(p => p.room.id === connector.toRoomId)
    
    if (!fromRoom || !toRoom) continue
    
    // Find ports
    const fromPort = fromRoom.room.ports.find(p => p.connectorId === connector.id)
    const toPort = toRoom.room.ports.find(p => p.connectorId === connector.id)
    
    if (!fromPort || !toPort) continue
    
    // Calculate path with reuse bonus from existing corridors
    // Backbone corridors get less reuse bonus (they define the main routes)
    const path = calculateConnectorPath(
      { x: fromPort.x, y: fromPort.y },
      { x: toPort.x, y: toPort.y },
      fromPort.wall,
      toPort.wall,
      placedRooms,
      gridWidth,
      gridHeight,
      connector.isBackbone ? [] : existingPaths  // Backbone doesn't reuse, others do
    )
    
    layoutConnectors.push({
      id: connector.id,
      fromRoomId: connector.fromRoomId,
      toRoomId: connector.toRoomId,
      kind: connector.kind,
      path: simplifyPath(path),
      width: CORRIDOR_WIDTH * GRID_SIZE
    })
    
    // Add this path to existing paths for next connectors to reuse
    existingPaths.push(path)
  }
  
  return layoutConnectors
}

function calculateConnectorPath(
  from: Point,
  to: Point,
  fromWall: 'top' | 'bottom' | 'left' | 'right',
  toWall: 'top' | 'bottom' | 'left' | 'right',
  rooms: PlacedRoom[],
  gridWidth: number,
  gridHeight: number,
  existingPaths: Point[][] = []
): Point[] {
  // Extend out from walls first
  const extendDist = GRID_SIZE * 1.5
  
  let p1 = { x: from.x, y: from.y }
  let p2 = { x: to.x, y: to.y }
  
  // Extend from starting wall
  switch (fromWall) {
    case 'left': p1.x -= extendDist; break
    case 'right': p1.x += extendDist; break
    case 'top': p1.y -= extendDist; break
    case 'bottom': p1.y += extendDist; break
  }
  
  // Extend from ending wall
  switch (toWall) {
    case 'left': p2.x -= extendDist; break
    case 'right': p2.x += extendDist; break
    case 'top': p2.y -= extendDist; break
    case 'bottom': p2.y += extendDist; break
  }

  // Use A* pathfinding between p1 and p2 that avoids rooms
  const astarPath = findPathWithAStar(p1, p2, rooms, GRID_SIZE, existingPaths)
  
  // Build final path: from -> p1 -> astarPath -> p2 -> to
  const path: Point[] = [{ x: from.x, y: from.y }, { x: p1.x, y: p1.y }, ...astarPath.slice(1, -1), { x: p2.x, y: p2.y }, { x: to.x, y: to.y }]
  
  return simplifyPath(path)
}

// A* pathfinding implementation for corridors
function findPathWithAStar(
  start: Point,
  end: Point,
  rooms: PlacedRoom[],
  cellSize: number,
  existingPaths: Point[][] = []
): Point[] {
  const padding = cellSize * CORRIDOR_CLEARANCE
  
  // Build a set of existing corridor points for reuse bonus
  const reusePointSet = new Set<string>()
  const proximityPointSet = new Set<string>() // Points adjacent to corridors
  const REUSE_TOLERANCE = cellSize * 0.75 // Points within this distance count as reusable
  
  for (const path of existingPaths) {
    for (const p of path) {
      // Snap to grid for lookup
      const gx = Math.round(p.x / cellSize)
      const gy = Math.round(p.y / cellSize)
      reusePointSet.add(`${gx},${gy}`)
      
      // Add adjacent cells for proximity bonus
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        proximityPointSet.add(`${gx+dx},${gy+dy}`)
      }
    }
  }
  
  // Calculate grid bounds
  const allPoints = [start, end, ...rooms.flatMap(r => [
    { x: r.rect.x * GRID_SIZE, y: r.rect.y * GRID_SIZE },
    { x: (r.rect.x + r.rect.width) * GRID_SIZE, y: (r.rect.y + r.rect.height) * GRID_SIZE },
  ])]
  
  const minX = Math.min(...allPoints.map(p => p.x)) - cellSize * 4
  const maxX = Math.max(...allPoints.map(p => p.x)) + cellSize * 4
  const minY = Math.min(...allPoints.map(p => p.y)) - cellSize * 4
  const maxY = Math.max(...allPoints.map(p => p.y)) + cellSize * 4
  
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
  
  // Check if a grid cell is blocked by any room
  // Excludes start and end cells to allow paths from/to ports
  const isBlocked = (gx: number, gy: number): boolean => {
    // Start and end are never blocked
    if (gx === gridStart.x && gy === gridStart.y) return false
    if (gx === gridEnd.x && gy === gridEnd.y) return false
    
    const worldPoint = toWorld(gx, gy)
    for (const placed of rooms) {
      const rx = placed.rect.x * GRID_SIZE
      const ry = placed.rect.y * GRID_SIZE
      const rw = placed.rect.width * GRID_SIZE
      const rh = placed.rect.height * GRID_SIZE
      
      if (worldPoint.x >= rx - padding && worldPoint.x <= rx + rw + padding &&
          worldPoint.y >= ry - padding && worldPoint.y <= ry + rh + padding) {
        return true
      }
    }
    return false
  }
  
  interface AStarNode {
    x: number
    y: number
    g: number
    h: number
    f: number
    parent: AStarNode | null
    turnCount: number
    direction: number // 0=none, 1=horizontal, 2=vertical
  }
  
  const openSet: AStarNode[] = []
  const closedSet = new Set<string>()
  
  const heuristic = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  
  const startNode: AStarNode = {
    x: gridStart.x,
    y: gridStart.y,
    g: 0,
    h: heuristic(gridStart, gridEnd),
    f: heuristic(gridStart, gridEnd),
    parent: null,
    turnCount: 0,
    direction: 0
  }
  
  openSet.push(startNode)
  
  const directions = [
    { dx: 0, dy: -1, dir: 2 }, // Up (vertical)
    { dx: 1, dy: 0, dir: 1 },  // Right (horizontal)
    { dx: 0, dy: 1, dir: 2 },  // Down (vertical)
    { dx: -1, dy: 0, dir: 1 }, // Left (horizontal)
  ]
  
  let iterations = 0
  const maxIterations = 5000
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++
    
    // Find node with lowest f
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()!
    
    // Reached goal?
    if (current.x === gridEnd.x && current.y === gridEnd.y) {
      // Reconstruct path
      const path: Point[] = []
      let node: AStarNode | null = current
      while (node) {
        path.unshift(toWorld(node.x, node.y))
        node = node.parent
      }
      return simplifyAStarPath(path)
    }
    
    closedSet.add(`${current.x},${current.y}`)
    
    // Explore neighbors
    for (const d of directions) {
      const nx = current.x + d.dx
      const ny = current.y + d.dy
      const key = `${nx},${ny}`
      
      if (closedSet.has(key)) continue
      if (isBlocked(nx, ny)) continue
      
      // Add turn penalty for direction changes (higher to discourage zigzags)
      const turnPenalty = (current.direction !== 0 && current.direction !== d.dir) ? 8 : 0
      
      // Reuse bonus: if this point is on an existing corridor (especially spine)
      let reuseBonus = 0
      if (reusePointSet.has(key)) {
        reuseBonus = -8  // Very strong bonus for exact reuse (spine or existing corridor)
      } else if (proximityPointSet.has(key)) {
        reuseBonus = -2  // Bonus for being adjacent to corridor
      }
      
      // For ships: slight preference for horizontal movement (along spine)
      // This makes corridors prefer to run along the ship's length
      const directionBonus = (d.dir === 1) ? -0.5 : 0  // Horizontal is slightly cheaper
      
      const g = current.g + 1 + turnPenalty + reuseBonus + directionBonus
      const h = heuristic({ x: nx, y: ny }, gridEnd)
      const f = g + h
      
      // Check if already in open set with better score
      const existing = openSet.find(n => n.x === nx && n.y === ny)
      if (existing) {
        if (g < existing.g) {
          existing.g = g
          existing.f = f
          existing.parent = current
          existing.direction = d.dir
          existing.turnCount = current.turnCount + (turnPenalty > 0 ? 1 : 0)
        }
      } else {
        openSet.push({
          x: nx,
          y: ny,
          g,
          h,
          f,
          parent: current,
          direction: d.dir,
          turnCount: current.turnCount + (turnPenalty > 0 ? 1 : 0)
        })
      }
    }
  }
  
  // Fallback to L-shaped path if A* fails
  return generateFallbackLPath(start, end, rooms)
}

// Simplify path by removing collinear points
function simplifyAStarPath(path: Point[]): Point[] {
  if (path.length <= 2) return path
  
  const result: Point[] = [path[0]]
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = path[i]
    const next = path[i + 1]
    
    // Check if direction changes (not collinear)
    const dx1 = Math.sign(curr.x - prev.x)
    const dy1 = Math.sign(curr.y - prev.y)
    const dx2 = Math.sign(next.x - curr.x)
    const dy2 = Math.sign(next.y - curr.y)
    
    if (dx1 !== dx2 || dy1 !== dy2) {
      result.push(curr)
    }
  }
  
  result.push(path[path.length - 1])
  return result
}

// Fallback L-shaped path generation
function generateFallbackLPath(start: Point, end: Point, rooms: PlacedRoom[]): Point[] {
  // Try L-shape horizontal first
  const mid1: Point = { x: end.x, y: start.y }
  if (!pathIntersectsRooms([start, mid1, end], rooms)) {
    return [start, mid1, end]
  }
  
  // Try L-shape vertical first
  const mid2: Point = { x: start.x, y: end.y }
  if (!pathIntersectsRooms([start, mid2, end], rooms)) {
    return [start, mid2, end]
  }
  
  // Try Z-shapes
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  
  const zPath1 = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
  if (!pathIntersectsRooms(zPath1, rooms)) return zPath1
  
  const zPath2 = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  if (!pathIntersectsRooms(zPath2, rooms)) return zPath2
  
  // Last resort: direct path
  return [start, end]
}

// Check if path segments intersect any rooms
function pathIntersectsRooms(path: Point[], rooms: PlacedRoom[]): boolean {
  const padding = GRID_SIZE * CORRIDOR_CLEARANCE
  
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    
    for (const placed of rooms) {
      const rx = placed.rect.x * GRID_SIZE - padding
      const ry = placed.rect.y * GRID_SIZE - padding
      const rw = placed.rect.width * GRID_SIZE + padding * 2
      const rh = placed.rect.height * GRID_SIZE + padding * 2
      
      if (lineIntersectsRectangle(p1, p2, rx, ry, rw, rh)) {
        return true
      }
    }
  }
  return false
}

// Check if line segment intersects rectangle
function lineIntersectsRectangle(
  p1: Point,
  p2: Point,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  // Check if either endpoint is inside the rectangle
  if (p1.x >= rx && p1.x <= rx + rw && p1.y >= ry && p1.y <= ry + rh) return true
  if (p2.x >= rx && p2.x <= rx + rw && p2.y >= ry && p2.y <= ry + rh) return true
  
  // Check intersection with each edge using Cohen-Sutherland
  const left = rx
  const right = rx + rw
  const top = ry
  const bottom = ry + rh
  
  // Line segment parameterized as p1 + t*(p2-p1), t in [0,1]
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  
  // Check intersections with vertical edges
  if (dx !== 0) {
    const tLeft = (left - p1.x) / dx
    if (tLeft >= 0 && tLeft <= 1) {
      const y = p1.y + tLeft * dy
      if (y >= top && y <= bottom) return true
    }
    const tRight = (right - p1.x) / dx
    if (tRight >= 0 && tRight <= 1) {
      const y = p1.y + tRight * dy
      if (y >= top && y <= bottom) return true
    }
  }
  
  // Check intersections with horizontal edges
  if (dy !== 0) {
    const tTop = (top - p1.y) / dy
    if (tTop >= 0 && tTop <= 1) {
      const x = p1.x + tTop * dx
      if (x >= left && x <= right) return true
    }
    const tBottom = (bottom - p1.y) / dy
    if (tBottom >= 0 && tBottom <= 1) {
      const x = p1.x + tBottom * dx
      if (x >= left && x <= right) return true
    }
  }
  
  return false
}

// ============================================================================
// JUNCTION GENERATION
// ============================================================================

function generateJunctions(
  connectors: LayoutConnector[],
  rooms: PlacedRoom[],
  request: GenerationRequest,
  rng: SeededRNG
): Junction[] {
  const junctions: Junction[] = []
  const junctionPoints = new Map<string, { x: number; y: number; connectorIds: string[] }>()
  
  // Find intersection points between corridors
  for (let i = 0; i < connectors.length; i++) {
    for (let j = i + 1; j < connectors.length; j++) {
      const intersections = findPathIntersections(connectors[i].path, connectors[j].path)
      
      for (const point of intersections) {
        const key = `${Math.round(point.x / GRID_SIZE)},${Math.round(point.y / GRID_SIZE)}`
        
        if (junctionPoints.has(key)) {
          const existing = junctionPoints.get(key)!
          if (!existing.connectorIds.includes(connectors[i].id)) {
            existing.connectorIds.push(connectors[i].id)
          }
          if (!existing.connectorIds.includes(connectors[j].id)) {
            existing.connectorIds.push(connectors[j].id)
          }
        } else {
          junctionPoints.set(key, {
            x: point.x,
            y: point.y,
            connectorIds: [connectors[i].id, connectors[j].id]
          })
        }
      }
    }
  }
  
  // Convert to junctions
  let junctionIndex = 0
  for (const [key, data] of junctionPoints) {
    if (data.connectorIds.length >= 2) {
      junctions.push({
        id: generateStableId('jct', request.seed, junctionIndex++),
        x: data.x,
        y: data.y,
        connectorIds: data.connectorIds,
        type: data.connectorIds.length > 2 ? 'cross' : 'tee'
      })
    }
  }
  
  return junctions
}

function findPathIntersections(path1: Point[], path2: Point[]): Point[] {
  const intersections: Point[] = []
  
  for (let i = 0; i < path1.length - 1; i++) {
    for (let j = 0; j < path2.length - 1; j++) {
      const intersection = lineIntersection(
        path1[i], path1[i + 1],
        path2[j], path2[j + 1]
      )
      
      if (intersection) {
        intersections.push(intersection)
      }
    }
  }
  
  return intersections
}

function lineIntersection(
  p1: Point, p2: Point,
  p3: Point, p4: Point
): Point | null {
  const x1 = p1.x, y1 = p1.y
  const x2 = p2.x, y2 = p2.y
  const x3 = p3.x, y3 = p3.y
  const x4 = p4.x, y4 = p4.y
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  
  if (Math.abs(denom) < 0.0001) return null // Parallel
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
  
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    }
  }
  
  return null
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface LayoutValidation {
  valid: boolean
  issues: string[]
}

export function validateLayout(layouts: DeckLayout[]): LayoutValidation {
  const issues: string[] = []
  
  for (const layout of layouts) {
    // Check all rooms are placed
    if (layout.rooms.length === 0) {
      issues.push(`Deck ${layout.deckIndex} has no rooms placed`)
    }
    
    // Check for room overlaps
    for (let i = 0; i < layout.rooms.length; i++) {
      for (let j = i + 1; j < layout.rooms.length; j++) {
        const a = layout.rooms[i]
        const b = layout.rooms[j]
        
        if (roomsOverlap(a, b)) {
          issues.push(`Rooms ${a.id} and ${b.id} overlap on deck ${layout.deckIndex}`)
        }
      }
    }
    
    // Check connectors have valid paths
    for (const connector of layout.connectors) {
      if (connector.path.length < 2) {
        issues.push(`Connector ${connector.id} has invalid path`)
      }
    }
  }
  
  return {
    valid: issues.length === 0,
    issues
  }
}

function roomsOverlap(a: LayoutRoom, b: LayoutRoom): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}




function simplifyPath(path: Point[]): Point[] {
  if (!path || path.length <= 2) return path

  const snapped = path.map(p => ({
    x: Math.round(p.x / SNAP_STEP) * SNAP_STEP,
    y: Math.round(p.y / SNAP_STEP) * SNAP_STEP
  }))

  const result: Point[] = [snapped[0]]

  for (let i = 1; i < snapped.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = snapped[i]
    const next = snapped[i + 1]

    const dx1 = Math.sign(curr.x - prev.x)
    const dy1 = Math.sign(curr.y - prev.y)
    const dx2 = Math.sign(next.x - curr.x)
    const dy2 = Math.sign(next.y - curr.y)

    if (dx1 !== dx2 || dy1 !== dy2) {
      result.push(curr)
    }
  }

  result.push(snapped[snapped.length - 1])

  return result.filter((p, idx, arr) => idx === 0 || p.x !== arr[idx - 1].x || p.y !== arr[idx - 1].y)
}

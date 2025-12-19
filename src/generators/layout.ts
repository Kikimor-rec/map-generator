/**
 * Layout Geometry Generator
 * Stage 4-5 of the generation pipeline: Position rooms and route connectors
 * Based on specification from 05_layout_geometry.md
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

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE = 40 // Base grid unit in pixels
const MIN_ROOM_GAP = 3 // Minimum tiles between rooms (enough for corridor)
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
  // Use smaller multiplier (2.5) for more compact layout
  const gridDimension = Math.ceil(Math.sqrt(totalTiles * 2.5))
  
  // Minimum size based on number of rooms (smaller for fewer rooms)
  const minSize = Math.max(15, Math.ceil(rooms.length * 2))
  const gridWidth = Math.max(minSize, gridDimension)
  const gridHeight = Math.max(minSize, gridDimension)
  
  // Phase 2: Place rooms using grammar-based placement
  const placedRooms = placeRooms(rooms, connectors, gridWidth, gridHeight, request, rng)
  
  // Phase 3: Calculate ports for each room
  for (const placed of placedRooms) {
    placed.room.ports = calculatePorts(placed.room, placed.rect, placedRooms, connectors)
  }
  
  // Phase 4: Route connectors between rooms
  const layoutConnectors = routeConnectors(
    connectors,
    placedRooms,
    gridWidth,
    gridHeight,
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
  // For first room, place near center
  if (placed.length === 0) {
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
          const score = scorePosition(pos, width, height, connectedPlaced, pattern, gridWidth, gridHeight)
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
        const score = scorePosition(pos, width, height, connectedPlaced, pattern, gridWidth, gridHeight)
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
  gridHeight: number
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
  
  switch (pattern) {
    case 'linear':
      // Prefer horizontal alignment
      score += 20 - Math.abs(centerY - gridCenterY)
      break
    case 'hub':
      // Prefer positions around center
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
// CONNECTOR ROUTING
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
  
  for (const connector of connectors) {
    const fromRoom = placedRooms.find(p => p.room.id === connector.fromRoomId)
    const toRoom = placedRooms.find(p => p.room.id === connector.toRoomId)
    
    if (!fromRoom || !toRoom) continue
    
    // Find ports
    const fromPort = fromRoom.room.ports.find(p => p.connectorId === connector.id)
    const toPort = toRoom.room.ports.find(p => p.connectorId === connector.id)
    
    if (!fromPort || !toPort) continue
    
    // Calculate path
    const path = calculateConnectorPath(
      { x: fromPort.x, y: fromPort.y },
      { x: toPort.x, y: toPort.y },
      fromPort.wall,
      toPort.wall,
      placedRooms,
      gridWidth,
      gridHeight
    )
    
    layoutConnectors.push({
      id: connector.id,
      fromRoomId: connector.fromRoomId,
      toRoomId: connector.toRoomId,
      kind: connector.kind,
      path: simplifyPath(path),
      width: CORRIDOR_WIDTH * GRID_SIZE
    })
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
  gridHeight: number
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
  const astarPath = findPathWithAStar(p1, p2, rooms, GRID_SIZE)
  
  // Build final path: from -> p1 -> astarPath -> p2 -> to
  const path: Point[] = [{ x: from.x, y: from.y }, { x: p1.x, y: p1.y }, ...astarPath.slice(1, -1), { x: p2.x, y: p2.y }, { x: to.x, y: to.y }]
  
  return simplifyPath(path)
}

// A* pathfinding implementation for corridors
function findPathWithAStar(
  start: Point,
  end: Point,
  rooms: PlacedRoom[],
  cellSize: number
): Point[] {
  const padding = cellSize * CORRIDOR_CLEARANCE
  
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
      
      // Add turn penalty for direction changes
      const turnPenalty = (current.direction !== 0 && current.direction !== d.dir) ? 5 : 0
      const g = current.g + 1 + turnPenalty
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

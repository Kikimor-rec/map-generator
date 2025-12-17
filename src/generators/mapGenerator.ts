/**
 * Map Generation Algorithm
 * 
 * Implements BSP (Binary Space Partitioning) and graph-based generation
 * for creating logical spaceship/station layouts
 */

import { v4 as uuid } from 'uuid'
import {
  type Room,
  type Corridor,
  type Deck,
  type GenerationParams,
  type Rect,
  type Point,
  RoomType,
  ROOM_TYPE_CONFIGS,
  CorridorStyle,
  DoorType,
} from '@core/types'

// ============================================================================
// Random Utilities
// ============================================================================

class SeededRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280
    return this.seed / 233280
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)]
  }
}

// ============================================================================
// BSP Tree Node
// ============================================================================

interface BSPNode {
  bounds: Rect
  room?: Room
  left?: BSPNode
  right?: BSPNode
  splitVertical?: boolean
}

// ============================================================================
// Graph-based Generation
// ============================================================================

interface RoomNode {
  id: string
  type: RoomType
  connections: string[]
  placed: boolean
  bounds?: Rect
}

// ============================================================================
// Generation Engine
// ============================================================================

export class MapGenerator {
  private rng: SeededRandom
  private params: GenerationParams
  private gridSize: number

  constructor(params: GenerationParams, gridSize: number = 32) {
    this.params = params
    this.gridSize = gridSize
    this.rng = new SeededRandom(params.seed || Date.now())
  }

  /**
   * Generate a complete deck with rooms and corridors
   */
  generateDeck(deckLevel: number = 1): Deck {
    const nodes = this.generateGraph()
    const rooms = this.placeRooms(nodes, deckLevel)
    const corridors = this.connectRooms(rooms, nodes)

    return {
      id: uuid(),
      name: `Deck ${deckLevel}`,
      level: deckLevel,
      rooms,
      corridors,
    }
  }

  /**
   * Step 1: Generate a logical graph of rooms
   */
  private generateGraph(): RoomNode[] {
    const nodes: RoomNode[] = []
    const { roomCount, requiredRooms, roomDistribution, complexity, loopiness } = this.params

    // First, add required rooms
    for (const roomType of requiredRooms) {
      nodes.push({
        id: uuid(),
        type: roomType,
        connections: [],
        placed: false,
      })
    }

    // Calculate remaining rooms based on distribution
    const remainingCount = roomCount - nodes.length
    const fillerTypes = this.calculateFillerTypes(remainingCount, roomDistribution)

    for (const roomType of fillerTypes) {
      nodes.push({
        id: uuid(),
        type: roomType,
        connections: [],
        placed: false,
      })
    }

    // Shuffle nodes for randomness
    const shuffledNodes = this.rng.shuffle(nodes)

    // Build spanning tree (ensure connectivity)
    for (let i = 1; i < shuffledNodes.length; i++) {
      const targetIndex = this.rng.nextInt(0, i - 1)
      shuffledNodes[i].connections.push(shuffledNodes[targetIndex].id)
      shuffledNodes[targetIndex].connections.push(shuffledNodes[i].id)
    }

    // Add extra connections based on loopiness
    const extraConnections = Math.floor(shuffledNodes.length * loopiness)
    for (let i = 0; i < extraConnections; i++) {
      const a = this.rng.nextInt(0, shuffledNodes.length - 1)
      const b = this.rng.nextInt(0, shuffledNodes.length - 1)
      if (a !== b && !shuffledNodes[a].connections.includes(shuffledNodes[b].id)) {
        shuffledNodes[a].connections.push(shuffledNodes[b].id)
        shuffledNodes[b].connections.push(shuffledNodes[a].id)
      }
    }

    // Apply layout rules based on complexity
    this.applyLayoutRules(shuffledNodes, complexity)

    return shuffledNodes
  }

  /**
   * Calculate room types for remaining slots
   */
  private calculateFillerTypes(count: number, distribution: Partial<Record<RoomType, number>>): RoomType[] {
    const types: RoomType[] = []
    
    // Add rooms based on distribution percentages
    for (const [type, percentage] of Object.entries(distribution)) {
      const roomType = type as RoomType
      const roomCount = Math.round(count * (percentage / 100))
      for (let i = 0; i < roomCount; i++) {
        types.push(roomType)
      }
    }

    // Fill remaining with generic rooms
    const remaining = count - types.length
    const genericTypes = [
      RoomType.Storage,
      RoomType.Maintenance,
      RoomType.JefferiesTube,
      RoomType.Generic,
    ]

    for (let i = 0; i < remaining; i++) {
      types.push(this.rng.pick(genericTypes))
    }

    return this.rng.shuffle(types)
  }

  /**
   * Apply layout rules based on complexity
   */
  private applyLayoutRules(nodes: RoomNode[], complexity: 'linear' | 'branching' | 'complex') {
    // Find special rooms
    const bridge = nodes.find(n => n.type === RoomType.Bridge)
    const reactor = nodes.find(n => n.type === RoomType.Reactor)
    const engineering = nodes.find(n => n.type === RoomType.Engineering)
    const medbay = nodes.find(n => n.type === RoomType.Medbay)

    // Bridge should be terminal (1-2 connections only)
    if (bridge && bridge.connections.length > 2) {
      bridge.connections = bridge.connections.slice(0, 2)
    }

    // Engineering should connect to reactor
    if (engineering && reactor && !engineering.connections.includes(reactor.id)) {
      engineering.connections.push(reactor.id)
      reactor.connections.push(engineering.id)
    }

    // For linear layout, limit branching
    if (complexity === 'linear') {
      for (const node of nodes) {
        if (node.connections.length > 2) {
          node.connections = node.connections.slice(0, 2)
        }
      }
    }
  }

  /**
   * Step 2: Place rooms on the grid using BSP-like approach
   */
  private placeRooms(nodes: RoomNode[], deckLevel: number): Room[] {
    const rooms: Room[] = []
    const placedPositions: Rect[] = []
    
    // Calculate grid based on number of rooms
    const gridWidth = Math.ceil(Math.sqrt(nodes.length)) + 2
    const gridHeight = Math.ceil(nodes.length / gridWidth) + 2
    
    // Starting position
    let currentX = this.gridSize * 2
    let currentY = this.gridSize * 2
    let rowHeight = 0
    let column = 0

    for (const node of nodes) {
      const config = ROOM_TYPE_CONFIGS[node.type]
      
      // Calculate room size based on type
      const widthCells = this.rng.nextInt(config.minSize.width, config.maxSize.width)
      const heightCells = this.rng.nextInt(config.minSize.height, config.maxSize.height)
      const width = widthCells * this.gridSize
      const height = heightCells * this.gridSize

      // Check if we need to wrap to next row
      const maxRowWidth = gridWidth * this.gridSize * 4
      if (currentX + width > maxRowWidth) {
        currentX = this.gridSize * 2
        currentY += rowHeight + this.gridSize * 2
        rowHeight = 0
        column = 0
      }

      // Find non-overlapping position
      let bounds: Rect = {
        x: currentX,
        y: currentY,
        width,
        height,
      }

      // Ensure no overlap
      let attempts = 0
      while (this.hasOverlap(bounds, placedPositions) && attempts < 50) {
        bounds.x += this.gridSize
        if (bounds.x + bounds.width > maxRowWidth) {
          bounds.x = this.gridSize * 2
          bounds.y += this.gridSize
        }
        attempts++
      }

      // Create room
      const room: Room = {
        id: node.id,
        type: node.type,
        name: config.name,
        bounds,
        color: config.defaultColor,
        borderColor: config.borderColor,
        doors: [],
        objects: [],
        metadata: {},
        deckLevel,
        isVisible: true,
        isLocked: false,
      }

      rooms.push(room)
      placedPositions.push(bounds)
      node.bounds = bounds
      node.placed = true

      // Update position for next room
      currentX += width + this.gridSize * 2
      rowHeight = Math.max(rowHeight, height)
      column++
    }

    return rooms
  }

  /**
   * Check if a rect overlaps with any existing rects
   */
  private hasOverlap(rect: Rect, existing: Rect[]): boolean {
    const padding = this.gridSize
    for (const other of existing) {
      if (
        rect.x - padding < other.x + other.width &&
        rect.x + rect.width + padding > other.x &&
        rect.y - padding < other.y + other.height &&
        rect.y + rect.height + padding > other.y
      ) {
        return true
      }
    }
    return false
  }

  /**
   * Step 3: Connect rooms with corridors based on graph
   */
  private connectRooms(rooms: Room[], nodes: RoomNode[]): Corridor[] {
    const corridors: Corridor[] = []
    const processedPairs = new Set<string>()

    for (const node of nodes) {
      const room = rooms.find(r => r.id === node.id)
      if (!room) continue

      for (const connectedId of node.connections) {
        // Avoid duplicate corridors
        const pairKey = [node.id, connectedId].sort().join('-')
        if (processedPairs.has(pairKey)) continue
        processedPairs.add(pairKey)

        const connectedRoom = rooms.find(r => r.id === connectedId)
        if (!connectedRoom) continue

        const corridor = this.createCorridor(room, connectedRoom)
        corridors.push(corridor)

        // Add doors to rooms
        this.addDoorsToRooms(room, connectedRoom, corridor)
      }
    }

    return corridors
  }

  /**
   * Create a corridor between two rooms
   */
  private createCorridor(roomA: Room, roomB: Room): Corridor {
    const centerA = this.getRoomCenter(roomA)
    const centerB = this.getRoomCenter(roomB)

    // Create L-shaped corridor (orthogonal)
    const midX = this.rng.next() > 0.5 ? centerA.x : centerB.x
    const midY = this.rng.next() > 0.5 ? centerB.y : centerA.y

    // Snap to grid
    const snapX = Math.round(midX / this.gridSize) * this.gridSize
    const snapY = Math.round(midY / this.gridSize) * this.gridSize

    const segments = []

    // Horizontal segment from A
    if (Math.abs(centerA.x - snapX) > this.gridSize) {
      segments.push({
        start: { x: this.snapToGrid(centerA.x), y: this.snapToGrid(centerA.y) },
        end: { x: snapX, y: this.snapToGrid(centerA.y) },
      })
    }

    // Vertical segment
    if (Math.abs(centerA.y - snapY) > this.gridSize) {
      segments.push({
        start: { x: snapX, y: this.snapToGrid(centerA.y) },
        end: { x: snapX, y: snapY },
      })
    }

    // Connect to B
    segments.push({
      start: { x: snapX, y: snapY },
      end: { x: this.snapToGrid(centerB.x), y: this.snapToGrid(centerB.y) },
    })

    return {
      id: uuid(),
      style: this.getCorridorStyle(roomA, roomB),
      segments,
      width: this.gridSize,
      connectedRoomIds: [roomA.id, roomB.id],
      doors: [],
      deckLevel: roomA.deckLevel,
    }
  }

  /**
   * Get corridor style based on connected rooms
   */
  private getCorridorStyle(roomA: Room, roomB: Room): CorridorStyle {
    const importantTypes = [RoomType.Bridge, RoomType.CaptainQuarters, RoomType.OfficerQuarters]
    const maintenanceTypes = [RoomType.JefferiesTube, RoomType.Maintenance]

    if (importantTypes.includes(roomA.type) || importantTypes.includes(roomB.type)) {
      return CorridorStyle.VIP
    }
    if (maintenanceTypes.includes(roomA.type) || maintenanceTypes.includes(roomB.type)) {
      return CorridorStyle.Maintenance
    }
    return CorridorStyle.Standard
  }

  /**
   * Add doors to rooms at corridor connection points
   */
  private addDoorsToRooms(roomA: Room, roomB: Room, corridor: Corridor) {
    // Find closest wall points
    const doorA = this.findDoorPosition(roomA, this.getRoomCenter(roomB))
    const doorB = this.findDoorPosition(roomB, this.getRoomCenter(roomA))

    if (doorA) {
      roomA.doors.push({
        id: uuid(),
        type: this.getDoorType(roomA, roomB),
        position: doorA.position,
        rotation: doorA.rotation,
        width: this.gridSize,
        isOpen: false,
        isLocked: false,
        securityLevel: 0,
      })
    }

    if (doorB) {
      roomB.doors.push({
        id: uuid(),
        type: this.getDoorType(roomB, roomA),
        position: doorB.position,
        rotation: doorB.rotation,
        width: this.gridSize,
        isOpen: false,
        isLocked: false,
        securityLevel: 0,
      })
    }
  }

  /**
   * Find best position for a door on room's wall
   */
  private findDoorPosition(room: Room, targetCenter: Point): { position: Point; rotation: number } | null {
    const center = this.getRoomCenter(room)
    const dx = targetCenter.x - center.x
    const dy = targetCenter.y - center.y

    let position: Point
    let rotation: number

    if (Math.abs(dx) > Math.abs(dy)) {
      // Door on left or right wall
      if (dx > 0) {
        // Right wall
        position = {
          x: room.bounds.x + room.bounds.width,
          y: center.y,
        }
        rotation = 90
      } else {
        // Left wall
        position = {
          x: room.bounds.x,
          y: center.y,
        }
        rotation = 270
      }
    } else {
      // Door on top or bottom wall
      if (dy > 0) {
        // Bottom wall
        position = {
          x: center.x,
          y: room.bounds.y + room.bounds.height,
        }
        rotation = 180
      } else {
        // Top wall
        position = {
          x: center.x,
          y: room.bounds.y,
        }
        rotation = 0
      }
    }

    return { position: this.snapPointToGrid(position), rotation }
  }

  /**
   * Determine door type based on rooms being connected
   */
  private getDoorType(roomA: Room, roomB: Room): DoorType {
    const airlockTypes = [RoomType.Airlock, RoomType.DockingBay, RoomType.Hangar]
    const secureTypes = [RoomType.Bridge, RoomType.Reactor, RoomType.Armory, RoomType.Brig]

    if (airlockTypes.includes(roomA.type) || airlockTypes.includes(roomB.type)) {
      return DoorType.Airlock
    }
    if (secureTypes.includes(roomA.type) || secureTypes.includes(roomB.type)) {
      return DoorType.Secure
    }
    if (roomA.type === RoomType.Reactor || roomB.type === RoomType.Reactor) {
      return DoorType.Blast
    }
    return DoorType.Standard
  }

  /**
   * Helper: Get center of a room
   */
  private getRoomCenter(room: Room): Point {
    return {
      x: room.bounds.x + room.bounds.width / 2,
      y: room.bounds.y + room.bounds.height / 2,
    }
  }

  /**
   * Helper: Snap a value to grid
   */
  private snapToGrid(value: number): number {
    return Math.round(value / this.gridSize) * this.gridSize
  }

  /**
   * Helper: Snap a point to grid
   */
  private snapPointToGrid(point: Point): Point {
    return {
      x: this.snapToGrid(point.x),
      y: this.snapToGrid(point.y),
    }
  }
}

// ============================================================================
// Generation Presets
// ============================================================================

export const GENERATION_PRESETS: Record<string, Partial<GenerationParams>> = {
  small_fighter: {
    roomCount: 6,
    deckCount: 1,
    requiredRooms: [RoomType.Bridge, RoomType.Engineering],
    roomDistribution: {
      [RoomType.CrewQuarters]: 30,
      [RoomType.Storage]: 20,
    },
    complexity: 'linear',
    loopiness: 0.1,
    shipType: 'fighter',
  },
  medium_freighter: {
    roomCount: 15,
    deckCount: 2,
    requiredRooms: [RoomType.Bridge, RoomType.Engineering, RoomType.CargoBay, RoomType.Medbay],
    roomDistribution: {
      [RoomType.CrewQuarters]: 25,
      [RoomType.Storage]: 20,
      [RoomType.CargoBay]: 15,
    },
    complexity: 'branching',
    loopiness: 0.2,
    shipType: 'freighter',
  },
  large_cruiser: {
    roomCount: 30,
    deckCount: 3,
    requiredRooms: [
      RoomType.Bridge,
      RoomType.CIC,
      RoomType.Engineering,
      RoomType.Reactor,
      RoomType.Medbay,
      RoomType.Hangar,
      RoomType.Armory,
    ],
    roomDistribution: {
      [RoomType.CrewQuarters]: 20,
      [RoomType.OfficerQuarters]: 10,
      [RoomType.Storage]: 10,
      [RoomType.Laboratory]: 5,
    },
    complexity: 'complex',
    loopiness: 0.4,
    shipType: 'cruiser',
  },
  space_station: {
    roomCount: 40,
    deckCount: 4,
    requiredRooms: [
      RoomType.Bridge,
      RoomType.Engineering,
      RoomType.Reactor,
      RoomType.Medbay,
      RoomType.DockingBay,
      RoomType.Laboratory,
      RoomType.Mess,
      RoomType.RecRoom,
    ],
    roomDistribution: {
      [RoomType.CrewQuarters]: 15,
      [RoomType.OfficerQuarters]: 5,
      [RoomType.Storage]: 15,
      [RoomType.Laboratory]: 10,
      [RoomType.CargoBay]: 10,
    },
    complexity: 'complex',
    loopiness: 0.5,
    shipType: 'station',
  },
  military_base: {
    roomCount: 25,
    deckCount: 2,
    requiredRooms: [
      RoomType.Bridge,
      RoomType.CIC,
      RoomType.Engineering,
      RoomType.Armory,
      RoomType.Brig,
      RoomType.Barracks,
      RoomType.Medbay,
    ],
    roomDistribution: {
      [RoomType.Barracks]: 20,
      [RoomType.SecurityPost]: 15,
      [RoomType.Storage]: 15,
    },
    complexity: 'branching',
    loopiness: 0.3,
    shipType: 'base',
  },
}

/**
 * Generate a deck using preset configuration
 */
export function generateFromPreset(presetName: keyof typeof GENERATION_PRESETS, seed?: number): Deck {
  const preset = GENERATION_PRESETS[presetName]
  
  const params: GenerationParams = {
    seed: seed ?? Date.now(),
    roomCount: preset.roomCount ?? 10,
    deckCount: preset.deckCount ?? 1,
    requiredRooms: preset.requiredRooms ?? [],
    roomDistribution: preset.roomDistribution ?? {},
    complexity: preset.complexity ?? 'branching',
    loopiness: preset.loopiness ?? 0.2,
    shipType: preset.shipType ?? 'freighter',
  }

  const generator = new MapGenerator(params)
  return generator.generateDeck(1)
}

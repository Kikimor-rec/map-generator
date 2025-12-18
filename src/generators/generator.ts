/**
 * Main Map Generator
 * Orchestrates the full generation pipeline
 * Based on specification from 01_generation_pipeline.md
 */

import type {
  GenerationRequest,
  RoomProgram,
  TopologyGraph,
  DeckLayout,
  MapJSON,
  MapMeta,
  TTRPGMetrics,
  ValidationIssue,
  Archetype,
  Subtype,
  SizeTier,
  StyleProfile
} from './types'

import type {
  Room,
  Corridor,
  Door,
  RoomType,
  DoorType,
  CorridorStyle,
  CorridorSegment,
  CorridorAttachment
} from '@core/types'

import { RoomType as RoomTypeEnum, DoorType as DoorTypeEnum, CorridorStyle as CorridorStyleEnum } from '@core/types'

import { createRNG } from './rng'
import { generateRoomProgram, validateRoomProgram } from './roomProgram'
import { generateTopology, validateTopology } from './topology'
import { generateLayout, validateLayout } from './layout'
import { coalesceCorridors } from '@core/corridorCoalesce'
import { DEFAULT_COALESCE_SETTINGS } from '@core/corridorTypes'

// ============================================================================
// GENERATOR OPTIONS
// ============================================================================

export interface GeneratorOptions {
  /** Random seed for reproducibility */
  seed?: string
  /** Main archetype: ship, station, or outpost */
  archetype?: Archetype
  /** Specific subtype within archetype */
  subtype?: Subtype
  /** Visual/style profile */
  styleProfile?: StyleProfile
  /** Size category */
  sizeTier?: SizeTier
  /** Graph connectivity (0-1, more loops = more paths) */
  loopiness?: number
  /** Danger level affecting hazards and security */
  danger?: number
  /** Skip validation for faster generation */
  skipValidation?: boolean
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_OPTIONS: Required<GeneratorOptions> = {
  seed: Date.now().toString(),
  archetype: 'ship',
  subtype: 'explorer',
  styleProfile: 'utilitarian',
  sizeTier: 'md',
  loopiness: 0.5,
  danger: 0.3,
  skipValidation: false
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export interface GenerationResult {
  /** Success flag */
  success: boolean
  /** Generated map data */
  map?: MapJSON
  /** Intermediate room program */
  roomProgram?: RoomProgram
  /** Intermediate topology graph */
  topology?: TopologyGraph
  /** Deck layouts */
  layouts?: DeckLayout[]
  /** Validation issues */
  issues: ValidationIssue[]
  /** Generation timing in milliseconds */
  timing: {
    total: number
    roomProgram: number
    topology: number
    layout: number
    validation: number
  }
}

/**
 * Generate a complete map based on the provided options
 */
export function generateMap(options: GeneratorOptions = {}): GenerationResult {
  const startTime = performance.now()
  const timing = {
    total: 0,
    roomProgram: 0,
    topology: 0,
    layout: 0,
    validation: 0
  }
  
  const issues: ValidationIssue[] = []
  
  // Normalize options with defaults
  const request = normalizeRequest(options)
  
  try {
    // Stage 2: Generate Room Program
    const roomProgramStart = performance.now()
    const roomProgram = generateRoomProgram({ request })
    timing.roomProgram = performance.now() - roomProgramStart
    
    // Validate room program
    if (!options.skipValidation) {
      const validation = validateRoomProgram(roomProgram, request)
      if (!validation.valid) {
        for (const issue of validation.issues) {
          issues.push({
            severity: 'warning',
            stage: 'roomProgram',
            message: issue
          })
        }
      }
    }
    
    // Stage 3: Generate Topology Graph
    const topologyStart = performance.now()
    const topology = generateTopology({ request, program: roomProgram })
    timing.topology = performance.now() - topologyStart
    
    // Validate topology
    if (!options.skipValidation) {
      const validation = validateTopology(topology)
      if (!validation.valid) {
        for (const issue of validation.issues) {
          issues.push({
            severity: 'warning',
            stage: 'topology',
            message: issue
          })
        }
      }
    }
    
    // Stage 4-5: Generate Layout Geometry
    const layoutStart = performance.now()
    const layouts = generateLayout({ request, topology })
    timing.layout = performance.now() - layoutStart
    
    // Validate layout
    if (!options.skipValidation) {
      const validationStart = performance.now()
      const validation = validateLayout(layouts)
      timing.validation = performance.now() - validationStart
      
      if (!validation.valid) {
        for (const issue of validation.issues) {
          issues.push({
            severity: 'warning',
            stage: 'layout',
            message: issue
          })
        }
      }
    }
    
    // Stage 7: Build final MapJSON
    const map = buildMapJSON(request, roomProgram, topology, layouts)
    
    timing.total = performance.now() - startTime
    
    return {
      success: true,
      map,
      roomProgram,
      topology,
      layouts,
      issues,
      timing
    }
    
  } catch (error) {
    timing.total = performance.now() - startTime
    
    issues.push({
      severity: 'error',
      stage: 'generator',
      message: error instanceof Error ? error.message : String(error)
    })
    
    return {
      success: false,
      issues,
      timing
    }
  }
}

// ============================================================================
// REQUEST NORMALIZATION
// ============================================================================

function normalizeRequest(options: GeneratorOptions): GenerationRequest {
  return {
    seed: options.seed ?? DEFAULT_OPTIONS.seed,
    archetype: options.archetype ?? DEFAULT_OPTIONS.archetype,
    subtype: options.subtype ?? DEFAULT_OPTIONS.subtype,
    styleProfile: options.styleProfile ?? DEFAULT_OPTIONS.styleProfile,
    sizeTier: options.sizeTier ?? DEFAULT_OPTIONS.sizeTier,
    loopiness: options.loopiness ?? DEFAULT_OPTIONS.loopiness,
    danger: options.danger ?? DEFAULT_OPTIONS.danger
  }
}

// ============================================================================
// MAP JSON BUILDER
// ============================================================================

function buildMapJSON(
  request: GenerationRequest,
  program: RoomProgram,
  topology: TopologyGraph,
  layouts: DeckLayout[]
): MapJSON {
  const meta = buildMeta(request, program, topology)
  const grid = { cellSize: 40, snapEnabled: true }
  const zones = buildZones(program)
  
  return {
    version: '1.0.0',
    meta,
    grid,
    zones,
    decks: layouts.map(layout => ({
      index: layout.deckIndex,
      label: `Deck ${layout.deckIndex + 1}`,
      gridWidth: layout.gridWidth,
      gridHeight: layout.gridHeight,
      rooms: layout.rooms,
      connectors: layout.connectors,
      junctions: layout.junctions
    }))
  }
}

function buildMeta(
  request: GenerationRequest,
  program: RoomProgram,
  topology: TopologyGraph
): MapMeta {
  const rng = createRNG(request.seed + '-name')
  
  return {
    name: generateName(request, rng),
    archetype: request.archetype,
    subtype: request.subtype,
    sizeTier: request.sizeTier,
    seed: String(request.seed),
    generatedAt: new Date().toISOString(),
    ttrpgMetrics: buildTTRPGMetrics(program, topology),
    tags: buildTags(request, program)
  }
}

function generateName(request: GenerationRequest, rng: { pick: <T>(arr: T[]) => T }): string {
  const prefixes: Record<Archetype, string[]> = {
    ship: ['ISS', 'USS', 'HMS', 'CSV', 'NSV'],
    station: ['Station', 'Orbital', 'Habitat', 'Port'],
    outpost: ['Base', 'Outpost', 'Facility', 'Site']
  }
  
  const names = [
    'Horizon', 'Vanguard', 'Pioneer', 'Endeavour', 'Prometheus',
    'Artemis', 'Helios', 'Nova', 'Zenith', 'Eclipse',
    'Aurora', 'Stellar', 'Nebula', 'Cosmos', 'Orion'
  ]
  
  const prefix = rng.pick(prefixes[request.archetype])
  const name = rng.pick(names)
  
  return `${prefix} ${name}`
}

function buildTTRPGMetrics(program: RoomProgram, topology: TopologyGraph): TTRPGMetrics {
  const primaryRooms = program.rooms.filter(r => r.importance === 'primary')
  
  // Estimate combat encounters based on room count
  const combatEncounters = Math.floor(program.totalRooms / 8) + 1
  
  // Exploration time estimate (minutes per room roughly)
  const explorationMinutes = program.totalRooms * 5
  
  return {
    totalRooms: program.totalRooms,
    totalConnectors: topology.connectors.length,
    estimatedCombatEncounters: combatEncounters,
    estimatedExplorationMinutes: explorationMinutes,
    keyLocations: primaryRooms.length,
    hiddenAreas: program.rooms.filter(r => r.accessLevel >= 3).length
  }
}

function buildZones(program: RoomProgram): Array<{ id: string; label: string; color: string }> {
  const zoneColors: Record<string, string> = {
    core: '#ef4444',      // Red
    crew: '#22c55e',      // Green
    operations: '#3b82f6', // Blue
    cargo: '#f59e0b',     // Amber
    special: '#8b5cf6'    // Purple
  }
  
  const zones: Array<{ id: string; label: string; color: string }> = []
  
  for (const [zone, count] of Object.entries(program.zoneDistribution)) {
    if (count > 0) {
      zones.push({
        id: zone,
        label: zone.charAt(0).toUpperCase() + zone.slice(1),
        color: zoneColors[zone] || '#6b7280'
      })
    }
  }
  
  return zones
}

function buildTags(request: GenerationRequest, program: RoomProgram): string[] {
  const tags: string[] = [
    request.archetype,
    request.subtype,
    request.sizeTier
  ]
  
  // Add descriptive tags
  if (request.loopiness !== undefined && request.loopiness > 0.7) {
    tags.push('labyrinthine')
  } else if (request.loopiness !== undefined && request.loopiness < 0.3) {
    tags.push('linear')
  }
  
  if (request.danger !== undefined && request.danger > 0.7) {
    tags.push('high-danger')
  }
  
  // Add room-based tags
  const hasWeapons = program.rooms.some(r => r.tags.includes('military'))
  const hasScience = program.rooms.some(r => r.tags.includes('science'))
  const hasCargo = program.rooms.some(r => r.tags.includes('cargo'))
  
  if (hasWeapons) tags.push('armed')
  if (hasScience) tags.push('research-capable')
  if (hasCargo) tags.push('cargo-hauler')
  
  return tags
}

// ============================================================================
// CONVERSION TO EDITOR FORMAT
// ============================================================================

export interface EditorMapData {
  rooms: Room[]
  corridors: Corridor[]
  doors: Door[]
}

/**
 * Convert generated MapJSON to editor-compatible format
 */
export function convertToEditorFormat(mapJson: MapJSON, deckIndex = 0): EditorMapData {
  const deck = mapJson.decks[deckIndex]
  if (!deck) {
    return { rooms: [], corridors: [], doors: [] }
  }
  
  // Convert rooms to core Room type
  const rooms: Room[] = deck.rooms.map(layoutRoom => {
    const roomType = mapRoomTypeId(layoutRoom.roomType)
    return {
      id: layoutRoom.id,
      type: roomType,
      name: layoutRoom.label,
      bounds: {
        x: layoutRoom.x,
        y: layoutRoom.y,
        width: layoutRoom.width,
        height: layoutRoom.height
      },
      color: getZoneColor(layoutRoom.zone, mapJson.zones),
      borderColor: undefined,
      doors: [], // Will be populated below
      objects: [],
      metadata: {
        zone: layoutRoom.zone,
        roomType: layoutRoom.roomType
      },
      deckLevel: deckIndex,
      isVisible: true,
      isLocked: false
    }
  })
  
  // Convert connectors to core Corridor type
  const corridors: Corridor[] = deck.connectors.map(connector => {
    // Convert path to segments
    const segments: CorridorSegment[] = []
    for (let i = 0; i < connector.path.length - 1; i++) {
      segments.push({
        start: { x: connector.path[i].x, y: connector.path[i].y },
        end: { x: connector.path[i + 1].x, y: connector.path[i + 1].y }
      })
    }
    
    // Find attachments
    const startAttachment = findRoomAttachment(connector.fromRoomId, connector.path[0], rooms)
    const endAttachment = connector.path.length > 0 
      ? findRoomAttachment(connector.toRoomId, connector.path[connector.path.length - 1], rooms)
      : undefined
    
    return {
      id: connector.id,
      style: CorridorStyleEnum.Standard,
      segments,
      width: 40, // Default corridor width
      color: undefined,
      doors: [],
      connectedRoomIds: [connector.fromRoomId, connector.toRoomId].filter(Boolean),
      deckLevel: deckIndex,
      startAttachment,
      endAttachment
    }
  })
  
  // Apply coalesce to merge overlapping corridor segments
  const { corridors: coalescedCorridors } = coalesceCorridors(
    corridors,
    DEFAULT_COALESCE_SETTINGS
  )
  
  // Generate doors at room-corridor connections
  const doors: Door[] = []
  
  for (const connector of deck.connectors) {
    if (connector.path.length >= 2) {
      // Door at start
      const startPoint = connector.path[0]
      doors.push({
        id: `door-${connector.id}-start`,
        type: getDoorType(connector.kind),
        position: { x: startPoint.x, y: startPoint.y },
        rotation: 0,
        width: 30,
        isOpen: false,
        isLocked: false,
        securityLevel: 0
      })
      
      // Door at end
      const endPoint = connector.path[connector.path.length - 1]
      doors.push({
        id: `door-${connector.id}-end`,
        type: getDoorType(connector.kind),
        position: { x: endPoint.x, y: endPoint.y },
        rotation: 0,
        width: 30,
        isOpen: false,
        isLocked: false,
        securityLevel: 0
      })
    }
  }
  
  return { rooms, corridors: coalescedCorridors, doors }
}

function getZoneColor(zone: string, zones: Array<{ id: string; color: string }>): string {
  const zoneInfo = zones.find(z => z.id === zone)
  return zoneInfo?.color || '#4a5568'
}

function findRoomAttachment(roomId: string, point: { x: number; y: number }, rooms: Room[]): CorridorAttachment | undefined {
  const room = rooms.find(r => r.id === roomId)
  if (!room) return undefined
  
  const bounds = room.bounds
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  
  // Determine which wall the point is closest to
  const distTop = Math.abs(point.y - bounds.y)
  const distBottom = Math.abs(point.y - (bounds.y + bounds.height))
  const distLeft = Math.abs(point.x - bounds.x)
  const distRight = Math.abs(point.x - (bounds.x + bounds.width))
  
  const minDist = Math.min(distTop, distBottom, distLeft, distRight)
  
  let wall: 'top' | 'right' | 'bottom' | 'left'
  let offset: number
  
  if (minDist === distTop) {
    wall = 'top'
    offset = (point.x - bounds.x) / bounds.width
  } else if (minDist === distBottom) {
    wall = 'bottom'
    offset = (point.x - bounds.x) / bounds.width
  } else if (minDist === distLeft) {
    wall = 'left'
    offset = (point.y - bounds.y) / bounds.height
  } else {
    wall = 'right'
    offset = (point.y - bounds.y) / bounds.height
  }
  
  return {
    roomId,
    wall,
    offset: Math.max(0, Math.min(1, offset))
  }
}

function getDoorType(kind: string): DoorType {
  switch (kind) {
    case 'airlock':
      return DoorTypeEnum.Airlock
    case 'bulkhead':
      return DoorTypeEnum.Blast
    case 'emergency':
      return DoorTypeEnum.Emergency
    default:
      return DoorTypeEnum.Standard
  }
}

/**
 * Map generator room type ID to core RoomType enum
 */
function mapRoomTypeId(roomType: string): RoomType {
  // Map common room type IDs to RoomType enum values
  const typeMap: Record<string, RoomType> = {
    'bridge': RoomTypeEnum.Bridge,
    'cic': RoomTypeEnum.CIC,
    'comms': RoomTypeEnum.Communications,
    'communications': RoomTypeEnum.Communications,
    'crewQuarters': RoomTypeEnum.CrewQuarters,
    'crew_quarters': RoomTypeEnum.CrewQuarters,
    'captainQuarters': RoomTypeEnum.CaptainQuarters,
    'captain_quarters': RoomTypeEnum.CaptainQuarters,
    'officerQuarters': RoomTypeEnum.OfficerQuarters,
    'officer_quarters': RoomTypeEnum.OfficerQuarters,
    'barracks': RoomTypeEnum.Barracks,
    'medbay': RoomTypeEnum.Medbay,
    'lifeSupport': RoomTypeEnum.LifeSupport,
    'life_support': RoomTypeEnum.LifeSupport,
    'cryogenics': RoomTypeEnum.Cryogenics,
    'engineering': RoomTypeEnum.Engineering,
    'reactor': RoomTypeEnum.Reactor,
    'powerDistribution': RoomTypeEnum.PowerDistribution,
    'power_distribution': RoomTypeEnum.PowerDistribution,
    'maintenance': RoomTypeEnum.Maintenance,
    'cargoBay': RoomTypeEnum.CargoBay,
    'cargo_bay': RoomTypeEnum.CargoBay,
    'storage': RoomTypeEnum.Storage,
    'armory': RoomTypeEnum.Armory,
    'hangar': RoomTypeEnum.Hangar,
    'dockingBay': RoomTypeEnum.DockingBay,
    'docking_bay': RoomTypeEnum.DockingBay,
    'messHall': RoomTypeEnum.Mess,
    'mess_hall': RoomTypeEnum.Mess,
    'recreation': RoomTypeEnum.RecRoom,
    'hydroponics': RoomTypeEnum.Storage, // No hydroponics in core, use Storage
    'lab': RoomTypeEnum.Laboratory,
    'scienceLab': RoomTypeEnum.Laboratory,
    'science_lab': RoomTypeEnum.Laboratory,
    'securityStation': RoomTypeEnum.SecurityPost,
    'security_station': RoomTypeEnum.SecurityPost,
    'brig': RoomTypeEnum.Brig,
    'weaponsBay': RoomTypeEnum.Armory, // No weaponsBay in core, use Armory
    'weapons_bay': RoomTypeEnum.Armory,
    'torpedoRoom': RoomTypeEnum.Armory, // No torpedoRoom in core, use Armory
    'torpedo_room': RoomTypeEnum.Armory,
    'corridor': RoomTypeEnum.Corridor,
    'junction': RoomTypeEnum.Corridor, // No junction in core, use Corridor
    'airlock': RoomTypeEnum.Airlock,
    'escape_pod': RoomTypeEnum.Airlock, // No escape_pod in core, use Airlock
    'escapePod': RoomTypeEnum.Airlock
  }
  
  return typeMap[roomType] || RoomTypeEnum.Generic
}

/**
 * Grid-First Generator Types
 * Tile-based map generation system
 */

import type { Archetype, SizeTier, SeededRNG, GenerationRequest, ProgrammedRoom, RoomCirculationRole } from '../types'

// ============================================================================
// TILE TYPES
// ============================================================================

export enum TileType {
  VOID = 0,      // Empty space (outside hull)
  HULL = 1,      // Interior hull space (can be carved into rooms/corridors)
  FLOOR = 2,     // Room floor tile
  CORRIDOR = 3,  // Corridor tile
  DOOR = 4,      // Door/portal between spaces
  JUNCTION = 5,  // Corridor intersection
  AIRLOCK = 6,   // External access point
  WALL = 7,      // Internal wall
}

export interface Tile {
  type: TileType
  roomId?: string        // If FLOOR, which room owns this tile
  corridorId?: string    // If CORRIDOR/JUNCTION, which corridor segment
  zoneId?: string        // Zone assignment
  spineLevel?: number    // 0=main spine, 1=branch, 2=secondary
  metadata?: Record<string, unknown>
}

// ============================================================================
// GRID CANVAS
// ============================================================================

export interface GridCanvas {
  /** Width in tiles */
  width: number
  /** Height in tiles */
  height: number
  /** Pixels per tile (default 40) */
  tileSize: number
  /** 2D tile array [y][x] */
  tiles: Tile[][]
  /** Archetype for context */
  archetype: Archetype
  /** Size tier */
  sizeTier: SizeTier
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// ============================================================================
// HULL SHAPES
// ============================================================================

export type HullShape =
  | 'elongated'     // Classic ship (pointed bow, wide stern)
  | 'pointed'       // Sharp nose (courier, fighter)
  | 'boxy'          // Freighter/cargo
  | 'angular'       // Military (faceted)
  | 'circular'      // Station
  | 'ring'          // Station ring
  | 'irregular'     // Outpost/ruins
  | 'clustered'     // Connected modules

export interface HullConfig {
  shape: HullShape
  /** Aspect ratio (width:height, e.g. 0.4 means ship is 2.5x taller than wide) */
  aspectRatio: number
  /** How much to taper the bow (0-1) */
  bowTaper: number
  /** How much to taper the stern (0-1) */
  sternTaper: number
  /** Symmetry (0-1, 1 = perfect symmetry) */
  symmetry: number
}

export interface HullModule {
  /** Stable identifier within the generated hull layout. */
  id: string
  center: Point
  radius: number
  kind: 'hub' | 'satellite'
}

export interface HullLink {
  /** Stable identifier within the generated hull layout. */
  id: string
  fromModuleId: string
  toModuleId: string
  /** Raw centerline carved into the hull mask. */
  centerline: Point[]
  kind: 'primary' | 'loop'
}

/**
 * Optional construction metadata returned by hull generators that have a
 * meaningful internal module topology.
 */
export interface HullLayout {
  kind: 'clustered-outpost'
  modules: HullModule[]
  links: HullLink[]
}

/**
 * Optional inputs that affect topology-bearing hulls. Omitting the context
 * preserves the historical clustered-hull link probability.
 */
export interface HullCarveContext {
  loopiness?: number
}

// ============================================================================
// ZONES
// ============================================================================

export type ZonePosition =
  | 'bow'          // Front (ships)
  | 'mid'          // Middle
  | 'stern'        // Back (ships)
  | 'port'         // Left side
  | 'starboard'    // Right side
  | 'center'       // Central area
  | 'hub'          // Central hub (stations)
  | 'inner'        // Inner ring
  | 'outer'        // Outer ring

export interface ZoneDefinition {
  id: string
  label: string
  position: ZonePosition
  /** Room type priorities for this zone */
  roomTypes: string[]
  /** Color for visualization */
  color: string
  /** Percentage of hull this zone occupies (0-1) */
  sizePercent: number
}

// ============================================================================
// SPINE/CORRIDOR PATTERNS
// ============================================================================

export type SpinePattern =
  | 'linear'        // Single main corridor
  | 'branching'     // Main + perpendicular branches
  | 'dual'          // Two parallel spines
  | 'grid'          // Regular grid pattern
  | 'hub-spoke'     // Central hub with spokes
  | 'hub-ring'      // Hub with concentric rings
  | 'loop'          // Circular loop
  | 'organic'       // Irregular, following hull shape

export interface SpineConfig {
  pattern: SpinePattern
  /** Main corridor width in tiles */
  mainWidth: number
  /** Branch corridor width */
  branchWidth: number
  /** Number of branches (for branching pattern) */
  branchCount: number
  /** Spacing between branches (in tiles) */
  branchSpacing: number
}

// ============================================================================
// ROOM PLACEMENT
// ============================================================================

export interface RoomPlacement {
  roomId: string
  roomType: string
  label: string
  /** Tiles occupied by this room */
  tiles: Point[]
  /** Bounding box in tile coordinates */
  bounds: Rect
  /** Zone assignment */
  zone: string
  /** Door positions (adjacent to corridors) */
  doorPositions: Point[]
  /** Actual generated circulation role after all viable ports are carved. */
  circulationRole: RoomCirculationRole
  /** Original program data */
  program: ProgrammedRoom
}

// ============================================================================
// GENERATION CONFIG
// ============================================================================

export interface GridGeneratorConfig {
  /** Hull shape configuration */
  hull: HullConfig
  /** Zone definitions */
  zones: ZoneDefinition[]
  /** Spine/corridor pattern */
  spine: SpineConfig
  /** Room density (0-1, how much of hull is rooms vs corridors) */
  roomDensity: number
  /** Minimum room size in tiles */
  minRoomSize: number
  /** Maximum room size in tiles */
  maxRoomSize: number
  /** Corridor padding around rooms (tiles) */
  corridorPadding: number
}

// ============================================================================
// ARCHETYPE TEMPLATES
// ============================================================================

export interface ArchetypeTemplate {
  archetype: Archetype
  subtype?: string
  hull: HullConfig
  zones: ZoneDefinition[]
  spine: SpineConfig
  roomDensity: number
}

// Ship zones
export const SHIP_ZONES: Record<string, ZoneDefinition[]> = {
  default: [
    { id: 'command', label: 'Command', position: 'bow', roomTypes: ['bridge', 'cic', 'comms'], color: '#3b82f6', sizePercent: 0.15 },
    { id: 'crew', label: 'Crew', position: 'mid', roomTypes: ['crewQuarters', 'medbay', 'messHall', 'recreation'], color: '#22c55e', sizePercent: 0.30 },
    { id: 'operations', label: 'Operations', position: 'mid', roomTypes: ['cargoBay', 'armory', 'lab', 'storage'], color: '#f59e0b', sizePercent: 0.25 },
    { id: 'engineering', label: 'Engineering', position: 'stern', roomTypes: ['engineering', 'reactor', 'lifeSupport', 'maintenance'], color: '#ef4444', sizePercent: 0.30 },
  ],
  military: [
    { id: 'command', label: 'Command', position: 'bow', roomTypes: ['bridge', 'cic', 'comms', 'tacticalCenter'], color: '#3b82f6', sizePercent: 0.20 },
    { id: 'tactical', label: 'Tactical', position: 'mid', roomTypes: ['armory', 'weaponsBay', 'torpedoRoom', 'securityStation'], color: '#dc2626', sizePercent: 0.25 },
    { id: 'crew', label: 'Crew', position: 'mid', roomTypes: ['barracks', 'medbay', 'messHall'], color: '#22c55e', sizePercent: 0.20 },
    { id: 'engineering', label: 'Engineering', position: 'stern', roomTypes: ['engineering', 'reactor', 'lifeSupport'], color: '#ef4444', sizePercent: 0.35 },
  ],
}

// Station zones
export const STATION_ZONES: Record<string, ZoneDefinition[]> = {
  default: [
    { id: 'hub', label: 'Hub', position: 'hub', roomTypes: ['operations', 'comms', 'lifeSupport'], color: '#8b5cf6', sizePercent: 0.20 },
    { id: 'docking', label: 'Docking', position: 'outer', roomTypes: ['dockingBay', 'cargoBay', 'airlock'], color: '#f59e0b', sizePercent: 0.30 },
    { id: 'residential', label: 'Residential', position: 'inner', roomTypes: ['crewQuarters', 'recreation', 'messHall'], color: '#22c55e', sizePercent: 0.25 },
    { id: 'utilities', label: 'Utilities', position: 'inner', roomTypes: ['engineering', 'reactor', 'storage'], color: '#ef4444', sizePercent: 0.25 },
  ],
}

// Outpost zones
export const OUTPOST_ZONES: Record<string, ZoneDefinition[]> = {
  default: [
    { id: 'main', label: 'Main', position: 'center', roomTypes: ['operations', 'comms', 'storage'], color: '#3b82f6', sizePercent: 0.40 },
    { id: 'support', label: 'Support', position: 'outer', roomTypes: ['crewQuarters', 'lifeSupport', 'generator'], color: '#22c55e', sizePercent: 0.35 },
    { id: 'specialized', label: 'Specialized', position: 'outer', roomTypes: ['lab', 'mining', 'hangar'], color: '#f59e0b', sizePercent: 0.25 },
  ],
}

// ============================================================================
// SIZE DIMENSIONS
// ============================================================================

/** Grid dimensions by archetype and size tier */
export const ARCHETYPE_DIMENSIONS: Record<Archetype, Record<SizeTier, { width: number; height: number }>> = {
  ship: {
    xs: { width: 16, height: 36 },   // ~576 tiles - enough for small ships
    sm: { width: 20, height: 48 },   // ~960 tiles
    md: { width: 24, height: 56 },   // ~1344 tiles
    lg: { width: 32, height: 72 },   // ~2304 tiles
    xl: { width: 40, height: 96 },   // ~3840 tiles
  },
  station: {
    xs: { width: 28, height: 28 },   // Small circular
    sm: { width: 36, height: 36 },
    md: { width: 48, height: 48 },
    lg: { width: 64, height: 64 },
    xl: { width: 84, height: 84 },
  },
  outpost: {
    xs: { width: 24, height: 20 },   // Compact but usable
    sm: { width: 32, height: 26 },
    md: { width: 40, height: 32 },
    lg: { width: 52, height: 42 },
    xl: { width: 64, height: 52 },
  },
}

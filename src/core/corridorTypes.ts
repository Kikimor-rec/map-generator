/**
 * Enhanced Corridor Types
 * Based on specification from 16_corridor_editor_spec.md
 * 
 * Provides comprehensive types for corridor editing, auto-routing,
 * ports, waypoints, junctions, and line jumps.
 */

import type { Point } from './types'

// ============================================================================
// CORRIDOR KIND & LAYER
// ============================================================================

/**
 * Type of corridor/connector
 */
export type CorridorKind = 
  | 'corridor'       // Standard passage
  | 'airlock'        // Airlock connection
  | 'bulkheadDoor'   // Heavy bulkhead door
  | 'serviceHatch'   // Maintenance access
  | 'verticalLink'   // Ladder/elevator between decks

/**
 * Layer the corridor belongs to
 */
export type CorridorLayer = 
  | 'main'           // Primary corridors
  | 'ventilation'    // Vent shafts
  | 'service'        // Service tunnels
  | 'cables'         // Cable routing
  | 'security'       // Security passages

/**
 * Width class for corridors
 */
export type CorridorWidthClass = 'narrow' | 'standard' | 'wide'

/**
 * Width in pixels per class
 */
export const CORRIDOR_WIDTHS: Record<CorridorWidthClass, number> = {
  narrow: 20,
  standard: 40,
  wide: 60,
}

// ============================================================================
// PORTS - Connection points on rooms
// ============================================================================

/**
 * Side of a room (port direction)
 */
export type PortSide = 'N' | 'E' | 'S' | 'W'

/**
 * Port mode - how the port position is determined
 */
export type PortMode = 'fixed' | 'sliding'

/**
 * A connection port on a room
 */
export interface Port {
  id: string
  roomId: string
  side: PortSide
  mode: PortMode
  /** Position along the wall (0-1), only used if mode='fixed' */
  position: number
  /** Connected corridor IDs */
  connectedCorridorIds: string[]
  /** Optional label */
  label?: string
}

/**
 * Get world position of a port
 */
export function getPortWorldPosition(
  port: Port,
  roomBounds: { x: number; y: number; width: number; height: number }
): Point {
  const { x, y, width, height } = roomBounds
  switch (port.side) {
    case 'N': return { x: x + width * port.position, y }
    case 'S': return { x: x + width * port.position, y: y + height }
    case 'W': return { x, y: y + height * port.position }
    case 'E': return { x: x + width, y: y + height * port.position }
  }
}

/**
 * Convert port side to legacy wall format
 */
export function portSideToWall(side: PortSide): 'top' | 'right' | 'bottom' | 'left' {
  switch (side) {
    case 'N': return 'top'
    case 'E': return 'right'
    case 'S': return 'bottom'
    case 'W': return 'left'
  }
}

/**
 * Convert legacy wall to port side
 */
export function wallToPortSide(wall: 'top' | 'right' | 'bottom' | 'left'): PortSide {
  switch (wall) {
    case 'top': return 'N'
    case 'right': return 'E'
    case 'bottom': return 'S'
    case 'left': return 'W'
  }
}

// ============================================================================
// WAYPOINTS - User-controlled routing points
// ============================================================================

/**
 * Waypoint kind
 */
export type WaypointKind = 'locked' | 'auto'

/**
 * A waypoint in the corridor path
 */
export interface Waypoint {
  x: number
  y: number
  kind: WaypointKind
}

// ============================================================================
// INTERSECTION POLICIES
// ============================================================================

/**
 * How to handle corridor intersections
 */
export type IntersectionPolicy = 'avoid' | 'junction' | 'lineJump'

/**
 * Line jump visual style
 */
export type LineJumpStyle = 'none' | 'arc' | 'gap' | 'sharp'

// ============================================================================
// CORNER STYLES
// ============================================================================

/**
 * Corner rendering style
 */
export type CornerStyle = 'sharp' | 'rounded'

// ============================================================================
// ENHANCED CORRIDOR STYLE
// ============================================================================

/**
 * Visual style configuration for corridor
 */
export interface CorridorStyleConfig {
  corner: CornerStyle
  lineJumps: LineJumpStyle
  jumpSize: number
  /** Color override */
  color?: string
  /** Dash pattern for secondary layers */
  dashPattern?: number[]
}

/**
 * Default style configurations per layer
 */
export const DEFAULT_CORRIDOR_STYLES: Record<CorridorLayer, CorridorStyleConfig> = {
  main: { corner: 'rounded', lineJumps: 'arc', jumpSize: 10 },
  ventilation: { corner: 'sharp', lineJumps: 'gap', jumpSize: 8, dashPattern: [10, 5] },
  service: { corner: 'sharp', lineJumps: 'gap', jumpSize: 8, dashPattern: [5, 5] },
  cables: { corner: 'sharp', lineJumps: 'none', jumpSize: 0, dashPattern: [2, 2] },
  security: { corner: 'rounded', lineJumps: 'arc', jumpSize: 10, color: '#ef4444' },
}

// ============================================================================
// ENHANCED CORRIDOR INTERFACE
// ============================================================================

/**
 * Corridor endpoint reference
 */
export interface CorridorEndpoint {
  roomId: string
  portId: string
}

/**
 * Enhanced corridor with full routing support
 */
export interface EnhancedCorridor {
  id: string
  kind: CorridorKind
  layer: CorridorLayer
  
  /** Source endpoint */
  from: CorridorEndpoint
  /** Destination endpoint */
  to: CorridorEndpoint
  
  /** Width class */
  widthClass: CorridorWidthClass
  /** Clearance in grid units */
  clearance: number
  
  /** Waypoints for routing (user-controlled + auto-generated) */
  waypoints: Waypoint[]
  /** Final computed path (H/V segments) */
  path: Point[]
  
  /** Intersection policy */
  intersectionPolicy: IntersectionPolicy
  /** Visual style */
  style: CorridorStyleConfig
  
  /** Deck level */
  deckLevel: number
  
  /** Is path dirty (needs recalculation)? */
  isDirty: boolean
  
  /** Metadata */
  metadata: Record<string, unknown>
}

// ============================================================================
// JUNCTION - Connection points between corridors
// ============================================================================

/**
 * Junction type
 */
export type JunctionKind = 'T' | 'X' | 'hub' | 'airlockChamber'

/**
 * Junction rules
 */
export interface JunctionRules {
  /** Is this a checkpoint (movement restriction)? */
  isCheckpoint?: boolean
  /** Does this have a bulkhead door? */
  isBulkhead?: boolean
  /** Security level required */
  securityLevel?: number
}

/**
 * A junction where corridors meet
 */
export interface Junction {
  id: string
  pos: Point
  kind: JunctionKind
  rules: JunctionRules
  /** Connected corridor IDs */
  connectedCorridorIds: string[]
  /** Deck level */
  deckLevel: number
}

// ============================================================================
// LINE JUMP - Visual representation of crossing without connection
// ============================================================================

/**
 * A line jump at a corridor crossing
 */
export interface LineJump {
  /** Position of the jump */
  pos: Point
  /** Which corridor is "on top" (rendered continuously) */
  topCorridorId: string
  /** Which corridor is "below" (has the jump) */
  bottomCorridorId: string
  /** Jump style (from bottom corridor's style) */
  style: LineJumpStyle
  /** Jump size */
  size: number
}

// ============================================================================
// ROUTING ENGINE SETTINGS
// ============================================================================

// ============================================================================
// COALESCE SETTINGS - Merge overlapping/duplicate corridors
// ============================================================================

/**
 * Policy for merging corridors of different types
 */
export type TypeMergePolicy = 
  | 'shareIfSameType'          // Merge only same types (default)
  | 'shareAndPromotePriority'  // Merge and pick type by priority
  | 'neverShareDifferentTypes' // Never merge different types

/**
 * Policy for merging corridors of different layers
 */
export type LayerMergePolicy = 
  | 'mergeAll'              // Merge all layers together
  | 'mergeWithinLayer'      // Only merge same layer (default)
  | 'neverMergeLayers'      // Never merge across layers

/**
 * Settings for corridor coalesce (merge) pass
 */
export interface CoalesceSettings {
  /** Enable coalesce processing */
  enabled: boolean
  /** Tolerance for matching endpoints/segments (pixels) */
  tolerancePx: number
  /** Minimum shared length to trigger merge (pixels) */
  minSharedLength: number
  /** Policy for merging different corridor types */
  typeMergePolicy: TypeMergePolicy
  /** Policy for merging different layers */
  layerMergePolicy: LayerMergePolicy
  /** Prefer reusing existing segments (A* cost reduction factor, 0-1) */
  preferReuseWeight: number
  /** Auto-create junctions at merge points */
  createJunctionsAtMerge: boolean
}

/**
 * Default coalesce settings
 */
export const DEFAULT_COALESCE_SETTINGS: CoalesceSettings = {
  enabled: true,
  tolerancePx: 4,
  minSharedLength: 20,
  typeMergePolicy: 'shareIfSameType',
  layerMergePolicy: 'mergeWithinLayer',
  preferReuseWeight: 0.3, // 30% cost reduction for reusing existing segments
  createJunctionsAtMerge: true,
}

// ============================================================================
// ROUTING COST FUNCTION - A* pathfinding costs
// ============================================================================

/**
 * Crossing policy for corridor intersections
 */
export type CrossingPolicy = 
  | 'forbidden'      // Never allow crossings
  | 'bridgeJump'     // Allow with bridge/jump marker
  | 'allowFreely'    // Allow without restriction

/**
 * Cost function configuration for A* routing
 */
export interface RoutingCostConfig {
  // === Base cost ===
  /** Cost per unit of length (base) */
  lengthCost: number
  
  // === Geometry penalties ===
  /** Penalty for each 90° turn */
  bendPenalty: number
  /** Penalty for 45° turn (if allowed) */
  bend45Penalty: number
  
  // === Obstacle penalties ===
  /** Penalty for entering room zone (very high/forbidden) */
  obstaclePenalty: number
  /** Penalty for being near room walls */
  nearMissPenalty: number
  /** Distance for nearMiss check (px) */
  nearMissDistance: number
  
  // === Crossing penalties ===
  /** Penalty for crossing another corridor */
  crossingPenalty: number
  /** Crossing policy */
  crossingPolicy: CrossingPolicy
  
  // === Reuse bonuses (trunk corridors) ===
  /** Enable prefer-reuse logic */
  preferReuseEnabled: boolean
  /** Bonus (negative cost) for reusing existing segment */
  reuseBonus: number
  /** Strength of reuse bonus (0-1) */
  reuseBonusStrength: number
  /** Soft capacity limit for segment reuse */
  reuseCapacity: number
  
  // === Junction penalties ===
  /** Penalty for connecting to overloaded junction */
  junctionDegreePenalty: number
  /** Minimum spacing between junctions (px) */
  minJunctionSpacing: number
  /** Penalty for junction too close */
  junctionProximityPenalty: number
}

/**
 * Default routing cost configuration
 */
export const DEFAULT_ROUTING_COSTS: RoutingCostConfig = {
  lengthCost: 1.0,
  bendPenalty: 5.0,
  bend45Penalty: 3.0,
  obstaclePenalty: 10000, // Effectively forbidden
  nearMissPenalty: 2.0,
  nearMissDistance: 20,
  crossingPenalty: 10.0,
  crossingPolicy: 'bridgeJump',
  preferReuseEnabled: true,
  reuseBonus: -3.0,
  reuseBonusStrength: 0.5,
  reuseCapacity: 3,
  junctionDegreePenalty: 2.0,
  minJunctionSpacing: 40,
  junctionProximityPenalty: 5.0,
}

// ============================================================================
// JUNCTION NORMALIZATION CONFIG - Post-processing constraints
// ============================================================================

/**
 * Junction normalization configuration for post-processing
 */
export interface JunctionNormConfig {
  /** Maximum arms without penalty */
  maxArmsOptimal: number
  /** Absolute maximum arms (split if exceeded) */
  maxArmsAbsolute: number
  /** Minimum spacing between junctions (px) */
  minSpacing: number
  /** Allowed angles (degrees) */
  allowedAngles: number[]
  /** Snap junctions to grid */
  snapToGrid: boolean
}

/**
 * Default junction normalization config
 */
export const DEFAULT_JUNCTION_NORM_CONFIG: JunctionNormConfig = {
  maxArmsOptimal: 4,
  maxArmsAbsolute: 6,
  minSpacing: 40,
  allowedAngles: [90],
  snapToGrid: true,
}

// ============================================================================
// TTRPG ROUTING CONSTRAINTS - Non-linearity and gameplay
// ============================================================================

/**
 * Gating mix configuration (percentage of each gate type)
 */
export interface GatingMix {
  doors: number
  airlocks: number
  grilles: number
  lockedSections: number
}

/**
 * TTRPG-specific routing constraints
 */
export interface TTRPGRoutingConstraints {
  /** Minimum cycles in the graph */
  minCycles: number
  /** Alternative path ratio (0-1) */
  altPathRatio: number
  /** Chokepoint budget */
  chokepointBudget: number
  /** Gating mix percentages */
  gatingMix: GatingMix
  /** Generate encounter hooks on alternative paths */
  encounterHooks: boolean
}

/**
 * Default TTRPG constraints
 */
export const DEFAULT_TTRPG_CONSTRAINTS: TTRPGRoutingConstraints = {
  minCycles: 3,
  altPathRatio: 0.3,
  chokepointBudget: 3,
  gatingMix: {
    doors: 0.6,
    airlocks: 0.1,
    grilles: 0.15,
    lockedSections: 0.15,
  },
  encounterHooks: true,
}

// ============================================================================
// DEBUG OVERLAY OPTIONS
// ============================================================================

/**
 * Debug overlay display options
 */
export interface DebugOverlayOptions {
  /** Highlight trunk corridors */
  showTrunkCorridors: boolean
  /** Junction degree heatmap */
  junctionDegreeHeatmap: boolean
  /** Cost heatmap */
  costHeatmap: boolean
  /** Show chokepoints */
  showChokepoints: boolean
  /** Show alternative paths */
  showAlternativePaths: boolean
}

/**
 * Default debug overlay options (all off)
 */
export const DEFAULT_DEBUG_OVERLAY: DebugOverlayOptions = {
  showTrunkCorridors: false,
  junctionDegreeHeatmap: false,
  costHeatmap: false,
  showChokepoints: false,
  showAlternativePaths: false,
}

// ============================================================================
// STYLE PROFILES - Realism vs Futurism
// ============================================================================

/**
 * Style profile identifier
 */
export type StyleProfileId = 'realism' | 'futurism' | 'custom'

/**
 * Layer-specific settings for style profile
 */
export interface StyleLayerSettings {
  /** Use separate layer for service corridors */
  separateServiceLayer: boolean
  /** Strict zoning (corridors rarely cross zones) */
  strictZoning: boolean
  /** Allow large hubs/atriums */
  allowLargeHubs: boolean
  /** Multi-deck vertical connectors */
  multiDeckConnectors: boolean
}

/**
 * Complete routing style profile
 */
export interface RoutingStyleProfile {
  id: StyleProfileId
  name: string
  costs: Partial<RoutingCostConfig>
  junctionNormConfig: Partial<JunctionNormConfig>
  ttrpgConstraints: Partial<TTRPGRoutingConstraints>
  layers: StyleLayerSettings
}

/**
 * Realism profile (NASApunk / Mothership)
 */
export const REALISM_PROFILE: RoutingStyleProfile = {
  id: 'realism',
  name: 'Realism (NASApunk)',
  costs: {
    bendPenalty: 8.0,
    reuseBonusStrength: 0.3,
    crossingPenalty: 15.0,
  },
  junctionNormConfig: {
    maxArmsOptimal: 3,
    allowedAngles: [90],
  },
  ttrpgConstraints: {
    minCycles: 1,
    altPathRatio: 0.2,
  },
  layers: {
    separateServiceLayer: true,
    strictZoning: true,
    allowLargeHubs: false,
    multiDeckConnectors: false,
  },
}

/**
 * Futurism profile (Star Trek / B5)
 */
export const FUTURISM_PROFILE: RoutingStyleProfile = {
  id: 'futurism',
  name: 'Futurism (Star Trek)',
  costs: {
    bendPenalty: 3.0,
    reuseBonusStrength: 0.7,
    crossingPenalty: 5.0,
  },
  junctionNormConfig: {
    maxArmsOptimal: 4,
    allowedAngles: [45, 90],
  },
  ttrpgConstraints: {
    minCycles: 3,
    altPathRatio: 0.5,
  },
  layers: {
    separateServiceLayer: false,
    strictZoning: false,
    allowLargeHubs: true,
    multiDeckConnectors: true,
  },
}

// ============================================================================
// ROUTING ENGINE SETTINGS (EXTENDED)
// ============================================================================

/**
 * Settings for the corridor routing engine
 */
export interface CorridorRouterSettings {
  /** Snap to grid */
  gridSnap: boolean
  /** Grid size in pixels */
  gridSize: number
  /** Default clearance from walls */
  clearanceDefault: number
  /** Length of stub from port (grid units) */
  stubLength: number
  /** Penalty for turns (higher = fewer turns) - DEPRECATED: use costs.bendPenalty */
  turnPenalty: number
  /** Default intersection policy */
  intersectionPolicyDefault: IntersectionPolicy
  /** Penalty for running parallel to walls */
  parallelPenalty: number
  /** Auto-reroute on collision */
  rerouteOnCollision: boolean
  /** Default line jump style */
  lineJumpStyle: LineJumpStyle
  /** Coalesce (merge) settings */
  coalesce: CoalesceSettings
  /** Routing cost function config */
  costs: RoutingCostConfig
  /** Junction normalization config */
  junctionNormConfig: JunctionNormConfig
  /** TTRPG constraints */
  ttrpgConstraints: TTRPGRoutingConstraints
  /** Style profile */
  styleProfile: StyleProfileId
  /** Debug overlay options */
  debugOverlay: DebugOverlayOptions
}

/**
 * Default router settings
 */
export const DEFAULT_ROUTER_SETTINGS: CorridorRouterSettings = {
  gridSnap: true,
  gridSize: 40,
  clearanceDefault: 1,
  stubLength: 2,
  turnPenalty: 5,
  intersectionPolicyDefault: 'avoid',
  parallelPenalty: 1,
  rerouteOnCollision: true,
  lineJumpStyle: 'arc',
  coalesce: DEFAULT_COALESCE_SETTINGS,
  costs: DEFAULT_ROUTING_COSTS,
  junctionNormConfig: DEFAULT_JUNCTION_NORM_CONFIG,
  ttrpgConstraints: DEFAULT_TTRPG_CONSTRAINTS,
  styleProfile: 'futurism',
  debugOverlay: DEFAULT_DEBUG_OVERLAY,
}

// ============================================================================
// ROUTE REQUEST & RESULT
// ============================================================================

/**
 * Request for routing a corridor
 */
export interface RouteRequest {
  from: Point
  to: Point
  fromSide?: PortSide
  toSide?: PortSide
  lockedWaypoints: Waypoint[]
  widthClass: CorridorWidthClass
  clearance: number
  intersectionPolicy: IntersectionPolicy
}

/**
 * Result of routing attempt
 */
export interface RouteResult {
  success: boolean
  path: Point[]
  waypoints: Waypoint[]
  intersections: Array<{
    point: Point
    corridorId: string
    kind: 'junction' | 'lineJump'
  }>
  /** Warnings (non-blocking issues) */
  warnings: string[]
  /** Error message if failed */
  error?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new enhanced corridor
 */
export function createEnhancedCorridor(
  id: string,
  from: CorridorEndpoint,
  to: CorridorEndpoint,
  options?: Partial<Omit<EnhancedCorridor, 'id' | 'from' | 'to'>>
): EnhancedCorridor {
  return {
    id,
    kind: options?.kind ?? 'corridor',
    layer: options?.layer ?? 'main',
    from,
    to,
    widthClass: options?.widthClass ?? 'standard',
    clearance: options?.clearance ?? 1,
    waypoints: options?.waypoints ?? [],
    path: options?.path ?? [],
    intersectionPolicy: options?.intersectionPolicy ?? 'avoid',
    style: options?.style ?? DEFAULT_CORRIDOR_STYLES.main,
    deckLevel: options?.deckLevel ?? 0,
    isDirty: options?.isDirty ?? true,
    metadata: options?.metadata ?? {},
  }
}

/**
 * Create a new junction
 */
export function createJunction(
  id: string,
  pos: Point,
  kind: JunctionKind,
  corridorIds: string[],
  deckLevel: number = 0
): Junction {
  return {
    id,
    pos,
    kind,
    rules: {},
    connectedCorridorIds: corridorIds,
    deckLevel,
  }
}

/**
 * Create a new port
 */
export function createPort(
  id: string,
  roomId: string,
  side: PortSide,
  position: number = 0.5,
  mode: PortMode = 'fixed'
): Port {
  return {
    id,
    roomId,
    side,
    mode,
    position,
    connectedCorridorIds: [],
  }
}

/**
 * Determine junction kind based on connected corridors
 */
export function determineJunctionKind(numConnections: number): JunctionKind {
  if (numConnections >= 4) return 'hub'
  if (numConnections === 4) return 'X'
  if (numConnections === 3) return 'T'
  return 'T'
}

/**
 * Result of a coalesce operation
 */
export interface CoalesceResult {
  /** Number of duplicate segments removed */
  segmentsRemoved: number
  /** Number of segments split due to partial overlap */
  segmentsSplit: number
  /** Number of junctions created */
  junctionsCreated: number
  /** IDs of corridors that were modified */
  modifiedCorridorIds: string[]
  /** IDs of corridors that were removed (fully merged) */
  removedCorridorIds: string[]
  /** New junctions created */
  newJunctions: Junction[]
}

/**
 * A normalized segment for deduplication
 * Endpoints are ordered so that (p1.x, p1.y) <= (p2.x, p2.y) lexicographically
 */
export interface NormalizedSegment {
  /** First endpoint (lexicographically smaller) */
  p1: Point
  /** Second endpoint (lexicographically larger) */
  p2: Point
  /** Original corridor ID */
  corridorId: string
  /** Segment index in original corridor */
  segmentIndex: number
  /** Layer for merge policy */
  layer: CorridorLayer
  /** Kind for merge policy */
  kind: CorridorKind
}

/**
 * Normalize a segment so endpoints are ordered consistently
 */
export function normalizeSegment(
  start: Point,
  end: Point,
  corridorId: string,
  segmentIndex: number,
  layer: CorridorLayer = 'main',
  kind: CorridorKind = 'corridor'
): NormalizedSegment {
  // Lexicographic ordering: compare x first, then y
  const shouldSwap = start.x > end.x || (start.x === end.x && start.y > end.y)
  return {
    p1: shouldSwap ? end : start,
    p2: shouldSwap ? start : end,
    corridorId,
    segmentIndex,
    layer,
    kind,
  }
}

/**
 * Create a segment hash key for deduplication lookup
 */
export function segmentHashKey(seg: NormalizedSegment, tolerance: number): string {
  const quantize = (n: number) => Math.round(n / tolerance) * tolerance
  return `${quantize(seg.p1.x)},${quantize(seg.p1.y)}-${quantize(seg.p2.x)},${quantize(seg.p2.y)}`
}

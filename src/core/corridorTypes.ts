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
  /** Penalty for turns (higher = fewer turns) */
  turnPenalty: number
  /** Default intersection policy */
  intersectionPolicyDefault: IntersectionPolicy
  /** Penalty for running parallel to walls */
  parallelPenalty: number
  /** Auto-reroute on collision */
  rerouteOnCollision: boolean
  /** Default line jump style */
  lineJumpStyle: LineJumpStyle
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

/**
 * Marker Types - TTRPG semantic markers for maps
 * Based on Mothership Map Viewer patterns
 */

import type { Point } from './types'

// ============================================================================
// MARKER TYPES
// ============================================================================

/**
 * Marker type categories
 */
export type MarkerCategory = 
  | 'interactable'  // Things players interact with
  | 'transition'    // Movement between areas
  | 'environment'   // Environmental features
  | 'custom'        // User-defined

/**
 * Standard marker types
 */
export type MarkerType =
  // === Interactables ===
  | 'terminal'    // Computer/console
  | 'loot'        // Container/loot
  | 'npc'         // Non-player character
  | 'hazard'      // Danger zone
  | 'trap'        // Hidden trap
  | 'objective'   // Mission objective
  
  // === Transitions ===
  | 'door'        // Standard door
  | 'airlock'     // Airlock/secure door
  | 'ladder'      // Vertical access
  | 'elevator'    // Elevator shaft
  | 'hatch'       // Floor/ceiling hatch
  | 'window'      // Window/viewport
  | 'vent'        // Ventilation access
  
  // === Environment ===
  | 'light'       // Light source
  | 'camera'      // Security camera
  | 'power'       // Power panel
  | 'alarm'       // Alarm/sensor
  | 'fire'        // Fire/heat source
  | 'radiation'   // Radiation zone
  
  // === Custom ===
  | 'custom'      // User-defined marker

/**
 * Marker size options
 */
export type MarkerSize = 'small' | 'medium' | 'large'

/**
 * Marker configuration (icon, color, category)
 */
export interface MarkerTypeConfig {
  type: MarkerType
  category: MarkerCategory
  icon: string           // Emoji or icon identifier
  label: string          // Display name
  defaultColor: string   // Hex color
  description: string    // Tooltip description
}

/**
 * Standard marker type configurations
 */
export const MARKER_TYPE_CONFIGS: Record<MarkerType, MarkerTypeConfig> = {
  // Interactables
  terminal: {
    type: 'terminal',
    category: 'interactable',
    icon: '💻',
    label: 'Terminal',
    defaultColor: '#00d4ff',
    description: 'Computer terminal or console',
  },
  loot: {
    type: 'loot',
    category: 'interactable',
    icon: '📦',
    label: 'Loot',
    defaultColor: '#ffd700',
    description: 'Container, crate, or loot point',
  },
  npc: {
    type: 'npc',
    category: 'interactable',
    icon: '👤',
    label: 'NPC',
    defaultColor: '#9b59b6',
    description: 'Non-player character',
  },
  hazard: {
    type: 'hazard',
    category: 'interactable',
    icon: '⚠️',
    label: 'Hazard',
    defaultColor: '#ff6b35',
    description: 'Environmental hazard or danger zone',
  },
  trap: {
    type: 'trap',
    category: 'interactable',
    icon: '💀',
    label: 'Trap',
    defaultColor: '#e74c3c',
    description: 'Hidden trap',
  },
  objective: {
    type: 'objective',
    category: 'interactable',
    icon: '🎯',
    label: 'Objective',
    defaultColor: '#2ecc71',
    description: 'Mission objective or goal',
  },
  
  // Transitions
  door: {
    type: 'door',
    category: 'transition',
    icon: '🚪',
    label: 'Door',
    defaultColor: '#8b4513',
    description: 'Standard door',
  },
  airlock: {
    type: 'airlock',
    category: 'transition',
    icon: '🔒',
    label: 'Airlock',
    defaultColor: '#e74c3c',
    description: 'Airlock or secure door',
  },
  ladder: {
    type: 'ladder',
    category: 'transition',
    icon: '🪜',
    label: 'Ladder',
    defaultColor: '#95a5a6',
    description: 'Ladder for vertical access',
  },
  elevator: {
    type: 'elevator',
    category: 'transition',
    icon: '🛗',
    label: 'Elevator',
    defaultColor: '#3498db',
    description: 'Elevator or lift',
  },
  hatch: {
    type: 'hatch',
    category: 'transition',
    icon: '⬛',
    label: 'Hatch',
    defaultColor: '#7f8c8d',
    description: 'Floor or ceiling hatch',
  },
  window: {
    type: 'window',
    category: 'transition',
    icon: '🔲',
    label: 'Window',
    defaultColor: '#87ceeb',
    description: 'Window or viewport',
  },
  vent: {
    type: 'vent',
    category: 'transition',
    icon: '🌀',
    label: 'Vent',
    defaultColor: '#bdc3c7',
    description: 'Ventilation shaft access',
  },
  
  // Environment
  light: {
    type: 'light',
    category: 'environment',
    icon: '💡',
    label: 'Light',
    defaultColor: '#f1c40f',
    description: 'Light source',
  },
  camera: {
    type: 'camera',
    category: 'environment',
    icon: '📹',
    label: 'Camera',
    defaultColor: '#e74c3c',
    description: 'Security camera',
  },
  power: {
    type: 'power',
    category: 'environment',
    icon: '⚡',
    label: 'Power',
    defaultColor: '#f39c12',
    description: 'Power panel or junction',
  },
  alarm: {
    type: 'alarm',
    category: 'environment',
    icon: '🚨',
    label: 'Alarm',
    defaultColor: '#e74c3c',
    description: 'Alarm or sensor',
  },
  fire: {
    type: 'fire',
    category: 'environment',
    icon: '🔥',
    label: 'Fire',
    defaultColor: '#e67e22',
    description: 'Fire or heat source',
  },
  radiation: {
    type: 'radiation',
    category: 'environment',
    icon: '☢️',
    label: 'Radiation',
    defaultColor: '#27ae60',
    description: 'Radiation zone',
  },
  
  // Custom
  custom: {
    type: 'custom',
    category: 'custom',
    icon: '📍',
    label: 'Custom',
    defaultColor: '#9b59b6',
    description: 'User-defined marker',
  },
}

// ============================================================================
// MARKER ENTITY
// ============================================================================

/**
 * A marker placed on the map
 */
export interface Marker {
  id: string
  type: MarkerType
  pos: Point
  
  // === Display ===
  label?: string           // Short name
  description?: string     // GM description
  customIcon?: string      // Override icon
  color?: string           // Override color
  size: MarkerSize
  rotation: number         // Degrees
  
  // === Ownership ===
  parentId?: string        // Room/Corridor ID if nested
  parentType?: 'room' | 'corridor' | 'standalone'
  
  // === TTRPG metadata ===
  isSecret: boolean        // Hidden from players by default
  secretDC?: number        // Difficulty class to discover
  notes?: string           // GM notes
  tags?: string[]          // Custom tags for filtering
  
  // === State ===
  isRevealed: boolean      // Has been discovered
  isActive: boolean        // For toggleable markers (alarms, etc.)
}

/**
 * Create a new marker with defaults
 */
export function createMarker(
  id: string,
  type: MarkerType,
  pos: Point,
  parentId?: string,
  parentType?: 'room' | 'corridor' | 'standalone'
): Marker {
  const config = MARKER_TYPE_CONFIGS[type]
  return {
    id,
    type,
    pos,
    label: config.label,
    color: config.defaultColor,
    size: 'medium',
    rotation: 0,
    parentId,
    parentType: parentType ?? 'standalone',
    isSecret: false,
    isRevealed: true,
    isActive: true,
  }
}

// ============================================================================
// ENDPOINT MARKERS (for corridors)
// ============================================================================

/**
 * Corridor endpoint marker type
 */
export type EndpointMarkerType =
  | 'none'      // Seamless connection (junction/trunk)
  | 'door'      // Standard door
  | 'grate'     // Grate/vent passage
  | 'airlock'   // Airlock
  | 'hatch'     // Hatch
  | 'bulkhead'  // Heavy bulkhead door
  | 'locked'    // Locked door (requires key/hack)

/**
 * Endpoint marker configuration
 */
export interface EndpointMarkerConfig {
  type: EndpointMarkerType
  icon: string
  label: string
  blocksMovement: boolean  // Requires interaction to pass
  blocksVision: boolean    // Blocks line of sight when closed
  isGate: boolean          // Is a "gate" (chokepoint)
}

/**
 * Endpoint marker configurations
 */
export const ENDPOINT_MARKER_CONFIGS: Record<EndpointMarkerType, EndpointMarkerConfig> = {
  none: {
    type: 'none',
    icon: '',
    label: 'None',
    blocksMovement: false,
    blocksVision: false,
    isGate: false,
  },
  door: {
    type: 'door',
    icon: '🚪',
    label: 'Door',
    blocksMovement: true,
    blocksVision: true,
    isGate: true,
  },
  grate: {
    type: 'grate',
    icon: '▦',
    label: 'Grate',
    blocksMovement: false,
    blocksVision: false,
    isGate: false,
  },
  airlock: {
    type: 'airlock',
    icon: '🔒',
    label: 'Airlock',
    blocksMovement: true,
    blocksVision: true,
    isGate: true,
  },
  hatch: {
    type: 'hatch',
    icon: '⬛',
    label: 'Hatch',
    blocksMovement: true,
    blocksVision: true,
    isGate: true,
  },
  bulkhead: {
    type: 'bulkhead',
    icon: '🛡️',
    label: 'Bulkhead',
    blocksMovement: true,
    blocksVision: true,
    isGate: true,
  },
  locked: {
    type: 'locked',
    icon: '🔐',
    label: 'Locked',
    blocksMovement: true,
    blocksVision: true,
    isGate: true,
  },
}

// ============================================================================
// MARKER FILTERING
// ============================================================================

/**
 * Get markers by category
 */
export function getMarkersByCategory(category: MarkerCategory): MarkerType[] {
  return Object.values(MARKER_TYPE_CONFIGS)
    .filter(config => config.category === category)
    .map(config => config.type)
}

/**
 * Get all marker type options for UI dropdown
 */
export function getMarkerTypeOptions(): Array<{ value: MarkerType; label: string; icon: string }> {
  return Object.values(MARKER_TYPE_CONFIGS).map(config => ({
    value: config.type,
    label: config.label,
    icon: config.icon,
  }))
}

/**
 * Get endpoint marker options for UI dropdown
 */
export function getEndpointMarkerOptions(): Array<{ value: EndpointMarkerType; label: string; icon: string }> {
  return Object.values(ENDPOINT_MARKER_CONFIGS).map(config => ({
    value: config.type,
    label: config.label,
    icon: config.icon,
  }))
}

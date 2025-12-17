/**
 * Visibility Types - TTRPG visibility and secrets model
 * Based on Mothership Map Viewer "parent doesn't reveal children" pattern
 */

// ============================================================================
// VISIBILITY STATE
// ============================================================================

/**
 * Visibility state for map elements
 */
export type VisibilityState =
  | 'visible'    // Visible to everyone
  | 'hidden'     // Hidden from all (GM only)
  | 'fog'        // In fog of war (unexplored)
  | 'revealed'   // Was visible, now in memory (dimmed)

/**
 * GM view mode
 */
export type GMViewMode =
  | 'player'     // See what players see
  | 'gm'         // See everything including hidden
  | 'secrets'    // Highlight secrets only

// ============================================================================
// VISIBILITY SETTINGS
// ============================================================================

/**
 * Default visibility settings for new elements
 */
export interface DefaultVisibilitySettings {
  /** Default visibility for new rooms */
  rooms: VisibilityState
  /** Default visibility for new corridors */
  corridors: VisibilityState
  /** Default visibility for new markers */
  markers: VisibilityState
  /** Default visibility for new walls */
  walls: VisibilityState
  /** Default visibility for new labels */
  labels: VisibilityState
}

/**
 * Visibility inheritance rules
 * CRITICAL: By default, parent visibility does NOT reveal children
 */
export interface VisibilityInheritanceRules {
  /**
   * When room becomes visible, also reveal its markers?
   * DEFAULT: false (to avoid accidentally revealing secrets)
   */
  roomRevealsMarkers: boolean

  /**
   * When room becomes visible, also reveal internal walls?
   * DEFAULT: true (internal walls are part of room structure)
   */
  roomRevealsInternalWalls: boolean

  /**
   * When corridor becomes visible, also reveal endpoint markers?
   * DEFAULT: false (doors/airlocks might be secret)
   */
  corridorRevealsEndpoints: boolean

  /**
   * When parent is hidden, force-hide children?
   * DEFAULT: true (can't see inside a hidden room)
   */
  hiddenParentHidesChildren: boolean

  /**
   * Secret elements require explicit reveal (never auto-reveal)?
   * DEFAULT: true
   */
  secretsRequireExplicitReveal: boolean
}

/**
 * Default visibility inheritance rules
 */
export const DEFAULT_VISIBILITY_INHERITANCE: VisibilityInheritanceRules = {
  roomRevealsMarkers: false,           // CRITICAL: don't reveal secrets
  roomRevealsInternalWalls: true,      // Walls are part of structure
  corridorRevealsEndpoints: false,     // Endpoints might be secret
  hiddenParentHidesChildren: true,     // Can't see inside hidden
  secretsRequireExplicitReveal: true,  // Secrets need explicit action
}

/**
 * Default visibility settings for new elements
 */
export const DEFAULT_VISIBILITY_SETTINGS: DefaultVisibilitySettings = {
  rooms: 'fog',
  corridors: 'fog',
  markers: 'hidden',  // Markers hidden by default (GM reveals)
  walls: 'fog',
  labels: 'fog',
}

// ============================================================================
// VISIBILITY OPERATIONS
// ============================================================================

/**
 * Element with visibility
 */
export interface HasVisibility {
  id: string
  visibility: VisibilityState
  isSecret?: boolean
}

/**
 * Check if element is visible to players
 */
export function isVisibleToPlayers(element: HasVisibility): boolean {
  return element.visibility === 'visible' || element.visibility === 'revealed'
}

/**
 * Check if element should be rendered in GM view
 */
export function isVisibleInGMView(
  element: HasVisibility,
  viewMode: GMViewMode
): boolean {
  switch (viewMode) {
    case 'player':
      return isVisibleToPlayers(element)
    case 'gm':
      return true // GM sees everything
    case 'secrets':
      return element.isSecret === true
  }
}

/**
 * Get visibility CSS class for rendering
 */
export function getVisibilityClass(
  element: HasVisibility,
  viewMode: GMViewMode
): string {
  if (viewMode === 'player') {
    switch (element.visibility) {
      case 'visible': return 'visibility-visible'
      case 'revealed': return 'visibility-revealed'
      case 'fog': return 'visibility-fog'
      case 'hidden': return 'visibility-hidden'
    }
  }
  
  // GM view - show everything but with indicators
  if (element.visibility === 'hidden') {
    return 'visibility-gm-hidden' // Dashed outline, faded
  }
  if (element.isSecret) {
    return 'visibility-gm-secret' // Special highlight
  }
  return 'visibility-visible'
}

/**
 * Get visibility icon for UI
 */
export function getVisibilityIcon(state: VisibilityState): string {
  switch (state) {
    case 'visible': return '👁️'
    case 'hidden': return '🚫'
    case 'fog': return '🌫️'
    case 'revealed': return '👁️‍🗨️'
  }
}

// ============================================================================
// SECRET PASSAGES
// ============================================================================

/**
 * Secret passage configuration
 */
export interface SecretPassageConfig {
  /** Show hint to GM (dashed line, etc.) */
  showHintToGM: boolean
  /** Visual hint style */
  hintStyle: 'dashed' | 'faded' | 'icon' | 'none'
  
  /** Discovery method */
  discoveryMethod: 'manual' | 'perception' | 'interact' | 'item'
  /** DC for perception-based discovery */
  difficultyClass?: number
  /** Required item for item-based discovery */
  requiredItem?: string
  
  /** When discovered, reveal both ends? */
  revealBothEnds: boolean
  /** When discovered, also reveal connected room? */
  revealConnectedRoom: boolean
}

/**
 * Default secret passage config
 */
export const DEFAULT_SECRET_PASSAGE_CONFIG: SecretPassageConfig = {
  showHintToGM: true,
  hintStyle: 'dashed',
  discoveryMethod: 'perception',
  difficultyClass: 15,
  revealBothEnds: true,
  revealConnectedRoom: false,
}

// ============================================================================
// VISIBILITY ACTIONS
// ============================================================================

/**
 * Reveal action options
 */
export interface RevealOptions {
  /** Also reveal children (override inheritance rules) */
  includeChildren: boolean
  /** Also reveal connected elements (corridors to room, etc.) */
  includeConnected: boolean
  /** Transition animation */
  animate: boolean
}

/**
 * Default reveal options
 */
export const DEFAULT_REVEAL_OPTIONS: RevealOptions = {
  includeChildren: false,  // Respect "parent doesn't reveal children"
  includeConnected: false,
  animate: true,
}

/**
 * Batch visibility change
 */
export interface VisibilityChange {
  elementId: string
  elementType: 'room' | 'corridor' | 'marker' | 'wall' | 'label'
  newState: VisibilityState
}

/**
 * Visibility history entry (for undo)
 */
export interface VisibilityHistoryEntry {
  timestamp: number
  changes: VisibilityChange[]
  description: string
}

// ============================================================================
// FOG OF WAR
// ============================================================================

/**
 * Fog of war settings
 */
export interface FogOfWarSettings {
  /** Enable fog of war */
  enabled: boolean
  /** Fog color */
  fogColor: string
  /** Fog opacity (0-1) */
  fogOpacity: number
  /** Revealed area opacity (0-1, for "memory" effect) */
  revealedOpacity: number
  /** Show grid through fog */
  showGridThroughFog: boolean
}

/**
 * Default fog of war settings
 */
export const DEFAULT_FOG_OF_WAR: FogOfWarSettings = {
  enabled: true,
  fogColor: '#1a1a2e',
  fogOpacity: 0.9,
  revealedOpacity: 0.5,
  showGridThroughFog: false,
}

// ============================================================================
// VISIBILITY PRESETS
// ============================================================================

/**
 * Visibility preset for quick setup
 */
export interface VisibilityPreset {
  id: string
  name: string
  description: string
  defaultSettings: DefaultVisibilitySettings
  inheritance: VisibilityInheritanceRules
  fogOfWar: FogOfWarSettings
}

/**
 * Built-in visibility presets
 */
export const VISIBILITY_PRESETS: Record<string, VisibilityPreset> = {
  exploration: {
    id: 'exploration',
    name: 'Exploration Mode',
    description: 'Start with everything hidden, reveal as players explore',
    defaultSettings: {
      rooms: 'fog',
      corridors: 'fog',
      markers: 'hidden',
      walls: 'fog',
      labels: 'fog',
    },
    inheritance: {
      roomRevealsMarkers: false,
      roomRevealsInternalWalls: true,
      corridorRevealsEndpoints: false,
      hiddenParentHidesChildren: true,
      secretsRequireExplicitReveal: true,
    },
    fogOfWar: {
      enabled: true,
      fogColor: '#1a1a2e',
      fogOpacity: 0.9,
      revealedOpacity: 0.5,
      showGridThroughFog: false,
    },
  },
  
  tactical: {
    id: 'tactical',
    name: 'Tactical Mode',
    description: 'Rooms visible, markers hidden until discovered',
    defaultSettings: {
      rooms: 'visible',
      corridors: 'visible',
      markers: 'hidden',
      walls: 'visible',
      labels: 'visible',
    },
    inheritance: {
      roomRevealsMarkers: false,
      roomRevealsInternalWalls: true,
      corridorRevealsEndpoints: true,
      hiddenParentHidesChildren: true,
      secretsRequireExplicitReveal: true,
    },
    fogOfWar: {
      enabled: false,
      fogColor: '#1a1a2e',
      fogOpacity: 0.9,
      revealedOpacity: 1.0,
      showGridThroughFog: true,
    },
  },
  
  planning: {
    id: 'planning',
    name: 'Planning Mode',
    description: 'Everything visible (map planning / handout mode)',
    defaultSettings: {
      rooms: 'visible',
      corridors: 'visible',
      markers: 'visible',
      walls: 'visible',
      labels: 'visible',
    },
    inheritance: {
      roomRevealsMarkers: true,
      roomRevealsInternalWalls: true,
      corridorRevealsEndpoints: true,
      hiddenParentHidesChildren: false,
      secretsRequireExplicitReveal: false,
    },
    fogOfWar: {
      enabled: false,
      fogColor: '#1a1a2e',
      fogOpacity: 0,
      revealedOpacity: 1.0,
      showGridThroughFog: true,
    },
  },
}

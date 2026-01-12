/**
 * Map Generator Module
 * Main exports for procedural map generation
 */

// Main generator
export { generateMap, convertToEditorFormat } from './generator'
export type { GeneratorOptions, GenerationResult, EditorMapData, RoutingOptions } from './generator'

// Types
export type {
  GenerationRequest,
  RoomProgram,
  ProgrammedRoom,
  TopologyGraph,
  GraphConnector,
  DeckLayout,
  LayoutRoom,
  LayoutConnector,
  Junction,
  MapJSON,
  MapMeta,
  Archetype,
  Subtype,
  SizeTier,
  StyleProfile
} from './types'

// Configuration
export { ROOM_CONFIGS, ARCHETYPE_CONFIGS, getRoomConfigsForContext } from './roomConfigs'
export type { ArchetypeConfig } from './roomConfigs'
export type { RoomTypeConfig, CountRule } from './types'

// Utilities
export { createRNG, generateStableId } from './rng'

// Sub-generators (for advanced usage)
export { generateRoomProgram, validateRoomProgram } from './roomProgram'
export { generateTopology, validateTopology } from './topology'
export { generateLayout, validateLayout } from './layout'

// Legacy export for compatibility
export { MapGenerator, generateFromPreset, GENERATION_PRESETS } from './mapGenerator'

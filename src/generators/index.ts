/**
 * Map Generator Module
 * Main exports for procedural map generation
 */

// Main generator
export { generateMap, generateMapAsync, convertToEditorFormat } from './generator'
export type {
  CandidateGenerationHooks,
  GeneratorOptions,
  GenerationResult,
  EditorMapData,
  RoutingOptions,
} from './generator'

export { PRODUCTION_PROFILES, getCandidateCount } from './productionProfiles'
export type {
  GenerationQualityProfile,
  MapSize,
  ProductionProfile,
} from './productionProfiles'

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
  StyleProfile,
  CandidateSelectionObjectives,
  CandidateSelectionSummary
} from './types'

// Configuration
export { ROOM_CONFIGS, ARCHETYPE_CONFIGS, getRoomConfigsForContext } from './roomConfigs'
export type { ArchetypeConfig } from './roomConfigs'
export type { RoomTypeConfig, CountRule } from './types'

// Utilities
export { createRNG, generateStableId } from './rng'

// Grid candidate quality selection
export {
  deriveGridCandidateSeed,
  evaluateGridCandidate,
  generateBestGridMap,
  generateBestGridMapAsync,
  getDefaultGridCandidateCount,
  rankGridCandidates,
} from './gridGenerator'
export type {
  GridCandidateEvaluation,
  GridCandidateHardIssue,
  GridCandidateInput,
} from './gridGenerator'

// Sub-generators (for advanced usage)
export { generateRoomProgram, validateRoomProgram } from './roomProgram'

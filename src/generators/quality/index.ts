/**
 * Quality Pipeline - Public API
 * 
 * Quality-first map generation with candidate selection,
 * validation, scoring, and progressive refinement.
 */

// Types
export type {
  QualityMode,
  QualityModeConfig,
  PipelineStage,
  StageTiming,
  GenerationCandidate,
  CandidateData,
  RoomProgramEntry,
  TopologyEdge,
  PlacedRoom,
  PortData,
  RoutedCorridor,
  JunctionData,
  CandidateDebug,
  ConstraintType,
  ValidationError,
  ValidationResult,
  ScoreBreakdown,
  ScoringConfig,
  QualityStyleProfile,
  PipelineResult,
  PipelineDiagnostics,
  RefinementCallback,
  RefinementUpdate,
  RefinementOptions,
  QualityPipelineOptions,
  MapGenerationParams,
  RoomSizeConfig,
  MapJSONCompat,
} from './types'

// Constants
export {
  QUALITY_MODE_CONFIGS,
  DEFAULT_SCORING_CONFIG,
  STYLE_SCORING_ADJUSTMENTS,
  DEFAULT_ROOM_SIZES,
  getRoomSizeConfig,
} from './types'

// Validators
export {
  validateCandidate,
  validateNoRoomOverlaps,
  validateNoCorridorRoomIntersections,
  validateConnectedGraph,
  validateNoExcessiveMicroSegments,
  validateValidPorts,
  validateJunctionDegrees,
} from './validators'
export type { ValidatorOptions } from './validators'

// Scoring
export {
  scoreCandidate,
  compareCandidates,
  normalizeScore,
  calculateTotalCorridorLength,
  calculateTotalBends,
  calculateDeadEndCount,
  calculateCycleCount,
  calculateChokepointCount,
  calculateJunctionDegreeStats,
  calculateReuseRatio,
  calculateCompactness,
  calculateZoneAdherence,
} from './scoring'
export type { ScoreOptions } from './scoring'

// Pipeline
export {
  runQualityPipeline,
  generateWithQuality,
} from './pipeline'

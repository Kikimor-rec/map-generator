/**
 * Quality Pipeline Types
 * 
 * Defines types for quality-first generation with candidate selection,
 * scoring, validation, and progressive refinement.
 */

// ============================================================================
// QUALITY MODES
// ============================================================================

/**
 * Generation quality mode
 */
export type QualityMode = 'draft' | 'standard' | 'polish'

/**
 * Quality mode configuration
 */
export interface QualityModeConfig {
  /** Mode identifier */
  mode: QualityMode
  /** Time budget in milliseconds */
  budgetMs: { min: number; max: number }
  /** Maximum candidates to evaluate */
  maxCandidates: number
  /** Enable coalesce in post-processing */
  enableCoalesce: boolean
  /** Enable path simplification */
  enableSimplify: boolean
  /** Enable beautification (grid snap, etc) */
  enableBeautify: boolean
  /** Enable junction normalization */
  enableJunctionNorm: boolean
  /** Quality threshold for early exit (0-1) */
  qualityThreshold: number
  /** Validation strictness (0-1) */
  validationStrictness: number
}

/**
 * Default quality mode configurations
 */
export const QUALITY_MODE_CONFIGS: Record<QualityMode, QualityModeConfig> = {
  draft: {
    mode: 'draft',
    budgetMs: { min: 50, max: 200 },
    maxCandidates: 3,
    enableCoalesce: false,
    enableSimplify: true,
    enableBeautify: false,
    enableJunctionNorm: false,
    qualityThreshold: 0.5,
    validationStrictness: 0.5,
  },
  standard: {
    mode: 'standard',
    budgetMs: { min: 500, max: 2000 },
    maxCandidates: 20,
    enableCoalesce: true,
    enableSimplify: true,
    enableBeautify: true,
    enableJunctionNorm: true,
    qualityThreshold: 0.75,
    validationStrictness: 0.9,
  },
  polish: {
    mode: 'polish',
    budgetMs: { min: 3000, max: 10000 },
    maxCandidates: 100,
    enableCoalesce: true,
    enableSimplify: true,
    enableBeautify: true,
    enableJunctionNorm: true,
    qualityThreshold: 0.95,
    validationStrictness: 1.0,
  },
}

// ============================================================================
// PIPELINE STAGES
// ============================================================================

/**
 * Pipeline stage identifier
 */
export type PipelineStage =
  | 'roomProgram'
  | 'topology'
  | 'layout'
  | 'routing'
  | 'postProcess'
  | 'validation'

/**
 * Stage timing info
 */
export interface StageTiming {
  stage: PipelineStage
  startMs: number
  endMs: number
  durationMs: number
}

// ============================================================================
// CANDIDATE GENERATION
// ============================================================================

/**
 * Generation candidate - one possible map solution
 */
export interface GenerationCandidate {
  /** Unique candidate ID */
  id: string
  /** Seed used for this candidate */
  seed: string
  /** Candidate index (0 = first attempt) */
  index: number
  /** Is this candidate valid (passes all constraints)? */
  isValid: boolean
  /** Validation errors if invalid */
  validationErrors: ValidationError[]
  /** Quality score (higher = better) */
  score: number
  /** Score breakdown by component */
  scoreBreakdown: ScoreBreakdown
  /** Generation time in ms */
  generationTimeMs: number
  /** Stage data (rooms, corridors, etc) */
  data: CandidateData
}

/**
 * Candidate data - the actual map content
 */
export interface CandidateData {
  /** Programmed rooms from Stage A */
  rooms: RoomProgramEntry[]
  /** Topology graph from Stage B */
  graph: TopologyEdge[]
  /** Placed rooms with coordinates from Stage C */
  placedRooms: PlacedRoom[]
  /** Routed corridors from Stage D */
  corridors: RoutedCorridor[]
  /** Junctions created during routing/coalesce */
  junctions: JunctionData[]
  /** Full map data for output (created after postProcess) */
  mapData?: MapJSONCompat
  /** Debug info if enabled */
  debug?: CandidateDebug
}

/**
 * Compatible MapJSON format (to avoid circular imports)
 */
export interface MapJSONCompat {
  version: string
  meta: {
    name: string
    archetype: string
    subtype: string
    sizeTier: string
    seed: string
    generatedAt: string
    ttrpgMetrics: {
      totalRooms: number
      traversalTime: string
      encounterDensity: string
      chokepointCount: number
    }
    tags: string[]
  }
  grid: { cellSize: number; snapEnabled: boolean }
  zones: Array<{ id: string; label: string; color: string }>
  decks: Array<{
    index: number
    label: string
    gridWidth: number
    gridHeight: number
    rooms: Array<{
      id: string
      label: string
      type: string
      zone: string
      x: number
      y: number
      width: number
      height: number
      rotation: number
      ports: Array<{ id: string; side: string; position: number; connectorId: string | null }>
    }>
    connectors: Array<{
      id: string
      type: string
      /** Direct room references (compat with main generator contract) */
      fromRoomId?: string
      toRoomId?: string
      fromPort: { roomId: string; portId: string }
      toPort: { roomId: string; portId: string }
      /** Corridor path in pixel coordinates */
      path: Array<{ x: number; y: number }>
      /** Optional alias for editors expecting waypoints */
      waypoints?: Array<{ x: number; y: number }>
    }>
    junctions: Array<{
      id: string
      x: number
      y: number
      corridorIds: string[]
    }>
  }>
}

/**
 * Room program entry (Stage A output)
 */
export interface RoomProgramEntry {
  id: string
  type: string
  label: string
  importance: 'key' | 'hub' | 'normal' | 'optional'
  zone: string
  minSize: { width: number; height: number }
  targetSize: { width: number; height: number }
  weight: number
  tags: string[]
  required: boolean
}

/**
 * Topology edge (Stage B output)
 */
export interface TopologyEdge {
  id: string
  fromRoomId: string
  toRoomId: string
  kind: 'corridor' | 'door' | 'airlock' | 'bulkhead'
  required: boolean
  isBackbone: boolean
}

/**
 * Placed room with coordinates (Stage C output)
 */
export interface PlacedRoom {
  id: string
  programId: string
  x: number
  y: number
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  ports: PortData[]
}

/**
 * Port (connection point) data
 */
export interface PortData {
  id: string
  x: number
  y: number
  wall: 'top' | 'bottom' | 'left' | 'right'
  /** Alternative name for wall (for compatibility) */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Normalized position along wall (0-1) */
  position?: number
  connectedTo?: string
}

/**
 * Routed corridor (Stage D output)
 */
export interface RoutedCorridor {
  id: string
  edgeId: string
  /** Corridor type */
  type?: 'corridor' | 'door' | 'airlock' | 'bulkhead'
  /** Source room ID */
  fromRoomId?: string
  fromPortId: string
  /** Target room ID */
  toRoomId?: string
  toPortId: string
  path: Array<{ x: number; y: number }>
  width: number
  bends: number
  length: number
  /** Segment IDs that make up this corridor (for segment-based architecture) */
  segmentIds?: string[]
  /** Optional explicit segments for editor selection */
  segments?: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>
}

/**
 * Corridor Segment - basic building block for corridor networks
 * Each segment is a straight line from one point to another.
 * Segments can be shared between multiple corridors.
 */
export interface CorridorSegment {
  /** Unique segment ID */
  id: string
  /** Start point */
  from: { x: number; y: number }
  /** End point */
  to: { x: number; y: number }
  /** Segment width */
  width: number
  /** IDs of corridors that use this segment */
  corridorIds: string[]
  /** Junction at start point (if any) */
  fromJunctionId?: string
  /** Junction at end point (if any) */
  toJunctionId?: string
  /** Is this a "trunk" segment used by multiple corridors? */
  isTrunk: boolean
}

/**
 * Junction data
 */
export interface JunctionData {
  id: string
  x: number
  y: number
  degree: number
  corridorIds: string[]
  /** Segment IDs connected at this junction */
  segmentIds?: string[]
}

/**
 * Debug info for candidate
 */
export interface CandidateDebug {
  /** Heatmap of blocked areas */
  blockedZones?: Array<{ x: number; y: number; width: number; height: number }>
  /** Routing attempts and failures */
  routingAttempts?: number
  /** Collision detections */
  collisions?: Array<{ corridorId: string; roomId: string; point: { x: number; y: number } }>
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation constraint types
 */
export type ConstraintType =
  | 'RoomsOverlap'
  | 'CorridorIntersectsRoom'
  | 'DisconnectedGraph'
  | 'TooManyMicroSegments'
  | 'InvalidPorts'
  | 'JunctionDegreeExceeded'
  | 'ClearanceViolation'

/**
 * Validation error
 */
export interface ValidationError {
  type: ConstraintType
  message: string
  severity: 'error' | 'warning'
  /** Location of the issue (if applicable) */
  location?: { x: number; y: number }
  /** Related entity IDs */
  relatedIds?: string[]
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  /** Constraint check counts */
  checks: Record<ConstraintType, { passed: number; failed: number }>
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Score breakdown by component
 */
export interface ScoreBreakdown {
  /** Total score (sum of weighted components) */
  total: number
  /** Individual component scores */
  components: {
    /** Corridor length penalty */
    corridorLength: number
    /** Bend count penalty */
    bends: number
    /** Dead end penalty (or bonus if intended) */
    deadEnds: number
    /** Cycle bonus (TTRPG interest) */
    cycles: number
    /** Chokepoint penalty */
    chokepoints: number
    /** Junction degree penalty */
    junctionDegree: number
    /** Reuse bonus (trunk corridors) */
    reuse: number
    /** Compactness bonus */
    compactness: number
    /** Zone adherence bonus */
    zoneAdherence: number
  }
  /** Style profile adjustments */
  styleAdjustment: number
}

/**
 * Scoring configuration (weights)
 */
export interface ScoringConfig {
  /** Weight for corridor length (negative = penalty) */
  wLength: number
  /** Weight for bend count */
  wBends: number
  /** Weight for dead ends beyond target */
  wDeadEnds: number
  /** Weight for cycle count (positive = bonus) */
  wCycles: number
  /** Weight for chokepoints */
  wChokepoints: number
  /** Weight for junction degree over budget */
  wJunctionDegree: number
  /** Weight for reuse ratio */
  wReuse: number
  /** Weight for compactness */
  wCompactness: number
  /** Weight for zone adherence */
  wZoneAdherence: number
}

/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  wLength: -0.01,
  wBends: -2.0,
  wDeadEnds: -5.0,
  wCycles: 10.0,
  wChokepoints: -8.0,
  wJunctionDegree: -3.0,
  wReuse: 5.0,
  wCompactness: 3.0,
  wZoneAdherence: 4.0,
}

/**
 * Style-specific scoring adjustments (quality pipeline specific)
 */
export type QualityStyleProfile = 'realism' | 'futurism'

export const STYLE_SCORING_ADJUSTMENTS: Record<QualityStyleProfile, Partial<ScoringConfig>> = {
  realism: {
    wCycles: 5.0,       // Lower cycle bonus
    wBends: -3.0,       // Higher bend penalty
    wChokepoints: -12.0, // Stricter on chokepoints
  },
  futurism: {
    wCycles: 15.0,      // Higher cycle bonus
    wReuse: 8.0,        // Higher reuse bonus
    wJunctionDegree: -1.0, // Allow larger hubs
  },
}

// ============================================================================
// PIPELINE RESULT
// ============================================================================

/**
 * Full pipeline result
 */
export interface PipelineResult {
  /** Best candidate found */
  bestCandidate: GenerationCandidate | null
  /** All evaluated candidates (for debugging) */
  allCandidates: GenerationCandidate[]
  /** Number of candidates evaluated */
  candidatesEvaluated: number
  /** Number of valid candidates */
  validCandidates: number
  /** Total generation time */
  totalTimeMs: number
  /** Time budget used (0-1) */
  budgetUsed: number
  /** Stage timings */
  stageTimings: StageTiming[]
  /** Quality mode used */
  qualityMode: QualityMode
  /** Was early exit triggered? */
  earlyExit: boolean
  /** Diagnostics for debug overlay */
  diagnostics: PipelineDiagnostics
}

/**
 * Pipeline diagnostics
 */
export interface PipelineDiagnostics {
  /** Room overlap count (should be 0) */
  overlaps: number
  /** Corridor-room intersections (should be 0) */
  corridorRoomIntersections: number
  /** Total corridor length */
  totalCorridorLength: number
  /** Total bend count */
  totalBends: number
  /** Cycle count in graph */
  cycleCount: number
  /** Chokepoint count */
  chokepointCount: number
  /** Junction degree distribution */
  junctionDegreeDistribution: Record<number, number>
  /** Micro segment count */
  microSegmentCount: number
}

// ============================================================================
// PROGRESSIVE REFINEMENT
// ============================================================================

/**
 * Refinement update callback
 */
export type RefinementCallback = (update: RefinementUpdate) => void

/**
 * Refinement update (sent to UI)
 */
export interface RefinementUpdate {
  /** Update type */
  type: 'draft' | 'improved' | 'final'
  /** Current best candidate */
  candidate: GenerationCandidate
  /** Progress (0-1) */
  progress: number
  /** Time elapsed */
  elapsedMs: number
  /** Candidates evaluated so far */
  candidatesEvaluated: number
  /** Can be cancelled? */
  canCancel: boolean
}

/**
 * Refinement options
 */
export interface RefinementOptions {
  /** Callback for updates */
  onUpdate?: RefinementCallback
  /** Maximum updates to send (avoid flooding) */
  maxUpdates?: number
  /** Minimum time between updates (ms) */
  minUpdateInterval?: number
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
}

// ============================================================================
// PIPELINE OPTIONS
// ============================================================================

/**
 * Full pipeline options
 */
export interface QualityPipelineOptions {
  /** Random seed for reproducibility */
  seed: string
  /** Quality mode */
  qualityMode: QualityMode
  /** Override quality config */
  qualityConfig?: Partial<QualityModeConfig>
  /** Override scoring config */
  scoringConfig?: Partial<ScoringConfig>
  /** Quality style profile for scoring adjustments */
  styleProfile?: QualityStyleProfile
  /** Map parameters */
  mapParams: MapGenerationParams
  /** Refinement options */
  refinement?: RefinementOptions
  /** Enable debug info in candidates */
  debug?: boolean
}

/**
 * Map generation parameters
 */
export interface MapGenerationParams {
  /** Archetype (ship/station/outpost) */
  archetype: 'ship' | 'station' | 'outpost'
  /** Subtype within archetype */
  subtype: string
  /** Size tier */
  sizeTier: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Target room count (optional) */
  roomCount?: number
  /** Grid size in pixels */
  gridSize?: number
  /** Loopiness (0-1) */
  loopiness?: number
  /** Danger level (0-1) */
  danger?: number
  /** Min cycles for TTRPG interest */
  minCycles?: number
  /** Chokepoint budget */
  chokepointBudget?: number
  /** Room clearance in grid units */
  roomClearance?: number
}

// ============================================================================
// ROOM SIZE CONFIG
// ============================================================================

/**
 * Room type size configuration
 */
export interface RoomSizeConfig {
  type: string
  minWidth: number
  minHeight: number
  targetWidth: number
  targetHeight: number
  maxWidth: number
  maxHeight: number
  importance: 'key' | 'hub' | 'normal' | 'optional'
}

/**
 * Default room sizes by type (in grid units)
 */
export const DEFAULT_ROOM_SIZES: RoomSizeConfig[] = [
  // Key rooms (largest)
  { type: 'bridge', minWidth: 6, minHeight: 5, targetWidth: 8, targetHeight: 6, maxWidth: 12, maxHeight: 8, importance: 'key' },
  { type: 'engineering', minWidth: 8, minHeight: 6, targetWidth: 12, targetHeight: 8, maxWidth: 16, maxHeight: 12, importance: 'key' },
  { type: 'medbay', minWidth: 5, minHeight: 4, targetWidth: 8, targetHeight: 6, maxWidth: 10, maxHeight: 8, importance: 'key' },
  { type: 'reactor', minWidth: 6, minHeight: 6, targetWidth: 8, targetHeight: 8, maxWidth: 12, maxHeight: 12, importance: 'key' },
  
  // Hub rooms (medium-large)
  { type: 'cargoBay', minWidth: 6, minHeight: 5, targetWidth: 10, targetHeight: 8, maxWidth: 16, maxHeight: 12, importance: 'hub' },
  { type: 'hangar', minWidth: 10, minHeight: 8, targetWidth: 16, targetHeight: 12, maxWidth: 24, maxHeight: 20, importance: 'hub' },
  { type: 'commonArea', minWidth: 5, minHeight: 4, targetWidth: 7, targetHeight: 5, maxWidth: 10, maxHeight: 8, importance: 'hub' },
  { type: 'docking', minWidth: 4, minHeight: 4, targetWidth: 6, targetHeight: 6, maxWidth: 10, maxHeight: 10, importance: 'hub' },
  
  // Normal rooms (medium)
  { type: 'quarters', minWidth: 3, minHeight: 3, targetWidth: 4, targetHeight: 4, maxWidth: 6, maxHeight: 5, importance: 'normal' },
  { type: 'lab', minWidth: 4, minHeight: 3, targetWidth: 6, targetHeight: 5, maxWidth: 8, maxHeight: 6, importance: 'normal' },
  { type: 'armory', minWidth: 3, minHeight: 3, targetWidth: 5, targetHeight: 4, maxWidth: 7, maxHeight: 5, importance: 'normal' },
  { type: 'security', minWidth: 3, minHeight: 3, targetWidth: 5, targetHeight: 4, maxWidth: 6, maxHeight: 5, importance: 'normal' },
  { type: 'galley', minWidth: 3, minHeight: 3, targetWidth: 5, targetHeight: 4, maxWidth: 7, maxHeight: 5, importance: 'normal' },
  { type: 'lifePod', minWidth: 2, minHeight: 2, targetWidth: 3, targetHeight: 3, maxWidth: 4, maxHeight: 4, importance: 'normal' },
  
  // Optional rooms (small)
  { type: 'storage', minWidth: 2, minHeight: 2, targetWidth: 3, targetHeight: 3, maxWidth: 5, maxHeight: 4, importance: 'optional' },
  { type: 'maintenance', minWidth: 2, minHeight: 2, targetWidth: 3, targetHeight: 3, maxWidth: 4, maxHeight: 4, importance: 'optional' },
  { type: 'closet', minWidth: 1, minHeight: 1, targetWidth: 2, targetHeight: 2, maxWidth: 3, maxHeight: 3, importance: 'optional' },
  { type: 'airlock', minWidth: 2, minHeight: 2, targetWidth: 3, targetHeight: 2, maxWidth: 4, maxHeight: 3, importance: 'optional' },
]

/**
 * Get size config for room type
 */
export function getRoomSizeConfig(type: string): RoomSizeConfig {
  const config = DEFAULT_ROOM_SIZES.find(c => c.type === type)
  if (config) return config
  
  // Default for unknown types
  return {
    type,
    minWidth: 3,
    minHeight: 3,
    targetWidth: 5,
    targetHeight: 4,
    maxWidth: 8,
    maxHeight: 6,
    importance: 'normal',
  }
}

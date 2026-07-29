/**
 * Procedural Map Generator - Types
 * Based on specification in docs/generator/
 */

import type { MultiPolygon } from '../geometry/types'

// ============================================================================
// Input Parameters (02_input_parameters.md)
// ============================================================================

export type Archetype = 
  | 'ship' 
  | 'station' 
  | 'outpost'

export type ShipSubtype = 
  | 'courier' 
  | 'cargo' 
  | 'research' 
  | 'military' 
  | 'salvage' 
  | 'smuggler'
  | 'medical'
  | 'prison'
  | 'colony'

export type StationSubtype = 
  | 'port' 
  | 'research' 
  | 'military' 
  | 'refinery' 
  | 'habitat'
  | 'listeningPost'

export type OutpostSubtype = 
  | 'science' 
  | 'mining' 
  | 'military' 
  | 'frontier' 
  | 'ruins'
  | 'blacksite'

export type Subtype = ShipSubtype | StationSubtype | OutpostSubtype | string

export type StyleProfile = 'utilitarian' | 'military' | 'luxury' | 'industrial' | 'organic' | 'alien' | 'realism' | 'futurism'

export type SizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// Backwards compatibility aliases
export type SizeTierShort = 'xs' | 's' | 'm' | 'l' | 'xl'

// Room importance levels
export type RoomImportance = 'primary' | 'secondary' | 'tertiary'

// Zone types
export type Zone = 'core' | 'crew' | 'operations' | 'cargo' | 'special'

export interface GenerationRequest {
  // Required
  seed: string | number
  archetype: Archetype
  subtype: Subtype
  styleProfile: StyleProfile
  sizeTier: SizeTier
  
  // Geometry & readability
  gridUnit?: number
  boundsHint?: { w: number; h: number }
  symmetry?: number // 0..1
  modularity?: number // 0..1
  readability?: number // 0..1
  
  // Gameplay
  loopiness?: number // 0..1
  secretness?: number // 0..1
  danger?: number // 0..1
  setpieceBias?: number // 0..1
  
  // Decks
  decks?: number | 'auto'
  maxRoomsPerDeck?: number
  verticality?: number // 0..1
  
  // Content control
  roomCountTarget?: number
  includeList?: string[]
  excludeList?: string[]
  mustHaveSetpieces?: string[]
  accessPolicy?: 'soft' | 'strict'
  
  // Hard constraints
  maxCorridorLength?: number
  maxDeadEndRatio?: number
  minAltPathsBetweenCritical?: number
  maxRoomsTotal?: number
  
  // Output
  outputVersion?: string
  debug?: boolean
  trace?: boolean
}

// ============================================================================
// Room Program (03_room_program.md)
// ============================================================================

export type RoomCirculationRole = 'terminal' | 'through' | 'hub'

export type SizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'huge'

export type AccessLevel = 'public' | 'crew' | 'restricted' | 'secure'

export interface ProgrammedRoom {
  id: string
  roomType: string
  label: string
  importance: RoomImportance
  zone: Zone | string
  accessLevel: number
  estimatedTiles: number
  estimatedWidth: number
  estimatedHeight: number
  tags: string[]
  adjacencyPreferences: string[]
  forbiddenAdjacencies: string[]
  isExterior: boolean
  deck?: number
}

export interface RoomProgram {
  rooms: ProgrammedRoom[]
  totalRooms: number
  totalEstimatedTiles: number
  zoneDistribution: Record<string, number>
  connectorHints: ConnectorHint[]
}

export interface ConnectorHint {
  fromRoomId: string
  toRoomId: string
  preferredKind: ConnectorKind
  required: boolean
}

// ============================================================================
// Topology Graph (04_topology_graph.md)
// ============================================================================

export type ConnectorKind = 
  | 'corridor' 
  | 'door'
  | 'airlock' 
  | 'bulkhead'
  | 'serviceHatch'

export interface GraphConnector {
  id: string
  kind: ConnectorKind
  fromRoomId: string
  toRoomId: string
  isBackbone: boolean
  isVertical: boolean
}

export interface TopologyGraph {
  rooms: Array<ProgrammedRoom & { deck: number }>
  connectors: GraphConnector[]
  deckCount: number
  roomsByDeck: Record<number, string[]>
  metrics: GraphMetrics
}

export interface GraphMetrics {
  totalNodes: number
  totalEdges: number
  avgDegree: number
  loopCount: number
  backboneLength: number
  diameter: number
}

// ============================================================================
// Geometry Layout (05_layout_geometry.md)
// ============================================================================

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

export type PressureBoundaryRole = 'inner-hatch' | 'outer-hatch' | 'bulkhead'

export interface Port {
  id: string
  x: number
  y: number
  wall: 'top' | 'bottom' | 'left' | 'right'
  connectorId: string | null
  doorType?: string
  pressureRole?: PressureBoundaryRole
  pressureBoundary?: boolean
  interlockGroupId?: string
  fromCompartmentId?: string
  toCompartmentId?: string
  exterior?: boolean
}

export interface LayoutRoom {
  id: string
  roomType: string
  label: string
  x: number
  y: number
  width: number
  height: number
  gridX: number
  gridY: number
  gridWidth: number
  gridHeight: number
  zone: string
  ports: Port[]
  isExterior: boolean
  tags?: string[]
  circulationRole?: RoomCirculationRole
  interruptsBackbone?: boolean
  metadata?: RoomMetadata
  pressureCompartmentId?: string
}

/**
 * Exact endpoint topology exported by a layout engine.
 *
 * Room anchors are only valid when a concrete room port is known. Generic
 * graph nodes intentionally remain corridor points instead of being guessed
 * from a nearby room label.
 */
export type LayoutConnectorEndpointAnchor =
  | {
      kind: 'roomPort'
      roomId: string
      portId: string
      doorId?: string
      position: Point
    }
  | {
      kind: 'junction'
      junctionId: string
      position: Point
    }
  | {
      kind: 'corridorPoint'
      pointId: string
      position: Point
    }
  | {
      kind: 'free'
      position: Point
    }

export interface LayoutConnector {
  id: string
  fromRoomId: string
  toRoomId: string
  kind: ConnectorKind
  path: Point[]
  width: number
  widthClass?: 'narrow' | 'standard' | 'wide'
  startAnchor?: LayoutConnectorEndpointAnchor
  endAnchor?: LayoutConnectorEndpointAnchor
}

export interface Junction {
  id: string
  x: number
  y: number
  connectorIds: string[]
  type: 'tee' | 'cross' | 'hub'
}

export type PressureCompartmentKind = 'exterior' | 'pressurized' | 'airlock'
export type PressureNominalState = 'vacuum' | 'pressurized' | 'cycling' | 'unknown'
export type ExternalEnvironment = 'vacuum' | 'unknown'

export interface PressureCompartment {
  id: string
  label: string
  kind: PressureCompartmentKind
  nominalState: PressureNominalState
  roomIds: string[]
}

export interface PressureHatch {
  id: string
  roomId: string
  portId: string
  wall: Port['wall']
  position: Point
  doorType: 'airlock'
  pressureRole: 'outer-hatch'
  pressureBoundary: true
  interlockGroupId: string
  fromCompartmentId: string
  toCompartmentId: string
}

export interface PressureInterlockGroup {
  id: string
  chamberRoomId: string
  innerPortIds: string[]
  outerHatchId?: string
}

export interface DeckPressureTopology {
  version: 1
  outsideCompartmentId: string
  externalEnvironment: ExternalEnvironment
  compartments: PressureCompartment[]
  exteriorHatches: PressureHatch[]
  interlockGroups: PressureInterlockGroup[]
}

export interface DeckLayout {
  deckIndex: number
  gridWidth: number
  gridHeight: number
  rooms: LayoutRoom[]
  connectors: LayoutConnector[]
  junctions: Junction[]
  pressure?: DeckPressureTopology
}

// ============================================================================
// Output Contract (11_output_json_contract.md)
// ============================================================================

export interface DeckGeometry {
  readonly unitsPerCell: number
  readonly facilityEnvelope: MultiPolygon
  readonly structuralVoids: readonly MultiPolygon[]
}

export interface MapJSON {
  version: string
  meta: MapMeta
  grid: GridSettings
  zones: Array<{ id: string; label: string; color: string }>
  decks: Array<{
    index: number
    label: string
    gridWidth: number
    gridHeight: number
    rooms: LayoutRoom[]
    connectors: LayoutConnector[]
    junctions: Junction[]
    geometry?: DeckGeometry
    pressure?: DeckPressureTopology
  }>
}

export interface MapMeta {
  name: string
  archetype: Archetype
  subtype: Subtype
  sizeTier: SizeTier
  seed: string
  generatedAt: string
  ttrpgMetrics: TTRPGMetrics
  tags: string[]
  candidateSelection?: CandidateSelectionSummary
}

export interface CandidateSelectionObjectives {
  routeClarity: number
  hullUseFit: number
  ttrpgChoice: number
}

export interface CandidateSelectionSummary {
  schemaVersion: 2
  evaluatorVersion: 'grid-candidate-v2'
  masterSeed: string
  requestedCandidates: number
  evaluatedCandidates: number
  passedCandidates: number
  rejectedCandidates: number
  selectedSeed: string
  selectedIndex: number
  paretoRank: number
  balancedScore: number
  objectives: CandidateSelectionObjectives
  reasonCodes: string[]
}

export interface GridSettings {
  cellSize: number
  snapEnabled: boolean
}

export interface ZoneInfo {
  id: string
  zone: Zone
  label: string
  color: string
}

export interface TTRPGMetrics {
  totalRooms: number
  totalConnectors: number
  estimatedCombatEncounters: number
  estimatedExplorationMinutes: number
  keyLocations: number
  hiddenAreas: number
  playabilityStatus?: 'pass' | 'warning' | 'error'
  connectedRoomPercent?: number
  isolatedRooms?: number
  loopCount?: number
  deadEndRatio?: number
  corridorDeadEndCount?: number
  junctionCount?: number
  maxJunctionDegree?: number
  averageCorridorTurns?: number
  criticalReachability?: number
  reachableRoomPairPercent?: number
  alternateRoutePairPercent?: number
  alternateRoutePairCandidateCount?: number
  entryBasis?: 'provided' | 'inferred' | 'fallback-first-room' | 'none'
  circulationCycleRank?: number
  averageRoomRouteDistance?: number | null
  longestRoomRouteDistance?: number | null
  criticalRoomPairPathDistance?: number | null
  averageEntryToCriticalDistance?: number | null
  zoneTransitionCount?: number
  playabilityViolationCodes?: string[]
  throughRoomCount?: number
  circulationHubRoomCount?: number
  aestheticStatus?: 'pass' | 'warning' | 'error'
  aestheticViolationCodes?: string[]
  hullUtilizationPercent?: number
  corridorTurnRatio?: number
  clusteredJunctionPairs?: number
  ambiguousDoorCount?: number
  doorMetadataMismatchCount?: number
  facilityStructureStatus?: 'pass' | 'warning' | 'error'
  facilityStructureViolationCodes?: string[]
  hullComponentCount?: number
  structuralVoidCount?: number
  structuralVoidCollisionCount?: number
  hullAspectRatio?: number
  hullSymmetryPercent?: number
  silhouetteFitScore?: number
  pressureStatus?: 'pass' | 'warning' | 'error'
  pressureViolationCodes?: string[]
  airlockRoomCount?: number
  validAirlockRoomCount?: number
  exteriorAirlockRoomCount?: number
  internalAirlockRoomCount?: number
  pressureBoundaryDoorCount?: number
  invalidPressureDoorCount?: number
  exteriorHatchCount?: number
  unresolvedExteriorHatchCount?: number
  pressureCompartmentCount?: number
  interlockGroupCount?: number
  invalidInterlockGroupCount?: number
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  stage: string
  message: string
  roomId?: string
  connectorId?: string
}

// ============================================================================
// Room Type Config (12_room_type_catalog.md, 14_config_templates.md)
// ============================================================================

export interface RoomTypeConfig {
  id: string
  category: string
  label: string
  description: string
  countRules: CountRule[]
  sizeByTier: Partial<Record<SizeTier, { minTiles: number; maxTiles: number; ratio: string }>>
  importance: RoomImportance
  adjacencyPreferences?: string[]
  forbiddenAdjacencies?: string[]
  accessLevel: number
  tags: string[]
  isExterior?: boolean
  featureRules?: FeatureRules
  styleHints?: {
    hasViewport?: boolean
    consoleCount?: { min: number; max: number }
  }
}

export interface CountRule {
  archetype: Archetype
  subtype?: Subtype
  sizeTier?: SizeTier
  quantity: number | { min: number; max: number }
  priority: number
  scaleFactor?: number
}

// ============================================================================
// Random Number Generator
// ============================================================================

export interface SeededRNG {
  random(): number
  randomInt(min: number, max: number): number
  randomFloat(min: number, max: number): number
  pick<T>(array: T[]): T
  shuffle<T>(array: T[]): T[]
  chance(probability: number): boolean
}

// ============================================================================
// Features & Metadata (used in features.ts, objectPlacer.ts)
// ============================================================================

export interface RoomMetadata {
  hazards?: string[]
  loot?: string[]
  passives?: string[]
  description?: string
}

export interface WeightedItem {
  id: string
  weight: number
}

export interface FeatureRules {
  hazardChance?: number
  lootChance?: number
  passiveChance?: number
  possibleHazards?: WeightedItem[]
  possibleLoot?: WeightedItem[]
  possiblePassives?: WeightedItem[]
}

// ============================================================================
// Skeleton Generator Types
// ============================================================================

export interface Socket {
  id: string
  x: number
  y: number
  wall?: 'top' | 'bottom' | 'left' | 'right'
  direction?: 'top' | 'bottom' | 'left' | 'right'
  width?: number
  roomId?: string
}

/**
 * Grid-First Map Generator
 * Main entry point for tile-based procedural map generation
 *
 * Generation pipeline (v2 — graph-first approach):
 * 1. Create canvas → 2. Carve hull → 3. Partition zones
 * 4. Place rooms (graph-first, adjacency-aware) → 5. Route corridors (MST + loops)
 * 6. Place doors → 7. Convert to MapJSON
 */

import type {
  GenerationRequest,
  RoomProgram,
  MapJSON,
  SeededRNG,
} from '../types'
import { createRNG } from '../rng'
import { generateRoomProgram } from '../roomProgram'
import { generateGridMapV2 } from './occupancyGenerator'

import {
  TileType,
  type GridCanvas,
  type RoomPlacement,
  type ZoneDefinition,
} from './types'

import { createCanvas } from './canvas'
import { carveHull, getDefaultHullConfig } from './hull'
import { partitionZones, getDefaultZones } from './zones'
import { placeRoomsGraphFirst } from './roomPlacer'
import { routeCorridors, placeDoors, ensureConnectivity } from './corridorRouter'
import { convertToMapJSON, generateDebugOutput } from './convert'

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export interface GridGeneratorOptions {
  seed?: string | number
  archetype?: 'ship' | 'station' | 'outpost'
  subtype?: string
  sizeTier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  styleProfile?: string
  loopiness?: number
  danger?: number
  debug?: boolean
}

export interface GridGeneratorResult {
  success: boolean
  map?: MapJSON
  canvas?: GridCanvas
  placements?: RoomPlacement[]
  debugOutput?: string
  error?: string
  timing: {
    total: number
    hull: number
    zones: number
    spine: number
    rooms: number
    doors: number
    convert: number
  }
}

/**
 * Generate a map using the grid-first approach
 */
export function generateGridMap(options: GridGeneratorOptions = {}): GridGeneratorResult {
  return generateGridMapV2(options)

  const startTime = performance.now()
  const timing = {
    total: 0,
    hull: 0,
    zones: 0,
    spine: 0,
    rooms: 0,
    doors: 0,
    convert: 0,
  }

  try {
    // Normalize options
    const seed = options.seed ?? Date.now().toString()
    const archetype = options.archetype ?? 'ship'
    const subtype = options.subtype ?? 'explorer'
    const sizeTier = options.sizeTier ?? 'md'
    const styleProfile = options.styleProfile ?? 'utilitarian'
    const loopiness = options.loopiness ?? 0.5
    const danger = options.danger ?? 0.3

    // Create RNG
    const rng = createRNG(seed)

    // Build request for room program
    const request: GenerationRequest = {
      seed: String(seed),
      archetype,
      subtype,
      styleProfile: styleProfile as any,
      sizeTier,
      loopiness,
      danger,
    }

    // Generate room program
    const roomProgram = generateRoomProgram({ request })

    // Create canvas
    const canvas = createCanvas(archetype, sizeTier)

    // Stage 1: Carve hull shape
    const hullStart = performance.now()
    const hullConfig = getDefaultHullConfig(archetype, subtype)
    carveHull(canvas, hullConfig, rng)
    timing.hull = performance.now() - hullStart

    // Stage 2: Partition zones
    const zonesStart = performance.now()
    const zones = getDefaultZones(archetype, subtype)
    partitionZones(canvas, zones, rng)
    timing.zones = performance.now() - zonesStart

    // Stage 3: Place rooms (graph-first — rooms before corridors)
    const roomsStart = performance.now()
    const placements = placeRoomsGraphFirst(canvas, roomProgram, zones, rng)
    timing.rooms = performance.now() - roomsStart

    // Stage 4: Route corridors between rooms (MST + loop edges)
    const spineStart = performance.now()
    const junctions = routeCorridors(canvas, placements, loopiness, rng)
    timing.spine = performance.now() - spineStart

    // Stage 5: Ensure all rooms are connected
    const corridorTiles = new Set<string>()
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const tile = canvas.tiles[y][x]
        if (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION) {
          corridorTiles.add(`${x},${y}`)
        }
      }
    }
    ensureConnectivity(canvas, placements, corridorTiles)

    // Stage 6: Place doors at room-corridor boundaries
    const doorsStart = performance.now()
    placeDoors(canvas, placements)
    ensureConnectivity(canvas, placements, corridorTiles)
    placeDoors(canvas, placements)
    timing.doors = performance.now() - doorsStart

    // Stage 7: Convert to MapJSON
    const convertStart = performance.now()
    const map = convertToMapJSON(canvas, placements, zones, request, roomProgram)
    timing.convert = performance.now() - convertStart

    timing.total = performance.now() - startTime

    // Generate debug output if requested
    const debugOutput = options.debug ? generateDebugOutput(canvas) : undefined

    return {
      success: true,
      map,
      canvas,
      placements,
      debugOutput,
      timing,
    }

  } catch (error: any) {
    timing.total = performance.now() - startTime
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error as unknown),
      timing,
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Re-export types
export type {
  GridCanvas,
  RoomPlacement,
  ZoneDefinition,
  HullConfig,
} from './types'

export { TileType } from './types'

// Re-export utilities
export { createCanvas } from './canvas'
export { carveHull, getDefaultHullConfig } from './hull'
export { partitionZones, getDefaultZones } from './zones'
export { placeRoomsGraphFirst } from './roomPlacer'
export { routeCorridors, placeDoors } from './corridorRouter'
export { convertToMapJSON, generateDebugOutput } from './convert'
export { getAdjacencyWeight, mustBeExterior } from './adjacency'
export { buildCorridorGraph } from './corridorGraph'
export { analyzeConnectivity, calculateGridMetrics } from './metrics'
export {
  getPlayabilityThresholds,
  validateTTRPGPlayability,
  type PlayabilityReport,
  type PlayabilityValidationOptions,
  type PlayabilityViolation,
} from './playabilityValidator'
export {
  getAestheticThresholds,
  validateMapAesthetics,
  type AestheticReport,
  type AestheticValidationOptions,
  type AestheticViolation,
} from './aestheticValidator'
export {
  captureOriginalHullMask,
  getEnclosedStructuralVoidMasks,
  validateFacilityStructure,
  type FacilityMetrics,
  type FacilityReport,
  type FacilityViolation,
  type FacilityViolationCode,
} from './facilityValidator'
export {
  validatePressureTopology,
  type PressureMetrics,
  type PressureReport,
  type PressureViolation,
  type PressureViolationCode,
} from './pressureValidator'
export {
  buildDeckPressureTopology,
  findExteriorHatchFace,
  getAirlockCompartmentId,
  getExteriorHatchId,
  getExteriorHatchPortId,
  getInnerPortId,
  getInterlockGroupId,
  getPressureCompartmentId,
} from './pressureTopology'

export {
  deriveGridCandidateSeed,
  evaluateGridCandidate,
  generateBestGridMap,
  generateBestGridMapAsync,
  getDefaultGridCandidateCount,
  rankGridCandidates,
  type AsyncGridCandidateHooks,
  type BestGridMapResult,
  type GridCandidateEvaluation,
  type GridCandidateEvaluationContext,
  type GridCandidateHardIssue,
  type GridCandidateInput,
} from './candidateSelector'

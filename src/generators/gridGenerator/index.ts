/**
 * Grid-First Map Generator
 * Main entry point for tile-based procedural map generation
 */

import type {
  GenerationRequest,
  RoomProgram,
  MapJSON,
  DeckLayout,
  SeededRNG,
} from '../types'
import { createRNG } from '../rng'
import { generateRoomProgram } from '../roomProgram'

import {
  TileType,
  type GridCanvas,
  type RoomPlacement,
  type ZoneDefinition,
  type HullConfig,
  type SpineConfig,
  ARCHETYPE_DIMENSIONS,
} from './types'

import { createCanvas } from './canvas'
import { carveHull, getDefaultHullConfig } from './hull'
import { partitionZones, getDefaultZones } from './zones'
import { carveSpine, getDefaultSpineConfig } from './spine'
import { placeRooms, placeDoors, checkConnectivity, connectIsolatedRooms } from './rooms'
import { convertToMapJSON, convertToDeckLayout, generateDebugOutput } from './convert'

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

    // Stage 3: Carve spine/corridor network
    const spineStart = performance.now()
    const spineConfig = getDefaultSpineConfig(archetype, subtype, sizeTier)
    const junctions = carveSpine(canvas, spineConfig, rng)
    timing.spine = performance.now() - spineStart

    // Stage 4: Place rooms
    const roomsStart = performance.now()
    const placements = placeRooms(canvas, roomProgram, zones, rng)
    timing.rooms = performance.now() - roomsStart

    // Stage 5: Check connectivity and connect isolated rooms
    const connectivity = checkConnectivity(canvas, placements)
    if (!connectivity.connected) {
      connectIsolatedRooms(canvas, placements, connectivity.isolated)
    }

    // Stage 6: Place doors
    const doorsStart = performance.now()
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

  } catch (error) {
    timing.total = performance.now() - startTime
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
  SpineConfig,
} from './types'

export { TileType } from './types'

// Re-export utilities
export { createCanvas } from './canvas'
export { carveHull, getDefaultHullConfig } from './hull'
export { partitionZones, getDefaultZones } from './zones'
export { carveSpine, getDefaultSpineConfig } from './spine'
export { placeRooms, placeDoors } from './rooms'
export { convertToMapJSON, generateDebugOutput } from './convert'

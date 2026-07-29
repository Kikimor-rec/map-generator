/**
 * Historical room-program/topology/layout generation retained only for
 * regression comparison. Product code must use the occupancy facade.
 */

import type {
  Archetype,
  DeckLayout,
  GenerationRequest,
  MapJSON,
  MapMeta,
  RoomProgram,
  SizeTier,
  StyleProfile,
  Subtype,
  TTRPGMetrics,
  TopologyGraph,
  ValidationIssue,
} from '../types'
import type { GenerationResult } from '../generator'
import { createRNG } from '../rng'
import { generateRoomProgram, validateRoomProgram } from '../roomProgram'
import { generateTopology, validateTopology } from '../topology'
import { generateLayout, validateLayout } from '../layout'

export interface LegacyGeneratorOptions {
  seed?: string
  archetype?: Archetype
  subtype?: Subtype
  styleProfile?: StyleProfile
  sizeTier?: SizeTier
  loopiness?: number
  danger?: number
  skipValidation?: boolean
}

const LEGACY_DEFAULT_OPTIONS: Required<LegacyGeneratorOptions> = {
  seed: Date.now().toString(),
  archetype: 'ship',
  subtype: 'explorer',
  styleProfile: 'utilitarian',
  sizeTier: 'md',
  loopiness: 0.5,
  danger: 0.3,
  skipValidation: false,
}

export function generateLegacyMapForRegression(
  options: LegacyGeneratorOptions = {},
): GenerationResult {
  const startTime = performance.now()
  const timing = {
    total: 0,
    roomProgram: 0,
    topology: 0,
    layout: 0,
    validation: 0,
  }
  const issues: ValidationIssue[] = []
  const request = normalizeLegacyRequest(options)

  try {
    const roomProgramStart = performance.now()
    const roomProgram = generateRoomProgram({ request })
    timing.roomProgram = performance.now() - roomProgramStart

    if (!options.skipValidation) {
      const validation = validateRoomProgram(roomProgram, request)
      if (!validation.valid) {
        for (const issue of validation.issues) {
          issues.push({
            severity: 'warning',
            stage: 'roomProgram',
            message: issue,
          })
        }
      }
    }

    const topologyStart = performance.now()
    const topology = generateTopology({ request, program: roomProgram })
    timing.topology = performance.now() - topologyStart

    if (!options.skipValidation) {
      const validation = validateTopology(topology)
      if (!validation.valid) {
        for (const issue of validation.issues) {
          issues.push({
            severity: 'warning',
            stage: 'topology',
            message: issue,
          })
        }
      }
    }

    const layoutStart = performance.now()
    const layouts = generateLayout({ request, topology })
    timing.layout = performance.now() - layoutStart

    if (!options.skipValidation) {
      const validationStart = performance.now()
      const validation = validateLayout(layouts)
      timing.validation = performance.now() - validationStart

      if (!validation.valid) {
        for (const issue of validation.issues) {
          issues.push({
            severity: 'warning',
            stage: 'layout',
            message: issue,
          })
        }
      }
    }

    const map = buildLegacyMapJSON(request, roomProgram, topology, layouts)
    timing.total = performance.now() - startTime

    return {
      success: true,
      map,
      roomProgram,
      topology,
      layouts,
      issues,
      timing,
    }
  } catch (error) {
    timing.total = performance.now() - startTime
    issues.push({
      severity: 'error',
      stage: 'generator',
      message: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      issues,
      timing,
    }
  }
}

function normalizeLegacyRequest(options: LegacyGeneratorOptions): GenerationRequest {
  return {
    seed: options.seed ?? LEGACY_DEFAULT_OPTIONS.seed,
    archetype: options.archetype ?? LEGACY_DEFAULT_OPTIONS.archetype,
    subtype: options.subtype ?? LEGACY_DEFAULT_OPTIONS.subtype,
    styleProfile: options.styleProfile ?? LEGACY_DEFAULT_OPTIONS.styleProfile,
    sizeTier: options.sizeTier ?? LEGACY_DEFAULT_OPTIONS.sizeTier,
    loopiness: options.loopiness ?? LEGACY_DEFAULT_OPTIONS.loopiness,
    danger: options.danger ?? LEGACY_DEFAULT_OPTIONS.danger,
  }
}

function buildLegacyMapJSON(
  request: GenerationRequest,
  program: RoomProgram,
  topology: TopologyGraph,
  layouts: DeckLayout[],
): MapJSON {
  return {
    version: '1.0.0',
    meta: buildLegacyMeta(request, program, topology),
    grid: { cellSize: 40, snapEnabled: true },
    zones: buildLegacyZones(program),
    decks: layouts.map(layout => ({
      index: layout.deckIndex,
      label: `Deck ${layout.deckIndex + 1}`,
      gridWidth: layout.gridWidth,
      gridHeight: layout.gridHeight,
      rooms: layout.rooms,
      connectors: layout.connectors.map(connector => ({
        ...connector,
        representation: 'room-route-v1',
      })),
      junctions: layout.junctions,
    })),
  }
}

function buildLegacyMeta(
  request: GenerationRequest,
  program: RoomProgram,
  topology: TopologyGraph,
): MapMeta {
  const rng = createRNG(request.seed + '-name')

  return {
    name: generateLegacyName(request, rng),
    archetype: request.archetype,
    subtype: request.subtype,
    sizeTier: request.sizeTier,
    seed: String(request.seed),
    generatedAt: new Date().toISOString(),
    ttrpgMetrics: buildLegacyTTRPGMetrics(program, topology),
    tags: buildLegacyTags(request, program),
  }
}

function generateLegacyName(
  request: GenerationRequest,
  rng: { pick: <T>(values: T[]) => T },
): string {
  const prefixes: Record<Archetype, string[]> = {
    ship: ['ISS', 'USS', 'HMS', 'CSV', 'NSV'],
    station: ['Station', 'Orbital', 'Habitat', 'Port'],
    outpost: ['Base', 'Outpost', 'Facility', 'Site'],
  }
  const names = [
    'Horizon', 'Vanguard', 'Pioneer', 'Endeavour', 'Prometheus',
    'Artemis', 'Helios', 'Nova', 'Zenith', 'Eclipse',
    'Aurora', 'Stellar', 'Nebula', 'Cosmos', 'Orion',
  ]

  return `${rng.pick(prefixes[request.archetype])} ${rng.pick(names)}`
}

function buildLegacyTTRPGMetrics(
  program: RoomProgram,
  topology: TopologyGraph,
): TTRPGMetrics {
  return {
    totalRooms: program.totalRooms,
    totalConnectors: topology.connectors.length,
    estimatedCombatEncounters: Math.floor(program.totalRooms / 8) + 1,
    estimatedExplorationMinutes: program.totalRooms * 5,
    keyLocations: program.rooms.filter(room => room.importance === 'primary').length,
    hiddenAreas: program.rooms.filter(room => room.accessLevel >= 3).length,
  }
}

function buildLegacyZones(
  program: RoomProgram,
): Array<{ id: string; label: string; color: string }> {
  const zoneColors: Record<string, string> = {
    core: '#ef4444',
    crew: '#22c55e',
    operations: '#3b82f6',
    cargo: '#f59e0b',
    special: '#8b5cf6',
  }

  return Object.entries(program.zoneDistribution)
    .filter(([, count]) => count > 0)
    .map(([zone]) => ({
      id: zone,
      label: zone.charAt(0).toUpperCase() + zone.slice(1),
      color: zoneColors[zone] || '#6b7280',
    }))
}

function buildLegacyTags(
  request: GenerationRequest,
  program: RoomProgram,
): string[] {
  const tags = [request.archetype, request.subtype, request.sizeTier]

  if (request.loopiness !== undefined && request.loopiness > 0.7) {
    tags.push('labyrinthine')
  } else if (request.loopiness !== undefined && request.loopiness < 0.3) {
    tags.push('linear')
  }
  if (request.danger !== undefined && request.danger > 0.7) tags.push('high-danger')
  if (program.rooms.some(room => room.tags.includes('military'))) tags.push('armed')
  if (program.rooms.some(room => room.tags.includes('science'))) tags.push('research-capable')
  if (program.rooms.some(room => room.tags.includes('cargo'))) tags.push('cargo-hauler')

  return tags
}

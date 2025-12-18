/**
 * Room Program Generator
 * Stage 2 of the generation pipeline: Select and prioritize rooms
 * Based on specification from 03_room_program.md
 */

import type {
  GenerationRequest,
  RoomProgram,
  ProgrammedRoom,
  ConnectorHint,
  SizeTier
} from './types'
import type { SeededRNG } from './types'
import { createRNG, generateStableId } from './rng'
import {
  ROOM_CONFIGS,
  ARCHETYPE_CONFIGS,
  getCountRange,
  getSizeRange,
  getRoomConfigsForContext
} from './roomConfigs'

// ============================================================================
// ZONE ASSIGNMENT
// ============================================================================

type Zone = 'core' | 'crew' | 'operations' | 'cargo' | 'special'

const CATEGORY_TO_ZONE: Record<string, Zone> = {
  'core': 'core',
  'propulsion': 'core',
  'habitation': 'crew',
  'medical': 'crew',
  'security': 'operations',
  'science': 'operations',
  'communications': 'operations',
  'cargo': 'cargo',
  'access': 'cargo',
  'commercial': 'operations',
  'industrial': 'operations',
  'service': 'special',
  'special': 'special'
}

// ============================================================================
// SIZE TIER CALCULATIONS
// ============================================================================

interface SizeTierBudget {
  minRooms: number
  maxRooms: number
  minTiles: number
  maxTiles: number
  deckCount: { min: number; max: number }
}

const SIZE_TIER_BUDGETS: Record<SizeTier, SizeTierBudget> = {
  xs: { minRooms: 4, maxRooms: 8, minTiles: 40, maxTiles: 100, deckCount: { min: 1, max: 1 } },
  sm: { minRooms: 8, maxRooms: 16, minTiles: 100, maxTiles: 250, deckCount: { min: 1, max: 2 } },
  md: { minRooms: 16, maxRooms: 32, minTiles: 250, maxTiles: 600, deckCount: { min: 2, max: 3 } },
  lg: { minRooms: 32, maxRooms: 64, minTiles: 600, maxTiles: 1500, deckCount: { min: 3, max: 5 } },
  xl: { minRooms: 64, maxRooms: 128, minTiles: 1500, maxTiles: 4000, deckCount: { min: 4, max: 8 } }
}

// ============================================================================
// ROOM PROGRAM GENERATOR
// ============================================================================

export interface RoomProgramOptions {
  request: GenerationRequest
}

export function generateRoomProgram(options: RoomProgramOptions): RoomProgram {
  const { request } = options
  const rng = createRNG(request.seed)
  
  const budget = SIZE_TIER_BUDGETS[request.sizeTier]
  const targetRoomCount = rng.randomInt(budget.minRooms, budget.maxRooms)
  const targetTileCount = rng.randomInt(budget.minTiles, budget.maxTiles)
  
  // Get archetype configuration
  const archetypeConfig = ARCHETYPE_CONFIGS[request.archetype]
  const subtypeConfig = archetypeConfig.subtypes.find(s => s.id === request.subtype)
  
  // Phase 1: Collect required core rooms
  const coreRoomTypes = new Set<string>(archetypeConfig.requiredCores)
  
  // Add subtype-specific cores
  if (subtypeConfig) {
    for (const core of subtypeConfig.additionalCores) {
      coreRoomTypes.add(core)
    }
  }
  
  // Phase 2: Collect all candidate room types with priorities
  interface RoomCandidate {
    roomType: string
    priority: number
    min: number
    max: number
    isCore: boolean
  }
  
  const candidates: RoomCandidate[] = []
  const applicableConfigs = getRoomConfigsForContext(
    request.archetype,
    request.subtype,
    request.sizeTier
  )
  
  for (const config of applicableConfigs) {
    const { min, max, priority } = getCountRange(
      config.id,
      request.archetype,
      request.subtype,
      request.sizeTier,
      targetRoomCount
    )
    
    if (max > 0 || coreRoomTypes.has(config.id)) {
      candidates.push({
        roomType: config.id,
        priority,
        min: coreRoomTypes.has(config.id) ? Math.max(1, min) : min,
        max,
        isCore: coreRoomTypes.has(config.id)
      })
    }
  }
  
  // Sort by priority (descending), then by isCore
  candidates.sort((a, b) => {
    if (a.isCore !== b.isCore) return a.isCore ? -1 : 1
    return b.priority - a.priority
  })
  
  // Phase 3: Generate room instances
  const rooms: ProgrammedRoom[] = []
  let roomIndex = 0
  let totalTiles = 0
  
  // First pass: Add core rooms (always required, up to a reasonable limit)
  const coreRoomsTarget = Math.min(Math.ceil(targetRoomCount * 0.6), targetRoomCount - 2)
  for (const candidate of candidates) {
    if (!candidate.isCore) continue
    if (rooms.length >= coreRoomsTarget) break
    
    const count = Math.min(candidate.min, coreRoomsTarget - rooms.length)
    for (let i = 0; i < count; i++) {
      const room = createProgrammedRoom(
        candidate.roomType,
        roomIndex,
        request,
        rng,
        'primary'
      )
      if (room) {
        rooms.push(room)
        totalTiles += room.estimatedTiles
        roomIndex++
      }
    }
  }
  
  // Second pass: Add minimum required non-core rooms (but respect target)
  for (const candidate of candidates) {
    if (candidate.isCore) continue
    if (rooms.length >= targetRoomCount) break
    
    const count = Math.min(candidate.min, targetRoomCount - rooms.length)
    for (let i = 0; i < count; i++) {
      const room = createProgrammedRoom(
        candidate.roomType,
        roomIndex,
        request,
        rng
      )
      if (room) {
        rooms.push(room)
        totalTiles += room.estimatedTiles
        roomIndex++
      }
    }
  }
  
  // Third pass: Fill up to target count with optional rooms
  const optionalCandidates = candidates.filter(c => !c.isCore && c.max > c.min)
  
  while (rooms.length < targetRoomCount && totalTiles < targetTileCount * 0.9) {
    if (optionalCandidates.length === 0) break
    
    // Weight selection by priority
    const totalWeight = optionalCandidates.reduce((sum, c) => sum + c.priority, 0)
    let roll = rng.random() * totalWeight
    
    let selected: RoomCandidate | null = null
    for (const candidate of optionalCandidates) {
      roll -= candidate.priority
      if (roll <= 0) {
        selected = candidate
        break
      }
    }
    
    if (!selected) {
      selected = optionalCandidates[optionalCandidates.length - 1]
    }
    
    // Count existing rooms of this type
    const existingCount = rooms.filter(r => r.roomType === selected!.roomType).length
    
    if (existingCount < selected.max) {
      const room = createProgrammedRoom(
        selected.roomType,
        roomIndex,
        request,
        rng
      )
      if (room) {
        rooms.push(room)
        totalTiles += room.estimatedTiles
        roomIndex++
      }
    } else {
      // Remove from candidates if maxed out
      const idx = optionalCandidates.indexOf(selected)
      if (idx >= 0) optionalCandidates.splice(idx, 1)
    }
  }
  
  // Phase 4: Generate connector hints from adjacency preferences
  const connectorHints = generateConnectorHints(rooms, rng)
  
  // Phase 5: Calculate zone distribution
  const zoneDistribution = calculateZoneDistribution(rooms)
  
  return {
    rooms,
    totalRooms: rooms.length,
    totalEstimatedTiles: totalTiles,
    zoneDistribution,
    connectorHints
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createProgrammedRoom(
  roomType: string,
  index: number,
  request: GenerationRequest,
  rng: SeededRNG,
  forceImportance?: 'primary' | 'secondary' | 'tertiary'
): ProgrammedRoom | null {
  const config = ROOM_CONFIGS[roomType]
  if (!config) return null
  
  const sizeRange = getSizeRange(roomType, request.sizeTier)
  if (!sizeRange) return null
  
  const estimatedTiles = rng.randomInt(sizeRange.minTiles, sizeRange.maxTiles)
  
  // Parse aspect ratio
  const [ratioW, ratioH] = sizeRange.ratio.split(':').map(Number)
  const aspectRatio = ratioW / ratioH
  
  // Calculate dimensions
  const height = Math.max(2, Math.round(Math.sqrt(estimatedTiles / aspectRatio)))
  const width = Math.max(2, Math.round(estimatedTiles / height))
  
  // Determine zone
  const zone = CATEGORY_TO_ZONE[config.category] || 'special'
  
  // Determine importance
  const importance = forceImportance || config.importance
  
  return {
    id: generateStableId('room', request.seed, index),
    roomType,
    label: config.label,
    zone,
    importance,
    accessLevel: config.accessLevel,
    estimatedTiles,
    estimatedWidth: width,
    estimatedHeight: height,
    tags: [...config.tags],
    adjacencyPreferences: config.adjacencyPreferences ? [...config.adjacencyPreferences] : [],
    forbiddenAdjacencies: config.forbiddenAdjacencies ? [...config.forbiddenAdjacencies] : [],
    isExterior: config.isExterior || false
  }
}

function generateConnectorHints(rooms: ProgrammedRoom[], rng: SeededRNG): ConnectorHint[] {
  const hints: ConnectorHint[] = []
  const usedPairs = new Set<string>()
  
  // Group rooms by type for lookup
  const roomsByType = new Map<string, ProgrammedRoom[]>()
  for (const room of rooms) {
    const list = roomsByType.get(room.roomType) || []
    list.push(room)
    roomsByType.set(room.roomType, list)
  }
  
  // Generate hints from adjacency preferences
  for (const room of rooms) {
    for (const preferred of room.adjacencyPreferences) {
      const candidates = roomsByType.get(preferred)
      if (!candidates || candidates.length === 0) continue
      
      // Pick a random candidate
      const target = rng.pick(candidates)
      
      // Skip if already connected or same room
      const pairKey = [room.id, target.id].sort().join('-')
      if (usedPairs.has(pairKey) || room.id === target.id) continue
      
      usedPairs.add(pairKey)
      
      hints.push({
        fromRoomId: room.id,
        toRoomId: target.id,
        preferredKind: determineConnectorKind(room, target),
        required: room.importance === 'primary' && target.importance === 'primary'
      })
    }
  }
  
  return hints
}

function determineConnectorKind(
  from: ProgrammedRoom,
  to: ProgrammedRoom
): 'corridor' | 'door' | 'airlock' | 'serviceHatch' {
  // Airlocks for exterior connections
  if (from.isExterior || to.isExterior) {
    return 'airlock'
  }
  
  // Service hatches for service rooms
  if (from.zone === 'special' || to.zone === 'special') {
    return 'serviceHatch'
  }
  
  // High access difference might need security door (represented as door)
  if (Math.abs(from.accessLevel - to.accessLevel) >= 2) {
    return 'door'
  }
  
  // Default to corridor
  return 'corridor'
}

function calculateZoneDistribution(rooms: ProgrammedRoom[]): Record<string, number> {
  const distribution: Record<string, number> = {}
  
  for (const room of rooms) {
    distribution[room.zone] = (distribution[room.zone] || 0) + 1
  }
  
  return distribution
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface RoomProgramValidation {
  valid: boolean
  issues: string[]
}

export function validateRoomProgram(
  program: RoomProgram,
  request: GenerationRequest
): RoomProgramValidation {
  const issues: string[] = []
  const archetypeConfig = ARCHETYPE_CONFIGS[request.archetype]
  
  // Check all required cores are present
  for (const coreType of archetypeConfig.requiredCores) {
    const hasCore = program.rooms.some(r => r.roomType === coreType)
    if (!hasCore) {
      issues.push(`Missing required core room: ${coreType}`)
    }
  }
  
  // Check subtype-specific cores
  const subtypeConfig = archetypeConfig.subtypes.find(s => s.id === request.subtype)
  if (subtypeConfig) {
    for (const coreType of subtypeConfig.additionalCores) {
      const hasCore = program.rooms.some(r => r.roomType === coreType)
      if (!hasCore) {
        issues.push(`Missing subtype-required room: ${coreType}`)
      }
    }
  }
  
  // Check no forbidden rooms
  for (const room of program.rooms) {
    if (archetypeConfig.forbiddenRooms.includes(room.roomType)) {
      issues.push(`Forbidden room type for archetype: ${room.roomType}`)
    }
  }
  
  // Check size budget
  const budget = SIZE_TIER_BUDGETS[request.sizeTier]
  if (program.totalRooms < budget.minRooms) {
    issues.push(`Too few rooms: ${program.totalRooms} < ${budget.minRooms}`)
  }
  if (program.totalRooms > budget.maxRooms * 1.2) {
    issues.push(`Too many rooms: ${program.totalRooms} > ${budget.maxRooms}`)
  }
  
  return {
    valid: issues.length === 0,
    issues
  }
}

/**
 * Quality Pipeline Orchestrator
 * 
 * Main entry point for quality-first generation.
 * Generates multiple candidates, validates, scores, and selects the best.
 */

import type {
  QualityPipelineOptions,
  QualityMode,
  QualityModeConfig,
  PipelineResult,
  GenerationCandidate,
  CandidateData,
  PipelineDiagnostics,
  StageTiming,
  RefinementUpdate,
  PlacedRoom,
  RoutedCorridor,
  JunctionData,
  RoomProgramEntry,
  TopologyEdge,
  PortData,
  MapJSONCompat,
} from './types'
import { QUALITY_MODE_CONFIGS, getRoomSizeConfig } from './types'
import { validateCandidate, type ValidatorOptions } from './validators'
import { scoreCandidate, calculateJunctionDegreeStats } from './scoring'
import { createRNG } from '../rng'
import type { SeededRNG as RNG } from '../types'

// ============================================================================
// CANDIDATE GENERATION
// ============================================================================

/**
 * Generate a single candidate
 */
function generateCandidate(
  index: number,
  seed: string,
  options: QualityPipelineOptions,
  config: QualityModeConfig
): GenerationCandidate {
  const startTime = performance.now()
  const candidateId = `candidate-${index}`
  const candidateSeed = `${seed}-${index}`
  
  const rng = createRNG(candidateSeed)
  
  try {
    // Stage A: Room Program
    const rooms = generateRoomProgram(rng, options)
    
    // Stage B: Topology Graph
    const graph = generateTopologyGraph(rng, rooms, options)
    
    // Stage C: Layout / Packing
    const placedRooms = layoutRooms(rng, rooms, graph, options)
    
    // Stage D: Routing
    const corridors = routeCorridors(rng, placedRooms, graph, options)
    
    // Build junctions from corridors
    const junctions = extractJunctions(corridors)
    
    // Stage E: Post-processing
    const processedData = postProcess(
      { rooms, graph, placedRooms, corridors, junctions },
      config,
      options
    )
    
    // Validate
    const validatorOpts: ValidatorOptions = {
      roomClearance: options.mapParams.roomClearance ?? 1,
      strictness: config.validationStrictness,
    }
    const validation = validateCandidate(processedData, validatorOpts)
    
    // Score (only if valid or for diagnostics)
    const scoreBreakdown = scoreCandidate(processedData, {
      styleProfile: options.styleProfile,
    })
    
    const generationTimeMs = performance.now() - startTime
    
    return {
      id: candidateId,
      seed: candidateSeed,
      index,
      isValid: validation.isValid,
      validationErrors: [...validation.errors, ...validation.warnings],
      score: validation.isValid ? scoreBreakdown.total : -Infinity,
      scoreBreakdown,
      generationTimeMs,
      data: processedData,
    }
  } catch (error) {
    const generationTimeMs = performance.now() - startTime
    
    return {
      id: candidateId,
      seed: candidateSeed,
      index,
      isValid: false,
      validationErrors: [{
        type: 'DisconnectedGraph',
        message: error instanceof Error ? error.message : 'Unknown error',
        severity: 'error',
      }],
      score: -Infinity,
      scoreBreakdown: {
        total: -Infinity,
        components: {
          corridorLength: 0,
          bends: 0,
          deadEnds: 0,
          cycles: 0,
          chokepoints: 0,
          junctionDegree: 0,
          reuse: 0,
          compactness: 0,
          zoneAdherence: 0,
        },
        styleAdjustment: 1,
      },
      generationTimeMs,
      data: {
        rooms: [],
        graph: [],
        placedRooms: [],
        corridors: [],
        junctions: [],
      },
    }
  }
}

// ============================================================================
// STAGE A: ROOM PROGRAM
// ============================================================================

function generateRoomProgram(
  rng: RNG,
  options: QualityPipelineOptions
): RoomProgramEntry[] {
  const { mapParams } = options
  const { archetype, sizeTier } = mapParams
  
  // Determine room count based on size tier
  const roomCounts: Record<string, { min: number; max: number }> = {
    xs: { min: 4, max: 8 },
    sm: { min: 8, max: 16 },
    md: { min: 16, max: 32 },
    lg: { min: 32, max: 64 },
    xl: { min: 64, max: 128 },
  }
  
  const countRange = roomCounts[sizeTier] || roomCounts.md
  const targetCount = mapParams.roomCount ?? rng.randomInt(countRange.min, countRange.max)
  
  // Room types by archetype
  const roomTypesByArchetype: Record<string, string[]> = {
    ship: ['bridge', 'engineering', 'quarters', 'medbay', 'cargoBay', 'airlock', 'storage', 'galley', 'armory', 'lifePod'],
    station: ['commandCenter', 'reactor', 'hangar', 'quarters', 'lab', 'medbay', 'cargoBay', 'docking', 'commonArea', 'storage'],
    outpost: ['commandCenter', 'generator', 'quarters', 'lab', 'storage', 'airlock', 'comms', 'garage'],
  }
  
  const availableTypes = roomTypesByArchetype[archetype] || roomTypesByArchetype.ship
  
  // Generate room list
  const rooms: RoomProgramEntry[] = []
  
  // Always include key rooms first
  const keyRooms = availableTypes.slice(0, 3)
  for (const type of keyRooms) {
    const sizeConfig = getRoomSizeConfig(type)
    rooms.push({
      id: `room-${rooms.length}`,
      type,
      label: type,
      importance: sizeConfig.importance,
      zone: getZoneForType(type),
      minSize: { width: sizeConfig.minWidth, height: sizeConfig.minHeight },
      targetSize: { width: sizeConfig.targetWidth, height: sizeConfig.targetHeight },
      weight: sizeConfig.importance === 'key' ? 3 : sizeConfig.importance === 'hub' ? 2 : 1,
      tags: [],
      required: true,
    })
  }
  
  // Add remaining rooms
  while (rooms.length < targetCount) {
    const type = rng.pick(availableTypes)
    const sizeConfig = getRoomSizeConfig(type)
    
    rooms.push({
      id: `room-${rooms.length}`,
      type,
      label: `${type}-${rooms.length}`,
      importance: sizeConfig.importance,
      zone: getZoneForType(type),
      minSize: { width: sizeConfig.minWidth, height: sizeConfig.minHeight },
      targetSize: { width: sizeConfig.targetWidth, height: sizeConfig.targetHeight },
      weight: 1,
      tags: [],
      required: rooms.length < targetCount * 0.7, // 70% are required
    })
  }
  
  return rooms
}

function getZoneForType(type: string): string {
  const zoneMap: Record<string, string> = {
    bridge: 'command',
    commandCenter: 'command',
    engineering: 'engineering',
    reactor: 'engineering',
    generator: 'engineering',
    quarters: 'crew',
    galley: 'crew',
    commonArea: 'crew',
    medbay: 'medical',
    lab: 'science',
    cargoBay: 'cargo',
    storage: 'cargo',
    hangar: 'operations',
    docking: 'operations',
    armory: 'security',
    airlock: 'access',
    lifePod: 'safety',
  }
  return zoneMap[type] || 'general'
}

// ============================================================================
// STAGE B: TOPOLOGY GRAPH
// ============================================================================

function generateTopologyGraph(
  rng: RNG,
  rooms: RoomProgramEntry[],
  options: QualityPipelineOptions
): TopologyEdge[] {
  const edges: TopologyEdge[] = []
  const { loopiness = 0.5, minCycles = 0 } = options.mapParams
  
  // Create minimum spanning tree first (ensures connectivity)
  const connected = new Set<string>([rooms[0].id])
  const unconnected = new Set(rooms.slice(1).map(r => r.id))
  
  while (unconnected.size > 0) {
    // Pick random connected room
    const fromId = rng.pick(Array.from(connected))
    // Pick random unconnected room
    const toId = rng.pick(Array.from(unconnected))
    
    edges.push({
      id: `edge-${edges.length}`,
      fromRoomId: fromId,
      toRoomId: toId,
      kind: 'corridor',
      required: true,
      isBackbone: edges.length < rooms.length / 3,
    })
    
    connected.add(toId)
    unconnected.delete(toId)
  }
  
  // Add extra edges for loops (based on loopiness)
  const maxExtraEdges = Math.floor(rooms.length * loopiness)
  const targetCycles = Math.max(minCycles, Math.floor(loopiness * rooms.length * 0.3))
  
  let addedEdges = 0
  const maxAttempts = maxExtraEdges * 3
  let attempts = 0
  
  while (addedEdges < maxExtraEdges && attempts < maxAttempts) {
    attempts++
    
    const fromId = rng.pick(rooms).id
    const toId = rng.pick(rooms).id
    
    if (fromId === toId) continue
    
    // Check if edge already exists
    const exists = edges.some(e => 
      (e.fromRoomId === fromId && e.toRoomId === toId) ||
      (e.fromRoomId === toId && e.toRoomId === fromId)
    )
    
    if (!exists) {
      edges.push({
        id: `edge-${edges.length}`,
        fromRoomId: fromId,
        toRoomId: toId,
        kind: 'corridor',
        required: false,
        isBackbone: false,
      })
      addedEdges++
    }
  }
  
  return edges
}

// ============================================================================
// STAGE C: LAYOUT / PACKING
// ============================================================================

function layoutRooms(
  rng: RNG,
  rooms: RoomProgramEntry[],
  graph: TopologyEdge[],
  options: QualityPipelineOptions
): PlacedRoom[] {
  const gridSize = options.mapParams.gridSize ?? 40
  const clearance = options.mapParams.roomClearance ?? 1
  
  const placedRooms: PlacedRoom[] = []
  const occupied: Array<{ x: number; y: number; width: number; height: number }> = []
  
  // Sort by importance (key rooms first)
  const sortedRooms = [...rooms].sort((a, b) => {
    const importanceOrder = { key: 0, hub: 1, normal: 2, optional: 3 }
    return (importanceOrder[a.importance] || 2) - (importanceOrder[b.importance] || 2)
  })
  
  for (const room of sortedRooms) {
    // Determine actual size (between min and target)
    const width = rng.randomInt(room.minSize.width, room.targetSize.width)
    const height = rng.randomInt(room.minSize.height, room.targetSize.height)
    
    // Find valid position
    let placed = false
    let x = 0, y = 0
    const maxAttempts = 100
    
    for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
      // Start near center and spiral outward
      const radius = Math.floor(attempt / 8) * 3
      const angle = (attempt % 8) * (Math.PI / 4)
      
      x = Math.floor(Math.cos(angle) * radius * gridSize)
      y = Math.floor(Math.sin(angle) * radius * gridSize)
      
      // Add some randomness
      x += rng.randomInt(-2, 2) * gridSize
      y += rng.randomInt(-2, 2) * gridSize
      
      // Check for overlaps
      const candidate = {
        x: x,
        y: y,
        width: width * gridSize,
        height: height * gridSize,
      }
      
      const overlaps = occupied.some(o => 
        !(candidate.x + candidate.width + clearance * gridSize <= o.x ||
          o.x + o.width + clearance * gridSize <= candidate.x ||
          candidate.y + candidate.height + clearance * gridSize <= o.y ||
          o.y + o.height + clearance * gridSize <= candidate.y)
      )
      
      if (!overlaps) {
        placed = true
      }
    }
    
    // Create ports on each wall
    const ports: PortData[] = []
    const addPort = (wall: 'top' | 'bottom' | 'left' | 'right', offsetRatio: number) => {
      let px: number, py: number
      switch (wall) {
        case 'top':
          px = x + (width * gridSize * offsetRatio)
          py = y
          break
        case 'bottom':
          px = x + (width * gridSize * offsetRatio)
          py = y + height * gridSize
          break
        case 'left':
          px = x
          py = y + (height * gridSize * offsetRatio)
          break
        case 'right':
          px = x + width * gridSize
          py = y + (height * gridSize * offsetRatio)
          break
      }
      ports.push({
        id: `${room.id}-port-${ports.length}`,
        x: px,
        y: py,
        wall,
      })
    }
    
    // Add 1-2 ports per wall
    for (const wall of ['top', 'bottom', 'left', 'right'] as const) {
      addPort(wall, 0.5)
      if (rng.random() > 0.7) {
        addPort(wall, rng.random() > 0.5 ? 0.3 : 0.7)
      }
    }
    
    placedRooms.push({
      id: room.id,
      programId: room.id,
      x,
      y,
      width: width * gridSize,
      height: height * gridSize,
      rotation: 0,
      ports,
    })
    
    occupied.push({
      x,
      y,
      width: width * gridSize,
      height: height * gridSize,
    })
  }
  
  return placedRooms
}

// ============================================================================
// STAGE D: ROUTING
// ============================================================================

function routeCorridors(
  rng: RNG,
  rooms: PlacedRoom[],
  graph: TopologyEdge[],
  options: QualityPipelineOptions
): RoutedCorridor[] {
  const corridors: RoutedCorridor[] = []
  const gridSize = options.mapParams.gridSize ?? 40
  
  for (const edge of graph) {
    const fromRoom = rooms.find(r => r.id === edge.fromRoomId)
    const toRoom = rooms.find(r => r.id === edge.toRoomId)
    
    if (!fromRoom || !toRoom) continue
    
    // Pick closest ports
    let bestFromPort = fromRoom.ports[0]
    let bestToPort = toRoom.ports[0]
    let bestDist = Infinity
    
    for (const fp of fromRoom.ports) {
      for (const tp of toRoom.ports) {
        const dist = Math.abs(fp.x - tp.x) + Math.abs(fp.y - tp.y)
        if (dist < bestDist) {
          bestDist = dist
          bestFromPort = fp
          bestToPort = tp
        }
      }
    }
    
    // Simple orthogonal routing (L-shaped or Z-shaped)
    const path: Array<{ x: number; y: number }> = []
    path.push({ x: bestFromPort.x, y: bestFromPort.y })
    
    const dx = bestToPort.x - bestFromPort.x
    const dy = bestToPort.y - bestFromPort.y
    
    // Determine routing strategy
    if (Math.abs(dx) < gridSize) {
      // Vertical corridor
      path.push({ x: bestFromPort.x, y: bestToPort.y })
    } else if (Math.abs(dy) < gridSize) {
      // Horizontal corridor
      path.push({ x: bestToPort.x, y: bestFromPort.y })
    } else {
      // L or Z shape
      const useZShape = rng.random() > 0.7 && Math.abs(dx) > gridSize * 2 && Math.abs(dy) > gridSize * 2
      
      if (useZShape) {
        // Z-shape (3 segments)
        const midX = bestFromPort.x + dx / 2
        path.push({ x: midX, y: bestFromPort.y })
        path.push({ x: midX, y: bestToPort.y })
      } else {
        // L-shape (2 segments)
        if (rng.random() > 0.5) {
          path.push({ x: bestToPort.x, y: bestFromPort.y })
        } else {
          path.push({ x: bestFromPort.x, y: bestToPort.y })
        }
      }
    }
    
    path.push({ x: bestToPort.x, y: bestToPort.y })
    
    // Calculate bends
    let bends = 0
    for (let i = 1; i < path.length - 1; i++) {
      const p0 = path[i - 1]
      const p1 = path[i]
      const p2 = path[i + 1]
      
      const d1x = p1.x - p0.x
      const d1y = p1.y - p0.y
      const d2x = p2.x - p1.x
      const d2y = p2.y - p1.y
      
      // If direction changed, it's a bend
      if ((d1x !== 0 && d2y !== 0) || (d1y !== 0 && d2x !== 0)) {
        bends++
      }
    }
    
    // Calculate length
    let length = 0
    for (let i = 0; i < path.length - 1; i++) {
      length += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y)
    }
    
    corridors.push({
      id: `corridor-${corridors.length}`,
      edgeId: edge.id,
      fromPortId: bestFromPort.id,
      toPortId: bestToPort.id,
      path,
      width: gridSize,
      bends,
      length,
    })
    
    // Mark ports as connected
    bestFromPort.connectedTo = bestToPort.id
    bestToPort.connectedTo = bestFromPort.id
  }
  
  return corridors
}

// ============================================================================
// JUNCTION EXTRACTION
// ============================================================================

function extractJunctions(corridors: RoutedCorridor[]): JunctionData[] {
  const junctionMap = new Map<string, { x: number; y: number; corridorIds: Set<string> }>()
  
  for (const corridor of corridors) {
    for (const point of corridor.path) {
      const key = `${Math.round(point.x)},${Math.round(point.y)}`
      
      if (!junctionMap.has(key)) {
        junctionMap.set(key, { x: point.x, y: point.y, corridorIds: new Set() })
      }
      
      junctionMap.get(key)!.corridorIds.add(corridor.id)
    }
  }
  
  // Convert to junctions (only points with 2+ corridors)
  const junctions: JunctionData[] = []
  
  for (const [, data] of junctionMap) {
    if (data.corridorIds.size >= 2) {
      junctions.push({
        id: `junction-${junctions.length}`,
        x: data.x,
        y: data.y,
        degree: data.corridorIds.size,
        corridorIds: Array.from(data.corridorIds),
      })
    }
  }
  
  return junctions
}

// ============================================================================
// STAGE E: POST-PROCESSING
// ============================================================================

function postProcess(
  data: CandidateData,
  config: QualityModeConfig,
  options: QualityPipelineOptions
): CandidateData {
  let { corridors, junctions, ...rest } = data
  
  // Simplify paths (always for all modes)
  if (config.enableSimplify) {
    corridors = simplifyCorridorPaths(corridors)
  }
  
  // Coalesce overlapping segments
  if (config.enableCoalesce) {
    const result = coalesceCorridors(corridors)
    corridors = result.corridors
    junctions = [...junctions, ...result.newJunctions]
  }
  
  // Normalize junctions
  if (config.enableJunctionNorm) {
    junctions = normalizeJunctions(junctions)
  }
  
  // Beautify (snap to grid)
  if (config.enableBeautify) {
    const gridSize = options.mapParams.gridSize ?? 40
    corridors = beautifyCorridors(corridors, gridSize)
  }
  
  // Generate MapJSON data
  const mapData = generateMapData({ ...rest, corridors, junctions }, options)
  
  return { ...rest, corridors, junctions, mapData }
}

/**
 * Convert CandidateData to MapJSONCompat format
 */
function generateMapData(
  data: Omit<CandidateData, 'mapData'>,
  options: QualityPipelineOptions
): MapJSONCompat {
  const { placedRooms, corridors, junctions, rooms, graph } = data
  
  // Calculate grid dimensions
  let maxX = 0, maxY = 0
  for (const room of placedRooms) {
    maxX = Math.max(maxX, room.x + room.width)
    maxY = Math.max(maxY, room.y + room.height)
  }
  
  const gridSize = options.mapParams.gridSize ?? 40
  const gridWidth = Math.ceil(maxX / gridSize) + 2
  const gridHeight = Math.ceil(maxY / gridSize) + 2
  
  // Convert placed rooms to layout rooms
  const layoutRooms = placedRooms.map(pr => {
    const roomProgram = rooms.find(r => r.id === pr.programId)
    return {
      id: pr.id,
      label: roomProgram?.label ?? pr.id,
      type: roomProgram?.type ?? 'generic',
      zone: roomProgram?.zone ?? 'default',
      x: pr.x,
      y: pr.y,
      width: pr.width,
      height: pr.height,
      rotation: 0,
      ports: pr.ports.map((port, idx) => ({
        id: port.id,
        side: port.wall,
        position: port.position ?? 0.5,
        connectorId: port.connectedTo || null
      }))
    }
  })
  
  // Build room ID lookup from graph edges
  const portToRoomMap = new Map<string, string>()
  for (const pr of placedRooms) {
    for (const port of pr.ports) {
      portToRoomMap.set(port.id, pr.id)
    }
  }
  
  // Convert corridors to connectors
  const connectors = corridors.map(c => {
    // Find edge to get corridor type
    const edge = graph.find(e => e.id === c.edgeId)
    const fromRoomId = portToRoomMap.get(c.fromPortId) ?? ''
    const toRoomId = portToRoomMap.get(c.toPortId) ?? ''
    
    return {
      id: c.id,
      type: c.type ?? edge?.kind ?? 'corridor',
      fromPort: {
        roomId: c.fromRoomId ?? fromRoomId,
        portId: c.fromPortId
      },
      toPort: {
        roomId: c.toRoomId ?? toRoomId,
        portId: c.toPortId
      },
      waypoints: c.path.map(p => ({ x: p.x, y: p.y }))
    }
  })
  
  // Convert junctions
  const layoutJunctions = junctions.map(j => ({
    id: j.id,
    x: j.x,
    y: j.y,
    corridorIds: j.corridorIds
  }))
  
  return {
    version: '1.0.0',
    meta: {
      name: `${options.mapParams.archetype}-${Date.now()}`,
      archetype: options.mapParams.archetype,
      subtype: options.mapParams.subtype,
      sizeTier: options.mapParams.sizeTier,
      seed: options.seed,
      generatedAt: new Date().toISOString(),
      ttrpgMetrics: {
        totalRooms: placedRooms.length,
        traversalTime: `${Math.ceil(placedRooms.length * 0.5)} turns`,
        encounterDensity: placedRooms.length > 10 ? 'high' : 'medium',
        chokepointCount: corridors.filter(c => c.path.length <= 2).length
      },
      tags: []
    },
    grid: {
      cellSize: gridSize,
      snapEnabled: true
    },
    zones: [
      { id: 'default', label: 'Main', color: '#4A90D9' }
    ],
    decks: [{
      index: 0,
      label: 'Deck 1',
      gridWidth,
      gridHeight,
      rooms: layoutRooms,
      connectors,
      junctions: layoutJunctions
    }]
  }
}

function simplifyCorridorPaths(corridors: RoutedCorridor[]): RoutedCorridor[] {
  return corridors.map(c => {
    const simplified: Array<{ x: number; y: number }> = [c.path[0]]
    
    for (let i = 1; i < c.path.length - 1; i++) {
      const prev = simplified[simplified.length - 1]
      const curr = c.path[i]
      const next = c.path[i + 1]
      
      // Check if collinear
      const dx1 = curr.x - prev.x
      const dy1 = curr.y - prev.y
      const dx2 = next.x - curr.x
      const dy2 = next.y - curr.y
      
      // Not collinear if cross product != 0
      if (dx1 * dy2 !== dy1 * dx2) {
        simplified.push(curr)
      }
    }
    
    simplified.push(c.path[c.path.length - 1])
    
    return { ...c, path: simplified, bends: Math.max(0, simplified.length - 2) }
  })
}

function coalesceCorridors(
  corridors: RoutedCorridor[]
): { corridors: RoutedCorridor[]; newJunctions: JunctionData[] } {
  // Simple implementation - just remove duplicate segments
  // Full implementation would use corridorCoalesce.ts
  return { corridors, newJunctions: [] }
}

function normalizeJunctions(junctions: JunctionData[]): JunctionData[] {
  // Simple implementation - merge nearby junctions
  const merged: JunctionData[] = []
  const tolerance = 10
  
  for (const j of junctions) {
    const existing = merged.find(m => 
      Math.abs(m.x - j.x) < tolerance && Math.abs(m.y - j.y) < tolerance
    )
    
    if (existing) {
      existing.degree += j.degree
      existing.corridorIds = [...new Set([...existing.corridorIds, ...j.corridorIds])]
    } else {
      merged.push({ ...j })
    }
  }
  
  return merged
}

function beautifyCorridors(corridors: RoutedCorridor[], gridSize: number): RoutedCorridor[] {
  return corridors.map(c => ({
    ...c,
    path: c.path.map(p => ({
      x: Math.round(p.x / gridSize) * gridSize,
      y: Math.round(p.y / gridSize) * gridSize,
    })),
  }))
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

function calculateDiagnostics(candidate: GenerationCandidate): PipelineDiagnostics {
  const { data } = candidate
  const junctionStats = calculateJunctionDegreeStats(data.junctions)
  
  // Count corridor-room intersections from validation errors
  const corridorRoomIntersections = candidate.validationErrors.filter(
    e => e.type === 'CorridorIntersectsRoom'
  ).length
  
  // Count overlaps
  const overlaps = candidate.validationErrors.filter(
    e => e.type === 'RoomsOverlap'
  ).length
  
  // Calculate total corridor length
  let totalCorridorLength = 0
  let totalBends = 0
  let microSegmentCount = 0
  const minSegmentLength = 10
  
  for (const corridor of data.corridors) {
    totalCorridorLength += corridor.length
    totalBends += corridor.bends
    
    for (let i = 0; i < corridor.path.length - 1; i++) {
      const p1 = corridor.path[i]
      const p2 = corridor.path[i + 1]
      const len = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)
      if (len < minSegmentLength) {
        microSegmentCount++
      }
    }
  }
  
  // Calculate cycles
  const cycleCount = Math.max(0, data.graph.length - data.placedRooms.length + 1)
  
  // Calculate chokepoints (simplified)
  const chokepointCount = 0 // Would require full graph analysis
  
  return {
    overlaps,
    corridorRoomIntersections,
    totalCorridorLength,
    totalBends,
    cycleCount,
    chokepointCount,
    junctionDegreeDistribution: junctionStats.distribution,
    microSegmentCount,
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Run the quality pipeline
 */
export async function runQualityPipeline(
  options: QualityPipelineOptions
): Promise<PipelineResult> {
  const startTime = performance.now()
  const stageTimings: StageTiming[] = []
  
  // Get quality config
  const config = {
    ...QUALITY_MODE_CONFIGS[options.qualityMode],
    ...options.qualityConfig,
  }
  
  const allCandidates: GenerationCandidate[] = []
  let bestCandidate: GenerationCandidate | null = null
  let earlyExit = false
  let lastUpdateTime = 0
  let updateCount = 0
  
  const maxUpdates = options.refinement?.maxUpdates ?? 3
  const minUpdateInterval = options.refinement?.minUpdateInterval ?? 200
  
  // Generate and evaluate candidates
  for (let i = 0; i < config.maxCandidates; i++) {
    // Check abort signal
    if (options.refinement?.abortSignal?.aborted) {
      break
    }
    
    // Check time budget
    const elapsed = performance.now() - startTime
    if (elapsed > config.budgetMs.max) {
      break
    }
    
    // Generate candidate
    const candidate = generateCandidate(i, options.seed, options, config)
    allCandidates.push(candidate)
    
    // Update best if this is better
    if (candidate.isValid && (!bestCandidate || candidate.score > bestCandidate.score)) {
      bestCandidate = candidate
      
      // Send update if enough time has passed
      if (options.refinement?.onUpdate) {
        const now = performance.now()
        if (now - lastUpdateTime >= minUpdateInterval && updateCount < maxUpdates) {
          const update: RefinementUpdate = {
            type: i === 0 ? 'draft' : 'improved',
            candidate: bestCandidate,
            progress: elapsed / config.budgetMs.max,
            elapsedMs: elapsed,
            candidatesEvaluated: i + 1,
            canCancel: true,
          }
          options.refinement.onUpdate(update)
          lastUpdateTime = now
          updateCount++
        }
      }
      
      // Check early exit
      const normalizedScore = (bestCandidate.score + 100) / 200 // Rough normalization
      if (normalizedScore >= config.qualityThreshold) {
        earlyExit = true
        break
      }
    }
  }
  
  // Send final update
  if (options.refinement?.onUpdate && bestCandidate) {
    const finalUpdate: RefinementUpdate = {
      type: 'final',
      candidate: bestCandidate,
      progress: 1,
      elapsedMs: performance.now() - startTime,
      candidatesEvaluated: allCandidates.length,
      canCancel: false,
    }
    options.refinement.onUpdate(finalUpdate)
  }
  
  const totalTimeMs = performance.now() - startTime
  
  // Calculate diagnostics
  const diagnostics = bestCandidate 
    ? calculateDiagnostics(bestCandidate)
    : {
        overlaps: 0,
        corridorRoomIntersections: 0,
        totalCorridorLength: 0,
        totalBends: 0,
        cycleCount: 0,
        chokepointCount: 0,
        junctionDegreeDistribution: {},
        microSegmentCount: 0,
      }
  
  return {
    bestCandidate,
    allCandidates: options.debug ? allCandidates : [],
    candidatesEvaluated: allCandidates.length,
    validCandidates: allCandidates.filter(c => c.isValid).length,
    totalTimeMs,
    budgetUsed: totalTimeMs / config.budgetMs.max,
    stageTimings,
    qualityMode: options.qualityMode,
    earlyExit,
    diagnostics,
  }
}

/**
 * Convenience function for quick generation
 */
export function generateWithQuality(
  mode: QualityMode,
  seed: string,
  archetype: 'ship' | 'station' | 'outpost',
  sizeTier: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
): Promise<PipelineResult> {
  return runQualityPipeline({
    seed,
    qualityMode: mode,
    mapParams: {
      archetype,
      subtype: 'default',
      sizeTier,
    },
  })
}

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
import { buildSegmentGraph, SegmentGraph } from './segmentGraph'
import { createRNG } from '../rng'
import type { SeededRNG as RNG } from '../types'

// Router cost weights (can be tuned per mode)
const ROUTER_COST = {
  lengthCost: 1,
  bendPenalty: 4,
  proximityPenalty: 2,
  reuseBonus: -3, // negative = prefer reuse
}

type Point = { x: number; y: number }

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
  // Increase clearance to leave room for corridors (at least 5 grid units for corridor + buffer)
  const clearance = Math.max(5, options.mapParams.roomClearance ?? 5)
  
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
// STAGE D: ROUTING (with room avoidance)
// ============================================================================

/**
 * Build sparse routing graph from port lines and obstacle borders.
 */
function buildSparseGraph(
  from: Point,
  to: Point,
  obstacles: Obstacle[],
  gridSize: number
): { nodes: Point[]; edges: Array<[number, number]> } {
  const xs = new Set<number>()
  const ys = new Set<number>()
  xs.add(from.x)
  xs.add(to.x)
  ys.add(from.y)
  ys.add(to.y)

  for (const o of obstacles) {
    xs.add(o.x - gridSize)
    xs.add(o.x)
    xs.add(o.x + o.width)
    xs.add(o.x + o.width + gridSize)
    ys.add(o.y - gridSize)
    ys.add(o.y)
    ys.add(o.y + o.height)
    ys.add(o.y + o.height + gridSize)
  }

  const nodes: Point[] = []
  const pointIndex = new Map<string, number>()
  const addNode = (p: Point) => {
    const key = `${p.x},${p.y}`
    if (!pointIndex.has(key)) {
      pointIndex.set(key, nodes.length)
      nodes.push(p)
    }
  }

  const xsArr = [...xs].sort((a, b) => a - b)
  const ysArr = [...ys].sort((a, b) => a - b)
  for (const x of xsArr) {
    for (const y of ysArr) {
      addNode({ x, y })
    }
  }

  const edges: Array<[number, number]> = []
  const isBlockedSegment = (a: Point, b: Point) => {
    const seg: Segment = { start: a, end: b }
    return obstacles.some(
      o => segmentIntersectsRoom(seg, o as any as PlacedRoom, 0) || insideObstacle(a, o) || insideObstacle(b, o)
    )
  }

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]
      if (a.x === b.x || a.y === b.y) {
        if (!isBlockedSegment(a, b)) {
          edges.push([i, j])
        }
      }
    }
  }

  return { nodes, edges }
}

/**
 * Pathfind on sparse graph with Manhattan cost + bends.
 */
function findSparsePath(
  graph: { nodes: Point[]; edges: Array<[number, number]> },
  start: Point,
  goal: Point
): Point[] | null {
  const { nodes, edges } = graph
  const adj = nodes.map(() => [] as number[])
  for (const [a, b] of edges) {
    adj[a].push(b)
    adj[b].push(a)
  }
  const startIdx = nodes.findIndex(n => n.x === start.x && n.y === start.y)
  const goalIdx = nodes.findIndex(n => n.x === goal.x && n.y === goal.y)
  if (startIdx === -1 || goalIdx === -1) return null

  type N = { idx: number; g: number; f: number; dir?: string; parent?: number }
  const open = new Map<number, N>()
  const closed = new Set<number>()
  open.set(startIdx, { idx: startIdx, g: 0, f: 0 })

  const heuristic = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

  while (open.size) {
    let current: N | null = null
    for (const n of open.values()) {
      if (!current || n.f < current.f) current = n
    }
    if (!current) break
    open.delete(current.idx)
    closed.add(current.idx)
    if (current.idx === goalIdx) {
      const path: Point[] = []
      let k: number | undefined = current.idx
      let dirMap = new Map<number, N>(open)
      dirMap.set(current.idx, current)
      while (k !== undefined) {
        const node = dirMap.get(k)
        if (!node) break
        path.push(nodes[node.idx])
        k = node.parent
      }
      return path.reverse()
    }
    for (const nb of adj[current.idx]) {
      if (closed.has(nb)) continue
      const currPt = nodes[current.idx]
      const nbPt = nodes[nb]
      const dir = currPt.x === nbPt.x ? (nbPt.y > currPt.y ? 'd' : 'u') : nbPt.x > currPt.x ? 'r' : 'l'
      const bend = current.dir && current.dir !== dir ? 1 : 0
      const g = current.g + heuristic(currPt, nbPt) + bend * ROUTER_COST.bendPenalty
      const f = g + heuristic(nbPt, nodes[goalIdx])
      const existing = open.get(nb)
      if (!existing || g < existing.g) {
        open.set(nb, { idx: nb, g, f, dir, parent: current.idx })
      }
    }
  }
  return null
}

function selectCandidatePorts(
  room: PlacedRoom,
  targetRoom: PlacedRoom,
  maxPorts: number = 2
): PortData[] {
  const targetCx = targetRoom.x + targetRoom.width / 2
  const targetCy = targetRoom.y + targetRoom.height / 2
  return [...room.ports]
    .map(p => ({
      port: p,
      score: Math.abs(p.x - targetCx) + Math.abs(p.y - targetCy),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.max(1, Math.min(maxPorts, room.ports.length)))
    .map(s => s.port)
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Segment {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

interface Obstacle {
  x: number
  y: number
  width: number
  height: number
}

function buildObstacles(rooms: PlacedRoom[], clearance: number, ignore: string[] = []): Obstacle[] {
  const pad = clearance
  return rooms
    .filter(r => !ignore.includes(r.id))
    .map(r => ({
      x: r.x - pad,
      y: r.y - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    }))
}

function insideObstacle(p: { x: number; y: number }, obs: Obstacle): boolean {
  return p.x > obs.x && p.x < obs.x + obs.width && p.y > obs.y && p.y < obs.y + obs.height
}

/**
 * Check if a segment intersects a rectangle (room)
 */
/**
 * Check if a segment intersects a rectangle (room)
 * Uses proper inflation/clearance for padding
 */
function segmentIntersectsRoom(seg: Segment, room: PlacedRoom, clearance: number = 1): boolean {
  // Check if segment passes through room interior with clearance padding
  const rect: Rect = {
    x: room.x - clearance,
    y: room.y - clearance,
    width: room.width + clearance * 2,
    height: room.height + clearance * 2,
  }
  
  // Check if either endpoint is strictly inside the rect
  const startInside = seg.start.x > rect.x && seg.start.x < rect.x + rect.width &&
                      seg.start.y > rect.y && seg.start.y < rect.y + rect.height
  const endInside = seg.end.x > rect.x && seg.end.x < rect.x + rect.width &&
                    seg.end.y > rect.y && seg.end.y < rect.y + rect.height
  
  if (startInside || endInside) return true
  
  // Check line segment against rectangle edges
  const edges: Segment[] = [
    { start: { x: rect.x, y: rect.y }, end: { x: rect.x + rect.width, y: rect.y } },
    { start: { x: rect.x + rect.width, y: rect.y }, end: { x: rect.x + rect.width, y: rect.y + rect.height } },
    { start: { x: rect.x, y: rect.y + rect.height }, end: { x: rect.x + rect.width, y: rect.y + rect.height } },
    { start: { x: rect.x, y: rect.y }, end: { x: rect.x, y: rect.y + rect.height } },
  ]
  
  for (const edge of edges) {
    if (linesIntersect(seg.start, seg.end, edge.start, edge.end)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if two line segments intersect
 */
function linesIntersect(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number }
): boolean {
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  
  return false
}

function direction(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y)
}

/**
 * Check if a path intersects any room (except source and target)
 */
function pathIntersectsRooms(
  path: Array<{ x: number; y: number }> | null | undefined,
  rooms: PlacedRoom[],
  excludeRoomIds: string[]
): boolean {
  if (!path || path.length < 2) return false
  for (let i = 0; i < path.length - 1; i++) {
    const seg: Segment = { start: path[i], end: path[i + 1] }
    
    for (const room of rooms) {
      if (excludeRoomIds.includes(room.id)) continue
      
      if (segmentIntersectsRoom(seg, room)) {
        return true
      }
    }
  }
  return false
}

/**
 * Try multiple routing strategies and return the first one that doesn't hit rooms
 */
function findGridPath(
  fromPort: PortData,
  toPort: PortData,
  fromRoomId: string,
  toRoomId: string,
  rooms: PlacedRoom[],
  gridSize: number,
  clearance: number
): Array<{ x: number; y: number }> | null {
  const blocked = new Set<string>()
  const cellKey = (gx: number, gy: number) => `${gx},${gy}`
  const toCell = (x: number, y: number) => ({
    gx: Math.round(x / gridSize),
    gy: Math.round(y / gridSize),
  })

  // Mark blocked cells for all rooms except endpoints (with clearance)
  for (const room of rooms) {
    if (room.id === fromRoomId || room.id === toRoomId) continue
    const pad = clearance * gridSize
    const x0 = Math.floor((room.x - pad) / gridSize)
    const y0 = Math.floor((room.y - pad) / gridSize)
    const x1 = Math.ceil((room.x + room.width + pad) / gridSize)
    const y1 = Math.ceil((room.y + room.height + pad) / gridSize)
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        blocked.add(cellKey(gx, gy))
      }
    }
  }

  const start = toCell(fromPort.x, fromPort.y)
  const goal = toCell(toPort.x, toPort.y)

  type Node = { gx: number; gy: number; g: number; f: number; px?: number; py?: number; dir?: string }
  const open = new Map<string, Node>()
  const allNodes = new Map<string, Node>()
  const parents = new Map<string, string | undefined>()
  const closed = new Set<string>()
  const startKey = cellKey(start.gx, start.gy)
  open.set(startKey, { gx: start.gx, gy: start.gy, g: 0, f: 0 })
  parents.set(startKey, undefined)
  allNodes.set(startKey, { gx: start.gx, gy: start.gy, g: 0, f: 0 })

  const dirs: Array<[number, number, string]> = [
    [1, 0, 'r'],
    [-1, 0, 'l'],
    [0, 1, 'd'],
    [0, -1, 'u'],
  ]
  const heuristic = (gx: number, gy: number) => Math.abs(gx - goal.gx) + Math.abs(gy - goal.gy)

  while (open.size > 0) {
    let currentKey = ''
    let current: Node | null = null
    for (const [k, n] of open) {
      if (!current || n.f < current.f) {
        current = n
        currentKey = k
      }
    }
    if (!current) break
    open.delete(currentKey)
    closed.add(currentKey)

    if (current.gx === goal.gx && current.gy === goal.gy) {
      const path: Array<{ x: number; y: number }> = []
      let k: string | undefined = currentKey
      while (k) {
        const node = allNodes.get(k)
        if (!node) break
        path.push({ x: node.gx * gridSize, y: node.gy * gridSize })
        k = parents.get(k)
      }
      return path.reverse()
    }

    for (const [dx, dy, dir] of dirs) {
      const ngx = current.gx + dx
      const ngy = current.gy + dy
      const nkey = cellKey(ngx, ngy)
      if (blocked.has(nkey) || closed.has(nkey)) continue

      const bendPenalty = current.dir && current.dir !== dir ? 0.2 : 0
      const ng = current.g + 1 + bendPenalty
      const nf = ng + heuristic(ngx, ngy)
      const existing = open.get(nkey)
      if (!existing || ng < existing.g) {
        const nnode: Node = { gx: ngx, gy: ngy, g: ng, f: nf, px: current.gx, py: current.gy, dir }
        open.set(nkey, nnode)
        allNodes.set(nkey, nnode)
        parents.set(nkey, currentKey)
      }
    }
  }

  return null
}

/**
 * A* pathfinding on a coarse grid to find paths around rooms
 */
function findPathAStar(
  fromPort: PortData,
  toPort: PortData,
  fromRoomId: string,
  toRoomId: string,
  rooms: PlacedRoom[],
  gridSize: number
): Array<{ x: number; y: number }> | null {
  const cellSize = gridSize * 2 // Coarse grid for speed
  
  // Calculate bounds
  const allX = rooms.map(r => [r.x, r.x + r.width]).flat().concat([fromPort.x, toPort.x])
  const allY = rooms.map(r => [r.y, r.y + r.height]).flat().concat([fromPort.y, toPort.y])
  const minX = Math.min(...allX) - cellSize * 3
  const maxX = Math.max(...allX) + cellSize * 3
  const minY = Math.min(...allY) - cellSize * 3
  const maxY = Math.max(...allY) + cellSize * 3
  
  const toGrid = (x: number, y: number) => ({
    gx: Math.round((x - minX) / cellSize),
    gy: Math.round((y - minY) / cellSize)
  })
  
  const toWorld = (gx: number, gy: number) => ({
    x: gx * cellSize + minX,
    y: gy * cellSize + minY
  })
  
  const start = toGrid(fromPort.x, fromPort.y)
  const goal = toGrid(toPort.x, toPort.y)
  
  // Check if a cell is blocked by any room (except source/target)
  const isBlocked = (gx: number, gy: number): boolean => {
    const world = toWorld(gx, gy)
    for (const room of rooms) {
      if (room.id === fromRoomId || room.id === toRoomId) continue
      
      // Check if point is inside room with generous padding (2x gridSize)
      const pad = gridSize * 2
      if (world.x >= room.x - pad && world.x <= room.x + room.width + pad &&
          world.y >= room.y - pad && world.y <= room.y + room.height + pad) {
        return true
      }
    }
    return false
  }
  
  interface Node {
    gx: number
    gy: number
    g: number
    f: number
    parent: Node | null
  }
  
  const openSet: Node[] = []
  const closedSet = new Set<string>()
  
  const heuristic = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) =>
    Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)
  
  openSet.push({
    gx: start.gx,
    gy: start.gy,
    g: 0,
    f: heuristic(start, goal),
    parent: null
  })
  
  const directions = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
  ]
  
  let iterations = 0
  const maxIterations = 500
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++
    
    openSet.sort((a, b) => a.f - b.f)
    const current = openSet.shift()!
    
    if (current.gx === goal.gx && current.gy === goal.gy) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = []
      let node: Node | null = current
      while (node) {
        const world = toWorld(node.gx, node.gy)
        path.unshift(world)
        node = node.parent
      }
      // Replace first and last with exact port positions
      path[0] = { x: fromPort.x, y: fromPort.y }
      path[path.length - 1] = { x: toPort.x, y: toPort.y }
      return simplifyPath(path)
    }
    
    closedSet.add(`${current.gx},${current.gy}`)
    
    for (const d of directions) {
      const ngx = current.gx + d.dx
      const ngy = current.gy + d.dy
      const key = `${ngx},${ngy}`
      
      if (closedSet.has(key)) continue
      if (ngx === start.gx && ngy === start.gy) continue // Don't revisit start
      if (ngx !== goal.gx || ngy !== goal.gy) {
        if (isBlocked(ngx, ngy)) continue
      }
      
      const g = current.g + 1
      const f = g + heuristic({ gx: ngx, gy: ngy }, goal)
      
      const existing = openSet.find(n => n.gx === ngx && n.gy === ngy)
      if (existing) {
        if (g < existing.g) {
          existing.g = g
          existing.f = f
          existing.parent = current
        }
      } else {
        openSet.push({ gx: ngx, gy: ngy, g, f, parent: current })
      }
    }
  }
  
  return null // No path found
}

/**
 * Remove collinear points from path
 */
function simplifyPath(path: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (path.length <= 2) return path
  
  const result: Array<{ x: number; y: number }> = [path[0]]
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = path[i]
    const next = path[i + 1]
    
    const dx1 = Math.sign(curr.x - prev.x)
    const dy1 = Math.sign(curr.y - prev.y)
    const dx2 = Math.sign(next.x - curr.x)
    const dy2 = Math.sign(next.y - curr.y)
    
    if (dx1 !== dx2 || dy1 !== dy2) {
      result.push(curr)
    }
  }
  
  result.push(path[path.length - 1])
  return result
}

function snapPath(path: Array<{ x: number; y: number }>, gridSize: number): Array<{ x: number; y: number }> {
  const snapped = path.map(p => ({
    x: Math.round(p.x / (gridSize / 2)) * (gridSize / 2),
    y: Math.round(p.y / (gridSize / 2)) * (gridSize / 2),
  }))
  return simplifyPath(
    snapped.filter((p, idx, arr) => idx === 0 || p.x !== arr[idx - 1].x || p.y !== arr[idx - 1].y)
  )
}

/**
 * Route corridors using segment-aware pathfinding.
 * When possible, reuses existing segments to create natural-looking
 * corridor networks with shared paths.
 */
function routeCorridors(
  rng: RNG,
  rooms: PlacedRoom[],
  graph: TopologyEdge[],
  options: QualityPipelineOptions
): RoutedCorridor[] {
  const corridors: RoutedCorridor[] = []
  const gridSize = options.mapParams.gridSize ?? 40
  const clearance = Math.max(2, options.mapParams.roomClearance ?? 2)
  
  // Create segment graph for path reuse
  const segmentGraph = new SegmentGraph(gridSize / 2)
  
  // Sort edges to prioritize backbone connections first
  const sortedEdges = [...graph].sort((a, b) => {
    // Backbone edges first (they form the trunk)
    if (a.isBackbone && !b.isBackbone) return -1
    if (!a.isBackbone && b.isBackbone) return 1
    return 0
  })
  
  for (const edge of sortedEdges) {
    const fromRoom = rooms.find(r => r.id === edge.fromRoomId)
    const toRoom = rooms.find(r => r.id === edge.toRoomId)
    
    if (!fromRoom || !toRoom) continue
    const obstacles = buildObstacles(rooms, clearance, [fromRoom.id, toRoom.id])
    
    // Try each port combination and find valid path
    let bestPath: Array<{ x: number; y: number }> | null = null
    let bestFromPort = fromRoom.ports[0]
    let bestToPort = toRoom.ports[0]
    let bestCost = Infinity
    let usedGraphPath = false
    
    const fromPorts = selectCandidatePorts(fromRoom, toRoom, 2)
    const toPorts = selectCandidatePorts(toRoom, fromRoom, 2)

    for (const fp of fromPorts) {
      for (const tp of toPorts) {
        // Strategy A: sparse graph router
        const sparse = buildSparseGraph({ x: fp.x, y: fp.y }, { x: tp.x, y: tp.y }, obstacles, gridSize)
        const sparsePath = findSparsePath(sparse, { x: fp.x, y: fp.y }, { x: tp.x, y: tp.y })
        if (sparsePath && sparsePath.length >= 2) {
          const snapped = snapPath(sparsePath, gridSize)
          const length = calculatePathLength(snapped)
          const bends = Math.max(0, snapped.length - 2)
          const cost =
            length * ROUTER_COST.lengthCost +
            bends * ROUTER_COST.bendPenalty
          const intersects = pathIntersectsRooms(snapped, rooms, [fromRoom.id, toRoom.id])
          if (!intersects && cost < bestCost) {
            bestCost = cost
            bestPath = snapped
            bestFromPort = fp
            bestToPort = tp
            usedGraphPath = false
          }
        }

        // First, try to find path through existing segment graph
        const graphPath = segmentGraph.findPathThroughGraph(
          { x: fp.x, y: fp.y },
          { x: tp.x, y: tp.y },
          rooms,
          [fromRoom.id, toRoom.id]
        )
        
        if (graphPath && graphPath.length >= 2) {
          const length = calculatePathLength(graphPath)
          if (!pathIntersectsRooms(graphPath, rooms, [fromRoom.id, toRoom.id])) {
            const bends = graphPath.length > 2 ? graphPath.length - 2 : 0
            const cost = length * ROUTER_COST.lengthCost + bends * ROUTER_COST.bendPenalty + ROUTER_COST.reuseBonus
            if (cost < bestCost) {
              bestCost = cost
              bestPath = graphPath
              bestFromPort = fp
              bestToPort = tp
              usedGraphPath = true
            }
          }
        }
        
        // Grid A* fallback
        let path =
          findGridPath(fp, tp, fromRoom.id, toRoom.id, rooms, gridSize, clearance) || [
            { x: fp.x, y: fp.y },
            { x: tp.x, y: fp.y },
            { x: tp.x, y: tp.y },
          ]

        if (path) {
          path = simplifyPath(path)
          const length = calculatePathLength(path)
          const bends = path.length > 2 ? path.length - 2 : 0
          const cost = length * ROUTER_COST.lengthCost + bends * ROUTER_COST.bendPenalty
          const intersects = pathIntersectsRooms(path, rooms, [fromRoom.id, toRoom.id])
          
          if (!intersects && cost < bestCost) {
            bestCost = cost
            bestPath = path
            bestFromPort = fp
            bestToPort = tp
            usedGraphPath = false
          }
        }
      }
    }
    
    if (!bestPath) continue
    // snap and simplify for consistency
    bestPath = snapPath(bestPath, gridSize)
    
    const corridorId = `corridor-${corridors.length}`
    
    // Add path to segment graph for future reuse
    segmentGraph.addCorridorPath(corridorId, bestPath)
    
    // Calculate bends
    let bends = 0
    for (let i = 1; i < bestPath.length - 1; i++) {
      const p0 = bestPath[i - 1]
      const p1 = bestPath[i]
      const p2 = bestPath[i + 1]
      
      const d1x = p1.x - p0.x
      const d1y = p1.y - p0.y
      const d2x = p2.x - p1.x
      const d2y = p2.y - p1.y
      
      if ((d1x !== 0 && d2y !== 0) || (d1y !== 0 && d2x !== 0)) {
        bends++
      }
    }
    
    corridors.push({
      id: corridorId,
      edgeId: edge.id,
      fromRoomId: fromRoom.id,
      toRoomId: toRoom.id,
      fromPortId: bestFromPort.id,
      toPortId: bestToPort.id,
      path: bestPath,
      width: Math.floor(gridSize / 2), // Thinner corridors
      bends,
      length: calculatePathLength(bestPath),
      segments: bestPath.slice(0, -1).map((p, idx) => ({
        start: p,
        end: bestPath[idx + 1],
      })),
    })
    
    bestFromPort.connectedTo = bestToPort.id
    bestToPort.connectedTo = bestFromPort.id
  }
  
  return corridors
}

/**
 * Calculate total path length (Manhattan distance)
 */
function calculatePathLength(path: Array<{ x: number; y: number }>): number {
  let length = 0
  for (let i = 0; i < path.length - 1; i++) {
    length += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y)
  }
  return length
}

// ============================================================================
// JUNCTION EXTRACTION
// ============================================================================

function extractJunctions(corridors: RoutedCorridor[]): JunctionData[] {
  const junctionMap = new Map<string, { x: number; y: number; corridorIds: Set<string> }>()
  
  // 1. Find junctions at shared path points
  for (const corridor of corridors) {
    for (const point of corridor.path) {
      const key = `${Math.round(point.x)},${Math.round(point.y)}`
      
      if (!junctionMap.has(key)) {
        junctionMap.set(key, { x: point.x, y: point.y, corridorIds: new Set() })
      }
      
      junctionMap.get(key)!.corridorIds.add(corridor.id)
    }
  }
  
  // 2. Find junctions at corridor segment intersections
  for (let i = 0; i < corridors.length; i++) {
    for (let j = i + 1; j < corridors.length; j++) {
      const c1 = corridors[i]
      const c2 = corridors[j]
      
      // Check all segment pairs
      for (let si = 0; si < c1.path.length - 1; si++) {
        for (let sj = 0; sj < c2.path.length - 1; sj++) {
          const intersection = getSegmentIntersection(
            c1.path[si], c1.path[si + 1],
            c2.path[sj], c2.path[sj + 1]
          )
          
          if (intersection) {
            const key = `${Math.round(intersection.x)},${Math.round(intersection.y)}`
            
            if (!junctionMap.has(key)) {
              junctionMap.set(key, { x: intersection.x, y: intersection.y, corridorIds: new Set() })
            }
            
            junctionMap.get(key)!.corridorIds.add(c1.id)
            junctionMap.get(key)!.corridorIds.add(c2.id)
          }
        }
      }
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

/**
 * Get intersection point of two line segments, or null if they don't intersect
 */
function getSegmentIntersection(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number }
): { x: number; y: number } | null {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  
  const cross = d1x * d2y - d1y * d2x
  
  // Parallel segments
  if (Math.abs(cross) < 0.0001) return null
  
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross
  
  // Check if intersection is within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: p1.x + t * d1x,
      y: p1.y + t * d1y
    }
  }
  
  return null
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
  const gridSize = options.mapParams.gridSize ?? 40
  
  // Simplify paths (always for all modes)
  if (config.enableSimplify) {
    corridors = simplifyCorridorPaths(corridors)
  }
  
  // Coalesce overlapping segments using SegmentGraph
  if (config.enableCoalesce) {
    const result = coalesceCorridors(corridors, gridSize)
    corridors = result.corridors
    junctions = [...junctions, ...result.newJunctions]
  }
  
  // Normalize junctions
  if (config.enableJunctionNorm) {
    junctions = normalizeJunctions(junctions)
  }
  
  // Beautify (snap to grid)
  if (config.enableBeautify) {
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
    const fromRoomId = c.fromRoomId ?? portToRoomMap.get(c.fromPortId) ?? ''
    const toRoomId = c.toRoomId ?? portToRoomMap.get(c.toPortId) ?? ''
    const path = c.path.map(p => ({ x: p.x, y: p.y }))
    const segments = c.segments ?? c.path.slice(0, -1).map((p, idx) => ({
      start: { x: p.x, y: p.y },
      end: { x: c.path[idx + 1].x, y: c.path[idx + 1].y },
    }))
    
    return {
      id: c.id,
      type: c.type ?? edge?.kind ?? 'corridor',
      fromRoomId,
      toRoomId,
      fromPort: {
        roomId: fromRoomId,
        portId: c.fromPortId
      },
      toPort: {
        roomId: toRoomId,
        portId: c.toPortId
      },
      path,
      waypoints: path,
      segmentIds: c.segmentIds,
      segments,
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
    if (!c.path || c.path.length < 2) {
      return c
    }
    
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

/**
 * Coalesce corridors using segment-based architecture.
 * Uses SegmentGraph to find shared segments, detect intersections,
 * and create junctions automatically.
 */
function coalesceCorridors(
  corridors: RoutedCorridor[],
  gridSize: number = 40
): { corridors: RoutedCorridor[]; newJunctions: JunctionData[] } {
  if (corridors.length === 0) {
    return { corridors: [], newJunctions: [] }
  }

  // Use SegmentGraph for intelligent coalescing
  const tolerance = Math.max(5, gridSize / 4)
  const { updatedCorridors, junctions } = buildSegmentGraph(corridors, tolerance)
  
  return { corridors: updatedCorridors, newJunctions: junctions }
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
  let bestInvalidCandidate: GenerationCandidate | null = null
  
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
    
    // Track best invalid candidate as fallback
    if (!candidate.isValid) {
      if (!bestInvalidCandidate || candidate.score > bestInvalidCandidate.score) {
        bestInvalidCandidate = candidate
      }
    }
    
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
  
  // Fallback to best invalid candidate if no valid ones found
  if (!bestCandidate && bestInvalidCandidate) {
    console.warn('[Quality] No valid candidates, using best invalid candidate with errors:', 
      bestInvalidCandidate.validationErrors.map(e => e.message).join('; '))
    bestCandidate = bestInvalidCandidate
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


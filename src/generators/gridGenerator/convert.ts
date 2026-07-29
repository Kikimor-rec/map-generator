/**
 * Conversion from GridCanvas to MapJSON/EditorFormat
 */

import type {
  MapJSON,
  MapMeta,
  DeckLayout,
  LayoutRoom,
  LayoutConnector,
  LayoutConnectorEndpointAnchor,
  Junction,
  Point,
  GenerationRequest,
  RoomProgram,
} from '../types'
import {
  TileType,
  type GridCanvas,
  type RoomPlacement,
  type ZoneDefinition,
} from './types'
import { getTile, getBoundingBox, DIRECTIONS_4 } from './canvas'
import { buildCorridorGraph, getTileConnectorIds, parseConnectorId } from './corridorGraph'
import { calculateGridMetrics } from './metrics'
import { validateTTRPGPlayability } from './playabilityValidator'
import { validateMapAesthetics } from './aestheticValidator'
import { GEOMETRY_UNITS_PER_CELL } from '../../domain/geometryUnits'
import { extractFacilityEnvelope } from './geometry'

// ============================================================================
// MAIN CONVERSION
// ============================================================================

/**
 * Convert GridCanvas to MapJSON format
 */
export function convertToMapJSON(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  zones: ZoneDefinition[],
  request: GenerationRequest,
  roomProgram: RoomProgram
): MapJSON {
  const deckLayout = convertToDeckLayout(canvas, placements, zones)
  const meta = buildMeta(request, roomProgram, placements, deckLayout.connectors, deckLayout.junctions, canvas)

  return {
    version: '1.0.0',
    meta,
    grid: {
      cellSize: canvas.tileSize,
      snapEnabled: true,
    },
    zones: zones.map(z => ({
      id: z.id,
      label: z.label,
      color: z.color,
    })),
    decks: [
      {
        index: 0,
        label: 'Main Deck',
        gridWidth: canvas.width,
        gridHeight: canvas.height,
        rooms: deckLayout.rooms,
        connectors: deckLayout.connectors,
        junctions: deckLayout.junctions,
        geometry: {
          unitsPerCell: GEOMETRY_UNITS_PER_CELL,
          facilityEnvelope: extractFacilityEnvelope(canvas),
          structuralVoids: [],
        },
      },
    ],
  }
}

/**
 * Convert GridCanvas to DeckLayout
 */
export function convertToDeckLayout(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  zones: ZoneDefinition[]
): DeckLayout {
  const rooms = placements.map(p => convertPlacementToLayoutRoom(p, canvas, zones))
  const corridors = extractCorridors(canvas, placements)
  const junctions = extractJunctions(canvas)

  return {
    deckIndex: 0,
    gridWidth: canvas.width,
    gridHeight: canvas.height,
    rooms,
    connectors: corridors,
    junctions,
  }
}

// ============================================================================
// ROOM CONVERSION
// ============================================================================

/**
 * Convert RoomPlacement to LayoutRoom
 */
function convertPlacementToLayoutRoom(
  placement: RoomPlacement,
  canvas: GridCanvas,
  zones: ZoneDefinition[]
): LayoutRoom {
  const tileSize = canvas.tileSize

  // Find door positions as ports
  const ports = placement.doorPositions.map((door, idx) => {
    // Determine which wall the door is on
    const wall = determineDoorWall(door, placement)
    const doorSemantic = getTile(canvas, door.x, door.y)?.metadata?.doorSemantic
    const doorType = typeof doorSemantic === 'string'
      ? doorSemantic
      : undefined

    const position = projectDoorTileToRoomWall(door, placement, tileSize)
    return {
      id: `port-${placement.roomId}-${idx}`,
      x: position.x,
      y: position.y,
      wall,
      connectorId: `corridor-${door.x}-${door.y}`,
      doorType,
    }
  })

  return {
    id: placement.roomId,
    roomType: placement.roomType,
    label: placement.label,
    x: placement.bounds.x * tileSize,
    y: placement.bounds.y * tileSize,
    width: placement.bounds.width * tileSize,
    height: placement.bounds.height * tileSize,
    gridX: placement.bounds.x,
    gridY: placement.bounds.y,
    gridWidth: placement.bounds.width,
    gridHeight: placement.bounds.height,
    zone: placement.zone,
    ports,
    isExterior: placement.program.isExterior || false,
    tags: placement.program.tags,
    circulationRole: placement.circulationRole,
    interruptsBackbone: placement.interruptsBackbone,
  }
}

/**
 * Determine which wall a door is on
 */
export function projectDoorTileToRoomWall(
  door: Point,
  placement: RoomPlacement,
  tileSize: number
): Point {
  const wall = determineDoorWall(door, placement)
  const centerX = door.x * tileSize + tileSize / 2
  const centerY = door.y * tileSize + tileSize / 2
  switch (wall) {
    case 'top': return { x: centerX, y: placement.bounds.y * tileSize }
    case 'bottom': return { x: centerX, y: (placement.bounds.y + placement.bounds.height) * tileSize }
    case 'left': return { x: placement.bounds.x * tileSize, y: centerY }
    case 'right': return { x: (placement.bounds.x + placement.bounds.width) * tileSize, y: centerY }
  }
}

function determineDoorWall(
  door: Point,
  placement: RoomPlacement
): 'top' | 'bottom' | 'left' | 'right' {
  const bounds = placement.bounds

  // Check distances to each edge
  const distTop = door.y - bounds.y
  const distBottom = (bounds.y + bounds.height - 1) - door.y
  const distLeft = door.x - bounds.x
  const distRight = (bounds.x + bounds.width - 1) - door.x

  const minDist = Math.min(distTop, distBottom, distLeft, distRight)

  if (minDist === distTop) return 'top'
  if (minDist === distBottom) return 'bottom'
  if (minDist === distLeft) return 'left'
  return 'right'
}

// ============================================================================
// CORRIDOR EXTRACTION
// ============================================================================

/**
 * Extract corridors from canvas as connected paths
 */
function extractCorridors(canvas: GridCanvas, placements: RoomPlacement[]): LayoutConnector[] {
  const graph = buildCorridorGraph(canvas)
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
  const junctionsByNodeId = new Map(
    graph.junctions.map(junction => [
      `node-${Math.floor(junction.x / canvas.tileSize)}-${Math.floor(junction.y / canvas.tileSize)}`,
      junction,
    ])
  )
  const portsByTile = buildExactRoomPortIndex(placements, canvas)

  return graph.edges
    .filter(edge => edge.path.length >= 2)
    .map((edge, idx) => {
      const endpoints = resolvePhysicalEdgeEndpoints(edge.connectorIds, edge.path, placements)
      const startAnchor = resolveExactGraphEndpointAnchor(
        edge.fromNodeId, edge.path[0], nodesById, junctionsByNodeId, portsByTile, canvas.tileSize
      )
      const endAnchor = resolveExactGraphEndpointAnchor(
        edge.toNodeId, edge.path[edge.path.length - 1], nodesById, junctionsByNodeId, portsByTile, canvas.tileSize
      )
      const path = simplifyGridPath(edge.path).map(p => gridPointToWorld(p, canvas.tileSize))
      if (startAnchor.kind === 'roomPort') path[0] = { ...startAnchor.position }
      if (endAnchor.kind === 'roomPort') path[path.length - 1] = { ...endAnchor.position }
      const orthogonalPath = orthogonalizeEndpointStubs(path, startAnchor, endAnchor, placements)
      return {
        id: `corridor-edge-${idx}`,
        fromRoomId: endpoints.fromRoomId,
        toRoomId: endpoints.toRoomId,
        kind: 'corridor',
        path: orthogonalPath,
        width: canvas.tileSize,
        widthClass: edge.connectorIds.length > 1 ? 'wide' : 'standard',
        startAnchor,
        endAnchor,
      }
    })
}

function orthogonalizeEndpointStubs(
  path: Point[],
  startAnchor: LayoutConnectorEndpointAnchor,
  endAnchor: LayoutConnectorEndpointAnchor,
  placements: RoomPlacement[]
): Point[] {
  if (path.length < 2) return path
  const result = path.map(point => ({ ...point }))

  if (!pointsAreOrthogonal(result[0], result[1])) {
    const wall = resolveRoomPortWall(startAnchor, placements)
    result.splice(1, 0, wall === 'left' || wall === 'right'
      ? { x: result[1].x, y: result[0].y }
      : { x: result[0].x, y: result[1].y })
  }

  const endIndex = result.length - 1
  if (!pointsAreOrthogonal(result[endIndex - 1], result[endIndex])) {
    const wall = resolveRoomPortWall(endAnchor, placements)
    result.splice(endIndex, 0, wall === 'left' || wall === 'right'
      ? { x: result[endIndex - 1].x, y: result[endIndex].y }
      : { x: result[endIndex].x, y: result[endIndex - 1].y })
  }

  const fullyOrthogonal: Point[] = [result[0]]
  for (let index = 1; index < result.length; index++) {
    const previous = fullyOrthogonal[fullyOrthogonal.length - 1]
    const current = result[index]
    if (!pointsAreOrthogonal(previous, current)) {
      fullyOrthogonal.push({ x: current.x, y: previous.y })
    }
    fullyOrthogonal.push(current)
  }

  return simplifyWorldPath(fullyOrthogonal)
}

function resolveRoomPortWall(
  anchor: LayoutConnectorEndpointAnchor,
  placements: RoomPlacement[]
): 'top' | 'bottom' | 'left' | 'right' | undefined {
  if (anchor.kind !== 'roomPort') return undefined
  const placement = placements.find(candidate => candidate.roomId === anchor.roomId)
  if (!placement) return undefined
  const doorIndex = placement.doorPositions.findIndex(
    (_door, index) => `port-${placement.roomId}-${index}` === anchor.portId
  )
  const door = placement.doorPositions[doorIndex]
  return door ? determineDoorWall(door, placement) : undefined
}

function pointsAreOrthogonal(a: Point, b: Point): boolean {
  return a.x === b.x || a.y === b.y
}

function simplifyWorldPath(path: Point[]): Point[] {
  const unique = path.filter((point, index) =>
    index === 0 || point.x !== path[index - 1].x || point.y !== path[index - 1].y
  )
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true
    const previous = unique[index - 1]
    const next = unique[index + 1]
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    )
  })
}

function gridPointToWorld(point: Point, tileSize: number): Point {
  return {
    x: point.x * tileSize + tileSize / 2,
    y: point.y * tileSize + tileSize / 2,
  }
}

function buildExactRoomPortIndex(
  placements: RoomPlacement[],
  canvas: GridCanvas
): Map<string, LayoutConnectorEndpointAnchor[]> {
  const result = new Map<string, LayoutConnectorEndpointAnchor[]>()

  for (const placement of placements) {
    placement.doorPositions.forEach((door, index) => {
      const portId = `port-${placement.roomId}-${index}`
      const anchor: LayoutConnectorEndpointAnchor = {
        kind: 'roomPort',
        roomId: placement.roomId,
        portId,
        doorId: `door-${portId}`,
        position: projectDoorTileToRoomWall(door, placement, canvas.tileSize),
      }

      // Door tiles are not part of the physical corridor graph. Associate the
      // port only with directly adjacent graph tiles, which is exact topology
      // rather than a nearest-room inference.
      const graphPoints = [door, ...DIRECTIONS_4.map(direction => ({
        x: door.x + direction.x,
        y: door.y + direction.y,
      }))].filter(point => {
        const tile = getTile(canvas, point.x, point.y)
        return tile?.type === TileType.CORRIDOR || tile?.type === TileType.JUNCTION
      })

      for (const point of graphPoints) {
        const key = `${point.x},${point.y}`
        const anchors = result.get(key) ?? []
        anchors.push(anchor)
        result.set(key, anchors)
      }
    })
  }

  return result
}

function resolveExactGraphEndpointAnchor(
  nodeId: string,
  fallbackPoint: Point,
  nodesById: Map<string, { id: string; x: number; y: number }>,
  junctionsByNodeId: Map<string, Junction>,
  portsByTile: Map<string, LayoutConnectorEndpointAnchor[]>,
  tileSize: number
): LayoutConnectorEndpointAnchor {
  const node = nodesById.get(nodeId)
  const gridPoint = node ?? fallbackPoint
  const position = gridPointToWorld(gridPoint, tileSize)
  const exactPorts = portsByTile.get(`${gridPoint.x},${gridPoint.y}`) ?? []

  // Ambiguous co-located ports are not safe to guess.
  if (exactPorts.length === 1) {
    return exactPorts[0]
  }

  const junction = junctionsByNodeId.get(nodeId)
  if (junction) {
    return {
      kind: 'junction',
      junctionId: junction.id,
      position,
    }
  }

  if (node) {
    return {
      kind: 'corridorPoint',
      pointId: node.id,
      position,
    }
  }

  return { kind: 'free', position }
}

/**
 * Build a path through corridor tiles
 */
function buildCorridorPath(tiles: Point[], canvas: GridCanvas): Point[] {
  if (tiles.length === 0) return []
  if (tiles.length === 1) return tiles

  // Find endpoints (tiles with only one neighbor in the group)
  const tileSet = new Set(tiles.map(t => `${t.x},${t.y}`))
  const endpoints: Point[] = []

  for (const tile of tiles) {
    let neighborCount = 0
    for (const dir of DIRECTIONS_4) {
      const key = `${tile.x + dir.x},${tile.y + dir.y}`
      if (tileSet.has(key)) neighborCount++
    }
    if (neighborCount <= 1) {
      endpoints.push(tile)
    }
  }

  // If no clear endpoints, just use first and last
  if (endpoints.length < 2) {
    return tiles
  }

  // Build path from first endpoint to last
  const path: Point[] = []
  const visited = new Set<string>()
  const start = endpoints[0]

  const queue: Point[] = [start]
  const parentMap = new Map<string, Point | null>()
  parentMap.set(`${start.x},${start.y}`, null)

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentKey = `${current.x},${current.y}`

    if (visited.has(currentKey)) continue
    visited.add(currentKey)

    for (const dir of DIRECTIONS_4) {
      const next = { x: current.x + dir.x, y: current.y + dir.y }
      const nextKey = `${next.x},${next.y}`

      if (!visited.has(nextKey) && tileSet.has(nextKey)) {
        queue.push(next)
        parentMap.set(nextKey, current)
      }
    }
  }

  // Reconstruct longest path
  let farthest = start
  let maxDist = 0
  for (const tile of tiles) {
    const dist = visited.has(`${tile.x},${tile.y}`) ?
      Math.abs(tile.x - start.x) + Math.abs(tile.y - start.y) : 0
    if (dist > maxDist) {
      maxDist = dist
      farthest = tile
    }
  }

  // Walk back from farthest to start
  let current: Point | undefined = farthest
  while (current) {
    path.unshift(current)
    current = parentMap.get(`${current.x},${current.y}`) ?? undefined
  }

  return path
}

function simplifyGridPath(path: Point[]): Point[] {
  if (path.length <= 2) return path

  const simplified: Point[] = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const prev = simplified[simplified.length - 1]
    const current = path[i]
    const next = path[i + 1]
    const dx1 = Math.sign(current.x - prev.x)
    const dy1 = Math.sign(current.y - prev.y)
    const dx2 = Math.sign(next.x - current.x)
    const dy2 = Math.sign(next.y - current.y)

    if (dx1 !== dx2 || dy1 !== dy2) {
      simplified.push(current)
    }
  }
  simplified.push(path[path.length - 1])
  return simplified
}

function resolvePhysicalEdgeEndpoints(
  connectorIds: string[],
  path: Point[],
  placements: RoomPlacement[]
): { fromRoomId: string; toRoomId: string } {
  for (const connectorId of connectorIds) {
    const parsed = parseConnectorId(connectorId)
    if (parsed) return parsed
  }

  return resolveConnectorEndpoints('physical-edge', path, placements)
}

function resolveConnectorEndpoints(
  connectorId: string,
  path: Point[],
  placements: RoomPlacement[]
): { fromRoomId: string; toRoomId: string } {
  const parsed = parseConnectorId(connectorId)
  if (parsed) return parsed

  const first = path[0]
  const last = path[path.length - 1]
  const fromRoomId = first ? nearestRoomId(first, placements) : undefined
  const toRoomId = last ? nearestRoomId(last, placements, fromRoomId) : undefined

  return {
    fromRoomId: fromRoomId ?? 'unknown',
    toRoomId: toRoomId ?? fromRoomId ?? 'unknown',
  }
}

function nearestRoomId(point: Point, placements: RoomPlacement[], excludeRoomId?: string): string | undefined {
  let best: { roomId: string; distance: number } | null = null
  for (const placement of placements) {
    if (placement.roomId === excludeRoomId) continue
    const center = {
      x: placement.bounds.x + placement.bounds.width / 2,
      y: placement.bounds.y + placement.bounds.height / 2,
    }
    const distance = Math.abs(point.x - center.x) + Math.abs(point.y - center.y)
    if (!best || distance < best.distance) {
      best = { roomId: placement.roomId, distance }
    }
  }
  return best?.roomId
}

// ============================================================================
// JUNCTION EXTRACTION
// ============================================================================

/**
 * Extract junctions from canvas
 */
function extractJunctions(canvas: GridCanvas): Junction[] {
  const graph = buildCorridorGraph(canvas)
  if (graph.junctions.length > 0) return graph.junctions

  const junctions: Junction[] = []

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.JUNCTION) continue

      // Count corridor neighbors to determine junction type
      let corridorNeighbors = 0
      for (const dir of DIRECTIONS_4) {
        const neighbor = getTile(canvas, x + dir.x, y + dir.y)
        if (neighbor && (neighbor.type === TileType.CORRIDOR || neighbor.type === TileType.JUNCTION)) {
          corridorNeighbors++
        }
      }

      const junctionType: 'tee' | 'cross' | 'hub' =
        corridorNeighbors >= 4 ? 'cross' :
        corridorNeighbors === 3 ? 'tee' : 'hub'

      junctions.push({
        id: `junction-${x}-${y}`,
        x: x * canvas.tileSize + canvas.tileSize / 2,
        y: y * canvas.tileSize + canvas.tileSize / 2,
        connectorIds: getTileConnectorIds(tile),
        type: junctionType,
      })
    }
  }

  return junctions
}

// ============================================================================
// METADATA
// ============================================================================

/**
 * Build map metadata
 */
function buildMeta(
  request: GenerationRequest,
  roomProgram: RoomProgram,
  placements: RoomPlacement[],
  connectors: LayoutConnector[],
  junctions: Junction[],
  canvas: GridCanvas
): MapMeta {
  const gridMetrics = calculateGridMetrics(canvas, placements, connectors, junctions)
  const playability = validateTTRPGPlayability(canvas, placements, {
    requestedLoopiness: request.loopiness,
  })
  const aesthetics = validateMapAesthetics(canvas, placements)
  return {
    name: `${request.archetype.charAt(0).toUpperCase() + request.archetype.slice(1)} ${request.subtype}`,
    archetype: request.archetype,
    subtype: request.subtype,
    sizeTier: request.sizeTier,
    seed: String(request.seed),
    generatedAt: new Date().toISOString(),
    ttrpgMetrics: {
      totalRooms: placements.length,
      totalConnectors: connectors.length,
      estimatedCombatEncounters: Math.floor(placements.length / 6),
      estimatedExplorationMinutes: placements.length * 4,
      keyLocations: placements.filter(p => p.program.importance === 'primary').length,
      hiddenAreas: placements.filter(p => p.program.accessLevel >= 3).length,
      ...gridMetrics,
      playabilityStatus: playability.status,
      connectedRoomPercent: playability.metrics.connectedRoomPercent,
      isolatedRooms: playability.metrics.isolatedRoomCount,
      deadEndRatio: playability.metrics.corridorDeadEndRatio,
      corridorDeadEndCount: playability.metrics.corridorDeadEndCount,
      junctionCount: playability.metrics.junctionCount,
      maxJunctionDegree: playability.metrics.maxJunctionDegree,
      criticalReachability: playability.metrics.criticalRoomReachabilityPercent,
      reachableRoomPairPercent: playability.metrics.reachableRoomPairPercent,
      alternateRoutePairPercent: playability.metrics.alternateRoutePairPercent,
      alternateRoutePairCandidateCount: playability.metrics.alternateRoutePairCandidateCount,
      entryBasis: playability.entryBasis,
      circulationCycleRank: playability.metrics.circulationCycleRank,
      averageRoomRouteDistance: playability.metrics.averageRoomRouteDistance,
      longestRoomRouteDistance: playability.metrics.longestRoomRoute?.distance ?? null,
      criticalRoomPairPathDistance: playability.metrics.criticalRoomPairPath?.distance ?? null,
      averageEntryToCriticalDistance: playability.metrics.averageEntryToCriticalDistance,
      zoneTransitionCount: playability.metrics.zoneTransitionCount,
      playabilityViolationCodes: playability.violations.map(issue => issue.code),
      throughRoomCount: placements.filter(room => room.circulationRole === 'through').length,
      circulationHubRoomCount: placements.filter(room => room.circulationRole === 'hub').length,
      aestheticStatus: aesthetics.status,
      aestheticViolationCodes: aesthetics.violations.map(issue => issue.code),
      hullUtilizationPercent: aesthetics.metrics.hullUtilizationPercent,
      corridorTurnRatio: aesthetics.metrics.corridorTurnRatio,
      clusteredJunctionPairs: aesthetics.metrics.clusteredJunctionPairCount,
      ambiguousDoorCount: aesthetics.metrics.ambiguousDoorCount,
      doorMetadataMismatchCount: aesthetics.metrics.doorMetadataMismatchCount,
    },
    tags: [
      request.archetype,
      request.subtype,
      request.sizeTier,
      'grid-generated',
    ],
  }
}

// ============================================================================
// DEBUG OUTPUT
// ============================================================================

/**
 * Generate debug visualization of the canvas
 */
export function generateDebugOutput(canvas: GridCanvas): string {
  const chars: Record<TileType, string> = {
    [TileType.VOID]: ' ',
    [TileType.HULL]: '.',
    [TileType.FLOOR]: '#',
    [TileType.CORRIDOR]: '=',
    [TileType.DOOR]: '+',
    [TileType.JUNCTION]: '*',
    [TileType.AIRLOCK]: 'A',
    [TileType.WALL]: '|',
  }

  let output = ''
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (tile?.roomId) {
        // Show first letter of room type
        output += tile.roomId.charAt(0).toUpperCase()
      } else {
        output += chars[tile?.type ?? TileType.VOID]
      }
    }
    output += '\n'
  }
  return output
}

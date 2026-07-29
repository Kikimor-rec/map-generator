/**
 * Read-only TTRPG playability analysis for a generated grid.
 *
 * This module deliberately does not repair or mutate the canvas. Metrics are
 * derived from the physical four-directional tile graph, so editor and
 * generator callers can use the same report before deciding how to repair a
 * layout.
 */

import type { Archetype, SizeTier } from '../types'
import { DIRECTIONS_4, getTile } from './canvas'
import { isConnectivityPassable } from './metrics'
import { TileType, type GridCanvas, type Point, type RoomPlacement } from './types'

export type PlayabilitySeverity = 'error' | 'warning' | 'info'
export type PlayabilityStatus = 'pass' | 'warning' | 'error'

export interface PlayabilityViolation {
  code:
    | 'ROOMS_DISCONNECTED'
    | 'CRITICAL_ROOM_UNREACHABLE'
    | 'HIGH_CORRIDOR_DEAD_END_RATIO'
    | 'LOW_JUNCTION_COUNT'
    | 'LOW_ROUTE_REDUNDANCY'
    | 'NO_ENTRY_ROOM'
  severity: PlayabilitySeverity
  message: string
  roomIds?: string[]
  actual?: number
  threshold?: number
  hint: string
}

export interface RouteDistance {
  fromRoomId: string
  toRoomId: string
  distance: number
}

export interface ZoneTransitionPair {
  fromZoneId: string
  toZoneId: string
  crossingEdges: number
}

export interface PlayabilityThresholds {
  connectedRoomPercentMin: number
  criticalReachabilityPercentMin: number
  corridorDeadEndRatioMax: number
  junctionCountMin: number
  alternateRoutePairPercentMin: number
}

export interface PlayabilityMetrics {
  connectedRoomPercent: number
  isolatedRoomCount: number
  isolatedRoomIds: string[]

  corridorTileCount: number
  corridorDeadEndCount: number
  corridorDeadEndRatio: number
  junctionCount: number
  maxJunctionDegree: number

  reachableRoomPairPercent: number
  averageRoomRouteDistance: number | null
  longestRoomRoute: RouteDistance | null
  criticalRoomPairPath: RouteDistance | null
  averageEntryToCriticalDistance: number | null

  circulationCycleRank: number
  circulationHasCycle: boolean
  nonBridgeCirculationEdgeRatio: number
  alternateRoutePairCount: number
  alternateRoutePairCandidateCount: number
  alternateRoutePairPercent: number

  zoneTransitionCount: number
  zoneTransitionPairCount: number
  zoneTransitionPairs: ZoneTransitionPair[]

  entryRoomCount: number
  entryRoomIds: string[]
  criticalRoomCount: number
  criticalRoomIds: string[]
  reachableCriticalRoomIds: string[]
  unreachableCriticalRoomIds: string[]
  criticalRoomReachabilityPercent: number
}

export interface PlayabilityReport {
  status: PlayabilityStatus
  archetype: Archetype
  sizeTier: SizeTier
  /**
   * `inferred` uses exterior/dock/airlock-like room semantics.
   * `provided` uses the caller override.
   * `fallback-first-room` is explicit: reachability is then measured from the
   * lexically first room and must not be presented as verified airlock access.
   * `none` means that the map has no rooms.
   */
  entryBasis: 'provided' | 'inferred' | 'fallback-first-room' | 'none'
  thresholds: PlayabilityThresholds
  metrics: PlayabilityMetrics
  violations: PlayabilityViolation[]
}

export interface PlayabilityValidationOptions {
  entryRoomIds?: string[]
  criticalRoomIds?: string[]
  requestedLoopiness?: number
  thresholds?: Partial<PlayabilityThresholds>
}

interface RoomPairDistance extends RouteDistance {
  reachable: boolean
}

interface NavigationGraph {
  adjacency: Map<string, Set<string>>
  roomNodeById: Map<string, string>
  roomAnchorNodesById: Map<string, string[]>
}

const ENTRY_TERMS = [
  'airlock',
  'dock',
  'docking',
  'hangar',
  'shuttle',
  'entrance',
  'entry',
  'egress',
]

export function validateTTRPGPlayability(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  options: PlayabilityValidationOptions = {}
): PlayabilityReport {
  const orderedPlacements = [...placements].sort((a, b) => a.roomId.localeCompare(b.roomId))
  const thresholds = {
    ...getPlayabilityThresholds(canvas.archetype, canvas.sizeTier, options.requestedLoopiness),
    ...(options.thresholds ?? {}),
  }

  const connectivity = analyzeRoomComponents(canvas, orderedPlacements)
  const corridor = analyzeCorridors(canvas)
  const pairDistances = calculateRoomPairDistances(canvas, orderedPlacements)
  const routeSummary = summarizeRoutes(pairDistances, orderedPlacements)
  const entrySelection = selectEntryRooms(orderedPlacements, options.entryRoomIds)
  const criticalRoomIds = selectCriticalRooms(orderedPlacements, options.criticalRoomIds)
  const critical = analyzeCriticalReachability(
    entrySelection.roomIds,
    criticalRoomIds,
    pairDistances
  )
  const navigationGraph = buildNavigationGraph(canvas, orderedPlacements)
  const alternate = analyzeAlternateRoutes(
    navigationGraph,
    buildAlternateRouteCandidates(entrySelection.roomIds, criticalRoomIds)
  )
  const zoneTransitions = analyzeZoneTransitions(canvas)

  const metrics: PlayabilityMetrics = {
    ...connectivity,
    ...corridor,
    ...routeSummary,
    ...alternate,
    ...zoneTransitions,
    entryRoomCount: entrySelection.roomIds.length,
    entryRoomIds: entrySelection.roomIds,
    criticalRoomCount: criticalRoomIds.length,
    criticalRoomIds,
    ...critical,
  }

  const violations: PlayabilityViolation[] = []

  if (metrics.connectedRoomPercent < thresholds.connectedRoomPercentMin) {
    violations.push({
      code: 'ROOMS_DISCONNECTED',
      severity: 'error',
      message: `${metrics.isolatedRoomCount} room(s) are outside the largest reachable room component.`,
      roomIds: metrics.isolatedRoomIds,
      actual: metrics.connectedRoomPercent,
      threshold: thresholds.connectedRoomPercentMin,
      hint: 'Connect each isolated room to the established circulation component with a door and valid route.',
    })
  }

  if (metrics.criticalRoomReachabilityPercent < thresholds.criticalReachabilityPercentMin) {
    violations.push({
      code: 'CRITICAL_ROOM_UNREACHABLE',
      severity: 'error',
      message: `${metrics.unreachableCriticalRoomIds.length} critical room(s) cannot be reached from an entry room.`,
      roomIds: metrics.unreachableCriticalRoomIds,
      actual: metrics.criticalRoomReachabilityPercent,
      threshold: thresholds.criticalReachabilityPercentMin,
      hint: 'Add a valid route from a dock/airlock entry to every primary room.',
    })
  }

  if (metrics.corridorDeadEndRatio > thresholds.corridorDeadEndRatioMax) {
    violations.push({
      code: 'HIGH_CORRIDOR_DEAD_END_RATIO',
      severity: 'warning',
      message: 'The corridor network has more terminal tiles than recommended for this archetype and size.',
      actual: metrics.corridorDeadEndRatio,
      threshold: thresholds.corridorDeadEndRatioMax,
      hint: 'Join selected terminal branches into loops, preserving intentional horror or service dead ends.',
    })
  }

  if (metrics.junctionCount < thresholds.junctionCountMin) {
    violations.push({
      code: 'LOW_JUNCTION_COUNT',
      severity: 'warning',
      message: 'The circulation network offers fewer route decisions than the soft archetype threshold.',
      actual: metrics.junctionCount,
      threshold: thresholds.junctionCountMin,
      hint: 'Add a readable branch or hub where it creates a meaningful tactical choice.',
    })
  }

  if (
    metrics.alternateRoutePairCandidateCount > 0 &&
    metrics.alternateRoutePairPercent < thresholds.alternateRoutePairPercentMin
  ) {
    violations.push({
      code: 'LOW_ROUTE_REDUNDANCY',
      severity: 'warning',
      message: 'Too few critical route pairs retain a path after removal of one circulation edge.',
      actual: metrics.alternateRoutePairPercent,
      threshold: thresholds.alternateRoutePairPercentMin,
      hint: 'Create a genuine bypass between critical locations instead of only widening the same route.',
    })
  }

  if (entrySelection.basis === 'fallback-first-room') {
    violations.push({
      code: 'NO_ENTRY_ROOM',
      severity: 'info',
      message: 'No exterior, dock, or airlock-like room was found; entry-to-critical metrics use the first room.',
      roomIds: entrySelection.roomIds,
      hint: 'Mark an exterior access room or provide entryRoomIds for authoritative reachability checks.',
    })
  }

  const status: PlayabilityStatus = violations.some(issue => issue.severity === 'error')
    ? 'error'
    : violations.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'pass'

  return {
    status,
    archetype: canvas.archetype,
    sizeTier: canvas.sizeTier,
    entryBasis: entrySelection.basis,
    thresholds,
    metrics,
    violations,
  }
}

export function getPlayabilityThresholds(
  archetype: Archetype,
  sizeTier: SizeTier,
  requestedLoopiness?: number
): PlayabilityThresholds {
  const tierIndex = ['xs', 'sm', 'md', 'lg', 'xl'].indexOf(sizeTier)
  const baseDeadEndMax = [0.42, 0.36, 0.32, 0.28, 0.25][Math.max(0, tierIndex)]
  const archetypeDeadEndAdjustment = archetype === 'station' ? -0.03 : archetype === 'outpost' ? 0.05 : 0
  const junctionByArchetype: Record<Archetype, number[]> = {
    ship: [0, 0, 1, 2, 3],
    station: [0, 1, 2, 3, 4],
    outpost: [0, 0, 1, 2, 2],
  }

  return {
    connectedRoomPercentMin: 100,
    criticalReachabilityPercentMin: 100,
    corridorDeadEndRatioMax: roundRatio(baseDeadEndMax + archetypeDeadEndAdjustment),
    junctionCountMin: junctionByArchetype[archetype][Math.max(0, tierIndex)],
    // Only assert route redundancy when the caller actually requested loops.
    // This avoids pretending that every compact or horror layout needs a loop.
    alternateRoutePairPercentMin:
      requestedLoopiness === undefined || requestedLoopiness < 0.35
        ? 0
        : requestedLoopiness >= 0.7 ? 50 : 1,
  }
}

function analyzeRoomComponents(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): Pick<PlayabilityMetrics, 'connectedRoomPercent' | 'isolatedRoomCount' | 'isolatedRoomIds'> {
  if (placements.length === 0) {
    return { connectedRoomPercent: 100, isolatedRoomCount: 0, isolatedRoomIds: [] }
  }

  const roomIds = new Set(placements.map(room => room.roomId))
  const visited = new Set<string>()
  const components: string[][] = []

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const startKey = pointKey({ x, y })
      if (visited.has(startKey) || !isConnectivityPassable(getTile(canvas, x, y))) continue

      const queue: Point[] = [{ x, y }]
      const componentRooms = new Set<string>()
      visited.add(startKey)

      for (let index = 0; index < queue.length; index++) {
        const point = queue[index]
        const tile = getTile(canvas, point.x, point.y)
        if (tile?.roomId && roomIds.has(tile.roomId)) componentRooms.add(tile.roomId)

        for (const direction of DIRECTIONS_4) {
          const next = { x: point.x + direction.x, y: point.y + direction.y }
          const key = pointKey(next)
          if (visited.has(key) || !isConnectivityPassable(getTile(canvas, next.x, next.y))) continue
          visited.add(key)
          queue.push(next)
        }
      }

      if (componentRooms.size > 0) {
        components.push([...componentRooms].sort())
      }
    }
  }

  const represented = new Set(components.flat())
  for (const room of placements) {
    if (!represented.has(room.roomId)) components.push([room.roomId])
  }

  components.sort((a, b) => b.length - a.length || a.join('\0').localeCompare(b.join('\0')))
  const mainRoomIds = new Set(components[0] ?? [])
  const isolatedRoomIds = placements
    .map(room => room.roomId)
    .filter(roomId => !mainRoomIds.has(roomId))
    .sort()

  return {
    connectedRoomPercent: Math.round((mainRoomIds.size / placements.length) * 100),
    isolatedRoomCount: isolatedRoomIds.length,
    isolatedRoomIds,
  }
}

function analyzeCorridors(
  canvas: GridCanvas
): Pick<
  PlayabilityMetrics,
  | 'corridorTileCount'
  | 'corridorDeadEndCount'
  | 'corridorDeadEndRatio'
  | 'junctionCount'
  | 'maxJunctionDegree'
> {
  let corridorTileCount = 0
  let corridorDeadEndCount = 0
  let junctionCount = 0
  let maxJunctionDegree = 0

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (!isCorridorTile(getTile(canvas, x, y)?.type)) continue
      corridorTileCount++
      const degree = DIRECTIONS_4.filter(direction =>
        isCorridorTile(getTile(canvas, x + direction.x, y + direction.y)?.type)
      ).length
      if (degree === 1) corridorDeadEndCount++
      if (degree >= 3) junctionCount++
      maxJunctionDegree = Math.max(maxJunctionDegree, degree)
    }
  }

  return {
    corridorTileCount,
    corridorDeadEndCount,
    corridorDeadEndRatio: corridorTileCount === 0
      ? 0
      : roundRatio(corridorDeadEndCount / corridorTileCount),
    junctionCount,
    maxJunctionDegree,
  }
}

function calculateRoomPairDistances(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): RoomPairDistance[] {
  const anchors = new Map(
    placements.map(room => [room.roomId, getRoomRouteAnchors(canvas, room)])
  )
  const pairs: RoomPairDistance[] = []

  for (let i = 0; i < placements.length; i++) {
    const from = placements[i]
    const distances = floodDistances(canvas, anchors.get(from.roomId) ?? [])

    for (let j = i + 1; j < placements.length; j++) {
      const to = placements[j]
      const targetDistances = (anchors.get(to.roomId) ?? [])
        .map(point => distances.get(pointKey(point)))
        .filter((distance): distance is number => distance !== undefined)
      const distance = targetDistances.length > 0 ? Math.min(...targetDistances) : -1
      pairs.push({
        fromRoomId: from.roomId,
        toRoomId: to.roomId,
        distance,
        reachable: distance >= 0,
      })
    }
  }

  return pairs
}

function summarizeRoutes(
  pairs: RoomPairDistance[],
  placements: RoomPlacement[]
): Pick<
  PlayabilityMetrics,
  | 'reachableRoomPairPercent'
  | 'averageRoomRouteDistance'
  | 'longestRoomRoute'
  | 'criticalRoomPairPath'
  | 'averageEntryToCriticalDistance'
> {
  const reachablePairs = pairs.filter(pair => pair.reachable)
  const criticalIds = new Set(
    placements.filter(room => room.program.importance === 'primary').map(room => room.roomId)
  )
  const criticalPairs = reachablePairs.filter(pair =>
    criticalIds.has(pair.fromRoomId) && criticalIds.has(pair.toRoomId)
  )

  return {
    reachableRoomPairPercent: pairs.length === 0
      ? 100
      : Math.round((reachablePairs.length / pairs.length) * 100),
    averageRoomRouteDistance: averageDistance(reachablePairs),
    longestRoomRoute: longestDistance(reachablePairs),
    criticalRoomPairPath: longestDistance(criticalPairs),
    // Filled with authoritative entry selection later.
    averageEntryToCriticalDistance: null,
  }
}

function selectEntryRooms(
  placements: RoomPlacement[],
  providedIds?: string[]
): { roomIds: string[]; basis: PlayabilityReport['entryBasis'] } {
  const available = new Set(placements.map(room => room.roomId))
  if (providedIds !== undefined) {
    return {
      roomIds: [...new Set(providedIds)].filter(id => available.has(id)).sort(),
      basis: 'provided',
    }
  }

  const inferred = placements.filter(room => {
    const semanticText = [
      room.roomType,
      room.label,
      ...(room.program.tags ?? []),
    ].join(' ').toLowerCase()
    return room.program.isExterior || ENTRY_TERMS.some(term => semanticText.includes(term))
  }).map(room => room.roomId).sort()

  if (inferred.length > 0) return { roomIds: inferred, basis: 'inferred' }
  if (placements.length > 0) {
    return { roomIds: [placements[0].roomId], basis: 'fallback-first-room' }
  }
  return { roomIds: [], basis: 'none' }
}

function selectCriticalRooms(placements: RoomPlacement[], providedIds?: string[]): string[] {
  const available = new Set(placements.map(room => room.roomId))
  if (providedIds !== undefined) {
    return [...new Set(providedIds)].filter(id => available.has(id)).sort()
  }
  return placements
    .filter(room => room.program.importance === 'primary')
    .map(room => room.roomId)
    .sort()
}

function analyzeCriticalReachability(
  entryRoomIds: string[],
  criticalRoomIds: string[],
  pairs: RoomPairDistance[]
): Pick<
  PlayabilityMetrics,
  | 'reachableCriticalRoomIds'
  | 'unreachableCriticalRoomIds'
  | 'criticalRoomReachabilityPercent'
  | 'averageEntryToCriticalDistance'
> {
  const pairDistance = new Map<string, number>()
  for (const pair of pairs) {
    if (!pair.reachable) continue
    pairDistance.set(roomPairKey(pair.fromRoomId, pair.toRoomId), pair.distance)
  }

  const distances: number[] = []
  const reachableCriticalRoomIds = criticalRoomIds.filter(criticalRoomId => {
    if (entryRoomIds.includes(criticalRoomId)) {
      distances.push(0)
      return true
    }
    const candidates = entryRoomIds
      .map(entryId => pairDistance.get(roomPairKey(entryId, criticalRoomId)))
      .filter((distance): distance is number => distance !== undefined)
    if (candidates.length === 0) return false
    distances.push(Math.min(...candidates))
    return true
  })
  const reachable = new Set(reachableCriticalRoomIds)
  const unreachableCriticalRoomIds = criticalRoomIds.filter(id => !reachable.has(id))

  return {
    reachableCriticalRoomIds,
    unreachableCriticalRoomIds,
    criticalRoomReachabilityPercent: criticalRoomIds.length === 0
      ? 100
      : Math.round((reachableCriticalRoomIds.length / criticalRoomIds.length) * 100),
    averageEntryToCriticalDistance: distances.length === 0
      ? null
      : roundMetric(distances.reduce((sum, distance) => sum + distance, 0) / distances.length),
  }
}

function buildNavigationGraph(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): NavigationGraph {
  const adjacency = new Map<string, Set<string>>()
  const roomNodeById = new Map<string, string>()
  const roomAnchorNodesById = new Map<string, string[]>()

  const ensureNode = (node: string) => {
    if (!adjacency.has(node)) adjacency.set(node, new Set())
  }
  const connect = (a: string, b: string) => {
    ensureNode(a)
    ensureNode(b)
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (!isCirculationTile(getTile(canvas, x, y)?.type)) continue
      const node = tileNode({ x, y })
      ensureNode(node)
      for (const direction of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
        const next = { x: x + direction.x, y: y + direction.y }
        if (isCirculationTile(getTile(canvas, next.x, next.y)?.type)) {
          connect(node, tileNode(next))
        }
      }
    }
  }

  for (const room of placements) {
    const roomNode = `room:${room.roomId}`
    roomNodeById.set(room.roomId, roomNode)
    ensureNode(roomNode)

    const circulationAnchors = getRoomCirculationAnchors(canvas, room)
    roomAnchorNodesById.set(room.roomId, circulationAnchors.map(tileNode))
    for (const anchor of circulationAnchors) {
      connect(roomNode, tileNode(anchor))
    }
  }

  return { adjacency, roomNodeById, roomAnchorNodesById }
}

function analyzeAlternateRoutes(
  graph: NavigationGraph,
  candidates: Array<[string, string]>
): Pick<
  PlayabilityMetrics,
  | 'circulationCycleRank'
  | 'circulationHasCycle'
  | 'nonBridgeCirculationEdgeRatio'
  | 'alternateRoutePairCount'
  | 'alternateRoutePairCandidateCount'
  | 'alternateRoutePairPercent'
> {
  const componentCount = countGraphComponents(graph.adjacency)
  const edgeCount = [...graph.adjacency.values()]
    .reduce((sum, neighbors) => sum + neighbors.size, 0) / 2
  const circulationCycleRank = Math.max(
    0,
    edgeCount - graph.adjacency.size + componentCount
  )
  const bridges = findBridges(graph.adjacency)
  const bridgeFreeComponents = labelComponentsWithoutEdges(graph.adjacency, bridges)
  const validCandidates = candidates.filter(([fromRoomId, toRoomId]) =>
    (graph.roomAnchorNodesById.get(fromRoomId)?.length ?? 0) > 0 &&
    (graph.roomAnchorNodesById.get(toRoomId)?.length ?? 0) > 0
  )
  const alternateRoutePairCount = validCandidates.filter(([fromRoomId, toRoomId]) => {
    const fromAnchors = graph.roomAnchorNodesById.get(fromRoomId) ?? []
    const toAnchors = graph.roomAnchorNodesById.get(toRoomId) ?? []
    return fromAnchors.some(fromNode =>
      toAnchors.some(toNode =>
        bridgeFreeComponents.get(fromNode) === bridgeFreeComponents.get(toNode)
      )
    )
  }).length

  return {
    circulationCycleRank,
    circulationHasCycle: circulationCycleRank > 0,
    nonBridgeCirculationEdgeRatio: edgeCount === 0
      ? 0
      : roundRatio((edgeCount - bridges.size) / edgeCount),
    alternateRoutePairCount,
    alternateRoutePairCandidateCount: validCandidates.length,
    alternateRoutePairPercent: validCandidates.length === 0
      ? 100
      : Math.round((alternateRoutePairCount / validCandidates.length) * 100),
  }
}

function buildAlternateRouteCandidates(
  entryRoomIds: string[],
  criticalRoomIds: string[]
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  if (criticalRoomIds.length >= 2) {
    for (let i = 0; i < criticalRoomIds.length; i++) {
      for (let j = i + 1; j < criticalRoomIds.length; j++) {
        pairs.push([criticalRoomIds[i], criticalRoomIds[j]])
      }
    }
  } else {
    for (const entryRoomId of entryRoomIds) {
      for (const criticalRoomId of criticalRoomIds) {
        if (entryRoomId !== criticalRoomId) pairs.push([entryRoomId, criticalRoomId])
      }
    }
  }
  return pairs
}

function analyzeZoneTransitions(
  canvas: GridCanvas
): Pick<
  PlayabilityMetrics,
  'zoneTransitionCount' | 'zoneTransitionPairCount' | 'zoneTransitionPairs'
> {
  const pairCounts = new Map<string, ZoneTransitionPair>()
  let zoneTransitionCount = 0

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!isConnectivityPassable(tile) || !tile?.zoneId) continue

      for (const direction of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
        const neighbor = getTile(canvas, x + direction.x, y + direction.y)
        if (
          !isConnectivityPassable(neighbor) ||
          !neighbor?.zoneId ||
          neighbor.zoneId === tile.zoneId
        ) continue

        zoneTransitionCount++
        const [fromZoneId, toZoneId] = [tile.zoneId, neighbor.zoneId].sort()
        const key = `${fromZoneId}\0${toZoneId}`
        const existing = pairCounts.get(key)
        pairCounts.set(key, {
          fromZoneId,
          toZoneId,
          crossingEdges: (existing?.crossingEdges ?? 0) + 1,
        })
      }
    }
  }

  const zoneTransitionPairs = [...pairCounts.values()]
    .sort((a, b) =>
      a.fromZoneId.localeCompare(b.fromZoneId) || a.toZoneId.localeCompare(b.toZoneId)
    )

  return {
    zoneTransitionCount,
    zoneTransitionPairCount: zoneTransitionPairs.length,
    zoneTransitionPairs,
  }
}

function getRoomRouteAnchors(canvas: GridCanvas, room: RoomPlacement): Point[] {
  const doors = uniquePoints(room.doorPositions)
    .filter(point => isConnectivityPassable(getTile(canvas, point.x, point.y)))
  if (doors.length > 0) return doors

  const tiles = uniquePoints(room.tiles)
    .filter(point => isConnectivityPassable(getTile(canvas, point.x, point.y)))
  if (tiles.length > 0) return tiles

  const fallback: Point[] = []
  for (let y = room.bounds.y; y < room.bounds.y + room.bounds.height; y++) {
    for (let x = room.bounds.x; x < room.bounds.x + room.bounds.width; x++) {
      if (isConnectivityPassable(getTile(canvas, x, y))) fallback.push({ x, y })
    }
  }
  return fallback
}

function getRoomCirculationAnchors(canvas: GridCanvas, room: RoomPlacement): Point[] {
  const doorTiles = uniquePoints(room.doorPositions)
    .filter(point => isCirculationTile(getTile(canvas, point.x, point.y)?.type))
  const corridorIngresses: Point[] = []
  for (const door of doorTiles) {
    for (const direction of DIRECTIONS_4) {
      const point = { x: door.x + direction.x, y: door.y + direction.y }
      if (isCorridorTile(getTile(canvas, point.x, point.y)?.type)) {
        corridorIngresses.push(point)
      }
    }
  }
  if (corridorIngresses.length > 0) return uniquePoints(corridorIngresses)

  // A standalone airlock/door can still anchor a room, but its only edge will
  // correctly be treated as a bridge by the redundancy analysis.
  if (doorTiles.length > 0) return doorTiles

  const adjacent: Point[] = []
  for (const roomPoint of uniquePoints(room.tiles)) {
    for (const direction of DIRECTIONS_4) {
      const point = { x: roomPoint.x + direction.x, y: roomPoint.y + direction.y }
      if (isCirculationTile(getTile(canvas, point.x, point.y)?.type)) adjacent.push(point)
    }
  }
  return uniquePoints(adjacent)
}

function floodDistances(canvas: GridCanvas, starts: Point[]): Map<string, number> {
  const distances = new Map<string, number>()
  const queue: Point[] = []

  for (const start of starts) {
    if (!isConnectivityPassable(getTile(canvas, start.x, start.y))) continue
    const key = pointKey(start)
    if (distances.has(key)) continue
    distances.set(key, 0)
    queue.push(start)
  }

  for (let index = 0; index < queue.length; index++) {
    const point = queue[index]
    const distance = distances.get(pointKey(point))!
    for (const direction of DIRECTIONS_4) {
      const next = { x: point.x + direction.x, y: point.y + direction.y }
      const key = pointKey(next)
      if (distances.has(key) || !isConnectivityPassable(getTile(canvas, next.x, next.y))) continue
      distances.set(key, distance + 1)
      queue.push(next)
    }
  }
  return distances
}

function findBridges(adjacency: Map<string, Set<string>>): Set<string> {
  const discovery = new Map<string, number>()
  const low = new Map<string, number>()
  const bridges = new Set<string>()
  let time = 0

  const visit = (node: string, parent?: string) => {
    discovery.set(node, time)
    low.set(node, time)
    time++

    for (const neighbor of [...(adjacency.get(node) ?? [])].sort()) {
      if (neighbor === parent) continue
      if (!discovery.has(neighbor)) {
        visit(neighbor, node)
        low.set(node, Math.min(low.get(node)!, low.get(neighbor)!))
        if (low.get(neighbor)! > discovery.get(node)!) {
          bridges.add(graphEdgeKey(node, neighbor))
        }
      } else {
        low.set(node, Math.min(low.get(node)!, discovery.get(neighbor)!))
      }
    }
  }

  for (const node of [...adjacency.keys()].sort()) {
    if (!discovery.has(node)) visit(node)
  }
  return bridges
}

function labelComponentsWithoutEdges(
  adjacency: Map<string, Set<string>>,
  excludedEdges: Set<string>
): Map<string, number> {
  const labels = new Map<string, number>()
  let component = 0

  for (const start of [...adjacency.keys()].sort()) {
    if (labels.has(start)) continue
    const queue = [start]
    labels.set(start, component)
    for (let index = 0; index < queue.length; index++) {
      const node = queue[index]
      for (const neighbor of adjacency.get(node) ?? []) {
        if (excludedEdges.has(graphEdgeKey(node, neighbor)) || labels.has(neighbor)) continue
        labels.set(neighbor, component)
        queue.push(neighbor)
      }
    }
    component++
  }
  return labels
}

function countGraphComponents(adjacency: Map<string, Set<string>>): number {
  const visited = new Set<string>()
  let count = 0
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue
    count++
    const queue = [start]
    visited.add(start)
    for (let index = 0; index < queue.length; index++) {
      for (const neighbor of adjacency.get(queue[index]) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return count
}

function averageDistance(pairs: RoomPairDistance[]): number | null {
  if (pairs.length === 0) return null
  return roundMetric(pairs.reduce((sum, pair) => sum + pair.distance, 0) / pairs.length)
}

function longestDistance(pairs: RoomPairDistance[]): RouteDistance | null {
  if (pairs.length === 0) return null
  const sorted = [...pairs].sort((a, b) =>
    b.distance - a.distance ||
    a.fromRoomId.localeCompare(b.fromRoomId) ||
    a.toRoomId.localeCompare(b.toRoomId)
  )
  const { fromRoomId, toRoomId, distance } = sorted[0]
  return { fromRoomId, toRoomId, distance }
}

function isCorridorTile(type: TileType | undefined): boolean {
  return type === TileType.CORRIDOR || type === TileType.JUNCTION
}

function isCirculationTile(type: TileType | undefined): boolean {
  return isCorridorTile(type) || type === TileType.DOOR || type === TileType.AIRLOCK
}

function uniquePoints(points: Point[]): Point[] {
  const byKey = new Map(points.map(point => [pointKey(point), point]))
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point)
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function tileNode(point: Point): string {
  return `tile:${pointKey(point)}`
}

function roomPairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

function graphEdgeKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

function roundRatio(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100
}

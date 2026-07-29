/**
 * Connectivity and corridor quality metrics for grid-generated maps.
 */

import type { LayoutConnector, Junction, TTRPGMetrics } from '../types'
import { TileType, type GridCanvas, type Point, type RoomPlacement, type Tile } from './types'
import { DIRECTIONS_4, getTile } from './canvas'
import { buildCorridorGraph, corridorNeighborCount, isCorridorLike } from './corridorGraph'

export interface ConnectivityAnalysis {
  reachableRoomIds: Set<string>
  isolatedRoomIds: string[]
  connectedRoomPercent: number
}

export function isConnectivityPassable(tile: Tile | undefined): boolean {
  return !!tile && (
    tile.type === TileType.FLOOR ||
    tile.type === TileType.DOOR ||
    tile.type === TileType.CORRIDOR ||
    tile.type === TileType.JUNCTION ||
    tile.type === TileType.AIRLOCK
  )
}

export function analyzeConnectivity(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): ConnectivityAnalysis {
  if (placements.length === 0) {
    return { reachableRoomIds: new Set(), isolatedRoomIds: [], connectedRoomPercent: 100 }
  }

  const startRoom = placements[0]
  const start = startRoom.doorPositions[0] ?? startRoom.tiles[0] ?? {
    x: startRoom.bounds.x,
    y: startRoom.bounds.y,
  }

  const queue: Point[] = [start]
  const visited = new Set<string>()
  const reachableRoomIds = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = `${current.x},${current.y}`
    if (visited.has(key)) continue
    visited.add(key)

    const tile = getTile(canvas, current.x, current.y)
    if (!isConnectivityPassable(tile)) continue
    if (tile?.roomId) reachableRoomIds.add(tile.roomId)

    for (const dir of DIRECTIONS_4) {
      const next = { x: current.x + dir.x, y: current.y + dir.y }
      if (visited.has(`${next.x},${next.y}`)) continue
      if (isConnectivityPassable(getTile(canvas, next.x, next.y))) {
        queue.push(next)
      }
    }
  }

  const isolatedRoomIds = placements
    .map(p => p.roomId)
    .filter(roomId => !reachableRoomIds.has(roomId))

  return {
    reachableRoomIds,
    isolatedRoomIds,
    connectedRoomPercent: Math.round((reachableRoomIds.size / placements.length) * 100),
  }
}

export function calculateGridMetrics(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  connectors: LayoutConnector[],
  junctions: Junction[]
): Partial<TTRPGMetrics> {
  const connectivity = analyzeConnectivity(canvas, placements)
  const graph = buildCorridorGraph(canvas)

  const corridorNodes = graph.nodes.filter(node => node.degree > 0)
  const deadEnds = corridorNodes.filter(node => node.degree === 1).length
  const deadEndRatio = corridorNodes.length > 0 ? deadEnds / corridorNodes.length : 0
  const loopCount = Math.max(0, graph.edges.length - graph.nodes.length + 1)
  const maxJunctionDegree = graph.nodes.reduce((max, node) => Math.max(max, node.degree), 0)

  return {
    totalConnectors: connectors.length,
    connectedRoomPercent: connectivity.connectedRoomPercent,
    isolatedRooms: connectivity.isolatedRoomIds.length,
    loopCount,
    deadEndRatio: Number(deadEndRatio.toFixed(2)),
    junctionCount: junctions.length,
    maxJunctionDegree,
    averageCorridorTurns: Number(averageTurns(connectors).toFixed(2)),
    criticalReachability: criticalReachability(connectivity.reachableRoomIds, placements),
  }
}

export function countCorridorDeadEnds(canvas: GridCanvas): number {
  let count = 0
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (isCorridorLike(getTile(canvas, x, y)) && corridorNeighborCount(canvas, { x, y }) === 1) {
        count++
      }
    }
  }
  return count
}

function averageTurns(connectors: LayoutConnector[]): number {
  if (connectors.length === 0) return 0
  const turns = connectors.map(connector => {
    let count = 0
    for (let i = 2; i < connector.path.length; i++) {
      const a = connector.path[i - 2]
      const b = connector.path[i - 1]
      const c = connector.path[i]
      const dx1 = Math.sign(b.x - a.x)
      const dy1 = Math.sign(b.y - a.y)
      const dx2 = Math.sign(c.x - b.x)
      const dy2 = Math.sign(c.y - b.y)
      if (dx1 !== dx2 || dy1 !== dy2) count++
    }
    return count
  })
  return turns.reduce((sum, value) => sum + value, 0) / connectors.length
}

function criticalReachability(reachableRoomIds: Set<string>, placements: RoomPlacement[]): number {
  const critical = placements.filter(p => p.program.importance === 'primary')
  if (critical.length === 0) return 100
  const reachable = critical.filter(p => reachableRoomIds.has(p.roomId)).length
  return Math.round((reachable / critical.length) * 100)
}

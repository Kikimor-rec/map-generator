/**
 * Corridor graph utilities for the grid generator.
 *
 * The canvas remains the source of truth, but corridor tiles can now carry
 * multiple logical connector ids. This lets crossings, branches, and overlaps
 * be treated as topology instead of independent path blobs.
 */

import type { Junction as LayoutJunction } from '../types'
import { TileType, type GridCanvas, type Point, type Tile } from './types'
import { DIRECTIONS_4, getTile } from './canvas'

export interface CorridorGraphNode {
  id: string
  x: number
  y: number
  degree: number
  kind: 'endpoint' | 'bend' | 'junction'
  connectorIds: string[]
}

export interface CorridorGraphEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  path: Point[]
  connectorIds: string[]
}

export interface CorridorGraph {
  nodes: CorridorGraphNode[]
  edges: CorridorGraphEdge[]
  junctions: LayoutJunction[]
}

export function connectorIdForRooms(fromRoomId: string, toRoomId: string): string {
  return `${fromRoomId}__${toRoomId}`
}

export function parseConnectorId(connectorId: string): { fromRoomId: string; toRoomId: string } | null {
  const parts = connectorId.split('__')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { fromRoomId: parts[0], toRoomId: parts[1] }
}

export function getTileConnectorIds(tile: Tile | undefined): string[] {
  if (!tile) return []
  const metadataIds = tile.metadata?.connectorIds
  const ids = Array.isArray(metadataIds)
    ? metadataIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  if (tile.corridorId) ids.push(tile.corridorId)
  return Array.from(new Set(ids))
}

export function addConnectorIdToTile(tile: Tile, connectorId: string): Tile {
  const connectorIds = Array.from(new Set([...getTileConnectorIds(tile), connectorId]))
  return {
    ...tile,
    corridorId: tile.corridorId ?? connectorId,
    metadata: {
      ...(tile.metadata ?? {}),
      connectorIds,
    },
  }
}

export function isCorridorLike(tile: Tile | undefined): boolean {
  return !!tile && (
    tile.type === TileType.CORRIDOR ||
    tile.type === TileType.JUNCTION
  )
}

export function buildCorridorGraph(canvas: GridCanvas): CorridorGraph {
  const nodes: CorridorGraphNode[] = []
  const nodeByKey = new Map<string, CorridorGraphNode>()
  const corridorKeys = new Set<string>()

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (isCorridorLike(getTile(canvas, x, y))) {
        corridorKeys.add(keyOf({ x, y }))
      }
    }
  }

  for (const key of corridorKeys) {
    const point = pointFromKey(key)
    const neighborCount = corridorNeighborCount(canvas, point)
    const connectorIds = getTileConnectorIds(getTile(canvas, point.x, point.y))
    const isBend = neighborCount === 2 && !hasOppositeCorridorNeighbors(canvas, point)
    const isNode = neighborCount !== 2 || isBend || connectorIds.length > 1

    if (!isNode) continue

    const kind: CorridorGraphNode['kind'] =
      neighborCount >= 3 || connectorIds.length > 1 ? 'junction' :
      neighborCount <= 1 ? 'endpoint' :
      'bend'

    const node: CorridorGraphNode = {
      id: `node-${point.x}-${point.y}`,
      x: point.x,
      y: point.y,
      degree: neighborCount,
      kind,
      connectorIds,
    }
    nodes.push(node)
    nodeByKey.set(key, node)
  }

  const edges: CorridorGraphEdge[] = []
  const visitedSegments = new Set<string>()

  for (const node of nodes) {
    const start = { x: node.x, y: node.y }
    for (const dir of DIRECTIONS_4) {
      const next = { x: start.x + dir.x, y: start.y + dir.y }
      if (!corridorKeys.has(keyOf(next))) continue

      const segmentKey = edgeVisitKey(start, next)
      if (visitedSegments.has(segmentKey)) continue

      const path: Point[] = [start]
      let previous = start
      let current = next
      let connectorIds = new Set(node.connectorIds)

      while (true) {
        path.push(current)
        visitedSegments.add(edgeVisitKey(previous, current))
        getTileConnectorIds(getTile(canvas, current.x, current.y)).forEach(id => connectorIds.add(id))

        const currentNode = nodeByKey.get(keyOf(current))
        if (currentNode && currentNode.id !== node.id) {
          currentNode.connectorIds.forEach(id => connectorIds.add(id))
          edges.push({
            id: `edge-${edges.length}`,
            fromNodeId: node.id,
            toNodeId: currentNode.id,
            path,
            connectorIds: Array.from(connectorIds),
          })
          break
        }

        const nextSteps = DIRECTIONS_4
          .map(d => ({ x: current.x + d.x, y: current.y + d.y }))
          .filter(p => corridorKeys.has(keyOf(p)) && (p.x !== previous.x || p.y !== previous.y))

        if (nextSteps.length === 0) break
        previous = current
        current = nextSteps[0]
      }
    }
  }

  const junctions = nodes
    .filter(node => node.kind === 'junction' && node.degree >= 3)
    .map(node => {
      const type: LayoutJunction['type'] =
        node.degree >= 4 ? 'cross' :
        node.degree === 3 ? 'tee' :
        'hub'
      return {
        id: `junction-${node.x}-${node.y}`,
        x: node.x * canvas.tileSize + canvas.tileSize / 2,
        y: node.y * canvas.tileSize + canvas.tileSize / 2,
        connectorIds: node.connectorIds,
        type,
      }
    })

  return { nodes, edges, junctions }
}

export function corridorNeighborCount(canvas: GridCanvas, point: Point): number {
  return DIRECTIONS_4.filter(dir => isCorridorLike(getTile(canvas, point.x + dir.x, point.y + dir.y))).length
}

function hasOppositeCorridorNeighbors(canvas: GridCanvas, point: Point): boolean {
  const up = isCorridorLike(getTile(canvas, point.x, point.y - 1))
  const down = isCorridorLike(getTile(canvas, point.x, point.y + 1))
  const left = isCorridorLike(getTile(canvas, point.x - 1, point.y))
  const right = isCorridorLike(getTile(canvas, point.x + 1, point.y))
  return (up && down) || (left && right)
}

function keyOf(point: Point): string {
  return `${point.x},${point.y}`
}

function pointFromKey(key: string): Point {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

function edgeVisitKey(a: Point, b: Point): string {
  const ka = keyOf(a)
  const kb = keyOf(b)
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

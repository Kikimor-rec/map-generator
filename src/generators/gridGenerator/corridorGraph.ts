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
    const isNode = neighborCount !== 2 || hasConnectorMembershipBoundary(canvas, point)

    if (!isNode) continue

    const kind: CorridorGraphNode['kind'] =
      neighborCount >= 3 ? 'junction' :
      neighborCount <= 1 ? 'endpoint' :
      'bend'
    const connectorIds = getTileConnectorIds(getTile(canvas, point.x, point.y))

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

  // A closed loop has degree two at every tile. Give each such component one
  // deterministic anchor so it can be exported as a single physical edge
  // instead of manufacturing a node at every bend.
  const visitedComponentKeys = new Set<string>()
  for (const startKey of corridorKeys) {
    if (visitedComponentKeys.has(startKey)) continue

    const componentKeys: string[] = []
    const queue = [startKey]
    visitedComponentKeys.add(startKey)

    while (queue.length > 0) {
      const currentKey = queue.shift()!
      componentKeys.push(currentKey)
      const current = pointFromKey(currentKey)
      for (const direction of DIRECTIONS_4) {
        const neighborKey = keyOf({
          x: current.x + direction.x,
          y: current.y + direction.y,
        })
        if (!corridorKeys.has(neighborKey) || visitedComponentKeys.has(neighborKey)) continue
        visitedComponentKeys.add(neighborKey)
        queue.push(neighborKey)
      }
    }

    if (componentKeys.some(key => nodeByKey.has(key))) continue
    const anchorKey = componentKeys.sort(comparePointKeys)[0]
    const anchor = pointFromKey(anchorKey)
    const node: CorridorGraphNode = {
      id: `node-${anchor.x}-${anchor.y}`,
      x: anchor.x,
      y: anchor.y,
      degree: 2,
      kind: 'bend',
      connectorIds: getTileConnectorIds(getTile(canvas, anchor.x, anchor.y)),
    }
    nodes.push(node)
    nodeByKey.set(anchorKey, node)
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
      let connectorIds = [...node.connectorIds].sort()

      while (true) {
        path.push(current)
        visitedSegments.add(edgeVisitKey(previous, current))
        connectorIds = intersectConnectorIds(
          connectorIds,
          getTileConnectorIds(getTile(canvas, current.x, current.y))
        )

        const currentNode = nodeByKey.get(keyOf(current))
        if (currentNode && (currentNode.id !== node.id || path.length > 2)) {
          edges.push({
            id: `edge-${edges.length}`,
            fromNodeId: node.id,
            toNodeId: currentNode.id,
            path,
            connectorIds,
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

function hasConnectorMembershipBoundary(canvas: GridCanvas, point: Point): boolean {
  const currentMembership = connectorMembershipKey(getTile(canvas, point.x, point.y))
  const currentPointKey = keyOf(point)

  return DIRECTIONS_4.some(direction => {
    const neighbor = { x: point.x + direction.x, y: point.y + direction.y }
    const neighborTile = getTile(canvas, neighbor.x, neighbor.y)
    if (!isCorridorLike(neighborTile) || corridorNeighborCount(canvas, neighbor) !== 2) return false
    if (connectorMembershipKey(neighborTile) === currentMembership) return false

    // Exactly one side of a straight membership transition becomes a node.
    return comparePointKeys(currentPointKey, keyOf(neighbor)) < 0
  })
}

function connectorMembershipKey(tile: Tile | undefined): string {
  return getTileConnectorIds(tile).sort().join('|')
}

function intersectConnectorIds(left: string[], right: string[]): string[] {
  const rightIds = new Set(right)
  return left.filter(id => rightIds.has(id)).sort()
}

function keyOf(point: Point): string {
  return `${point.x},${point.y}`
}

function pointFromKey(key: string): Point {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

function comparePointKeys(leftKey: string, rightKey: string): number {
  const left = pointFromKey(leftKey)
  const right = pointFromKey(rightKey)
  return left.y - right.y || left.x - right.x
}

function edgeVisitKey(a: Point, b: Point): string {
  const ka = keyOf(a)
  const kb = keyOf(b)
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

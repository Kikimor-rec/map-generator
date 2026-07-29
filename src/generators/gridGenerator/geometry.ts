/**
 * Deterministic boundary extraction for occupancy-first generator canvases.
 *
 * The GridCanvas remains a generation cache. This adapter reconstructs a
 * canonical fixed-point envelope for serialization and rendering.
 */

import { cellsToGeometryUnits } from '../../domain/geometryUnits'
import type { IntPoint, MultiPolygon, Polygon, Ring } from '../../geometry/types'
import { TileType, type GridCanvas } from './types'

interface GridPoint {
  readonly x: number
  readonly y: number
}

interface BoundaryEdge {
  readonly id: number
  readonly start: GridPoint
  readonly end: GridPoint
  /** Clockwise in screen coordinates: east, south, west, north. */
  readonly direction: 0 | 1 | 2 | 3
}

interface RingRecord {
  readonly ring: Ring
  readonly signedArea: number
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

function isOccupied(canvas: GridCanvas, x: number, y: number): boolean {
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
    return false
  }
  return canvas.tiles[y]?.[x]?.type !== TileType.VOID
}

function collectBoundaryEdges(canvas: GridCanvas): BoundaryEdge[] {
  const edges: BoundaryEdge[] = []

  const addEdge = (
    start: GridPoint,
    end: GridPoint,
    direction: BoundaryEdge['direction']
  ): void => {
    edges.push({ id: edges.length, start, end, direction })
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!isOccupied(canvas, x, y)) continue

      // Edges are oriented with occupied space on their right. With screen
      // coordinates (positive Y down), outer rings therefore have positive
      // signed area and holes have negative signed area.
      if (!isOccupied(canvas, x, y - 1)) {
        addEdge({ x, y }, { x: x + 1, y }, 0)
      }
      if (!isOccupied(canvas, x + 1, y)) {
        addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 }, 1)
      }
      if (!isOccupied(canvas, x, y + 1)) {
        addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 }, 2)
      }
      if (!isOccupied(canvas, x - 1, y)) {
        addEdge({ x, y: y + 1 }, { x, y }, 3)
      }
    }
  }

  return edges
}

function turnPriority(
  incoming: BoundaryEdge['direction'],
  outgoing: BoundaryEdge['direction']
): number {
  const delta = (outgoing - incoming + 4) % 4

  // At a diagonal contact, two boundaries share a vertex. Taking the
  // right-most available turn keeps the two 4-connected components separate.
  if (delta === 1) return 0 // right
  if (delta === 0) return 1 // straight
  if (delta === 3) return 2 // left
  return 3 // reverse (only for malformed input)
}

function simplifyClosedRing(points: readonly GridPoint[]): GridPoint[] {
  if (points.length < 3) return []

  const simplified: GridPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross =
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x)

    if (cross !== 0) {
      simplified.push(current)
    }
  }

  return simplified
}

function rotateToCanonicalStart(points: readonly GridPoint[]): GridPoint[] {
  if (points.length === 0) return []

  let startIndex = 0
  for (let index = 1; index < points.length; index += 1) {
    const candidate = points[index]
    const current = points[startIndex]
    if (
      candidate.y < current.y ||
      (candidate.y === current.y && candidate.x < current.x)
    ) {
      startIndex = index
    }
  }

  return [
    ...points.slice(startIndex),
    ...points.slice(0, startIndex),
  ]
}

function traceBoundaryRings(edges: readonly BoundaryEdge[]): GridPoint[][] {
  const edgesByStart = new Map<string, BoundaryEdge[]>()
  for (const edge of edges) {
    const key = pointKey(edge.start)
    const bucket = edgesByStart.get(key)
    if (bucket) {
      bucket.push(edge)
    } else {
      edgesByStart.set(key, [edge])
    }
  }

  const visited = new Set<number>()
  const rings: GridPoint[][] = []

  for (const firstEdge of edges) {
    if (visited.has(firstEdge.id)) continue

    const points: GridPoint[] = []
    let current = firstEdge
    let closed = false

    for (let step = 0; step <= edges.length; step += 1) {
      visited.add(current.id)
      points.push(current.start)

      if (pointKey(current.end) === pointKey(firstEdge.start)) {
        closed = true
        break
      }

      const candidates = (edgesByStart.get(pointKey(current.end)) ?? [])
        .filter(edge => !visited.has(edge.id))
        .sort((left, right) => {
          const turnDifference =
            turnPriority(current.direction, left.direction) -
            turnPriority(current.direction, right.direction)
          if (turnDifference !== 0) return turnDifference
          if (left.end.y !== right.end.y) return left.end.y - right.end.y
          return left.end.x - right.end.x
        })

      const next = candidates[0]
      if (!next) break
      current = next
    }

    if (!closed) {
      throw new Error('Grid boundary is not a closed ring')
    }

    const simplified = rotateToCanonicalStart(simplifyClosedRing(points))
    if (simplified.length >= 3) {
      rings.push(simplified)
    }
  }

  return rings
}

function toGeometryRing(points: readonly GridPoint[]): Ring {
  return points.map(point => ({
    x: cellsToGeometryUnits(point.x),
    y: cellsToGeometryUnits(point.y),
  }))
}

function signedArea(ring: Ring): number {
  let twiceArea = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

function pointInRing(point: IntPoint, ring: Ring): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current]
    const b = ring[previous]
    const crossesRay =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crossesRay) inside = !inside
  }
  return inside
}

function ringBoundsKey(ring: Ring): string {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (const point of ring) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
  }
  return `${String(minY).padStart(16, '0')}:${String(minX).padStart(16, '0')}`
}

function assembleMultiPolygon(rings: readonly RingRecord[]): MultiPolygon {
  const outers = rings
    .filter(record => record.signedArea > 0)
    .map(record => ({
      record,
      holes: [] as Ring[],
    }))

  for (const hole of rings.filter(record => record.signedArea < 0)) {
    const container = outers
      .filter(outer => pointInRing(hole.ring[0], outer.record.ring))
      .sort(
        (left, right) =>
          Math.abs(left.record.signedArea) - Math.abs(right.record.signedArea)
      )[0]

    if (container) {
      container.holes.push(hole.ring)
    }
  }

  const polygons: Polygon[] = outers
    .sort((left, right) =>
      ringBoundsKey(left.record.ring).localeCompare(ringBoundsKey(right.record.ring))
    )
    .map(({ record, holes }) => ({
      outer: record.ring,
      ...(holes.length > 0
        ? {
            holes: holes.sort((left, right) =>
              ringBoundsKey(left).localeCompare(ringBoundsKey(right))
            ),
          }
        : {}),
    }))

  return { polygons }
}

/**
 * Extract every non-VOID tile as a canonical MultiPolygon.
 *
 * Adjacent occupied cells are merged, enclosed VOID regions become holes,
 * and disconnected (including diagonally touching) regions remain separate
 * polygons. Coordinates never depend on `canvas.tileSize`.
 */
export function extractFacilityEnvelope(canvas: GridCanvas): MultiPolygon {
  const rings = traceBoundaryRings(collectBoundaryEdges(canvas))
    .map(toGeometryRing)
    .map(ring => ({ ring, signedArea: signedArea(ring) }))
    .filter(record => record.signedArea !== 0)

  return assembleMultiPolygon(rings)
}

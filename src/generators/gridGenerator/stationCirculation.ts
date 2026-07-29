/**
 * Hull-aware primary circulation for circular and habitat stations.
 *
 * The module is intentionally independent from the occupancy generator so the
 * strategy can be tested before it becomes the active station dispatch.
 */

import { addConnectorIdToTile } from './corridorGraph'
import { DIRECTIONS_4, getCanvasCenter, getTile } from './canvas'
import { TileType, type GridCanvas, type Point, type Tile } from './types'

export interface CirculationRun {
  id: string
  points: Point[]
}

const RING_ID = 'spine-station-ring'
const MIN_RING_RADIUS = 3

/**
 * Carve an atomic ring-and-spoke circulation network into an existing station
 * hull. The complete network is validated against the hull before any tile is
 * changed.
 */
export function carveStationCirculation(
  canvas: GridCanvas,
  loopiness: number
): CirculationRun[] {
  const center = getCanvasCenter(canvas)
  const outerRadius = findOuterRadius(canvas, center)
  const centralHoleOuterRadius = findCentralHoleOuterRadius(
    canvas,
    center,
    outerRadius
  )
  const hasCentralHole = centralHoleOuterRadius !== null
  const ring = findValidRing(canvas, center, outerRadius, hasCentralHole)

  if (!ring) {
    throw new Error('Unable to fit a closed station circulation ring inside the hull')
  }

  const spokeCount = hasCentralHole ? 4 : spokeCountForLoopiness(loopiness)
  const spokes = buildSpokes(
    canvas,
    center,
    ring.points,
    spokeCount,
    centralHoleOuterRadius
  )
  const runs = [ring, ...spokes]

  // Validate every run before carving to avoid a disconnected partial network.
  for (const run of runs) {
    if (run.points.length === 0 || run.points.some(point => !isCarvable(getTile(canvas, point.x, point.y)))) {
      throw new Error(`Station circulation run "${run.id}" leaves the hull`)
    }
  }

  for (const run of runs) {
    carveRun(canvas, run)
  }

  return runs
}

function findOuterRadius(canvas: GridCanvas, center: Point): number {
  let outerRadius = 0
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!isCarvable(getTile(canvas, x, y))) continue
      outerRadius = Math.max(outerRadius, Math.hypot(x - center.x, y - center.y))
    }
  }
  return outerRadius
}

function findCentralHoleOuterRadius(
  canvas: GridCanvas,
  center: Point,
  outerRadius: number
): number | null {
  const minRadius = Math.max(2, outerRadius * 0.15)
  const searchRadius = outerRadius * 0.65
  let holeOuterRadius: number | null = null

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const radius = Math.hypot(x - center.x, y - center.y)
      if (
        radius >= minRadius &&
        radius <= searchRadius &&
        getTile(canvas, x, y)?.type === TileType.VOID
      ) {
        holeOuterRadius = Math.max(holeOuterRadius ?? 0, radius)
      }
    }
  }
  return holeOuterRadius
}

function findValidRing(
  canvas: GridCanvas,
  center: Point,
  outerRadius: number,
  hasCentralHole: boolean
): CirculationRun | null {
  const targetRadius = Math.round(outerRadius * (hasCentralHole ? 0.74 : 0.55))
  const maxRadius = Math.max(MIN_RING_RADIUS, Math.floor(outerRadius) - 2)
  const candidates = Array.from(
    { length: Math.max(0, maxRadius - MIN_RING_RADIUS + 1) },
    (_, index) => MIN_RING_RADIUS + index
  ).sort((a, b) => Math.abs(a - targetRadius) - Math.abs(b - targetRadius) || a - b)

  for (const radius of candidates) {
    const points = rasterizeOrthogonalRing(center, radius)
    if (
      isSimpleClosedRing(points) &&
      points.every(point => isCarvable(getTile(canvas, point.x, point.y)))
    ) {
      return { id: RING_ID, points }
    }
  }

  return null
}

/**
 * Rasterize a regular octagon as a one-tile, four-connected closed ring.
 * Every diagonal octagon edge uses one deterministic radial elbow, keeping
 * the exact H/V tactical path while avoiding a bend on every grid cell.
 */
function rasterizeOrthogonalRing(center: Point, radius: number): Point[] {
  const diagonal = Math.max(1, Math.round(radius / Math.SQRT2))
  const vertices: Point[] = [
    { x: center.x, y: center.y - radius },
    { x: center.x + diagonal, y: center.y - diagonal },
    { x: center.x + radius, y: center.y },
    { x: center.x + diagonal, y: center.y + diagonal },
    { x: center.x, y: center.y + radius },
    { x: center.x - diagonal, y: center.y + diagonal },
    { x: center.x - radius, y: center.y },
    { x: center.x - diagonal, y: center.y - diagonal },
  ]
  const points: Point[] = [vertices[0]]

  for (let index = 0; index < vertices.length; index += 1) {
    appendOrthogonalLeg(
      points,
      vertices[index],
      vertices[(index + 1) % vertices.length],
      center,
      radius
    )
  }

  if (samePoint(points[0], points[points.length - 1])) {
    points.pop()
  }
  return deduplicateConsecutive(points)
}

function appendOrthogonalLeg(
  output: Point[],
  start: Point,
  end: Point,
  center: Point,
  preferredRadius: number
): void {
  const elbowCandidates = [
    { x: end.x, y: start.y },
    { x: start.x, y: end.y },
  ]
  const elbow = elbowCandidates.sort((left, right) => {
    const leftError = Math.abs(Math.hypot(left.x - center.x, left.y - center.y) - preferredRadius)
    const rightError = Math.abs(Math.hypot(right.x - center.x, right.y - center.y) - preferredRadius)
    return leftError - rightError || left.y - right.y || left.x - right.x
  })[0]

  appendAxisAlignedTiles(output, output[output.length - 1], elbow)
  appendAxisAlignedTiles(output, output[output.length - 1], end)
}

function appendAxisAlignedTiles(output: Point[], start: Point, end: Point): void {
  let current = start
  while (!samePoint(current, end)) {
    current = {
      x: current.x === end.x ? current.x : current.x + Math.sign(end.x - current.x),
      y: current.x === end.x && current.y !== end.y
        ? current.y + Math.sign(end.y - current.y)
        : current.y,
    }
    output.push(current)
  }
}

function buildSpokes(
  canvas: GridCanvas,
  center: Point,
  ringPoints: Point[],
  spokeCount: number,
  centralHoleOuterRadius: number | null
): CirculationRun[] {
  const runs: CirculationRun[] = []

  for (let index = 0; index < spokeCount; index += 1) {
    const angle = centralHoleOuterRadius !== null
      ? -Math.PI / 2 + index * Math.PI / 2
      : -Math.PI / 2 + index * Math.PI * 2 / spokeCount
    const anchor = nearestRingPointAtAngle(ringPoints, center, angle)
    const start = centralHoleOuterRadius === null
      ? center
      : pointOnRay(
          center,
          angle,
          Math.min(
            Math.max(MIN_RING_RADIUS, Math.ceil(centralHoleOuterRadius) + 1),
            Math.max(MIN_RING_RADIUS, Math.floor(Math.hypot(
              anchor.x - center.x,
              anchor.y - center.y
            )) - 1)
          )
        )
    const points = rasterizeSpoke(start, anchor)

    const invalidPoint = points.find(point => !isCarvable(getTile(canvas, point.x, point.y)))
    if (invalidPoint) {
      throw new Error(`Station spoke ${index} cannot cross hull tile (${invalidPoint.x}, ${invalidPoint.y})`)
    }

    runs.push({
      id: `spine-station-spoke-${index}`,
      points,
    })
  }

  return runs
}

function nearestRingPointAtAngle(
  ringPoints: Point[],
  center: Point,
  angle: number
): Point {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  return ringPoints.reduce((best, point) => {
    const bestDx = best.x - center.x
    const bestDy = best.y - center.y
    const dx = point.x - center.x
    const dy = point.y - center.y
    const bestProjection = bestDx * direction.x + bestDy * direction.y
    const projection = dx * direction.x + dy * direction.y
    if (projection !== bestProjection) return projection > bestProjection ? point : best

    const bestPerpendicularError = Math.abs(bestDx * direction.y - bestDy * direction.x)
    const perpendicularError = Math.abs(dx * direction.y - dy * direction.x)
    if (perpendicularError !== bestPerpendicularError) {
      return perpendicularError < bestPerpendicularError ? point : best
    }

    return point.y < best.y || (point.y === best.y && point.x < best.x) ? point : best
  })
}

function pointOnRay(
  center: Point,
  angle: number,
  radius: number
): Point {
  return {
    x: Math.round(center.x + Math.cos(angle) * radius),
    y: Math.round(center.y + Math.sin(angle) * radius),
  }
}

function rasterizeSpoke(start: Point, end: Point): Point[] {
  const points: Point[] = [start]
  let current = start

  while (!samePoint(current, end)) {
    const dx = end.x - current.x
    const dy = end.y - current.y
    const stepX = dx === 0 ? null : { x: current.x + Math.sign(dx), y: current.y }
    const stepY = dy === 0 ? null : { x: current.x, y: current.y + Math.sign(dy) }

    if (!stepX) current = stepY!
    else if (!stepY) current = stepX
    else {
      const xRemaining = Math.abs(end.x - stepX.x) + Math.abs(end.y - stepX.y)
      const yRemaining = Math.abs(end.x - stepY.x) + Math.abs(end.y - stepY.y)
      current = xRemaining <= yRemaining ? stepX : stepY
    }
    points.push(current)
  }

  return points
}

function carveRun(canvas: GridCanvas, run: CirculationRun): void {
  for (const point of run.points) {
    const existing = getTile(canvas, point.x, point.y)!
    const type = existing.type === TileType.JUNCTION
      ? TileType.JUNCTION
      : TileType.CORRIDOR
    canvas.tiles[point.y][point.x] = addConnectorIdToTile(
      { ...existing, type, spineLevel: 0 },
      run.id
    )
  }
}

function isSimpleClosedRing(points: Point[]): boolean {
  if (points.length < 8) return false
  const keys = new Set(points.map(pointKey))
  if (keys.size !== points.length) return false

  for (const point of points) {
    const degree = DIRECTIONS_4.filter(direction =>
      keys.has(`${point.x + direction.x},${point.y + direction.y}`)
    ).length
    if (degree !== 2) return false
  }

  return true
}

function isCarvable(tile: Tile | undefined): boolean {
  return !!tile && (
    tile.type === TileType.HULL ||
    tile.type === TileType.CORRIDOR ||
    tile.type === TileType.JUNCTION
  )
}

function deduplicateConsecutive(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]))
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function spokeCountForLoopiness(loopiness: number): number {
  if (loopiness < 0.4) return 4
  if (loopiness < 0.75) return 6
  return 8
}

import type {
  FacilityMaskInput,
  FacilityMasks,
  IntPoint,
  MultiPolygon,
  Polygon,
  PolygonGeometry,
  RasterGrid,
  Ring,
} from './types'

export type PointLocation = 'outside' | 'inside' | 'boundary'

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface NormalizedRasterGrid {
  width: number
  height: number
  cellSize: number
  origin: IntPoint
}

function isMultiPolygon(geometry: PolygonGeometry): geometry is MultiPolygon {
  return 'polygons' in geometry
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`)
  }
}

function assertRing(ring: Ring, label: string): void {
  if (ring.length < 3) {
    throw new TypeError(`${label} must contain at least three points`)
  }

  ring.forEach((point, index) => {
    assertSafeInteger(point.x, `${label}[${index}].x`)
    assertSafeInteger(point.y, `${label}[${index}].y`)
  })
}

function assertPolygon(polygon: Polygon, label: string): void {
  assertRing(polygon.outer, `${label}.outer`)
  polygon.holes?.forEach((hole, index) => {
    assertRing(hole, `${label}.holes[${index}]`)
  })
}

function assertGeometry(geometry: PolygonGeometry, label: string): void {
  if (isMultiPolygon(geometry)) {
    geometry.polygons.forEach((polygon, index) => {
      assertPolygon(polygon, `${label}.polygons[${index}]`)
    })
    return
  }

  assertPolygon(geometry, label)
}

function normalizeGrid(grid: RasterGrid): NormalizedRasterGrid {
  assertSafeInteger(grid.width, 'grid.width')
  assertSafeInteger(grid.height, 'grid.height')
  assertSafeInteger(grid.cellSize, 'grid.cellSize')

  if (grid.width <= 0 || grid.height <= 0) {
    throw new RangeError('grid width and height must be positive')
  }
  if (grid.cellSize <= 0) {
    throw new RangeError('grid.cellSize must be positive')
  }

  const origin = grid.origin ?? { x: 0, y: 0 }
  assertSafeInteger(origin.x, 'grid.origin.x')
  assertSafeInteger(origin.y, 'grid.origin.y')

  const endX = origin.x + grid.width * grid.cellSize
  const endY = origin.y + grid.height * grid.cellSize
  if (!Number.isSafeInteger(endX) || !Number.isSafeInteger(endY)) {
    throw new RangeError('grid extent exceeds the safe integer range')
  }

  const cellCount = grid.width * grid.height
  if (!Number.isSafeInteger(cellCount)) {
    throw new RangeError('grid cell count exceeds the safe integer range')
  }

  return {
    width: grid.width,
    height: grid.height,
    cellSize: grid.cellSize,
    origin,
  }
}

function pointOnSegment(point: IntPoint, start: IntPoint, end: IntPoint): boolean {
  const cross =
    (point.x - start.x) * (end.y - start.y) -
    (point.y - start.y) * (end.x - start.x)

  if (cross !== 0) return false

  return (
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y)
  )
}

/**
 * Orientation-independent even/odd point classification.
 *
 * Raster samples are cell centres. Integer geometry therefore produces
 * integer or half-integer samples and the rule does not use an epsilon.
 */
export function classifyPointInRing(point: IntPoint, ring: Ring): PointLocation {
  let inside = false

  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]
    const end = ring[(index + 1) % ring.length]

    if (pointOnSegment(point, start, end)) return 'boundary'

    if ((start.y > point.y) !== (end.y > point.y)) {
      const intersectionX =
        start.x +
        ((point.y - start.y) * (end.x - start.x)) / (end.y - start.y)

      if (point.x < intersectionX) inside = !inside
    }
  }

  return inside ? 'inside' : 'outside'
}

/**
 * Polygon containment rule used by rasterization:
 *
 * - an outer-ring boundary belongs to the polygon;
 * - a hole boundary belongs to the hole and is excluded from the polygon;
 * - ring winding and an optional repeated closing point do not affect output.
 */
export function pointInPolygon(point: IntPoint, polygon: Polygon): boolean {
  if (classifyPointInRing(point, polygon.outer) === 'outside') return false

  return !(polygon.holes ?? []).some(
    (hole) => classifyPointInRing(point, hole) !== 'outside',
  )
}

export function pointInPolygonGeometry(
  point: IntPoint,
  geometry: PolygonGeometry,
): boolean {
  const polygons = isMultiPolygon(geometry) ? geometry.polygons : [geometry]
  return polygons.some((polygon) => pointInPolygon(point, polygon))
}

function ringBounds(ring: Ring): Bounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of ring) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return { minX, minY, maxX, maxY }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function rasterizePolygonInto(
  target: Uint8Array,
  polygon: Polygon,
  grid: NormalizedRasterGrid,
): void {
  const bounds = ringBounds(polygon.outer)
  const firstColumn = clamp(
    Math.ceil((bounds.minX - grid.origin.x) / grid.cellSize - 0.5),
    0,
    grid.width - 1,
  )
  const lastColumn = clamp(
    Math.floor((bounds.maxX - grid.origin.x) / grid.cellSize - 0.5),
    0,
    grid.width - 1,
  )
  const firstRow = clamp(
    Math.ceil((bounds.minY - grid.origin.y) / grid.cellSize - 0.5),
    0,
    grid.height - 1,
  )
  const lastRow = clamp(
    Math.floor((bounds.maxY - grid.origin.y) / grid.cellSize - 0.5),
    0,
    grid.height - 1,
  )

  if (firstColumn > lastColumn || firstRow > lastRow) return

  // Deterministic row-major scan. Every cell is classified at its centre.
  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = grid.origin.y + (row + 0.5) * grid.cellSize

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const x = grid.origin.x + (column + 0.5) * grid.cellSize
      if (pointInPolygon({ x, y }, polygon)) {
        target[row * grid.width + column] = 1
      }
    }
  }
}

/**
 * Converts canonical Polygon/MultiPolygon geometry into a binary occupancy
 * mask. MultiPolygon parts use union semantics.
 */
export function rasterizePolygonGeometry(
  geometry: PolygonGeometry,
  rasterGrid: RasterGrid,
): Uint8Array {
  assertGeometry(geometry, 'geometry')
  const grid = normalizeGrid(rasterGrid)
  const result = new Uint8Array(grid.width * grid.height)
  const polygons = isMultiPolygon(geometry) ? geometry.polygons : [geometry]

  for (const polygon of polygons) {
    rasterizePolygonInto(result, polygon, grid)
  }

  return result
}

/**
 * Builds the three base facility masks. Structural voids are unioned and win
 * over the envelope at shared edges and overlapping cells.
 */
export function rasterizeFacilityMasks(
  input: FacilityMaskInput,
  rasterGrid: RasterGrid,
): FacilityMasks {
  assertGeometry(input.envelope, 'input.envelope')
  input.structuralVoids?.forEach((geometry, index) => {
    assertGeometry(geometry, `input.structuralVoids[${index}]`)
  })

  const grid = normalizeGrid(rasterGrid)
  const envelope = rasterizePolygonGeometry(input.envelope, grid)
  const structuralVoids = new Uint8Array(grid.width * grid.height)

  for (const geometry of input.structuralVoids ?? []) {
    const voidMask = rasterizePolygonGeometry(geometry, grid)
    for (let index = 0; index < structuralVoids.length; index += 1) {
      structuralVoids[index] ||= voidMask[index]
    }
  }

  const usable = new Uint8Array(grid.width * grid.height)
  for (let index = 0; index < usable.length; index += 1) {
    usable[index] = envelope[index] === 1 && structuralVoids[index] === 0 ? 1 : 0
  }

  return {
    width: grid.width,
    height: grid.height,
    cellSize: grid.cellSize,
    origin: grid.origin,
    envelope,
    structuralVoids,
    usable,
  }
}

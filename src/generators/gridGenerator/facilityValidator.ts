import { DIRECTIONS_4 } from './canvas'
import { TileType, type GridCanvas, type Point } from './types'

export type FacilityViolationCode =
  | 'EMPTY_FACILITY_ENVELOPE'
  | 'DISCONNECTED_FACILITY_ENVELOPE'
  | 'STRUCTURAL_VOID_COLLISION'
  | 'WEAK_ARCHETYPE_SILHOUETTE'

export interface FacilityMetrics {
  footprintTileCount: number
  hullComponentCount: number
  structuralVoidCount: number
  structuralVoidCollisionCount: number
  hullAspectRatio: number
  hullSymmetryPercent: number
  silhouetteFitScore: number
}

export interface FacilityViolation {
  code: FacilityViolationCode
  severity: 'error' | 'warning'
  message: string
  actual: number
  threshold: number
  hint: string
}

export interface FacilityReport {
  status: 'pass' | 'warning' | 'error'
  metrics: FacilityMetrics
  violations: FacilityViolation[]
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

interface VoidRegion {
  points: Point[]
  touchesBoundary: boolean
}

const SILHOUETTE_MINIMUM = {
  ship: 0.62,
  station: 0.58,
  outpost: 0.5,
} as const

/**
 * Captures the intended facility footprint before rooms and corridors replace
 * HULL tiles. The returned rows are new arrays and can safely be retained.
 */
export function captureOriginalHullMask(
  canvas: GridCanvas
): readonly (readonly boolean[])[] {
  return canvas.tiles.map(row => row.map(tile => tile.type !== TileType.VOID))
}

export function validateFacilityStructure(canvas: GridCanvas): FacilityReport {
  const mask = normalizedHullMask(canvas)
  const points = collectMaskPoints(mask)
  const bounds = getBounds(points)
  const hullComponentCount = countMaskComponents(mask)
  const structuralVoidCount = findVoidRegions(mask)
    .filter(region => !region.touchesBoundary)
    .length
  const structuralVoidCollisionCount = countOutsideMaskOccupancy(canvas, mask)
  const hullAspectRatio = bounds.width === 0
    ? 0
    : round(bounds.height / bounds.width)
  const hullSymmetryPercent = round(calculateBilateralSymmetry(mask, bounds) * 100)
  const silhouetteFitScore = round(
    calculateSilhouetteFit(canvas, mask, bounds, structuralVoidCount) * 100
  )
  const metrics: FacilityMetrics = {
    footprintTileCount: points.length,
    hullComponentCount,
    structuralVoidCount,
    structuralVoidCollisionCount,
    hullAspectRatio,
    hullSymmetryPercent,
    silhouetteFitScore,
  }
  const violations: FacilityViolation[] = []

  if (metrics.footprintTileCount === 0) {
    violations.push({
      code: 'EMPTY_FACILITY_ENVELOPE',
      severity: 'error',
      message: 'The generated facility has no usable hull footprint.',
      actual: 0,
      threshold: 1,
      hint: 'Regenerate the hull before placing rooms or circulation.',
    })
  }
  if (metrics.hullComponentCount > 1) {
    violations.push({
      code: 'DISCONNECTED_FACILITY_ENVELOPE',
      severity: 'error',
      message: 'The facility envelope contains disconnected pressurized islands.',
      actual: metrics.hullComponentCount,
      threshold: 1,
      hint: 'Join hull modules with a physical neck or corridor-bearing connector.',
    })
  }
  if (metrics.structuralVoidCollisionCount > 0) {
    violations.push({
      code: 'STRUCTURAL_VOID_COLLISION',
      severity: 'error',
      message: 'Generated rooms or circulation escaped the original hull mask.',
      actual: metrics.structuralVoidCollisionCount,
      threshold: 0,
      hint: 'Reject the placement or reroute it inside the preserved hull footprint.',
    })
  }
  const silhouetteMinimum = SILHOUETTE_MINIMUM[canvas.archetype] * 100
  if (metrics.silhouetteFitScore < silhouetteMinimum) {
    violations.push({
      code: 'WEAK_ARCHETYPE_SILHOUETTE',
      severity: 'warning',
      message: 'The unlabeled outline does not strongly express its facility archetype.',
      actual: metrics.silhouetteFitScore,
      threshold: silhouetteMinimum,
      hint: 'Strengthen the archetype profile while retaining bounded asymmetry.',
    })
  }

  return {
    status: violations.some(issue => issue.severity === 'error')
      ? 'error'
      : violations.length > 0 ? 'warning' : 'pass',
    metrics,
    violations,
  }
}

export function getEnclosedStructuralVoidMasks(
  canvas: GridCanvas
): readonly (readonly (readonly boolean[])[])[] {
  const mask = normalizedHullMask(canvas)
  return findVoidRegions(mask)
    .filter(region => !region.touchesBoundary)
    .map(region => {
      const regionKeys = new Set(region.points.map(pointKey))
      return mask.map((row, y) => row.map((_occupied, x) => regionKeys.has(`${x},${y}`)))
    })
}

function normalizedHullMask(canvas: GridCanvas): readonly (readonly boolean[])[] {
  const mask = canvas.originalHullMask ?? captureOriginalHullMask(canvas)
  if (
    mask.length !== canvas.height ||
    mask.some(row => row.length !== canvas.width)
  ) {
    throw new Error('Original hull mask dimensions do not match the grid canvas')
  }
  return mask
}

function collectMaskPoints(mask: readonly (readonly boolean[])[]): Point[] {
  const points: Point[] = []
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[y].length; x += 1) {
      if (mask[y][x]) points.push({ x, y })
    }
  }
  return points
}

function getBounds(points: readonly Point[]): Bounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: -1, maxY: -1, width: 0, height: 0 }
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function countMaskComponents(mask: readonly (readonly boolean[])[]): number {
  const visited = new Set<string>()
  let count = 0
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[y].length; x += 1) {
      if (!mask[y][x] || visited.has(`${x},${y}`)) continue
      count += 1
      floodMask(mask, { x, y }, visited)
    }
  }
  return count
}

function floodMask(
  mask: readonly (readonly boolean[])[],
  start: Point,
  visited: Set<string>
): void {
  const queue = [start]
  visited.add(pointKey(start))
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]
    for (const direction of DIRECTIONS_4) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }
      const key = pointKey(next)
      if (
        next.y < 0 ||
        next.y >= mask.length ||
        next.x < 0 ||
        next.x >= mask[next.y].length ||
        !mask[next.y][next.x] ||
        visited.has(key)
      ) {
        continue
      }
      visited.add(key)
      queue.push(next)
    }
  }
}

function findVoidRegions(
  mask: readonly (readonly boolean[])[]
): VoidRegion[] {
  const visited = new Set<string>()
  const regions: VoidRegion[] = []
  const height = mask.length
  const width = mask[0]?.length ?? 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y][x] || visited.has(`${x},${y}`)) continue
      const points: Point[] = []
      const queue = [{ x, y }]
      visited.add(`${x},${y}`)
      let touchesBoundary = false
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head]
        points.push(current)
        if (
          current.x === 0 ||
          current.y === 0 ||
          current.x === width - 1 ||
          current.y === height - 1
        ) {
          touchesBoundary = true
        }
        for (const direction of DIRECTIONS_4) {
          const next = {
            x: current.x + direction.x,
            y: current.y + direction.y,
          }
          const key = pointKey(next)
          if (
            next.x < 0 ||
            next.x >= width ||
            next.y < 0 ||
            next.y >= height ||
            mask[next.y][next.x] ||
            visited.has(key)
          ) {
            continue
          }
          visited.add(key)
          queue.push(next)
        }
      }
      regions.push({ points, touchesBoundary })
    }
  }
  return regions
}

function countOutsideMaskOccupancy(
  canvas: GridCanvas,
  mask: readonly (readonly boolean[])[]
): number {
  let collisions = 0
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!mask[y][x] && canvas.tiles[y][x].type !== TileType.VOID) {
        collisions += 1
      }
    }
  }
  return collisions
}

function calculateBilateralSymmetry(
  mask: readonly (readonly boolean[])[],
  bounds: Bounds
): number {
  if (bounds.width === 0 || bounds.height === 0) return 0
  let comparedPairs = 0
  let matchingPairs = 0
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let offset = 0; offset < Math.ceil(bounds.width / 2); offset += 1) {
      const left = bounds.minX + offset
      const right = bounds.maxX - offset
      const leftOccupied = mask[y][left]
      const rightOccupied = mask[y][right]
      if (!leftOccupied && !rightOccupied) continue
      comparedPairs += 1
      if (leftOccupied === rightOccupied) matchingPairs += 1
    }
  }
  return comparedPairs === 0 ? 0 : matchingPairs / comparedPairs
}

function calculateSilhouetteFit(
  canvas: GridCanvas,
  mask: readonly (readonly boolean[])[],
  bounds: Bounds,
  structuralVoidCount: number
): number {
  if (bounds.width === 0 || bounds.height === 0) return 0
  const aspect = bounds.height / bounds.width
  const symmetry = calculateBilateralSymmetry(mask, bounds)
  const boundingArea = bounds.width * bounds.height
  const occupied = collectMaskPoints(mask).length
  const negativeSpace = clamp01(1 - occupied / Math.max(1, boundingArea))

  if (canvas.archetype === 'ship') {
    const elongation = clamp01((aspect - 1.15) / 0.85)
    const profileVariation = shipProfileVariation(mask, bounds)
    const coherentAsymmetry = clamp01(symmetry / 0.58)
    return clamp01(
      elongation * 0.5 +
      profileVariation * 0.32 +
      coherentAsymmetry * 0.18
    )
  }

  if (canvas.archetype === 'station') {
    const radialAspect = clamp01(1 - Math.abs(Math.log(Math.max(0.01, aspect))) / 0.45)
    const coherentAsymmetry = clamp01(symmetry / 0.62)
    const voidSignal = structuralVoidCount > 0 ? 1 : clamp01(1 - negativeSpace / 0.5)
    return clamp01(
      radialAspect * 0.5 +
      coherentAsymmetry * 0.3 +
      voidSignal * 0.2
    )
  }

  const modularNegativeSpace = clamp01(negativeSpace / 0.22)
  const coherentOutline = clamp01(symmetry / 0.42)
  const nonLinearAspect = clamp01(1 - Math.abs(Math.log(Math.max(0.01, aspect))) / 1.2)
  return clamp01(
    modularNegativeSpace * 0.55 +
    coherentOutline * 0.2 +
    nonLinearAspect * 0.25
  )
}

function shipProfileVariation(
  mask: readonly (readonly boolean[])[],
  bounds: Bounds
): number {
  const widths: number[] = []
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    let width = 0
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (mask[y][x]) width += 1
    }
    if (width > 0) widths.push(width)
  }
  if (widths.length === 0) return 0
  const maximum = Math.max(...widths)
  const minimum = Math.min(...widths)
  return clamp01((maximum - minimum) / Math.max(1, maximum) / 0.55)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function round(value: number): number {
  return Number(value.toFixed(3))
}

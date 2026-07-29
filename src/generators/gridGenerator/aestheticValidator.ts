/**
 * Read-only visual quality analysis for generated grid maps.
 *
 * This complements TTRPG connectivity checks with recurring presentation
 * problems that are otherwise easy to miss during manual review.
 */

import { DIRECTIONS_4, getTile } from './canvas'
import { TileType, type GridCanvas, type Point, type RoomPlacement } from './types'

export type AestheticStatus = 'pass' | 'warning' | 'error'

export type AestheticViolationCode =
  | 'LOW_HULL_UTILIZATION'
  | 'EXCESSIVE_CORRIDOR_TURNS'
  | 'CLUSTERED_JUNCTIONS'
  | 'AMBIGUOUS_DOORS'
  | 'DOOR_METADATA_MISMATCH'

export interface AestheticThresholds {
  hullUtilizationPercentMin: number
  corridorTurnRatioMax: number
  junctionSpacingMinTiles: number
  clusteredJunctionPairMax: number
  ambiguousDoorCountMax: number
  doorMetadataMismatchMax: number
}

export interface AestheticMetrics {
  hullFootprintTileCount: number
  occupiedHullTileCount: number
  hullUtilizationPercent: number
  circulationTileCount: number
  corridorTurnTileCount: number
  corridorTurnRatio: number
  structuralJunctionCount: number
  clusteredJunctionPairCount: number
  doorCount: number
  ambiguousDoorCount: number
  doorMetadataMismatchCount: number
}

export interface AestheticViolation {
  code: AestheticViolationCode
  severity: Exclude<AestheticStatus, 'pass'>
  message: string
  actual: number
  threshold: number
  hint: string
  positions?: Point[]
}

export interface AestheticReport {
  status: AestheticStatus
  thresholds: AestheticThresholds
  metrics: AestheticMetrics
  violations: AestheticViolation[]
}

export interface AestheticValidationOptions {
  thresholds?: Partial<AestheticThresholds>
}

export function validateMapAesthetics(
  canvas: GridCanvas,
  placements: readonly RoomPlacement[],
  options: AestheticValidationOptions = {}
): AestheticReport {
  const thresholds = {
    ...getAestheticThresholds(canvas),
    ...(options.thresholds ?? {}),
  }
  const metrics = analyzeAestheticMetrics(canvas, placements, thresholds)
  const violations: AestheticViolation[] = []

  if (metrics.hullUtilizationPercent < thresholds.hullUtilizationPercentMin) {
    violations.push({
      code: 'LOW_HULL_UTILIZATION',
      severity: 'warning',
      message: 'Too much of the visible hull is unused by rooms or circulation.',
      actual: metrics.hullUtilizationPercent,
      threshold: thresholds.hullUtilizationPercentMin,
      hint: 'Compact the hull, distribute modules more evenly, or reserve the empty area as an explicit structural void.',
    })
  }

  if (metrics.corridorTurnRatio > thresholds.corridorTurnRatioMax) {
    violations.push({
      code: 'EXCESSIVE_CORRIDOR_TURNS',
      severity: 'warning',
      message: 'The circulation network changes direction too frequently for a readable blueprint.',
      actual: metrics.corridorTurnRatio,
      threshold: thresholds.corridorTurnRatioMax,
      hint: 'Prefer longer trunks, fewer elbows, and rooms that interrupt circulation instead of parallel doglegs.',
    })
  }

  if (metrics.clusteredJunctionPairCount > thresholds.clusteredJunctionPairMax) {
    violations.push({
      code: 'CLUSTERED_JUNCTIONS',
      severity: 'warning',
      message: 'Several route decisions are packed into the same small area.',
      actual: metrics.clusteredJunctionPairCount,
      threshold: thresholds.clusteredJunctionPairMax,
      hint: 'Merge the cluster into one intentional hub or move branches farther apart.',
    })
  }

  if (metrics.ambiguousDoorCount > thresholds.ambiguousDoorCountMax) {
    violations.push({
      code: 'AMBIGUOUS_DOORS',
      severity: 'warning',
      message: 'One or more generated doors do not clearly bridge a room and circulation.',
      actual: metrics.ambiguousDoorCount,
      threshold: thresholds.ambiguousDoorCountMax,
      hint: 'Place every generated threshold on a room perimeter with a corridor, junction, or airlock on the opposite side.',
    })
  }

  if (metrics.doorMetadataMismatchCount > thresholds.doorMetadataMismatchMax) {
    violations.push({
      code: 'DOOR_METADATA_MISMATCH',
      severity: 'error',
      message: 'Room door metadata and physical door tiles disagree.',
      actual: metrics.doorMetadataMismatchCount,
      threshold: thresholds.doorMetadataMismatchMax,
      hint: 'Repair the room door list before conversion so editor anchors and rendered thresholds share one source of truth.',
    })
  }

  return {
    status: violations.some(issue => issue.severity === 'error')
      ? 'error'
      : violations.length > 0 ? 'warning' : 'pass',
    thresholds,
    metrics,
    violations,
  }
}

export function getAestheticThresholds(canvas: GridCanvas): AestheticThresholds {
  const tierIndex = Math.max(0, ['xs', 'sm', 'md', 'lg', 'xl'].indexOf(canvas.sizeTier))
  const baseHullUse = [26, 28, 30, 32, 34][tierIndex]
  const archetypeHullAdjustment =
    canvas.archetype === 'station' ? -3 : canvas.archetype === 'outpost' ? -5 : 0

  return {
    hullUtilizationPercentMin: baseHullUse + archetypeHullAdjustment,
    corridorTurnRatioMax:
      canvas.archetype === 'ship' ? 0.18 : canvas.archetype === 'station' ? 0.22 : 0.28,
    junctionSpacingMinTiles: canvas.archetype === 'outpost' ? 2 : 3,
    clusteredJunctionPairMax: 0,
    ambiguousDoorCountMax: 0,
    doorMetadataMismatchMax: 0,
  }
}

function analyzeAestheticMetrics(
  canvas: GridCanvas,
  placements: readonly RoomPlacement[],
  thresholds: AestheticThresholds
): AestheticMetrics {
  let hullFootprintTileCount = 0
  let occupiedHullTileCount = 0
  let circulationTileCount = 0
  let corridorTurnTileCount = 0
  let doorCount = 0
  let ambiguousDoorCount = 0
  const junctionPositions: Point[] = []

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type === TileType.VOID) continue
      hullFootprintTileCount++
      if (isOccupiedHullTile(tile.type)) occupiedHullTileCount++

      const position = { x, y }
      const neighborDirections = circulationNeighborDirections(canvas, position)
      if (isCirculationTile(tile.type)) circulationTileCount++

      if (
        (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION) &&
        neighborDirections.length === 2 &&
        !directionsAreOpposite(neighborDirections[0], neighborDirections[1])
      ) {
        corridorTurnTileCount++
      }

      if (isCirculationTile(tile.type) && neighborDirections.length >= 3) {
        junctionPositions.push(position)
      }

      if (tile.type === TileType.DOOR) {
        doorCount++
        const neighbors = DIRECTIONS_4
          .map(direction => getTile(canvas, x + direction.x, y + direction.y)?.type)
        const hasRoom = neighbors.some(type => type === TileType.FLOOR)
        const hasCirculation = neighbors.some(type =>
          type === TileType.CORRIDOR ||
          type === TileType.JUNCTION ||
          type === TileType.AIRLOCK
        )
        if (!hasRoom || !hasCirculation) ambiguousDoorCount++
      }
    }
  }

  const clusteredJunctionPairCount = countNearbyPairs(
    junctionPositions,
    thresholds.junctionSpacingMinTiles
  )
  const expectedDoors = new Set(
    placements.flatMap(room =>
      room.doorPositions.map(position => pointKey(position))
    )
  )
  let doorMetadataMismatchCount = 0
  for (const key of expectedDoors) {
    const point = parsePointKey(key)
    const type = getTile(canvas, point.x, point.y)?.type
    if (type !== TileType.DOOR && type !== TileType.AIRLOCK) {
      doorMetadataMismatchCount++
    }
  }

  return {
    hullFootprintTileCount,
    occupiedHullTileCount,
    hullUtilizationPercent: hullFootprintTileCount === 0
      ? 100
      : round((occupiedHullTileCount / hullFootprintTileCount) * 100),
    circulationTileCount,
    corridorTurnTileCount,
    corridorTurnRatio: circulationTileCount === 0
      ? 0
      : round(corridorTurnTileCount / circulationTileCount),
    structuralJunctionCount: junctionPositions.length,
    clusteredJunctionPairCount,
    doorCount,
    ambiguousDoorCount,
    doorMetadataMismatchCount,
  }
}

function circulationNeighborDirections(canvas: GridCanvas, point: Point): Point[] {
  return DIRECTIONS_4.filter(direction =>
    isCirculationTile(getTile(canvas, point.x + direction.x, point.y + direction.y)?.type)
  )
}

function isCirculationTile(type: TileType | undefined): boolean {
  return type === TileType.CORRIDOR ||
    type === TileType.JUNCTION ||
    type === TileType.DOOR ||
    type === TileType.AIRLOCK
}

function isOccupiedHullTile(type: TileType): boolean {
  return type === TileType.FLOOR ||
    type === TileType.CORRIDOR ||
    type === TileType.JUNCTION ||
    type === TileType.DOOR ||
    type === TileType.AIRLOCK
}

function directionsAreOpposite(a: Point, b: Point): boolean {
  return a.x + b.x === 0 && a.y + b.y === 0
}

function countNearbyPairs(points: Point[], minimumSpacing: number): number {
  let count = 0
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 1; second < points.length; second++) {
      const distance =
        Math.abs(points[first].x - points[second].x) +
        Math.abs(points[first].y - points[second].y)
      if (distance < minimumSpacing) count++
    }
  }
  return count
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function parsePointKey(key: string): Point {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

function round(value: number): number {
  return Number(value.toFixed(3))
}

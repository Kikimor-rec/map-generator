import { describe, expect, it } from 'vitest'
import type { ProgrammedRoom } from '../../types'
import { createCanvasCustom, setTile } from '../canvas'
import { generateGridMap } from '../index'
import { validateMapAesthetics } from '../aestheticValidator'
import { TileType, type GridCanvas, type Point, type RoomPlacement } from '../types'

function roomProgram(id: string): ProgrammedRoom {
  return {
    id,
    roomType: id,
    label: id,
    importance: 'secondary',
    zone: 'operations',
    accessLevel: 1,
    estimatedTiles: 1,
    estimatedWidth: 1,
    estimatedHeight: 1,
    tags: [],
    adjacencyPreferences: [],
    forbiddenAdjacencies: [],
    isExterior: false,
  }
}

function placement(roomId: string, floor: Point, doors: Point[] = []): RoomPlacement {
  return {
    roomId,
    roomType: 'generic',
    label: roomId,
    tiles: [floor],
    bounds: { x: floor.x, y: floor.y, width: 1, height: 1 },
    zone: 'operations',
    doorPositions: doors,
    circulationRole: 'terminal',
    program: roomProgram(roomId),
  }
}

function fillHull(canvas: GridCanvas): void {
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      setTile(canvas, x, y, { type: TileType.HULL })
    }
  }
}

function tile(canvas: GridCanvas, point: Point, type: TileType, roomId?: string): void {
  setTile(canvas, point.x, point.y, { type, roomId })
}

describe('validateMapAesthetics', () => {
  it('passes a compact, straight layout with explicit room-corridor thresholds', () => {
    const canvas = createCanvasCustom(7, 3, 'ship', 'sm')
    fillHull(canvas)
    tile(canvas, { x: 1, y: 1 }, TileType.FLOOR, 'left')
    tile(canvas, { x: 2, y: 1 }, TileType.DOOR, 'left')
    tile(canvas, { x: 3, y: 1 }, TileType.CORRIDOR)
    tile(canvas, { x: 4, y: 1 }, TileType.DOOR, 'right')
    tile(canvas, { x: 5, y: 1 }, TileType.FLOOR, 'right')

    const report = validateMapAesthetics(
      canvas,
      [
        placement('left', { x: 1, y: 1 }, [{ x: 2, y: 1 }]),
        placement('right', { x: 5, y: 1 }, [{ x: 4, y: 1 }]),
      ],
      {
        thresholds: {
          hullUtilizationPercentMin: 20,
          corridorTurnRatioMax: 1,
        },
      }
    )

    expect(report.status).toBe('pass')
    expect(report.metrics.ambiguousDoorCount).toBe(0)
    expect(report.metrics.doorMetadataMismatchCount).toBe(0)
    expect(report.metrics.corridorTurnTileCount).toBe(0)
  })

  it('reports unused hull area, excessive turns, and an unclear door', () => {
    const canvas = createCanvasCustom(10, 10, 'ship', 'md')
    fillHull(canvas)
    tile(canvas, { x: 1, y: 1 }, TileType.FLOOR, 'room')
    tile(canvas, { x: 2, y: 1 }, TileType.DOOR, 'room')
    tile(canvas, { x: 2, y: 3 }, TileType.CORRIDOR)
    tile(canvas, { x: 3, y: 3 }, TileType.CORRIDOR)
    tile(canvas, { x: 3, y: 4 }, TileType.CORRIDOR)
    tile(canvas, { x: 4, y: 4 }, TileType.CORRIDOR)
    tile(canvas, { x: 4, y: 5 }, TileType.CORRIDOR)

    const report = validateMapAesthetics(
      canvas,
      [placement('room', { x: 1, y: 1 }, [{ x: 2, y: 1 }])],
      {
        thresholds: {
          hullUtilizationPercentMin: 50,
          corridorTurnRatioMax: 0.1,
        },
      }
    )

    expect(report.status).toBe('warning')
    expect(report.violations.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'LOW_HULL_UTILIZATION',
        'EXCESSIVE_CORRIDOR_TURNS',
        'AMBIGUOUS_DOORS',
      ])
    )
  })

  it('detects route-decision clusters instead of relying on visual inspection', () => {
    const canvas = createCanvasCustom(7, 5, 'station', 'md')
    fillHull(canvas)
    const corridorTiles = [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 2, y: 1 },
      { x: 2, y: 3 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
    ]
    for (const point of corridorTiles) tile(canvas, point, TileType.CORRIDOR)

    const report = validateMapAesthetics(canvas, [], {
      thresholds: {
        hullUtilizationPercentMin: 0,
        corridorTurnRatioMax: 1,
        junctionSpacingMinTiles: 3,
      },
    })

    expect(report.metrics.structuralJunctionCount).toBe(2)
    expect(report.metrics.clusteredJunctionPairCount).toBe(1)
    expect(report.violations.map(issue => issue.code)).toContain('CLUSTERED_JUNCTIONS')
  })

  it('treats room door metadata drift as an error', () => {
    const canvas = createCanvasCustom(5, 3, 'ship', 'xs')
    fillHull(canvas)
    tile(canvas, { x: 1, y: 1 }, TileType.FLOOR, 'room')

    const report = validateMapAesthetics(
      canvas,
      [placement('room', { x: 1, y: 1 }, [{ x: 2, y: 1 }])],
      {
        thresholds: {
          hullUtilizationPercentMin: 0,
          corridorTurnRatioMax: 1,
        },
      }
    )

    expect(report.status).toBe('error')
    expect(report.metrics.doorMetadataMismatchCount).toBe(1)
    expect(report.violations.map(issue => issue.code)).toContain('DOOR_METADATA_MISMATCH')
  })

  it('exports the automatic visual review into active grid metadata', () => {
    const result = generateGridMap({
      seed: 'aesthetic-metadata',
      archetype: 'ship',
      subtype: 'freighter',
      sizeTier: 'sm',
    })

    expect(result.success).toBe(true)
    const metrics = result.map?.meta.ttrpgMetrics
    expect(metrics?.aestheticStatus).toMatch(/^(pass|warning|error)$/)
    expect(metrics?.aestheticViolationCodes).toBeInstanceOf(Array)
    expect(metrics?.hullUtilizationPercent).toEqual(expect.any(Number))
    expect(metrics?.corridorTurnRatio).toEqual(expect.any(Number))
    expect(metrics?.clusteredJunctionPairs).toEqual(expect.any(Number))
    expect(metrics?.ambiguousDoorCount).toEqual(expect.any(Number))
    expect(metrics?.doorMetadataMismatchCount).toBe(0)
  })
})

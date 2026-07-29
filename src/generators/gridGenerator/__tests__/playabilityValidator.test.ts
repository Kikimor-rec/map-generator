import { describe, expect, it } from 'vitest'
import type { ProgrammedRoom } from '../../types'
import { createCanvasCustom, setTile } from '../canvas'
import { generateGridMap } from '../index'
import { validateTTRPGPlayability } from '../playabilityValidator'
import { TileType, type GridCanvas, type Point, type RoomPlacement } from '../types'

function program(
  id: string,
  importance: ProgrammedRoom['importance'] = 'secondary',
  isExterior = false
): ProgrammedRoom {
  return {
    id,
    roomType: id,
    label: id,
    importance,
    zone: 'operations',
    accessLevel: 1,
    estimatedTiles: 1,
    estimatedWidth: 1,
    estimatedHeight: 1,
    tags: [],
    adjacencyPreferences: [],
    forbiddenAdjacencies: [],
    isExterior,
  }
}

function placeRoom(
  canvas: GridCanvas,
  roomId: string,
  floor: Point,
  door?: Point,
  importance: ProgrammedRoom['importance'] = 'secondary',
  isExterior = false
): RoomPlacement {
  const roomProgram = program(roomId, importance, isExterior)
  setTile(canvas, floor.x, floor.y, {
    type: TileType.FLOOR,
    roomId,
    zoneId: floor.x < canvas.width / 2 ? 'alpha' : 'beta',
  })
  if (door) {
    setTile(canvas, door.x, door.y, {
      type: TileType.DOOR,
      roomId,
      zoneId: floor.x < canvas.width / 2 ? 'alpha' : 'beta',
    })
  }
  return {
    roomId,
    roomType: roomId,
    label: roomId,
    tiles: [floor],
    bounds: { x: floor.x, y: floor.y, width: 1, height: 1 },
    zone: floor.x < canvas.width / 2 ? 'alpha' : 'beta',
    doorPositions: door ? [door] : [],
    program: roomProgram,
  }
}

function corridor(canvas: GridCanvas, points: Point[], zoneId = 'alpha'): void {
  for (const point of points) {
    setTile(canvas, point.x, point.y, {
      type: TileType.CORRIDOR,
      corridorId: 'test-corridor',
      zoneId,
    })
  }
}

describe('validateTTRPGPlayability', () => {
  it('reports connected rooms, route distances, dead ends, junctions, and zone transitions', () => {
    const canvas = createCanvasCustom(10, 7, 'ship', 'sm')
    corridor(canvas, [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 4, y: 2 },
    ])

    const placements = [
      placeRoom(canvas, 'airlock', { x: 0, y: 3 }, { x: 1, y: 3 }, 'primary', true),
      placeRoom(canvas, 'bridge', { x: 4, y: 0 }, { x: 4, y: 1 }, 'primary'),
      placeRoom(canvas, 'engineering', { x: 9, y: 3 }, { x: 8, y: 3 }, 'primary'),
    ]

    // Make the right half a distinct functional zone.
    for (let x = 5; x <= 9; x++) {
      const tile = canvas.tiles[3][x]
      if (tile.type !== TileType.VOID) tile.zoneId = 'beta'
    }

    const report = validateTTRPGPlayability(canvas, placements)

    expect(report.entryBasis).toBe('inferred')
    expect(report.metrics.connectedRoomPercent).toBe(100)
    expect(report.metrics.isolatedRoomIds).toEqual([])
    expect(report.metrics.corridorDeadEndCount).toBe(3)
    expect(report.metrics.junctionCount).toBe(1)
    expect(report.metrics.longestRoomRoute).toEqual({
      fromRoomId: 'airlock',
      toRoomId: 'engineering',
      distance: 7,
    })
    expect(report.metrics.criticalRoomPairPath?.distance).toBe(7)
    expect(report.metrics.criticalRoomReachabilityPercent).toBe(100)
    expect(report.metrics.zoneTransitionPairCount).toBe(1)
    expect(report.metrics.zoneTransitionCount).toBe(1)
  })

  it('reports disconnected and unreachable critical rooms as errors', () => {
    const canvas = createCanvasCustom(9, 5, 'outpost', 'md')
    corridor(canvas, [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ])
    const placements = [
      placeRoom(canvas, 'dock', { x: 0, y: 2 }, { x: 1, y: 2 }, 'secondary', true),
      placeRoom(canvas, 'operations', { x: 4, y: 2 }, undefined, 'secondary'),
      placeRoom(canvas, 'reactor', { x: 8, y: 4 }, undefined, 'primary'),
    ]
    // Connect operations to the short corridor but leave the reactor isolated.
    setTile(canvas, 4, 2, { type: TileType.FLOOR, roomId: 'operations', zoneId: 'alpha' })

    const report = validateTTRPGPlayability(canvas, placements)

    expect(report.status).toBe('error')
    expect(report.metrics.connectedRoomPercent).toBe(67)
    expect(report.metrics.isolatedRoomIds).toEqual(['reactor'])
    expect(report.metrics.reachableRoomPairPercent).toBe(33)
    expect(report.metrics.unreachableCriticalRoomIds).toEqual(['reactor'])
    expect(report.violations.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['ROOMS_DISCONNECTED', 'CRITICAL_ROOM_UNREACHABLE'])
    )
  })

  it('distinguishes a true loop from a single-route circulation tree', () => {
    const loopCanvas = createCanvasCustom(9, 7, 'station', 'md')
    const loopPoints: Point[] = []
    for (let x = 2; x <= 6; x++) {
      loopPoints.push({ x, y: 1 }, { x, y: 5 })
    }
    for (let y = 2; y <= 4; y++) {
      loopPoints.push({ x: 2, y }, { x: 6, y })
    }
    corridor(loopCanvas, loopPoints)
    const loopRooms = [
      placeRoom(loopCanvas, 'dock', { x: 0, y: 3 }, { x: 1, y: 3 }, 'primary', true),
      placeRoom(loopCanvas, 'command', { x: 8, y: 3 }, { x: 7, y: 3 }, 'primary'),
    ]
    corridor(loopCanvas, [{ x: 2, y: 3 }, { x: 6, y: 3 }])

    const loopReport = validateTTRPGPlayability(loopCanvas, loopRooms, {
      requestedLoopiness: 0.8,
    })

    expect(loopReport.metrics.circulationHasCycle).toBe(true)
    expect(loopReport.metrics.circulationCycleRank).toBeGreaterThan(0)
    expect(loopReport.metrics.alternateRoutePairPercent).toBe(100)
    expect(loopReport.violations.some(issue => issue.code === 'LOW_ROUTE_REDUNDANCY')).toBe(false)

    const treeCanvas = createCanvasCustom(9, 5, 'station', 'md')
    corridor(treeCanvas, Array.from({ length: 5 }, (_, index) => ({ x: index + 2, y: 2 })))
    const treeRooms = [
      placeRoom(treeCanvas, 'dock', { x: 0, y: 2 }, { x: 1, y: 2 }, 'primary', true),
      placeRoom(treeCanvas, 'command', { x: 8, y: 2 }, { x: 7, y: 2 }, 'primary'),
    ]
    const treeReport = validateTTRPGPlayability(treeCanvas, treeRooms, {
      requestedLoopiness: 0.8,
    })

    expect(treeReport.metrics.circulationHasCycle).toBe(false)
    expect(treeReport.metrics.alternateRoutePairPercent).toBe(0)
    expect(treeReport.violations.some(issue => issue.code === 'LOW_ROUTE_REDUNDANCY')).toBe(true)
  })

  it('is deterministic and useful on generated maps for every archetype', () => {
    for (const archetype of ['ship', 'station', 'outpost'] as const) {
      const generated = generateGridMap({
        seed: `playability-${archetype}`,
        archetype,
        subtype: archetype === 'station' ? 'habitat' : 'research',
        sizeTier: 'sm',
        loopiness: 0.55,
      })

      expect(generated.success).toBe(true)
      const first = validateTTRPGPlayability(generated.canvas!, generated.placements!, {
        requestedLoopiness: 0.55,
      })
      const second = validateTTRPGPlayability(generated.canvas!, generated.placements!, {
        requestedLoopiness: 0.55,
      })

      expect(first).toEqual(second)
      expect(first.metrics.connectedRoomPercent).toBe(100)
      expect(first.metrics.corridorTileCount).toBeGreaterThan(0)
      expect(first.metrics.longestRoomRoute).not.toBeNull()
      expect(first.metrics.criticalRoomReachabilityPercent).toBe(100)
    }
  })

  it('exports the compact playability report into MapJSON metadata', () => {
    for (const [archetype, seed] of [
      ['ship', 'meta-playability-ship'],
      ['station', 'meta-playability-station'],
      ['outpost', 'meta-playability-outpost'],
    ] as const) {
      const loopiness = 0.65
      const generated = generateGridMap({
        seed,
        archetype,
        subtype: archetype === 'station' ? 'habitat' : 'research',
        sizeTier: 'sm',
        loopiness,
      })
      const direct = validateTTRPGPlayability(
        generated.canvas!,
        generated.placements!,
        { requestedLoopiness: loopiness }
      )
      const exported = generated.map!.meta.ttrpgMetrics

      expect(exported.playabilityStatus).toBe(direct.status)
      expect(exported.connectedRoomPercent).toBe(direct.metrics.connectedRoomPercent)
      expect(exported.criticalReachability)
        .toBe(direct.metrics.criticalRoomReachabilityPercent)
      expect(exported.reachableRoomPairPercent)
        .toBe(direct.metrics.reachableRoomPairPercent)
      expect(exported.alternateRoutePairPercent)
        .toBe(direct.metrics.alternateRoutePairPercent)
      expect(exported.longestRoomRouteDistance)
        .toBe(direct.metrics.longestRoomRoute?.distance ?? null)
      expect(exported.zoneTransitionCount).toBe(direct.metrics.zoneTransitionCount)
      expect(exported.playabilityViolationCodes)
        .toEqual(direct.violations.map(issue => issue.code))
    }
  })

  it('keeps soft thresholds archetype-aware and allows explicit overrides', () => {
    const station = createCanvasCustom(5, 5, 'station', 'md')
    const outpost = createCanvasCustom(5, 5, 'outpost', 'md')

    const stationReport = validateTTRPGPlayability(station, [])
    const outpostReport = validateTTRPGPlayability(outpost, [], {
      thresholds: { junctionCountMin: 0, corridorDeadEndRatioMax: 0.9 },
    })

    expect(stationReport.thresholds.corridorDeadEndRatioMax)
      .toBeLessThan(outpostReport.thresholds.corridorDeadEndRatioMax)
    expect(outpostReport.thresholds.junctionCountMin).toBe(0)
    expect(outpostReport.entryBasis).toBe('none')
  })
})

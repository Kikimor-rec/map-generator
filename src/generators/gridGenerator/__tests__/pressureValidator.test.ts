import { describe, expect, it } from 'vitest'
import type { ProgrammedRoom, RoomCirculationRole } from '../../types'
import { createCanvasCustom, fillRect } from '../canvas'
import type { DoorAccessMetadata } from '../doorClassifier'
import { captureOriginalHullMask } from '../facilityValidator'
import { validatePressureTopology } from '../pressureValidator'
import {
  TileType,
  type GridCanvas,
  type Point,
  type RoomPlacement,
} from '../types'

const AIRLOCK_ACCESS: DoorAccessMetadata = {
  version: 1,
  accessId: 'test-airlock',
  requiredLevel: 1,
  requiredAccess: 'crew',
  lockLevel: 1,
  failsafe: false,
  lockedByDefault: false,
  pressureBoundary: true,
  interlocked: true,
  checkpoint: false,
  reasons: ['airlock-room'],
}

function createHullCanvas(): GridCanvas {
  const canvas = createCanvasCustom(9, 9, 'ship', 'xs')
  fillRect(canvas, { x: 1, y: 1, width: 7, height: 7 }, TileType.HULL)
  canvas.originalHullMask = captureOriginalHullMask(canvas)
  return canvas
}

function makeProgram(isExterior: boolean): ProgrammedRoom {
  return {
    id: isExterior ? 'external-airlock' : 'internal-airlock',
    roomType: 'airlock',
    label: 'Airlock',
    importance: 'primary',
    zone: 'docking',
    accessLevel: 1,
    estimatedTiles: 9,
    estimatedWidth: 3,
    estimatedHeight: 3,
    tags: ['pressure'],
    adjacencyPreferences: [],
    forbiddenAdjacencies: [],
    isExterior,
  }
}

function placeAirlock(
  canvas: GridCanvas,
  options: {
    id: string
    isExterior: boolean
    role: RoomCirculationRole
    tiles: Point[]
    doors: Point[]
  }
): RoomPlacement {
  for (const point of options.tiles) {
    canvas.tiles[point.y][point.x] = {
      type: TileType.FLOOR,
      roomId: options.id,
    }
  }
  for (const [index, point] of options.doors.entries()) {
    canvas.tiles[point.y][point.x] = {
      type: TileType.AIRLOCK,
      roomId: options.id,
      metadata: {
        doorSemantic: 'airlock',
        doorAccess: {
          ...AIRLOCK_ACCESS,
          accessId: `${options.id}-${index}`,
        },
      },
    }
  }
  const xs = options.tiles.map(point => point.x)
  const ys = options.tiles.map(point => point.y)
  return {
    roomId: options.id,
    roomType: 'airlock',
    label: 'Airlock',
    tiles: options.tiles,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs) + 1,
      height: Math.max(...ys) - Math.min(...ys) + 1,
    },
    zone: 'docking',
    doorPositions: options.doors,
    circulationRole: options.role,
    program: {
      ...makeProgram(options.isExterior),
      id: options.id,
    },
  }
}

describe('pressure topology validation', () => {
  it('allows an exterior docking airlock to terminate internal circulation', () => {
    const canvas = createHullCanvas()
    const placement = placeAirlock(canvas, {
      id: 'external-airlock',
      isExterior: true,
      role: 'terminal',
      tiles: [
        { x: 1, y: 3 },
        { x: 1, y: 4 },
        { x: 2, y: 3 },
        { x: 2, y: 4 },
      ],
      doors: [{ x: 2, y: 3 }],
    })

    const report = validatePressureTopology(canvas, [placement])
    expect(report.status).toBe('warning')
    expect(report.metrics.validAirlockRoomCount).toBe(1)
    expect(report.violations.map(issue => issue.code))
      .toEqual(['EXTERIOR_HATCH_NOT_MATERIALIZED'])
  })

  it('accepts a two-sided internal transit airlock', () => {
    const canvas = createHullCanvas()
    const placement = placeAirlock(canvas, {
      id: 'internal-airlock',
      isExterior: false,
      role: 'through',
      tiles: [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
      ],
      doors: [{ x: 3, y: 3 }, { x: 4, y: 4 }],
    })

    const report = validatePressureTopology(canvas, [placement])
    expect(report.status).toBe('pass')
    expect(report.metrics.validAirlockRoomCount).toBe(1)
    expect(report.metrics.internalAirlockRoomCount).toBe(1)
  })

  it('rejects a one-sided internal airlock and bad interlock metadata', () => {
    const canvas = createHullCanvas()
    const placement = placeAirlock(canvas, {
      id: 'broken-airlock',
      isExterior: false,
      role: 'terminal',
      tiles: [{ x: 4, y: 4 }],
      doors: [{ x: 4, y: 4 }],
    })
    canvas.tiles[4][4].metadata!.doorAccess = {
      ...AIRLOCK_ACCESS,
      interlocked: false,
    }

    const report = validatePressureTopology(canvas, [placement])
    expect(report.status).toBe('error')
    expect(report.metrics.invalidPressureDoorCount).toBe(1)
    expect(report.violations.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'INTERNAL_AIRLOCK_NOT_TRANSIT',
      'INVALID_AIRLOCK_DOOR_METADATA',
    ]))
  })
})

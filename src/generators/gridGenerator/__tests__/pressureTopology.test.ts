import { describe, expect, it } from 'vitest'
import { convertToEditorFormat } from '../../generator'
import type { GenerationRequest, ProgrammedRoom, RoomCirculationRole, RoomProgram } from '../../types'
import { createCanvasCustom, fillRect } from '../canvas'
import { convertToDeckLayout, convertToMapJSON } from '../convert'
import type { DoorAccessMetadata } from '../doorClassifier'
import { captureOriginalHullMask } from '../facilityValidator'
import {
  buildDeckPressureTopology,
  findExteriorHatchFace,
} from '../pressureTopology'
import { validatePressureTopology } from '../pressureValidator'
import {
  TileType,
  type GridCanvas,
  type Point,
  type RoomPlacement,
} from '../types'

const AIRLOCK_ACCESS: DoorAccessMetadata = {
  version: 1,
  accessId: 'pressure-topology-test',
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

function createHullCanvas(archetype: 'ship' | 'outpost' = 'ship'): GridCanvas {
  const canvas = createCanvasCustom(9, 9, archetype, 'xs')
  fillRect(canvas, { x: 1, y: 1, width: 7, height: 7 }, TileType.HULL)
  canvas.originalHullMask = captureOriginalHullMask(canvas)
  return canvas
}

function program(id: string, isExterior = true): ProgrammedRoom {
  return {
    id,
    roomType: 'airlock',
    label: 'Docking Airlock',
    importance: 'primary',
    zone: 'docking',
    accessLevel: 1,
    estimatedTiles: 4,
    estimatedWidth: 2,
    estimatedHeight: 2,
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
    tiles: Point[]
    doors: Point[]
    role?: RoomCirculationRole
  }
): RoomPlacement {
  for (const tile of options.tiles) {
    canvas.tiles[tile.y][tile.x] = {
      type: TileType.FLOOR,
      roomId: options.id,
    }
  }
  for (const [index, door] of options.doors.entries()) {
    canvas.tiles[door.y][door.x] = {
      type: TileType.AIRLOCK,
      roomId: options.id,
      metadata: {
        doorSemantic: 'airlock',
        doorAccess: {
          ...AIRLOCK_ACCESS,
          accessId: `${options.id}:${index}`,
        },
      },
    }
  }
  const xs = options.tiles.map(tile => tile.x)
  const ys = options.tiles.map(tile => tile.y)
  return {
    roomId: options.id,
    roomType: 'airlock',
    label: 'Docking Airlock',
    tiles: options.tiles,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs) + 1,
      height: Math.max(...ys) - Math.min(...ys) + 1,
    },
    zone: 'docking',
    doorPositions: options.doors,
    circulationRole: options.role ?? 'terminal',
    program: program(options.id),
  }
}

describe('static pressure topology', () => {
  it('materializes a terminal exterior airlock as a complete two-hatch chain', () => {
    const canvas = createHullCanvas()
    const room = placeAirlock(canvas, {
      id: 'dock-alpha',
      tiles: [
        { x: 1, y: 3 },
        { x: 1, y: 4 },
        { x: 2, y: 3 },
        { x: 2, y: 4 },
      ],
      doors: [{ x: 2, y: 3 }],
    })

    const topology = buildDeckPressureTopology(canvas, [room])
    const hatch = topology.exteriorHatches[0]
    expect(topology.externalEnvironment).toBe('vacuum')
    expect(hatch).toMatchObject({
      roomId: 'dock-alpha',
      wall: 'left',
      pressureRole: 'outer-hatch',
      pressureBoundary: true,
      interlockGroupId: 'interlock:dock-alpha',
      fromCompartmentId: 'pressure:airlock:dock-alpha',
      toCompartmentId: topology.outsideCompartmentId,
    })
    expect(topology.interlockGroups[0]).toEqual({
      id: 'interlock:dock-alpha',
      chamberRoomId: 'dock-alpha',
      innerPortIds: ['port-dock-alpha-0'],
      outerHatchId: hatch.id,
    })

    const report = validatePressureTopology(canvas, [room], topology)
    expect(report.status).toBe('pass')
    expect(report.metrics).toMatchObject({
      validAirlockRoomCount: 1,
      exteriorHatchCount: 1,
      unresolvedExteriorHatchCount: 0,
      invalidInterlockGroupCount: 0,
    })

    const layout = convertToDeckLayout(canvas, [room], [], topology)
    const outerPort = layout.rooms[0].ports.find(
      port => port.pressureRole === 'outer-hatch'
    )
    expect(outerPort).toMatchObject({
      id: 'port-dock-alpha-exterior-hatch',
      connectorId: null,
      exterior: true,
    })
    expect(layout.rooms[0].ports).toHaveLength(2)
    const request: GenerationRequest = {
      seed: 'pressure-topology-roundtrip',
      archetype: 'ship',
      subtype: 'courier',
      styleProfile: 'utilitarian',
      sizeTier: 'xs',
    }
    const roomProgram: RoomProgram = {
      rooms: [room.program],
      totalRooms: 1,
      totalEstimatedTiles: 4,
      zoneDistribution: { docking: 1 },
      connectorHints: [],
    }
    const map = convertToMapJSON(
      canvas, [room], [], request, roomProgram
    )
    const editor = convertToEditorFormat(map)
    expect(editor.pressure).toEqual(map.decks[0].pressure)
    expect(editor.rooms[0].doors.find(
      door => door.pressureRole === 'outer-hatch'
    )).toMatchObject({
      exterior: true,
      boundarySide: 'left',
      interlockGroupId: 'interlock:dock-alpha',
    })
  })

  it('does not open a hatch into an enclosed structural void', () => {
    const canvas = createHullCanvas()
    const mask = canvas.originalHullMask!.map(row => [...row])
    mask[4][4] = false
    canvas.originalHullMask = mask
    const room = placeAirlock(canvas, {
      id: 'false-exterior',
      tiles: [{ x: 3, y: 4 }],
      doors: [{ x: 3, y: 4 }],
    })

    expect(findExteriorHatchFace(canvas, room)).toBeUndefined()
    const topology = buildDeckPressureTopology(canvas, [room])
    expect(topology.exteriorHatches).toEqual([])
    const report = validatePressureTopology(canvas, [room], topology)
    expect(report.status).toBe('error')
    expect(report.violations.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'EXTERIOR_AIRLOCK_OFF_HULL',
        'EXTERIOR_HATCH_NOT_MATERIALIZED',
      ])
    )
  })

  it('keeps an outpost exterior environment explicitly unknown', () => {
    const canvas = createHullCanvas('outpost')
    const topology = buildDeckPressureTopology(canvas, [])
    expect(topology.externalEnvironment).toBe('unknown')
    expect(topology.compartments[0]).toMatchObject({
      kind: 'exterior',
      nominalState: 'unknown',
    })
  })
})

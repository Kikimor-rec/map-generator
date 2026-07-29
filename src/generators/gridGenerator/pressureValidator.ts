import { getTile } from './canvas'
import type { DeckPressureTopology } from '../types'
import type { DoorAccessMetadata, DoorSemantic } from './doorClassifier'
import { TileType, type GridCanvas, type Point, type RoomPlacement } from './types'
import { findExteriorHatchFace } from './pressureTopology'

export type PressureViolationCode =
  | 'AIRLOCK_WITHOUT_INTERNAL_DOOR'
  | 'EXTERIOR_AIRLOCK_OFF_HULL'
  | 'INTERNAL_AIRLOCK_NOT_TRANSIT'
  | 'INVALID_AIRLOCK_DOOR_METADATA'
  | 'INVALID_BULKHEAD_DOOR_METADATA'
  | 'EXTERIOR_HATCH_NOT_MATERIALIZED'
  | 'INVALID_EXTERIOR_HATCH_METADATA'
  | 'INVALID_AIRLOCK_INTERLOCK_GROUP'
  | 'PRESSURE_COMPARTMENT_MISSING'

export interface PressureMetrics {
  airlockRoomCount: number
  validAirlockRoomCount: number
  exteriorAirlockRoomCount: number
  internalAirlockRoomCount: number
  pressureBoundaryDoorCount: number
  invalidPressureDoorCount: number
  exteriorHatchCount: number
  unresolvedExteriorHatchCount: number
  pressureCompartmentCount: number
  interlockGroupCount: number
  invalidInterlockGroupCount: number
}

export interface PressureViolation {
  code: PressureViolationCode
  severity: 'error' | 'warning'
  message: string
  roomIds: string[]
  hint: string
}

export interface PressureReport {
  status: 'pass' | 'warning' | 'error'
  metrics: PressureMetrics
  violations: PressureViolation[]
}

interface DoorRecord {
  position: Point
  semantic?: DoorSemantic
  access?: DoorAccessMetadata
  tileType?: TileType
}

export function validatePressureTopology(
  canvas: GridCanvas,
  placements: readonly RoomPlacement[],
  topology?: DeckPressureTopology
): PressureReport {
  const violations: PressureViolation[] = []
  let airlockRoomCount = 0
  let validAirlockRoomCount = 0
  let exteriorAirlockRoomCount = 0
  let internalAirlockRoomCount = 0
  let pressureBoundaryDoorCount = 0
  let invalidPressureDoorCount = 0

  let validExteriorHatchCount = 0
  let invalidInterlockGroupCount = 0
  for (const placement of placements) {
    const doors = placement.doorPositions.map(position =>
      readDoor(canvas, position)
    )
    for (const door of doors) {
      if (door.access?.pressureBoundary) pressureBoundaryDoorCount += 1
      if (!isValidPressureDoor(door)) {
        invalidPressureDoorCount += 1
        violations.push({
          code: door.semantic === 'bulkhead'
            ? 'INVALID_BULKHEAD_DOOR_METADATA'
            : 'INVALID_AIRLOCK_DOOR_METADATA',
          severity: 'error',
          message: 'A pressure-boundary door has inconsistent physical or access metadata.',
          roomIds: [placement.roomId],
          hint: 'Regenerate the door classification and physical tile from one semantic record.',
        })
      }
    }

    if (normalizeRoomType(placement.roomType) !== 'airlock') continue
    airlockRoomCount += 1
    const isExterior = placement.program.isExterior
    if (isExterior) {
      exteriorAirlockRoomCount += 1
    } else {
      internalAirlockRoomCount += 1
    }

    let valid = true
    if (doors.length === 0) {
      valid = false
      violations.push({
        code: 'AIRLOCK_WITHOUT_INTERNAL_DOOR',
        severity: 'error',
        message: 'An airlock chamber has no connection to the interior circulation graph.',
        roomIds: [placement.roomId],
        hint: 'Attach at least one room-side interlocked airlock door.',
      })
    }

    if (isExterior && !findExteriorHatchFace(canvas, placement)) {
      valid = false
      violations.push({
        code: 'EXTERIOR_AIRLOCK_OFF_HULL',
        severity: 'error',
        message: 'An exterior docking airlock does not touch the facility hull boundary.',
        roomIds: [placement.roomId],
        hint: 'Move the docking chamber to the perimeter without forcing it to become a through-room.',
      })
    }

    if (
      !isExterior &&
      (
        doors.length < 2 ||
        placement.circulationRole === 'terminal'
      )
    ) {
      valid = false
      violations.push({
        code: 'INTERNAL_AIRLOCK_NOT_TRANSIT',
        severity: 'error',
        message: 'An internal pressure-transition airlock is not a two-sided transit chamber.',
        roomIds: [placement.roomId],
        hint: 'Give the chamber two distinct room-side connections and mark it through or hub.',
      })
    }

    if (doors.some(door =>
      door.semantic !== 'airlock' ||
      door.tileType !== TileType.AIRLOCK ||
      !door.access?.pressureBoundary ||
      !door.access.interlocked
    )) {
      valid = false
      violations.push({
        code: 'INVALID_AIRLOCK_DOOR_METADATA',
        severity: 'error',
        message: 'An airlock chamber uses a non-interlocked or non-airlock room-side threshold.',
        roomIds: [placement.roomId],
        hint: 'Classify every airlock-room threshold as an interlocked pressure boundary.',
      })
    }

    if (topology) {
      const group = topology.interlockGroups.find(
        candidate => candidate.chamberRoomId === placement.roomId
      )
      const expectedInnerPortIds = placement.doorPositions.map(
        (_door, index) => `port-${placement.roomId}-${index}`
      )
      if (
        !group ||
        group.id !== `interlock:${placement.roomId}` ||
        !sameStringSet(group.innerPortIds, expectedInnerPortIds)
      ) {
        valid = false
        invalidInterlockGroupCount += 1
        violations.push({
          code: 'INVALID_AIRLOCK_INTERLOCK_GROUP',
          severity: 'error',
          message: 'Airlock thresholds do not share one stable chamber interlock group.',
          roomIds: [placement.roomId],
          hint: 'Bind all inner thresholds and the optional outer hatch to the same interlock group.',
        })
      }

      const chamberId = `pressure:airlock:${placement.roomId}`
      if (!topology.compartments.some(compartment =>
        compartment.id === chamberId &&
        compartment.kind === 'airlock' &&
        compartment.roomIds.includes(placement.roomId)
      )) {
        valid = false
        violations.push({
          code: 'PRESSURE_COMPARTMENT_MISSING',
          severity: 'error',
          message: 'An airlock room has no explicit chamber compartment.',
          roomIds: [placement.roomId],
          hint: 'Materialize one cycling pressure compartment for the airlock room.',
        })
      }

      if (isExterior) {
        const hatch = topology.exteriorHatches.find(
          candidate => candidate.roomId === placement.roomId
        )
        if (hatch && isValidExteriorHatch(canvas, topology, placement, hatch, group)) {
          validExteriorHatchCount += 1
        } else if (hatch) {
          valid = false
          invalidInterlockGroupCount += 1
          violations.push({
            code: 'INVALID_EXTERIOR_HATCH_METADATA',
            severity: 'error',
            message: 'The vacuum-facing hatch does not complete the airlock pressure chain.',
            roomIds: [placement.roomId],
            hint: 'Connect chamber and exterior compartments through the same interlock group as the inner hatch.',
          })
        }
      }
    }

    if (valid) validAirlockRoomCount += 1
  }

  const unresolvedExteriorHatchCount =
    Math.max(0, exteriorAirlockRoomCount - validExteriorHatchCount)
  if (unresolvedExteriorHatchCount > 0) {
    violations.push({
      code: 'EXTERIOR_HATCH_NOT_MATERIALIZED',
      severity: topology ? 'error' : 'warning',
      message: topology
        ? 'Exterior airlock topology is missing a valid vacuum-facing hatch.'
        : 'Exterior airlock intent is valid, but the outer vacuum-facing hatch is not serialized yet.',
      roomIds: placements
        .filter(room =>
          room.program.isExterior &&
          normalizeRoomType(room.roomType) === 'airlock'
        )
        .map(room => room.roomId),
      hint: 'Materialize the second hatch when exterior connector endpoints enter the output schema.',
    })
  }

  const metrics: PressureMetrics = {
    airlockRoomCount,
    validAirlockRoomCount,
    exteriorAirlockRoomCount,
    internalAirlockRoomCount,
    pressureBoundaryDoorCount,
    invalidPressureDoorCount,
    exteriorHatchCount: topology?.exteriorHatches.length ?? 0,
    unresolvedExteriorHatchCount,
    pressureCompartmentCount: topology?.compartments.length ?? 0,
    interlockGroupCount: topology?.interlockGroups.length ?? 0,
    invalidInterlockGroupCount,
  }

  return {
    status: violations.some(issue => issue.severity === 'error')
      ? 'error'
      : violations.length > 0 ? 'warning' : 'pass',
    metrics,
    violations: deduplicateViolations(violations),
  }
}

function readDoor(canvas: GridCanvas, position: Point): DoorRecord {
  const tile = getTile(canvas, position.x, position.y)
  return {
    position,
    tileType: tile?.type,
    semantic: tile?.metadata?.doorSemantic as DoorSemantic | undefined,
    access: tile?.metadata?.doorAccess as DoorAccessMetadata | undefined,
  }
}

function isValidPressureDoor(door: DoorRecord): boolean {
  if (door.semantic !== 'airlock' && door.semantic !== 'bulkhead') return true
  if (
    door.tileType !== TileType.DOOR &&
    door.tileType !== TileType.AIRLOCK
  ) {
    return false
  }
  if (!door.access?.pressureBoundary) return false
  if (door.semantic === 'airlock') {
    return door.tileType === TileType.AIRLOCK && door.access.interlocked
  }
  return !door.access.interlocked
}

function normalizeRoomType(roomType: string): string {
  return roomType.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function deduplicateViolations(
  violations: PressureViolation[]
): PressureViolation[] {
  const seen = new Set<string>()
  return violations.filter(violation => {
    const key = `${violation.code}:${[...violation.roomIds].sort().join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isValidExteriorHatch(
  canvas: GridCanvas,
  topology: DeckPressureTopology,
  placement: RoomPlacement,
  hatch: DeckPressureTopology['exteriorHatches'][number],
  group: DeckPressureTopology['interlockGroups'][number] | undefined
): boolean {
  const chamberId = `pressure:airlock:${placement.roomId}`
  const expectedFace = findExteriorHatchFace(canvas, placement)
  return (
    hatch.doorType === 'airlock' &&
    hatch.pressureRole === 'outer-hatch' &&
    hatch.pressureBoundary &&
    hatch.fromCompartmentId === chamberId &&
    hatch.toCompartmentId === topology.outsideCompartmentId &&
    topology.compartments.some(compartment => compartment.id === chamberId) &&
    topology.compartments.some(
      compartment => compartment.id === topology.outsideCompartmentId
    ) &&
    group?.id === hatch.interlockGroupId &&
    group?.outerHatchId === hatch.id &&
    expectedFace?.wall === hatch.wall &&
    expectedFace.position.x === hatch.position.x &&
    expectedFace.position.y === hatch.position.y
  )
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const expected = new Set(b)
  return a.every(value => expected.has(value))
}

import type {
  DeckPressureTopology,
  Point as WorldPoint,
  Port,
  PressureCompartment,
  PressureHatch,
  PressureInterlockGroup,
} from '../types'
import type { GridCanvas, Point, RoomPlacement } from './types'

const OUTSIDE_COMPARTMENT_ID = 'pressure:vacuum'
const MAIN_COMPARTMENT_ID = 'pressure:facility-main'

interface ExteriorFace {
  tile: Point
  wall: Port['wall']
  position: WorldPoint
}

/**
 * Builds the smallest honest static pressure graph supported by the current
 * grid generator:
 *
 * vacuum <-> outer hatch <-> airlock chamber <-> inner hatch <-> facility
 *
 * The main facility remains one coarse compartment for now. Airlock chambers
 * are explicit, so exterior hatches and their shared interlock groups can be
 * serialized without pretending that runtime decompression is simulated.
 */
export function buildDeckPressureTopology(
  canvas: GridCanvas,
  placements: readonly RoomPlacement[]
): DeckPressureTopology {
  const externalEnvironment = canvas.archetype === 'outpost'
    ? 'unknown'
    : 'vacuum'
  const airlocks = placements
    .filter(room => normalizeRoomType(room.roomType) === 'airlock')
    .slice()
    .sort((a, b) => a.roomId.localeCompare(b.roomId))
  const mainRoomIds = placements
    .filter(room => normalizeRoomType(room.roomType) !== 'airlock')
    .map(room => room.roomId)
    .sort()

  const compartments: PressureCompartment[] = [
    {
      id: OUTSIDE_COMPARTMENT_ID,
      label: externalEnvironment === 'vacuum'
        ? 'Exterior vacuum'
        : 'Exterior environment',
      kind: 'exterior',
      nominalState: externalEnvironment,
      roomIds: [],
    },
    {
      id: MAIN_COMPARTMENT_ID,
      label: 'Main pressurized facility',
      kind: 'pressurized',
      nominalState: 'pressurized',
      roomIds: mainRoomIds,
    },
    ...airlocks.map(room => ({
      id: getAirlockCompartmentId(room.roomId),
      label: `${room.label} chamber`,
      kind: 'airlock' as const,
      nominalState: 'cycling' as const,
      roomIds: [room.roomId],
    })),
  ]

  const exteriorHatches: PressureHatch[] = []
  const interlockGroups: PressureInterlockGroup[] = []

  for (const room of airlocks) {
    const interlockGroupId = getInterlockGroupId(room.roomId)
    const innerPortIds = room.doorPositions.map(
      (_door, index) => getInnerPortId(room.roomId, index)
    )
    const group: PressureInterlockGroup = {
      id: interlockGroupId,
      chamberRoomId: room.roomId,
      innerPortIds,
    }

    if (room.program.isExterior) {
      const exteriorFace = findExteriorHatchFace(canvas, room)
      if (exteriorFace) {
        const hatchId = getExteriorHatchId(room.roomId)
        const portId = getExteriorHatchPortId(room.roomId)
        exteriorHatches.push({
          id: hatchId,
          roomId: room.roomId,
          portId,
          wall: exteriorFace.wall,
          position: exteriorFace.position,
          doorType: 'airlock',
          pressureRole: 'outer-hatch',
          pressureBoundary: true,
          interlockGroupId,
          fromCompartmentId: getAirlockCompartmentId(room.roomId),
          toCompartmentId: OUTSIDE_COMPARTMENT_ID,
        })
        group.outerHatchId = hatchId
      }
    }

    interlockGroups.push(group)
  }

  return {
    version: 1,
    outsideCompartmentId: OUTSIDE_COMPARTMENT_ID,
    externalEnvironment,
    compartments,
    exteriorHatches,
    interlockGroups,
  }
}

export function getPressureCompartmentId(
  room: RoomPlacement
): string {
  return normalizeRoomType(room.roomType) === 'airlock'
    ? getAirlockCompartmentId(room.roomId)
    : MAIN_COMPARTMENT_ID
}

export function getAirlockCompartmentId(roomId: string): string {
  return `pressure:airlock:${roomId}`
}

export function getInterlockGroupId(roomId: string): string {
  return `interlock:${roomId}`
}

export function getInnerPortId(roomId: string, doorIndex: number): string {
  return `port-${roomId}-${doorIndex}`
}

export function getExteriorHatchId(roomId: string): string {
  return `hatch-${roomId}-exterior`
}

export function getExteriorHatchPortId(roomId: string): string {
  return `port-${roomId}-exterior-hatch`
}

export function findExteriorHatchFace(
  canvas: GridCanvas,
  room: RoomPlacement
): ExteriorFace | undefined {
  const candidates: Array<ExteriorFace & { preference: number; centerDistance: number }> = []
  const exteriorVoidMask = buildExteriorVoidMask(canvas)
  const oppositeWall = getOppositeWallOfPrimaryDoor(room)
  const roomCenter = {
    x: room.bounds.x + room.bounds.width / 2,
    y: room.bounds.y + room.bounds.height / 2,
  }

  for (const tile of room.tiles) {
    for (const side of EXTERIOR_SIDES) {
      const neighbor = {
        x: tile.x + side.delta.x,
        y: tile.y + side.delta.y,
      }
      if (!isExteriorVoid(canvas, neighbor, exteriorVoidMask)) continue

      candidates.push({
        tile,
        wall: side.wall,
        position: projectTileFaceToWorld(canvas, room, tile, side.wall),
        preference: side.wall === oppositeWall ? 0 : 1,
        centerDistance:
          Math.abs(tile.x + 0.5 - roomCenter.x) +
          Math.abs(tile.y + 0.5 - roomCenter.y),
      })
    }
  }

  candidates.sort((a, b) =>
    a.preference - b.preference ||
    a.centerDistance - b.centerDistance ||
    WALL_ORDER[a.wall] - WALL_ORDER[b.wall] ||
    a.tile.y - b.tile.y ||
    a.tile.x - b.tile.x
  )

  const selected = candidates[0]
  if (!selected) return undefined
  return {
    tile: selected.tile,
    wall: selected.wall,
    position: selected.position,
  }
}

function projectTileFaceToWorld(
  canvas: GridCanvas,
  room: RoomPlacement,
  tile: Point,
  wall: Port['wall']
): WorldPoint {
  const centerX = tile.x * canvas.tileSize + canvas.tileSize / 2
  const centerY = tile.y * canvas.tileSize + canvas.tileSize / 2
  switch (wall) {
    case 'top':
      return { x: centerX, y: room.bounds.y * canvas.tileSize }
    case 'bottom':
      return {
        x: centerX,
        y: (room.bounds.y + room.bounds.height) * canvas.tileSize,
      }
    case 'left':
      return { x: room.bounds.x * canvas.tileSize, y: centerY }
    case 'right':
      return {
        x: (room.bounds.x + room.bounds.width) * canvas.tileSize,
        y: centerY,
      }
  }
}

function getOppositeWallOfPrimaryDoor(
  room: RoomPlacement
): Port['wall'] | undefined {
  const door = room.doorPositions[0]
  if (!door) return undefined
  const distances: Array<{ wall: Port['wall']; value: number }> = [
    { wall: 'top', value: door.y - room.bounds.y },
    {
      wall: 'bottom',
      value: room.bounds.y + room.bounds.height - 1 - door.y,
    },
    { wall: 'left', value: door.x - room.bounds.x },
    {
      wall: 'right',
      value: room.bounds.x + room.bounds.width - 1 - door.x,
    },
  ]
  distances.sort((a, b) => a.value - b.value || WALL_ORDER[a.wall] - WALL_ORDER[b.wall])
  return OPPOSITE_WALL[distances[0].wall]
}

function isExteriorVoid(
  canvas: GridCanvas,
  point: Point,
  exteriorVoidMask: readonly (readonly boolean[])[]
): boolean {
  if (
    point.x < 0 ||
    point.x >= canvas.width ||
    point.y < 0 ||
    point.y >= canvas.height
  ) {
    return true
  }
  return exteriorVoidMask[point.y][point.x]
}

/**
 * Only void connected to the canvas edge is exterior. Enclosed negative space
 * is a structural void and must never receive a vacuum-facing hatch.
 */
function buildExteriorVoidMask(canvas: GridCanvas): boolean[][] {
  const result = Array.from(
    { length: canvas.height },
    () => Array.from({ length: canvas.width }, () => false)
  )
  const queue: Point[] = []

  const enqueue = (point: Point): void => {
    if (
      point.x < 0 ||
      point.x >= canvas.width ||
      point.y < 0 ||
      point.y >= canvas.height ||
      result[point.y][point.x] ||
      canvas.originalHullMask?.[point.y]?.[point.x]
    ) {
      return
    }
    result[point.y][point.x] = true
    queue.push(point)
  }

  for (let x = 0; x < canvas.width; x += 1) {
    enqueue({ x, y: 0 })
    enqueue({ x, y: canvas.height - 1 })
  }
  for (let y = 0; y < canvas.height; y += 1) {
    enqueue({ x: 0, y })
    enqueue({ x: canvas.width - 1, y })
  }

  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index]
    enqueue({ x: point.x, y: point.y - 1 })
    enqueue({ x: point.x + 1, y: point.y })
    enqueue({ x: point.x, y: point.y + 1 })
    enqueue({ x: point.x - 1, y: point.y })
  }

  return result
}

function normalizeRoomType(roomType: string): string {
  return roomType.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

const EXTERIOR_SIDES: ReadonlyArray<{
  wall: Port['wall']
  delta: Point
}> = [
  { wall: 'top', delta: { x: 0, y: -1 } },
  { wall: 'right', delta: { x: 1, y: 0 } },
  { wall: 'bottom', delta: { x: 0, y: 1 } },
  { wall: 'left', delta: { x: -1, y: 0 } },
]

const WALL_ORDER: Record<Port['wall'], number> = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3,
}

const OPPOSITE_WALL: Record<Port['wall'], Port['wall']> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

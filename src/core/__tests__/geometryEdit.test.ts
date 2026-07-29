import { describe, expect, it } from 'vitest'
import {
  detachCorridorFromRoom,
  moveRoomWithContents,
  reconcileAttachedCorridor,
} from '../geometryEdit'
import {
  CorridorStyle,
  DoorType,
  LayerType,
  ObjectCategory,
  RoomType,
  type Corridor,
  type CorridorSegment,
  type Point,
  type Room,
} from '../types'

function room(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100
): Room {
  return {
    id,
    type: RoomType.Generic,
    name: id,
    bounds: { x, y, width, height },
    doors: [],
    objects: [],
    metadata: {},
    deckLevel: 1,
    isVisible: true,
    isLocked: false,
  }
}

function corridor(
  segments: CorridorSegment[],
  startRoomId = 'start',
  endRoomId = 'end'
): Corridor {
  return {
    id: 'corridor',
    style: CorridorStyle.Standard,
    segments,
    width: 20,
    doors: [],
    connectedRoomIds: [startRoomId, endRoomId],
    deckLevel: 1,
    startAttachment: { roomId: startRoomId, wall: 'right', offset: 0.5 },
    endAttachment: { roomId: endRoomId, wall: 'left', offset: 0.5 },
  }
}

function isOrthogonalAndContinuous(segments: CorridorSegment[]): boolean {
  return segments.every((segment, index) => {
    const orthogonal =
      segment.start.x === segment.end.x || segment.start.y === segment.end.y
    const previous = segments[index - 1]
    const continuous =
      !previous ||
      (previous.end.x === segment.start.x && previous.end.y === segment.start.y)
    return orthogonal && continuous
  })
}

function pointInsideExpandedRoom(
  point: Point,
  target: Room,
  padding: number
): boolean {
  return (
    point.x >= target.bounds.x - padding &&
    point.x <= target.bounds.x + target.bounds.width + padding &&
    point.y >= target.bounds.y - padding &&
    point.y <= target.bounds.y + target.bounds.height + padding
  )
}

describe('moveRoomWithContents', () => {
  it('moves bounds, absolute doors, and absolute objects immutably', () => {
    const source = room('room', 10, 20)
    source.doors = [{
      id: 'door',
      type: DoorType.Standard,
      position: { x: 110, y: 70 },
      rotation: 90,
      width: 20,
      isOpen: false,
      isLocked: false,
      securityLevel: 0,
    }]
    source.objects = [{
      id: 'object',
      templateId: 'console',
      name: 'Console',
      category: ObjectCategory.Equipment,
      position: { x: 40, y: 60 },
      size: { width: 20, height: 20 },
      rotation: 0,
      isVisible: true,
      layer: LayerType.Furniture,
      metadata: {},
    }]
    const snapshot = structuredClone(source)

    const moved = moveRoomWithContents(source, { x: 30, y: -10 })

    expect(moved.bounds).toEqual({ x: 40, y: 10, width: 100, height: 100 })
    expect(moved.doors[0].position).toEqual({ x: 140, y: 60 })
    expect(moved.objects[0].position).toEqual({ x: 70, y: 50 })
    expect(source).toEqual(snapshot)
    expect(moved).not.toBe(source)
    expect(moved.doors[0]).not.toBe(source.doors[0])
    expect(moved.objects[0]).not.toBe(source.objects[0])
  })
})

describe('reconcileAttachedCorridor', () => {
  it('moves an attached endpoint and preserves orthogonal continuous segments', () => {
    const rooms = [
      room('start', 0, 100),
      room('end', 400, 0),
    ]
    const source = corridor([{
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
    }])
    const snapshot = structuredClone(source)

    const result = reconcileAttachedCorridor({
      corridor: source,
      rooms,
      changedRoomIds: ['start'],
      gridSize: 20,
    })

    expect(result.status).toBe('rerouted')
    expect(result.corridor.segments[0].start).toEqual({ x: 100, y: 150 })
    expect(result.corridor.segments.at(-1)?.end).toEqual({ x: 400, y: 50 })
    expect(isOrthogonalAndContinuous(result.corridor.segments)).toBe(true)
    expect(result.corridor.startAttachment).toEqual(source.startAttachment)
    expect(result.corridor.endAttachment).toEqual(source.endAttachment)
    expect(source).toEqual(snapshot)
  })

  it('deterministically routes around non-endpoint room obstacles', () => {
    const obstacle = room('obstacle', 190, 0, 120, 120)
    const rooms = [
      room('start', 0, 0),
      room('end', 400, 0),
      obstacle,
    ]
    const source = corridor([{
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
    }])

    const first = reconcileAttachedCorridor({
      corridor: source,
      rooms,
      changedRoomIds: new Set(['start']),
      gridSize: 20,
      clearance: 5,
    })
    const second = reconcileAttachedCorridor({
      corridor: source,
      rooms,
      changedRoomIds: new Set(['start']),
      gridSize: 20,
      clearance: 5,
    })

    expect(first.status).toBe('rerouted')
    expect(first.corridor.segments).toEqual(second.corridor.segments)
    expect(isOrthogonalAndContinuous(first.corridor.segments)).toBe(true)

    const padding = source.width / 2 + 5
    for (const segment of first.corridor.segments) {
      const sampleCount = Math.max(
        1,
        Math.ceil(
          (Math.abs(segment.end.x - segment.start.x) +
            Math.abs(segment.end.y - segment.start.y)) / 5
        )
      )
      for (let index = 0; index <= sampleCount; index++) {
        const t = index / sampleCount
        const point = {
          x: segment.start.x + (segment.end.x - segment.start.x) * t,
          y: segment.start.y + (segment.end.y - segment.start.y) * t,
        }
        expect(pointInsideExpandedRoom(point, obstacle, padding)).toBe(false)
      }
    }
  })

  it('returns the original corridor unchanged for unrelated room edits', () => {
    const source = corridor([{
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
    }])

    const result = reconcileAttachedCorridor({
      corridor: source,
      rooms: [room('start', 0, 0), room('end', 400, 0), room('other', 200, 200)],
      changedRoomIds: ['other'],
      gridSize: 20,
    })

    expect(result.status).toBe('unchanged')
    expect(result.corridor).toBe(source)
  })

  it('returns blocked and retains old segments when an outward stub is obstructed', () => {
    const source = corridor([{
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
    }])
    const oldSegments = structuredClone(source.segments)

    const result = reconcileAttachedCorridor({
      corridor: source,
      rooms: [
        room('start', 0, 0),
        room('end', 400, 0),
        room('blocker', 105, 25, 40, 50),
      ],
      changedRoomIds: ['start'],
      gridSize: 20,
      clearance: 0,
    })

    expect(result.status).toBe('blocked')
    expect(result.corridor).toBe(source)
    expect(result.corridor.segments).toEqual(oldSegments)
    expect(result.warnings).toHaveLength(1)
  })

  it('follows a canonical room-port door anchor after room movement', () => {
    const startRoom = room('start', 0, 100)
    startRoom.doors = [{
      id: 'door-port-start-0',
      type: DoorType.Standard,
      position: { x: 100, y: 150 },
      rotation: 90,
      width: 20,
      isOpen: false,
      isLocked: false,
      securityLevel: 0,
    }]
    const source = corridor([{
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
    }])
    source.startAttachment = undefined
    source.startAnchor = {
      kind: 'roomPort',
      roomId: 'start',
      portId: 'port-start-0',
      doorId: 'door-port-start-0',
      position: { x: 100, y: 50 },
    }

    const result = reconcileAttachedCorridor({
      corridor: source,
      rooms: [startRoom, room('end', 400, 0)],
      changedRoomIds: ['start'],
      gridSize: 20,
    })

    expect(result.status).toBe('rerouted')
    expect(result.corridor.segments[0].start).toEqual({ x: 100, y: 150 })
    expect(result.corridor.startAnchor).toEqual({
      kind: 'roomPort',
      roomId: 'start',
      portId: 'port-start-0',
      doorId: 'door-port-start-0',
      position: { x: 100, y: 150 },
    })
    expect(isOrthogonalAndContinuous(result.corridor.segments)).toBe(true)
  })
})

describe('detachCorridorFromRoom', () => {
  it('detaches legacy and canonical room-port endpoints without moving geometry', () => {
    const source = corridor([{
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
    }])
    source.startAnchor = {
      kind: 'roomPort',
      roomId: 'start',
      portId: 'port-start-0',
      doorId: 'door-port-start-0',
      position: { x: 100, y: 50 },
    }
    const snapshot = structuredClone(source)

    const detached = detachCorridorFromRoom(source, 'start')

    expect(detached).not.toBe(source)
    expect(detached.startAttachment).toBeUndefined()
    expect(detached.startAnchor).toEqual({
      kind: 'free',
      position: { x: 100, y: 50 },
    })
    expect(detached.endAttachment).toEqual(source.endAttachment)
    expect(detached.endAnchor).toEqual(source.endAnchor)
    expect(detached.segments).toBe(source.segments)
    expect(source).toEqual(snapshot)
    expect(detachCorridorFromRoom(source, 'other')).toBe(source)
  })
})

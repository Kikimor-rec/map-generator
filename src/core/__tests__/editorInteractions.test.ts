import { describe, expect, it } from 'vitest'
import {
  corridorIsOrthogonalAndContinuous,
  findEndpointSnapCandidate,
  shouldPreserveAttachments,
  updateCorridorPoint,
} from '../editorInteractions'
import {
  CorridorStyle,
  DoorType,
  RoomType,
  type Corridor,
  type CorridorJunction,
  type Room,
} from '../types'

const room: Room = {
  id: 'room-a',
  type: RoomType.Bridge,
  name: 'Bridge',
  bounds: { x: 0, y: 0, width: 100, height: 80 },
  doors: [{
    id: 'door-port-a',
    type: DoorType.Standard,
    position: { x: 100, y: 40 },
    rotation: 90,
    width: 20,
    isOpen: false,
    isLocked: false,
    securityLevel: 0,
  }],
  objects: [],
  metadata: {},
  deckLevel: 1,
  isVisible: true,
  isLocked: false,
}

const sourceCorridor: Corridor = {
  id: 'corridor-a',
  style: CorridorStyle.Standard,
  segments: [
    { start: { x: 100, y: 40 }, end: { x: 160, y: 40 } },
    { start: { x: 160, y: 40 }, end: { x: 160, y: 120 } },
  ],
  width: 20,
  doors: [],
  connectedRoomIds: ['room-a'],
  deckLevel: 1,
  startAttachment: { roomId: 'room-a', wall: 'right', offset: 0.5 },
  startAnchor: {
    kind: 'roomPort',
    roomId: 'room-a',
    portId: 'port-a',
    doorId: 'door-port-a',
    position: { x: 100, y: 40 },
  },
  endAnchor: { kind: 'free', position: { x: 160, y: 120 } },
}

describe('shouldPreserveAttachments', () => {
  it.each([
    [true, false, true],
    [true, true, false],
    [false, false, false],
    [false, true, true],
  ])('inverts the persisted preference only while Alt is held', (preference, altKey, expected) => {
    expect(shouldPreserveAttachments(preference, altKey)).toBe(expected)
  })
})

describe('findEndpointSnapCandidate', () => {
  const junction: CorridorJunction = {
    id: 'junction-a',
    position: { x: 220, y: 120 },
    kind: 'T',
    corridorIds: [],
  }
  const otherCorridor: Corridor = {
    ...sourceCorridor,
    id: 'corridor-b',
    segments: [{ start: { x: 300, y: 100 }, end: { x: 360, y: 100 } }],
    startAttachment: undefined,
    startAnchor: { kind: 'free', position: { x: 300, y: 100 } },
  }

  it('snaps to an exact door and emits both canonical and legacy bindings', () => {
    const candidate = findEndpointSnapCandidate({
      point: { x: 104, y: 42 },
      rooms: [room],
      junctions: [],
      corridors: [],
      threshold: 12,
    })

    expect(candidate?.kind).toBe('roomPort')
    expect(candidate?.position).toEqual({ x: 100, y: 40 })
    expect(candidate?.attachment).toEqual({
      roomId: 'room-a',
      wall: 'right',
      offset: 0.5,
    })
    expect(candidate?.anchor).toEqual({
      kind: 'roomPort',
      roomId: 'room-a',
      portId: 'port-a',
      doorId: 'door-port-a',
      position: { x: 100, y: 40 },
    })
  })

  it('snaps to stable junction and corridor-point ids', () => {
    const junctionCandidate = findEndpointSnapCandidate({
      point: { x: 218, y: 120 },
      rooms: [],
      junctions: [junction],
      corridors: [],
      threshold: 10,
    })
    expect(junctionCandidate?.anchor).toEqual({
      kind: 'junction',
      junctionId: 'junction-a',
      position: { x: 220, y: 120 },
    })

    const corridorCandidate = findEndpointSnapCandidate({
      point: { x: 302, y: 100 },
      rooms: [],
      junctions: [],
      corridors: [sourceCorridor, otherCorridor],
      excludeCorridorId: 'corridor-a',
      threshold: 10,
    })
    expect(corridorCandidate?.anchor).toEqual({
      kind: 'corridorPoint',
      pointId: 'corridor-b:0:start',
      position: { x: 300, y: 100 },
    })
  })

  it('excludes the edited corridor and falls back to a room wall', () => {
    const excluded = findEndpointSnapCandidate({
      point: { x: 160, y: 120 },
      rooms: [],
      junctions: [],
      corridors: [sourceCorridor],
      excludeCorridorId: 'corridor-a',
      threshold: 10,
    })
    expect(excluded).toBeNull()

    const wall = findEndpointSnapCandidate({
      point: { x: 52, y: -6 },
      rooms: [{ ...room, doors: [] }],
      junctions: [],
      corridors: [],
      threshold: 10,
    })
    expect(wall?.kind).toBe('roomWall')
    expect(wall?.position).toEqual({ x: 52, y: 0 })
    expect(wall?.attachment).toEqual({
      roomId: 'room-a',
      wall: 'top',
      offset: 0.52,
    })
    expect(wall?.anchor).toBeUndefined()
  })
})

describe('updateCorridorPoint', () => {
  it('materializes bends and never commits a diagonal endpoint edit', () => {
    const updated = updateCorridorPoint({
      corridor: sourceCorridor,
      segmentIndex: 1,
      pointType: 'end',
      position: { x: 220, y: 150 },
      endpointBinding: null,
    })

    expect(corridorIsOrthogonalAndContinuous(updated)).toBe(true)
    expect(updated.segments.at(-1)?.end).toEqual({ x: 220, y: 150 })
    expect(updated.endAttachment).toBeUndefined()
    expect(updated.endAnchor).toEqual({
      kind: 'free',
      position: { x: 220, y: 150 },
    })
  })

  it('commits the exact preview binding for a room port', () => {
    const candidate = findEndpointSnapCandidate({
      point: { x: 101, y: 41 },
      rooms: [room],
      junctions: [],
      corridors: [],
      threshold: 10,
    })
    expect(candidate).not.toBeNull()

    const updated = updateCorridorPoint({
      corridor: {
        ...sourceCorridor,
        startAttachment: undefined,
        startAnchor: { kind: 'free', position: { x: 80, y: 30 } },
        segments: [
          { start: { x: 80, y: 30 }, end: { x: 160, y: 30 } },
          { start: { x: 160, y: 30 }, end: { x: 160, y: 120 } },
        ],
      },
      segmentIndex: 0,
      pointType: 'start',
      position: candidate!.position,
      endpointBinding: candidate,
    })

    expect(updated.startAnchor).toEqual(candidate!.anchor)
    expect(updated.startAttachment).toEqual(candidate!.attachment)
    expect(updated.segments[0].start).toEqual(candidate!.position)
    expect(corridorIsOrthogonalAndContinuous(updated)).toBe(true)
  })

  it('keeps an internal bend continuous and orthogonal', () => {
    const updated = updateCorridorPoint({
      corridor: sourceCorridor,
      segmentIndex: 0,
      pointType: 'end',
      position: { x: 190, y: 70 },
    })

    expect(corridorIsOrthogonalAndContinuous(updated)).toBe(true)
    expect(updated.startAnchor).toEqual(sourceCorridor.startAnchor)
    expect(updated.endAnchor).toEqual(sourceCorridor.endAnchor)
  })
})

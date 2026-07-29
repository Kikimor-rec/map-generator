import { describe, expect, it } from 'vitest'
import { convertToEditorFormat } from '../generator'
import { normalizeConnectorRepresentation } from '../connectorRepresentation'
import type {
  LayoutConnector,
  LayoutRoom,
  MapJSON,
} from '../types'

function room(
  id: string,
  x: number,
  ports: LayoutRoom['ports'],
): LayoutRoom {
  return {
    id,
    roomType: 'generic',
    label: id,
    x,
    y: 0,
    width: 100,
    height: 100,
    gridX: x,
    gridY: 0,
    gridWidth: 100,
    gridHeight: 100,
    zone: 'operations',
    ports,
    isExterior: false,
  }
}

function mapWith(
  rooms: LayoutRoom[],
  connectors: LayoutConnector[],
): MapJSON {
  return {
    version: '1.0.0',
    meta: {
      name: 'Connector representation fixture',
      archetype: 'ship',
      subtype: 'exploration',
      sizeTier: 'sm',
      seed: 'connector-representation',
      generatedAt: '2026-07-29T00:00:00.000Z',
      ttrpgMetrics: {
        totalRooms: rooms.length,
        totalConnectors: connectors.length,
        estimatedCombatEncounters: 0,
        estimatedExplorationMinutes: 0,
        keyLocations: 0,
        hiddenAreas: 0,
      },
      tags: [],
    },
    grid: {
      cellSize: 40,
      snapEnabled: true,
    },
    zones: [
      {
        id: 'operations',
        label: 'Operations',
        color: '#3b82f6',
      },
    ],
    decks: [
      {
        index: 0,
        label: 'Deck 1',
        gridWidth: 20,
        gridHeight: 10,
        rooms,
        connectors,
        junctions: [],
      },
    ],
  }
}

describe('normalizeConnectorRepresentation', () => {
  it('prefers an explicit physical representation over an arbitrary id', () => {
    expect(normalizeConnectorRepresentation({
      id: 'custom-link',
      representation: 'physical-topology-edge-v1',
    })).toBe('physical-topology-edge-v1')
  })

  it('does not let a historical-looking id override an explicit room route', () => {
    expect(normalizeConnectorRepresentation({
      id: 'corridor-edge-custom',
      representation: 'room-route-v1',
    })).toBe('room-route-v1')
  })

  it('recognizes discriminator-free historical grid connectors only in fallback', () => {
    expect(normalizeConnectorRepresentation({ id: 'corridor-edge-3' }))
      .toBe('physical-topology-edge-v1')
    expect(normalizeConnectorRepresentation({ id: 'legacy-connector-3' }))
      .toBe('room-route-v1')
  })
})

describe('connector representation editor adapter', () => {
  it('renders an explicitly physical connector with an arbitrary id as physical topology', () => {
    const rooms = [
      room('room-a', 0, [{
        id: 'physical-port-a',
        x: 100,
        y: 50,
        wall: 'right',
        connectorId: 'custom-physical',
        doorType: 'secure',
      }]),
      room('room-b', 200, [{
        id: 'physical-port-b',
        x: 200,
        y: 50,
        wall: 'left',
        connectorId: 'custom-physical',
      }]),
    ]
    const connector: LayoutConnector = {
      id: 'custom-physical',
      representation: 'physical-topology-edge-v1',
      fromRoomId: 'room-a',
      toRoomId: 'room-b',
      kind: 'corridor',
      path: [{ x: 100, y: 50 }, { x: 200, y: 50 }],
      width: 24,
      startAnchor: {
        kind: 'roomPort',
        roomId: 'room-a',
        portId: 'physical-port-a',
        position: { x: 100, y: 50 },
      },
      endAnchor: {
        kind: 'roomPort',
        roomId: 'room-b',
        portId: 'physical-port-b',
        position: { x: 200, y: 50 },
      },
    }

    const editor = convertToEditorFormat(mapWith(rooms, [connector]))

    expect(editor.corridors).toHaveLength(1)
    expect(editor.corridors[0]).toMatchObject({
      id: 'custom-physical',
      width: 24,
      startAttachment: undefined,
      endAttachment: undefined,
    })
    expect(editor.rooms.flatMap(candidate => candidate.doors).map(door => door.id))
      .toEqual(expect.arrayContaining(['door-physical-port-a', 'door-physical-port-b']))
    expect(editor.doors).toEqual([])
  })

  it('adapts a legacy room route with an arbitrary non-prefix id', () => {
    const rooms = [
      room('room-a', 0, []),
      room('room-b', 200, []),
    ]
    const connector: LayoutConnector = {
      id: 'custom-room-route',
      fromRoomId: 'room-a',
      toRoomId: 'room-b',
      kind: 'corridor',
      path: [{ x: 100, y: 50 }, { x: 200, y: 50 }],
      width: 24,
    }

    const editor = convertToEditorFormat(mapWith(rooms, [connector]))

    expect(editor.corridors).toHaveLength(1)
    expect(editor.corridors[0]).toMatchObject({
      id: 'custom-room-route',
      width: 40,
      startAttachment: { roomId: 'room-a', wall: 'right' },
      endAttachment: { roomId: 'room-b', wall: 'left' },
    })
    expect(editor.doors.map(door => door.id)).toEqual([
      'door-custom-room-route-start',
      'door-custom-room-route-end',
    ])
  })

  it('handles physical and room-route connectors independently on a mixed deck', () => {
    const rooms = [
      room('room-a', 0, [{
        id: 'physical-port-a',
        x: 100,
        y: 30,
        wall: 'right',
        connectorId: 'physical-link',
      }]),
      room('room-b', 200, [{
        id: 'physical-port-b',
        x: 200,
        y: 30,
        wall: 'left',
        connectorId: 'physical-link',
      }]),
      room('room-c', 400, []),
      room('room-d', 600, []),
    ]
    const connectors: LayoutConnector[] = [
      {
        id: 'physical-link',
        representation: 'physical-topology-edge-v1',
        fromRoomId: 'room-a',
        toRoomId: 'room-b',
        kind: 'corridor',
        path: [{ x: 100, y: 30 }, { x: 200, y: 30 }],
        width: 22,
        startAnchor: {
          kind: 'roomPort',
          roomId: 'room-a',
          portId: 'physical-port-a',
          position: { x: 100, y: 30 },
        },
        endAnchor: {
          kind: 'roomPort',
          roomId: 'room-b',
          portId: 'physical-port-b',
          position: { x: 200, y: 30 },
        },
      },
      {
        id: 'room-route-link',
        representation: 'room-route-v1',
        fromRoomId: 'room-c',
        toRoomId: 'room-d',
        kind: 'corridor',
        path: [{ x: 500, y: 50 }, { x: 600, y: 50 }],
        width: 22,
      },
    ]

    const editor = convertToEditorFormat(mapWith(rooms, connectors))
    const physical = editor.corridors.find(corridor => corridor.id === 'physical-link')
    const roomRoute = editor.corridors.find(corridor => corridor.id === 'room-route-link')

    expect(physical).toMatchObject({
      width: 22,
      startAttachment: undefined,
      endAttachment: undefined,
    })
    expect(roomRoute).toMatchObject({
      width: 40,
      startAttachment: { roomId: 'room-c', wall: 'right' },
      endAttachment: { roomId: 'room-d', wall: 'left' },
    })
    expect(editor.rooms.flatMap(candidate => candidate.doors).map(door => door.id))
      .toEqual(expect.arrayContaining(['door-physical-port-a', 'door-physical-port-b']))
    expect(editor.doors.map(door => door.id)).toEqual([
      'door-room-route-link-start',
      'door-room-route-link-end',
    ])
  })

  it('keeps discriminator-free corridor-edge grid JSON readable', () => {
    const rooms = [
      room('room-a', 0, []),
      room('room-b', 200, []),
    ]
    const connector: LayoutConnector = {
      id: 'corridor-edge-7',
      fromRoomId: 'room-a',
      toRoomId: 'room-b',
      kind: 'corridor',
      path: [{ x: 100, y: 50 }, { x: 200, y: 50 }],
      width: 20,
    }

    const editor = convertToEditorFormat(mapWith(rooms, [connector]))

    expect(editor.corridors[0]).toMatchObject({
      id: 'corridor-edge-7',
      width: 20,
      startAttachment: undefined,
      endAttachment: undefined,
    })
    expect(editor.doors).toEqual([])
  })
})

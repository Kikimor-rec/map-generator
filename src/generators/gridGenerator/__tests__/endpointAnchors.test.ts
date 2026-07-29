import { describe, expect, it } from 'vitest'
import { convertToEditorFormat } from '../../generator'
import type {
  LayoutConnectorEndpointAnchor,
  MapJSON,
  ProgrammedRoom,
} from '../../types'
import { createCanvasCustom } from '../canvas'
import { convertToDeckLayout } from '../convert'
import {
  TileType,
  type RoomPlacement,
  type ZoneDefinition,
} from '../types'

function programmedRoom(id: string): ProgrammedRoom {
  return {
    id,
    roomType: 'bridge',
    label: 'Room A',
    importance: 'primary',
    zone: 'main',
    accessLevel: 1,
    estimatedTiles: 6,
    estimatedWidth: 2,
    estimatedHeight: 3,
    tags: [],
    adjacencyPreferences: [],
    forbiddenAdjacencies: [],
    isExterior: false,
  }
}

function makeFixture() {
  const canvas = createCanvasCustom(9, 7, 'ship', 'sm', 40)
  const corridorTiles = [
    { x: 3, y: 3, type: TileType.DOOR },
    { x: 4, y: 3, type: TileType.CORRIDOR },
    { x: 5, y: 3, type: TileType.JUNCTION },
    { x: 6, y: 3, type: TileType.CORRIDOR },
    { x: 7, y: 3, type: TileType.CORRIDOR },
    { x: 5, y: 2, type: TileType.CORRIDOR },
    { x: 5, y: 1, type: TileType.CORRIDOR },
    { x: 5, y: 4, type: TileType.CORRIDOR },
    { x: 5, y: 5, type: TileType.CORRIDOR },
  ]
  for (const tile of corridorTiles) {
    canvas.tiles[tile.y][tile.x] = { type: tile.type }
  }

  const placement: RoomPlacement = {
    roomId: 'room-a',
    roomType: 'bridge',
    label: 'Room A',
    tiles: [
      { x: 1, y: 2 }, { x: 2, y: 2 },
      { x: 1, y: 3 }, { x: 2, y: 3 },
      { x: 1, y: 4 }, { x: 2, y: 4 },
    ],
    bounds: { x: 1, y: 2, width: 2, height: 3 },
    zone: 'main',
    doorPositions: [{ x: 3, y: 3 }],
    program: programmedRoom('room-a'),
  }

  const zones: ZoneDefinition[] = [{
    id: 'main',
    label: 'Main',
    position: 'center',
    roomTypes: ['bridge'],
    color: '#335577',
    sizePercent: 1,
  }]

  return {
    layout: convertToDeckLayout(canvas, [placement], zones),
    canvas,
    zones,
  }
}

function anchors(connector: {
  startAnchor?: LayoutConnectorEndpointAnchor
  endAnchor?: LayoutConnectorEndpointAnchor
}): LayoutConnectorEndpointAnchor[] {
  return [connector.startAnchor, connector.endAnchor].filter(
    (anchor): anchor is LayoutConnectorEndpointAnchor => !!anchor
  )
}

describe('generated corridor endpoint anchors', () => {
  it('exports exact room ports and topology nodes without nearest-room anchor guesses', () => {
    const { layout } = makeFixture()
    const roomFacing = layout.connectors.find(connector =>
      anchors(connector).some(anchor => anchor.kind === 'roomPort')
    )

    expect(roomFacing).toBeDefined()
    const roomAnchor = anchors(roomFacing!).find(
      anchor => anchor.kind === 'roomPort'
    )
    expect(roomAnchor).toEqual({
      kind: 'roomPort',
      roomId: 'room-a',
      portId: 'port-room-a-0',
      doorId: 'door-port-room-a-0',
      position: { x: 120, y: 140 },
    })
    expect(anchors(roomFacing!).some(anchor => anchor.kind === 'junction')).toBe(true)

    const nearestLabelOnlyEdge = layout.connectors.find(connector =>
      connector !== roomFacing &&
      (connector.fromRoomId === 'room-a' || connector.toRoomId === 'room-a') &&
      anchors(connector).every(anchor => anchor.kind !== 'roomPort')
    )
    expect(nearestLabelOnlyEdge).toBeDefined()
    expect(anchors(nearestLabelOnlyEdge!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'junction', junctionId: 'junction-5-3' }),
        expect.objectContaining({ kind: 'corridorPoint' }),
      ])
    )
  })

  it('preserves anchors in editor corridors and matches room-port door ids', () => {
    const { layout, canvas, zones } = makeFixture()
    const map: MapJSON = {
      version: '1.0.0',
      meta: {
        name: 'Anchor fixture',
        archetype: 'ship',
        subtype: 'courier',
        sizeTier: 'sm',
        seed: 'anchor-fixture',
        generatedAt: '2025-01-01T00:00:00.000Z',
        ttrpgMetrics: {
          totalRooms: 1,
          totalConnectors: layout.connectors.length,
          estimatedCombatEncounters: 0,
          estimatedExplorationMinutes: 4,
          keyLocations: 1,
          hiddenAreas: 0,
        },
        tags: [],
      },
      grid: { cellSize: 40, snapEnabled: true },
      zones: zones.map(zone => ({
        id: zone.id,
        label: zone.label,
        color: zone.color,
      })),
      decks: [{
        index: 0,
        label: 'Main Deck',
        gridWidth: canvas.width,
        gridHeight: canvas.height,
        rooms: layout.rooms,
        connectors: layout.connectors,
        junctions: layout.junctions,
      }],
    }

    const editor = convertToEditorFormat(map)
    const roomDoorIds = new Set(editor.rooms.flatMap(room =>
      room.doors.map(door => door.id)
    ))
    const editorAnchors = editor.corridors.flatMap(corridor =>
      [corridor.startAnchor, corridor.endAnchor].filter(Boolean)
    )
    const roomPortAnchor = editorAnchors.find(
      anchor => anchor?.kind === 'roomPort'
    )

    expect(roomPortAnchor).toMatchObject({
      kind: 'roomPort',
      roomId: 'room-a',
      portId: 'port-room-a-0',
      doorId: 'door-port-room-a-0',
    })
    expect(roomDoorIds.has('door-port-room-a-0')).toBe(true)
    expect(editorAnchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'junction', junctionId: 'junction-5-3' }),
      expect.objectContaining({ kind: 'corridorPoint' }),
    ]))
  })
})

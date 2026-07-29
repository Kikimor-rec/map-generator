import { describe, expect, it } from 'vitest'
import { generateGridMap } from '../index'
import { convertToEditorFormat } from '../../generator'
import { TileType, type GridCanvas, type RoomPlacement, type Tile } from '../types'
import type { DoorAccessMetadata, DoorSemantic } from '../doorClassifier'

interface ClassifiedDoor {
  placement: RoomPlacement
  tile: Tile
  semantic: DoorSemantic
  access: DoorAccessMetadata
}

function collectClassifiedDoors(
  canvas: GridCanvas,
  placements: RoomPlacement[]
): ClassifiedDoor[] {
  return placements.flatMap(placement =>
    placement.doorPositions.map(position => {
      const tile = canvas.tiles[position.y][position.x]
      return {
        placement,
        tile,
        semantic: tile.metadata?.doorSemantic as DoorSemantic,
        access: tile.metadata?.doorAccess as DoorAccessMetadata,
      }
    })
  )
}

function generateFixtures() {
  return [
    generateGridMap({
      seed: 'door-semantics-ship',
      archetype: 'ship',
      subtype: 'freighter',
      sizeTier: 'lg',
    }),
    generateGridMap({
      seed: 'door-semantics-station',
      archetype: 'station',
      subtype: 'trading',
      sizeTier: 'lg',
    }),
    generateGridMap({
      seed: 'door-semantics-outpost',
      archetype: 'outpost',
      subtype: 'science',
      sizeTier: 'lg',
    }),
  ]
}

describe('active occupancy door semantics', () => {
  it('classifies every room-side port and leaves corridor trunk tiles unclassified', () => {
    for (const result of generateFixtures()) {
      expect(result.success, result.error).toBe(true)
      const classifiedDoors = collectClassifiedDoors(result.canvas!, result.placements!)

      expect(classifiedDoors.length).toBeGreaterThan(0)
      for (const door of classifiedDoors) {
        expect(['standard', 'bulkhead', 'secure', 'airlock']).toContain(door.semantic)
        expect(door.access).toMatchObject({
          version: 1,
          accessId: expect.stringContaining(`port-${door.placement.roomId}-`),
        })
        expect([TileType.DOOR, TileType.AIRLOCK]).toContain(door.tile.type)
      }

      for (const row of result.canvas!.tiles) {
        for (const tile of row) {
          if (
            tile.type === TileType.CORRIDOR ||
            tile.type === TileType.JUNCTION
          ) {
            expect(tile.metadata?.doorSemantic).toBeUndefined()
            expect(tile.metadata?.doorAccess).toBeUndefined()
          }
        }
      }
    }
  }, 15_000)

  it('produces airlock, secure, and bulkhead metadata in deterministic fixtures', () => {
    const classifiedDoors = generateFixtures().flatMap(result =>
      collectClassifiedDoors(result.canvas!, result.placements!)
    )
    const bySemantic = new Map(
      classifiedDoors.map(door => [door.semantic, door])
    )

    expect(bySemantic.get('airlock')?.tile.type).toBe(TileType.AIRLOCK)
    expect(bySemantic.get('airlock')?.access).toMatchObject({
      pressureBoundary: true,
      interlocked: true,
    })
    expect(bySemantic.get('secure')?.tile.type).toBe(TileType.DOOR)
    expect(bySemantic.get('secure')?.access).toMatchObject({
      lockedByDefault: true,
      checkpoint: true,
    })
    expect(bySemantic.get('bulkhead')?.tile.type).toBe(TileType.DOOR)
    expect(bySemantic.get('bulkhead')?.access).toMatchObject({
      pressureBoundary: true,
      interlocked: false,
    })
  })

  it('exports tile door semantics through each matching MapJSON room port', () => {
    const result = generateGridMap({
      seed: 'door-port-export',
      archetype: 'station',
      subtype: 'trading',
      sizeTier: 'lg',
    })
    expect(result.success, result.error).toBe(true)

    const roomsById = new Map(
      result.map!.decks[0].rooms.map(room => [room.id, room])
    )
    for (const placement of result.placements!) {
      const room = roomsById.get(placement.roomId)!
      for (let index = 0; index < placement.doorPositions.length; index += 1) {
        const position = placement.doorPositions[index]
        const semantic = result.canvas!.tiles[position.y][position.x]
          .metadata?.doorSemantic

        expect(room.ports[index].doorType).toBe(semantic)
      }
    }
  })

  it('materializes grid port semantics as visible editor room doors without endpoint duplicates', () => {
    const result = generateGridMap({
      seed: 'door-editor-adapter',
      archetype: 'station',
      subtype: 'trading',
      sizeTier: 'lg',
    })
    expect(result.success, result.error).toBe(true)

    const editorData = convertToEditorFormat(result.map!)
    const editorRooms = new Map(editorData.rooms.map(room => [room.id, room]))
    const seenTypes = new Set<string>()

    for (const layoutRoom of result.map!.decks[0].rooms) {
      const editorRoom = editorRooms.get(layoutRoom.id)!
      expect(editorRoom.doors).toHaveLength(layoutRoom.ports.length)

      for (const port of layoutRoom.ports) {
        const editorDoor = editorRoom.doors.find(door =>
          door.position.x === port.x && door.position.y === port.y
        )
        expect(editorDoor, `missing editor door for ${port.id}`).toBeDefined()
        const expectedRotation =
          port.wall === 'left' || port.wall === 'right' ? 90 : 0
        expect(editorDoor!.rotation).toBe(expectedRotation)

        if (port.doorType === 'airlock') {
          expect(editorDoor!.type).toBe('airlock')
          seenTypes.add('airlock')
        } else if (port.doorType === 'secure') {
          expect(editorDoor!.type).toBe('secure')
          expect(editorDoor!.isLocked).toBe(true)
          seenTypes.add('secure')
        } else if (port.doorType === 'bulkhead') {
          expect(editorDoor!.type).toBe('blast')
          seenTypes.add('bulkhead')
        }
      }
    }

    expect(seenTypes).toEqual(new Set(['airlock', 'secure', 'bulkhead']))
    expect(editorData.doors).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { ProgrammedRoom, SeededRNG } from '../../types'
import { generateGridMap } from '../index'
import type { Rect, RoomPlacement } from '../types'
import { planRoomCirculation } from '../roomCirculation'

function room(overrides: Partial<ProgrammedRoom> = {}): ProgrammedRoom {
  return {
    id: 'room-test',
    roomType: 'quarters',
    label: 'Test Room',
    importance: 'secondary',
    zone: 'crew',
    accessLevel: 1,
    estimatedTiles: 16,
    estimatedWidth: 4,
    estimatedHeight: 4,
    tags: [],
    adjacencyPreferences: [],
    forbiddenAdjacencies: [],
    isExterior: false,
    ...overrides,
  }
}

function rngWithChance(value: boolean): SeededRNG {
  return {
    random: () => value ? 0 : 1,
    randomInt: min => min,
    randomFloat: min => min,
    pick: values => values[0],
    shuffle: values => [...values],
    chance: () => value,
  }
}

describe('room circulation planning', () => {
  it('keeps an exterior docking airlock terminal', () => {
    expect(planRoomCirculation(
      room({ roomType: 'airlock', isExterior: true }),
      'station',
      rngWithChance(true)
    )).toMatchObject({
      desiredRole: 'terminal',
      targetConnectionCount: 1,
      reason: 'exterior-terminal',
    })
  })

  it('uses a non-exterior airlock as a two-sided pressure transition', () => {
    expect(planRoomCirculation(
      room({ roomType: 'airlock', isExterior: false }),
      'ship',
      rngWithChance(false)
    )).toMatchObject({
      desiredRole: 'through',
      targetConnectionCount: 2,
      reason: 'pressure-transition',
    })
  })

  it('allows shared spaces and only sometimes allows a bridge shortcut', () => {
    expect(planRoomCirculation(
      room({ roomType: 'commonArea', estimatedTiles: 30 }),
      'station',
      rngWithChance(false)
    ).desiredRole).toBe('hub')

    expect(planRoomCirculation(
      room({ roomType: 'bridge' }),
      'ship',
      rngWithChance(false)
    ).desiredRole).toBe('terminal')

    expect(planRoomCirculation(
      room({ roomType: 'bridge' }),
      'ship',
      rngWithChance(true)
    ).desiredRole).toBe('through')
  })
})

describe('generated through rooms', () => {
  it('exports actual roles, distinct door walls, and matching TTRPG metrics', () => {
    const fixtures = [
      { archetype: 'ship' as const, subtype: 'explorer', seed: 'through-ship-a' },
      { archetype: 'ship' as const, subtype: 'cargo', seed: 'through-ship-b' },
      { archetype: 'station' as const, subtype: 'hub', seed: 'through-station-a' },
      { archetype: 'station' as const, subtype: 'habitat', seed: 'through-station-b' },
      { archetype: 'outpost' as const, subtype: 'research', seed: 'through-outpost-a' },
      { archetype: 'outpost' as const, subtype: 'mining', seed: 'through-outpost-b' },
    ]

    let throughRoomCount = 0
    for (const fixture of fixtures) {
      const result = generateGridMap({
        ...fixture,
        sizeTier: 'md',
        loopiness: 0.65,
      })
      expect(result.success).toBe(true)

      const placements = result.placements ?? []
      const generatedThrough = placements.filter(
        placement => placement.circulationRole === 'through'
      )
      const generatedHubs = placements.filter(
        placement => placement.circulationRole === 'hub'
      )
      throughRoomCount += generatedThrough.length + generatedHubs.length

      for (const placement of [...generatedThrough, ...generatedHubs]) {
        expect(placement.doorPositions.length).toBeGreaterThanOrEqual(2)
        expect(new Set(placement.doorPositions.map(door =>
          doorWall(placement.bounds, door)
        )).size).toBeGreaterThanOrEqual(2)
      }

      for (const placement of placements.filter(
        candidate => candidate.program.isExterior &&
          normalizeRoomType(candidate.roomType) === 'airlock'
      )) {
        expect(placement.circulationRole).toBe('terminal')
      }

      const deckRooms = result.map?.decks[0].rooms ?? []
      for (const placement of placements) {
        expect(deckRooms.find(candidate => candidate.id === placement.roomId)?.circulationRole)
          .toBe(placement.circulationRole)
      }

      expect(result.map?.meta.ttrpgMetrics.throughRoomCount)
        .toBe(generatedThrough.length)
      expect(result.map?.meta.ttrpgMetrics.circulationHubRoomCount)
        .toBe(generatedHubs.length)
    }

    expect(throughRoomCount).toBeGreaterThan(0)
  })

  it('is deterministic for room roles and door positions', () => {
    const options = {
      archetype: 'station' as const,
      subtype: 'habitat',
      sizeTier: 'md' as const,
      seed: 'through-deterministic',
      loopiness: 0.7,
    }
    const first = generateGridMap(options).placements ?? []
    const second = generateGridMap(options).placements ?? []

    expect(first.map(roleSnapshot)).toEqual(second.map(roleSnapshot))
  })
})

function roleSnapshot(room: RoomPlacement) {
  return {
    id: room.roomId,
    role: room.circulationRole,
    doors: room.doorPositions,
  }
}

function doorWall(bounds: Rect, door: { x: number; y: number }): string {
  if (door.y === bounds.y) return 'top'
  if (door.x === bounds.x + bounds.width - 1) return 'right'
  if (door.y === bounds.y + bounds.height - 1) return 'bottom'
  return 'left'
}

function normalizeRoomType(roomType: string): string {
  return roomType.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

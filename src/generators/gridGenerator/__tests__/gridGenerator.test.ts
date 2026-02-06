import { describe, it, expect } from 'vitest'
import { generateGridMap, type GridGeneratorResult } from '../index'
import { TileType } from '../types'

// ============================================================================
// HELPERS
// ============================================================================

/** Count tiles of a given type across the entire canvas */
function countTileType(result: GridGeneratorResult, type: TileType): number {
  const canvas = result.canvas!
  let count = 0
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (canvas.tiles[y][x].type === type) {
        count++
      }
    }
  }
  return count
}

/** Get the center point of a room placement's bounding box */
function getRoomCenter(placement: { bounds: { x: number; y: number; width: number; height: number } }) {
  return {
    x: placement.bounds.x + placement.bounds.width / 2,
    y: placement.bounds.y + placement.bounds.height / 2,
  }
}

/** Euclidean distance between two points */
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// ============================================================================
// TESTS
// ============================================================================

describe('generateGridMap', () => {
  // --------------------------------------------------------------------------
  // 1. Basic generation works
  // --------------------------------------------------------------------------
  describe('basic generation', () => {
    it('should return success with default options', () => {
      const result = generateGridMap({ seed: 'basic-test' })

      expect(result.success).toBe(true)
      expect(result.map).toBeDefined()
      expect(result.placements).toBeDefined()
      expect(result.placements!.length).toBeGreaterThan(0)
    })

    it('should return a canvas with valid dimensions', () => {
      const result = generateGridMap({ seed: 'canvas-test' })

      expect(result.canvas).toBeDefined()
      expect(result.canvas!.width).toBeGreaterThan(0)
      expect(result.canvas!.height).toBeGreaterThan(0)
      expect(result.canvas!.tiles).toBeDefined()
      expect(result.canvas!.tiles.length).toBe(result.canvas!.height)
      expect(result.canvas!.tiles[0].length).toBe(result.canvas!.width)
    })

    it('should populate timing information', () => {
      const result = generateGridMap({ seed: 'timing-test' })

      expect(result.timing).toBeDefined()
      expect(result.timing.total).toBeGreaterThan(0)
      expect(result.timing.hull).toBeGreaterThanOrEqual(0)
      expect(result.timing.zones).toBeGreaterThanOrEqual(0)
      expect(result.timing.rooms).toBeGreaterThanOrEqual(0)
      expect(result.timing.doors).toBeGreaterThanOrEqual(0)
      expect(result.timing.convert).toBeGreaterThanOrEqual(0)
    })

    it('should produce placements that each have tiles and bounds', () => {
      const result = generateGridMap({ seed: 'placement-test' })

      for (const placement of result.placements!) {
        expect(placement.roomId).toBeTruthy()
        expect(placement.roomType).toBeTruthy()
        expect(placement.label).toBeTruthy()
        expect(placement.tiles.length).toBeGreaterThan(0)
        expect(placement.bounds.width).toBeGreaterThan(0)
        expect(placement.bounds.height).toBeGreaterThan(0)
        expect(placement.zone).toBeTruthy()
        expect(placement.program).toBeDefined()
      }
    })

    it('should return debug output when debug option is true', () => {
      const result = generateGridMap({ seed: 'debug-test', debug: true })

      expect(result.success).toBe(true)
      expect(result.debugOutput).toBeDefined()
      expect(typeof result.debugOutput).toBe('string')
    })

    it('should not return debug output when debug option is false', () => {
      const result = generateGridMap({ seed: 'no-debug-test', debug: false })

      expect(result.success).toBe(true)
      expect(result.debugOutput).toBeUndefined()
    })
  })

  // --------------------------------------------------------------------------
  // 2. All archetypes work
  // --------------------------------------------------------------------------
  describe('archetypes', () => {
    const archetypes = ['ship', 'station', 'outpost'] as const

    for (const archetype of archetypes) {
      it(`should successfully generate a '${archetype}' map`, () => {
        const result = generateGridMap({
          seed: `archetype-${archetype}`,
          archetype,
          sizeTier: 'sm',
        })

        expect(result.success).toBe(true)
        expect(result.map).toBeDefined()
        expect(result.placements).toBeDefined()
        expect(result.placements!.length).toBeGreaterThan(0)
        expect(result.canvas!.archetype).toBe(archetype)
      })
    }

    it('should produce different canvas dimensions for different archetypes', () => {
      const shipResult = generateGridMap({ seed: 'dim-test', archetype: 'ship', sizeTier: 'md' })
      const stationResult = generateGridMap({ seed: 'dim-test', archetype: 'station', sizeTier: 'md' })

      const shipCanvas = shipResult.canvas!
      const stationCanvas = stationResult.canvas!

      // Ships are elongated (taller than wide), stations are roughly square
      const shipAspect = shipCanvas.width / shipCanvas.height
      const stationAspect = stationCanvas.width / stationCanvas.height

      expect(shipAspect).toBeLessThan(stationAspect)
    })
  })

  // --------------------------------------------------------------------------
  // 3. All size tiers work
  // --------------------------------------------------------------------------
  describe('size tiers', () => {
    const sizeTiers = ['xs', 'sm', 'md', 'lg'] as const

    for (const sizeTier of sizeTiers) {
      it(`should successfully generate a '${sizeTier}' map`, () => {
        const result = generateGridMap({
          seed: `size-${sizeTier}`,
          archetype: 'ship',
          sizeTier,
        })

        expect(result.success).toBe(true)
        expect(result.map).toBeDefined()
        expect(result.placements).toBeDefined()
        expect(result.placements!.length).toBeGreaterThan(0)
      })
    }

    it('should produce larger canvases for larger size tiers', () => {
      const results = sizeTiers.map(sizeTier =>
        generateGridMap({ seed: 'size-ordering', archetype: 'ship', sizeTier })
      )

      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1].canvas!
        const curr = results[i].canvas!
        const prevArea = prev.width * prev.height
        const currArea = curr.width * curr.height
        expect(currArea).toBeGreaterThan(prevArea)
      }
    })

    it('should place more rooms in larger maps', () => {
      const xsResult = generateGridMap({ seed: 'room-count', archetype: 'ship', sizeTier: 'xs' })
      const lgResult = generateGridMap({ seed: 'room-count', archetype: 'ship', sizeTier: 'lg' })

      expect(lgResult.placements!.length).toBeGreaterThan(xsResult.placements!.length)
    })
  })

  // --------------------------------------------------------------------------
  // 4. Seed determinism
  // --------------------------------------------------------------------------
  describe('seed determinism', () => {
    it('should produce the same number of placements with the same seed', () => {
      const result1 = generateGridMap({ seed: 'determinism-42', archetype: 'ship', sizeTier: 'sm' })
      const result2 = generateGridMap({ seed: 'determinism-42', archetype: 'ship', sizeTier: 'sm' })

      expect(result1.placements!.length).toBe(result2.placements!.length)
    })

    it('should produce identical room types in the same order with the same seed', () => {
      const result1 = generateGridMap({ seed: 12345, archetype: 'ship', sizeTier: 'md' })
      const result2 = generateGridMap({ seed: 12345, archetype: 'ship', sizeTier: 'md' })

      const types1 = result1.placements!.map(p => p.roomType)
      const types2 = result2.placements!.map(p => p.roomType)

      expect(types1).toEqual(types2)
    })

    it('should produce the same number of rooms with the same seed (number vs string)', () => {
      const result1 = generateGridMap({ seed: 99999, archetype: 'station', sizeTier: 'sm' })
      const result2 = generateGridMap({ seed: 99999, archetype: 'station', sizeTier: 'sm' })

      expect(result1.placements!.length).toBe(result2.placements!.length)
    })

    it('should produce different results with different seeds', () => {
      const result1 = generateGridMap({ seed: 'seed-A', archetype: 'ship', sizeTier: 'md' })
      const result2 = generateGridMap({ seed: 'seed-B', archetype: 'ship', sizeTier: 'md' })

      // The layouts should differ -- check room positions differ
      const positions1 = result1.placements!.map(p => `${p.bounds.x},${p.bounds.y}`)
      const positions2 = result2.placements!.map(p => `${p.bounds.x},${p.bounds.y}`)

      // It's astronomically unlikely that two different seeds produce identical positions
      expect(positions1).not.toEqual(positions2)
    })

    it('should produce identical corridor tile counts with the same seed', () => {
      const result1 = generateGridMap({ seed: 'corridor-det', archetype: 'ship', sizeTier: 'md' })
      const result2 = generateGridMap({ seed: 'corridor-det', archetype: 'ship', sizeTier: 'md' })

      const corridors1 = countTileType(result1, TileType.CORRIDOR)
      const corridors2 = countTileType(result2, TileType.CORRIDOR)

      expect(corridors1).toBe(corridors2)
    })
  })

  // --------------------------------------------------------------------------
  // 5. All rooms connected
  // --------------------------------------------------------------------------
  describe('room connectivity', () => {
    it('should give every room at least one door position (ship)', () => {
      const result = generateGridMap({ seed: 'connected-ship', archetype: 'ship', sizeTier: 'md' })

      expect(result.success).toBe(true)
      for (const placement of result.placements!) {
        expect(
          placement.doorPositions.length,
          `Room "${placement.label}" (${placement.roomType}) has no door positions`
        ).toBeGreaterThan(0)
      }
    })

    it('should give every room at least one door position (station)', () => {
      const result = generateGridMap({ seed: 'connected-station', archetype: 'station', sizeTier: 'md' })

      expect(result.success).toBe(true)
      for (const placement of result.placements!) {
        expect(
          placement.doorPositions.length,
          `Room "${placement.label}" (${placement.roomType}) has no door positions`
        ).toBeGreaterThan(0)
      }
    })

    it('should give every room at least one door position (outpost)', () => {
      const result = generateGridMap({ seed: 'connected-outpost', archetype: 'outpost', sizeTier: 'md' })

      expect(result.success).toBe(true)
      for (const placement of result.placements!) {
        expect(
          placement.doorPositions.length,
          `Room "${placement.label}" (${placement.roomType}) has no door positions`
        ).toBeGreaterThan(0)
      }
    })

    it('should have DOOR tiles on the canvas at each door position', () => {
      const result = generateGridMap({ seed: 'door-tiles', archetype: 'ship', sizeTier: 'sm' })
      const canvas = result.canvas!

      for (const placement of result.placements!) {
        for (const doorPos of placement.doorPositions) {
          const tile = canvas.tiles[doorPos.y][doorPos.x]
          expect(
            tile.type,
            `Expected DOOR tile at (${doorPos.x}, ${doorPos.y}) for room "${placement.label}", got type ${tile.type}`
          ).toBe(TileType.DOOR)
        }
      }
    })

    it('should have corridor or junction tiles adjacent to every door', () => {
      const result = generateGridMap({ seed: 'door-adj', archetype: 'ship', sizeTier: 'sm' })
      const canvas = result.canvas!

      const corridorTypes = new Set([TileType.CORRIDOR, TileType.JUNCTION, TileType.DOOR, TileType.FLOOR])
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ]

      for (const placement of result.placements!) {
        for (const doorPos of placement.doorPositions) {
          const neighbors = directions
            .map(d => ({ x: doorPos.x + d.dx, y: doorPos.y + d.dy }))
            .filter(p => p.x >= 0 && p.x < canvas.width && p.y >= 0 && p.y < canvas.height)

          const hasPassable = neighbors.some(n => corridorTypes.has(canvas.tiles[n.y][n.x].type))
          expect(
            hasPassable,
            `Door at (${doorPos.x}, ${doorPos.y}) for "${placement.label}" has no adjacent corridor/floor tiles`
          ).toBe(true)
        }
      }
    })
  })

  // --------------------------------------------------------------------------
  // 6. No parallel corridors -- junction tiles where corridors cross
  // --------------------------------------------------------------------------
  describe('corridor junctions', () => {
    it('should have junction tiles where corridors cross', () => {
      // Use a medium ship with moderate loopiness to get crossing corridors
      const result = generateGridMap({
        seed: 'junction-test',
        archetype: 'ship',
        sizeTier: 'md',
        loopiness: 0.7,
      })

      expect(result.success).toBe(true)

      const junctionCount = countTileType(result, TileType.JUNCTION)
      // A medium map with loopiness should produce at least some junctions
      expect(junctionCount).toBeGreaterThan(0)
    })

    it('should mark junction tiles where a corridor has 3+ corridor/junction neighbors', () => {
      const result = generateGridMap({
        seed: 'junction-neighbors',
        archetype: 'ship',
        sizeTier: 'md',
        loopiness: 0.6,
      })

      const canvas = result.canvas!
      const junctionTypes = new Set([TileType.CORRIDOR, TileType.JUNCTION, TileType.DOOR])

      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ]

      // Every JUNCTION tile should have 3 or more corridor/junction/door neighbors
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (canvas.tiles[y][x].type === TileType.JUNCTION) {
            const neighborCount = directions
              .map(d => ({ nx: x + d.dx, ny: y + d.dy }))
              .filter(p => p.nx >= 0 && p.nx < canvas.width && p.ny >= 0 && p.ny < canvas.height)
              .filter(p => junctionTypes.has(canvas.tiles[p.ny][p.nx].type))
              .length

            expect(
              neighborCount,
              `Junction at (${x}, ${y}) has only ${neighborCount} corridor-like neighbors, expected >= 3`
            ).toBeGreaterThanOrEqual(3)
          }
        }
      }
    })

    it('should produce junctions in station maps', () => {
      const result = generateGridMap({
        seed: 'station-junction',
        archetype: 'station',
        sizeTier: 'md',
        loopiness: 0.5,
      })

      expect(result.success).toBe(true)
      const junctionCount = countTileType(result, TileType.JUNCTION)
      expect(junctionCount).toBeGreaterThan(0)
    })
  })

  // --------------------------------------------------------------------------
  // 7. Adjacency rules respected
  // --------------------------------------------------------------------------
  describe('adjacency rules', () => {
    it('should place reactor far from crew quarters in ship archetype', () => {
      // Run multiple seeds to make this a statistical test
      const seeds = ['adj-1', 'adj-2', 'adj-3', 'adj-4', 'adj-5']
      let totalDistance = 0
      let measurements = 0

      for (const seed of seeds) {
        const result = generateGridMap({
          seed,
          archetype: 'ship',
          sizeTier: 'md',
        })

        if (!result.success || !result.placements) continue

        const reactorRooms = result.placements.filter(p => p.roomType === 'reactor')
        const crewRooms = result.placements.filter(p => p.roomType === 'crewQuarters')

        for (const reactor of reactorRooms) {
          for (const crew of crewRooms) {
            const reactorCenter = getRoomCenter(reactor)
            const crewCenter = getRoomCenter(crew)
            const dist = distance(reactorCenter, crewCenter)
            totalDistance += dist
            measurements++
          }
        }
      }

      // If we found both room types, verify they're not adjacent
      if (measurements > 0) {
        const avgDistance = totalDistance / measurements
        // Reactor and crew quarters (adjacency weight -9) should average at least 8 tiles apart
        expect(avgDistance).toBeGreaterThan(8)
      }
    })

    it('should not place reactor directly adjacent to crew quarters', () => {
      const result = generateGridMap({
        seed: 'adj-direct',
        archetype: 'ship',
        sizeTier: 'md',
      })

      if (!result.success || !result.placements) return

      const reactorRooms = result.placements.filter(p => p.roomType === 'reactor')
      const crewRooms = result.placements.filter(p => p.roomType === 'crewQuarters')

      for (const reactor of reactorRooms) {
        const reactorTileSet = new Set(reactor.tiles.map(t => `${t.x},${t.y}`))

        for (const crew of crewRooms) {
          // Check if any crew tile is orthogonally adjacent to any reactor tile
          let directlyAdjacent = false
          for (const crewTile of crew.tiles) {
            const neighbors = [
              `${crewTile.x - 1},${crewTile.y}`,
              `${crewTile.x + 1},${crewTile.y}`,
              `${crewTile.x},${crewTile.y - 1}`,
              `${crewTile.x},${crewTile.y + 1}`,
            ]
            if (neighbors.some(n => reactorTileSet.has(n))) {
              directlyAdjacent = true
              break
            }
          }

          expect(
            directlyAdjacent,
            'Reactor room should not be directly adjacent to crew quarters'
          ).toBe(false)
        }
      }
    })

    it('should place engineering near reactor', () => {
      const seeds = ['eng-reactor-1', 'eng-reactor-2', 'eng-reactor-3']
      let totalDistance = 0
      let measurements = 0

      for (const seed of seeds) {
        const result = generateGridMap({
          seed,
          archetype: 'ship',
          sizeTier: 'md',
        })

        if (!result.success || !result.placements) continue

        const reactorRooms = result.placements.filter(p => p.roomType === 'reactor')
        const engRooms = result.placements.filter(p => p.roomType === 'engineering')

        for (const reactor of reactorRooms) {
          for (const eng of engRooms) {
            const reactorCenter = getRoomCenter(reactor)
            const engCenter = getRoomCenter(eng)
            totalDistance += distance(reactorCenter, engCenter)
            measurements++
          }
        }
      }

      if (measurements > 0) {
        const avgDistance = totalDistance / measurements
        // Engineering and reactor (adjacency weight +9) should be relatively close
        // They should be within the same zone, so distance should be modest
        expect(avgDistance).toBeLessThan(25)
      }
    })
  })

  // --------------------------------------------------------------------------
  // 8. Loopiness parameter
  // --------------------------------------------------------------------------
  describe('loopiness parameter', () => {
    it('should produce more corridor tiles with higher loopiness', () => {
      const lowLoopResult = generateGridMap({
        seed: 'loopiness-compare',
        archetype: 'ship',
        sizeTier: 'md',
        loopiness: 0.1,
      })

      const highLoopResult = generateGridMap({
        seed: 'loopiness-compare',
        archetype: 'ship',
        sizeTier: 'md',
        loopiness: 0.9,
      })

      expect(lowLoopResult.success).toBe(true)
      expect(highLoopResult.success).toBe(true)

      const lowCorridors = countTileType(lowLoopResult, TileType.CORRIDOR)
        + countTileType(lowLoopResult, TileType.JUNCTION)
      const highCorridors = countTileType(highLoopResult, TileType.CORRIDOR)
        + countTileType(highLoopResult, TileType.JUNCTION)

      expect(highCorridors).toBeGreaterThan(lowCorridors)
    })

    it('should produce more junctions with higher loopiness', () => {
      const lowLoopResult = generateGridMap({
        seed: 'junction-loopiness',
        archetype: 'ship',
        sizeTier: 'md',
        loopiness: 0.1,
      })

      const highLoopResult = generateGridMap({
        seed: 'junction-loopiness',
        archetype: 'ship',
        sizeTier: 'md',
        loopiness: 0.9,
      })

      expect(lowLoopResult.success).toBe(true)
      expect(highLoopResult.success).toBe(true)

      const lowJunctions = countTileType(lowLoopResult, TileType.JUNCTION)
      const highJunctions = countTileType(highLoopResult, TileType.JUNCTION)

      expect(highJunctions).toBeGreaterThanOrEqual(lowJunctions)
    })

    it('should still produce a valid map at loopiness extremes', () => {
      const minResult = generateGridMap({
        seed: 'loop-min',
        archetype: 'ship',
        sizeTier: 'sm',
        loopiness: 0.0,
      })

      const maxResult = generateGridMap({
        seed: 'loop-max',
        archetype: 'ship',
        sizeTier: 'sm',
        loopiness: 1.0,
      })

      expect(minResult.success).toBe(true)
      expect(minResult.placements!.length).toBeGreaterThan(0)

      expect(maxResult.success).toBe(true)
      expect(maxResult.placements!.length).toBeGreaterThan(0)
    })

    it('should affect station maps as well', () => {
      const lowLoopResult = generateGridMap({
        seed: 'station-loopiness',
        archetype: 'station',
        sizeTier: 'md',
        loopiness: 0.1,
      })

      const highLoopResult = generateGridMap({
        seed: 'station-loopiness',
        archetype: 'station',
        sizeTier: 'md',
        loopiness: 0.9,
      })

      expect(lowLoopResult.success).toBe(true)
      expect(highLoopResult.success).toBe(true)

      const lowCorridors = countTileType(lowLoopResult, TileType.CORRIDOR)
        + countTileType(lowLoopResult, TileType.JUNCTION)
      const highCorridors = countTileType(highLoopResult, TileType.CORRIDOR)
        + countTileType(highLoopResult, TileType.JUNCTION)

      expect(highCorridors).toBeGreaterThan(lowCorridors)
    })
  })
})

import { describe, expect, it } from 'vitest'
import { createRNG } from '../../rng'
import { createCanvas } from '../canvas'
import { getTileConnectorIds } from '../corridorGraph'
import { carveHull, getDefaultHullConfig } from '../hull'
import { analyzeConnectivity, generateGridMap } from '../index'
import {
  TileType,
  type GridCanvas,
  type HullLayout,
  type Point,
  type RoomPlacement,
} from '../types'

function connectorIds(canvas: GridCanvas): Set<string> {
  const ids = new Set<string>()
  for (const row of canvas.tiles) {
    for (const tile of row) {
      for (const id of getTileConnectorIds(tile)) ids.add(id)
    }
  }
  return ids
}

function backbonePoints(canvas: GridCanvas, prefix: string): Point[] {
  const points: Point[] = []
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (getTileConnectorIds(canvas.tiles[y][x]).some(id => id.startsWith(prefix))) {
        points.push({ x, y })
      }
    }
  }
  return points
}

function expectBackboneInsideOriginalHull(
  generated: GridCanvas,
  original: GridCanvas,
  prefix: string
): void {
  const points = backbonePoints(generated, prefix)
  expect(points.length).toBeGreaterThan(0)
  for (const point of points) {
    expect(
      original.tiles[point.y][point.x].type,
      `${prefix} escaped at (${point.x}, ${point.y})`
    ).not.toBe(TileType.VOID)
  }
}

function roomSectors(canvas: GridCanvas, placements: RoomPlacement[]): Set<number> {
  const sectors = new Set<number>()
  const center = { x: canvas.width / 2, y: canvas.height / 2 }
  for (const placement of placements) {
    const roomCenter = {
      x: placement.bounds.x + placement.bounds.width / 2,
      y: placement.bounds.y + placement.bounds.height / 2,
    }
    const angle = Math.atan2(roomCenter.y - center.y, roomCenter.x - center.x)
    const normalized = (angle + Math.PI * 2 + Math.PI / 2) % (Math.PI * 2)
    sectors.add(Math.floor(normalized / (Math.PI / 2)) % 4)
  }
  return sectors
}

function nearestModuleIds(
  placements: RoomPlacement[],
  layout: HullLayout
): Set<string> {
  const ids = new Set<string>()
  for (const placement of placements) {
    const center = {
      x: placement.bounds.x + placement.bounds.width / 2,
      y: placement.bounds.y + placement.bounds.height / 2,
    }
    const nearest = layout.modules.reduce((best, module) => {
      const distance = Math.hypot(center.x - module.center.x, center.y - module.center.y)
      return distance < best.distance ? { id: module.id, distance } : best
    }, { id: '', distance: Infinity })
    ids.add(nearest.id)
  }
  return ids
}

describe('active archetype circulation dispatch', () => {
  it('uses radial station zoning and deterministic loopiness-scaled ring topology', () => {
    const seed = 'station-active-dispatch'
    const low = generateGridMap({
      seed,
      archetype: 'station',
      subtype: 'research',
      sizeTier: 'md',
      loopiness: 0,
    })
    const high = generateGridMap({
      seed,
      archetype: 'station',
      subtype: 'research',
      sizeTier: 'md',
      loopiness: 1,
    })
    const highAgain = generateGridMap({
      seed,
      archetype: 'station',
      subtype: 'research',
      sizeTier: 'md',
      loopiness: 1,
    })

    expect(low.success, low.error).toBe(true)
    expect(high.success, high.error).toBe(true)
    expect(connectorIds(low.canvas!)).toContain('spine-station-ring')
    expect(connectorIds(high.canvas!)).toContain('spine-station-ring')
    expect(
      [...connectorIds(low.canvas!)].filter(id => id.startsWith('spine-station-spoke-'))
    ).toHaveLength(4)
    expect(
      [...connectorIds(high.canvas!)].filter(id => id.startsWith('spine-station-spoke-'))
    ).toHaveLength(8)
    expect(high.canvas!.tiles).toEqual(highAgain.canvas!.tiles)

    const original = createCanvas('station', 'md')
    carveHull(
      original,
      getDefaultHullConfig('station', 'research'),
      createRNG(seed),
      { loopiness: 1 }
    )
    expectBackboneInsideOriginalHull(high.canvas!, original, 'spine-station-')
    expect(high.canvas!.tiles[Math.floor(high.canvas!.height / 2)][Math.floor(high.canvas!.width / 2)].zoneId)
      .toBe('hub')
    expect(roomSectors(high.canvas!, high.placements!).size).toBeGreaterThanOrEqual(3)
    expect(analyzeConnectivity(high.canvas!, high.placements!).connectedRoomPercent).toBe(100)
  })

  it('preserves the habitat void while carving its ring and four physical spokes', () => {
    const seed = 'habitat-active-dispatch'
    const result = generateGridMap({
      seed,
      archetype: 'station',
      subtype: 'habitat',
      sizeTier: 'md',
      loopiness: 1,
    })
    const original = createCanvas('station', 'md')
    carveHull(
      original,
      getDefaultHullConfig('station', 'habitat'),
      createRNG(seed),
      { loopiness: 1 }
    )

    expect(result.success, result.error).toBe(true)
    expect(
      [...connectorIds(result.canvas!)].filter(id => id.startsWith('spine-station-spoke-'))
    ).toHaveLength(4)
    expectBackboneInsideOriginalHull(result.canvas!, original, 'spine-station-')

    const center = { x: result.canvas!.width / 2, y: result.canvas!.height / 2 }
    const interiorVoid: Point[] = []
    for (let y = 0; y < original.height; y += 1) {
      for (let x = 0; x < original.width; x += 1) {
        if (
          original.tiles[y][x].type === TileType.VOID &&
          Math.hypot(x - center.x, y - center.y) < original.width * 0.25
        ) {
          interiorVoid.push({ x, y })
        }
      }
    }

    expect(interiorVoid.length).toBeGreaterThan(0)
    for (const point of interiorVoid) {
      expect(result.canvas!.tiles[point.y][point.x].type).toBe(TileType.VOID)
    }
  })

  it('activates clustered-outpost primary links and deterministic loop links', () => {
    const seed = 'outpost-active-dispatch'
    const low = generateGridMap({
      seed,
      archetype: 'outpost',
      subtype: 'science',
      sizeTier: 'md',
      loopiness: 0,
    })
    const highOptions = {
      seed,
      archetype: 'outpost' as const,
      subtype: 'science',
      sizeTier: 'md' as const,
      loopiness: 1,
    }
    const high = generateGridMap(highOptions)
    const highAgain = generateGridMap(highOptions)

    expect(low.success, low.error).toBe(true)
    expect(high.success, high.error).toBe(true)
    expect(
      [...connectorIds(low.canvas!)].filter(id => id.startsWith('outpost-primary-')).length
    ).toBeGreaterThan(0)
    expect(
      [...connectorIds(low.canvas!)].filter(id => id.startsWith('outpost-loop-'))
    ).toHaveLength(0)
    expect(
      [...connectorIds(high.canvas!)].filter(id => id.startsWith('outpost-loop-')).length
    ).toBeGreaterThan(0)
    expect(high.canvas!.tiles).toEqual(highAgain.canvas!.tiles)

    const original = createCanvas('outpost', 'md')
    const layout = carveHull(
      original,
      getDefaultHullConfig('outpost', 'science'),
      createRNG(seed),
      { loopiness: 1 }
    )
    expect(layout?.kind).toBe('clustered-outpost')
    expectBackboneInsideOriginalHull(high.canvas!, original, 'outpost-')
    expect(high.placements!.length).toBeGreaterThan(0)
    expect(nearestModuleIds(high.placements!, layout!).size).toBeGreaterThanOrEqual(2)
    expect(analyzeConnectivity(high.canvas!, high.placements!).connectedRoomPercent).toBe(100)
  })

  it('keeps irregular ruins on the safe hull-clipped fallback', () => {
    const result = generateGridMap({
      seed: 'outpost-ruins-fallback',
      archetype: 'outpost',
      subtype: 'ruins',
      sizeTier: 'md',
      loopiness: 1,
    })

    expect(result.success, result.error).toBe(true)
    expect([...connectorIds(result.canvas!)].some(id => id.startsWith('outpost-'))).toBe(false)
    expect(result.placements!.length).toBeGreaterThan(0)
    expect(analyzeConnectivity(result.canvas!, result.placements!).connectedRoomPercent).toBe(100)
  })
})

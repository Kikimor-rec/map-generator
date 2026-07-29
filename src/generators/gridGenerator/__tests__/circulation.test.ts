import { describe, expect, it } from 'vitest'
import { createRNG } from '../../rng'
import { createCanvas } from '../canvas'
import { getTileConnectorIds } from '../corridorGraph'
import { carveHull, getDefaultHullConfig } from '../hull'
import { generateGridMap } from '../index'
import { TileType, type GridCanvas, type Point } from '../types'

const SIZE_TIERS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const SEED = 'ship-circulation-acceptance'

function pointsForConnector(canvas: GridCanvas, connectorId: string): Point[] {
  const points: Point[] = []
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (getTileConnectorIds(canvas.tiles[y][x]).includes(connectorId)) {
        points.push({ x, y })
      }
    }
  }
  return points
}

function hullBounds(canvas: GridCanvas): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (canvas.tiles[y][x].type === TileType.VOID) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return { minX, minY, maxX, maxY }
}

function shortestDistanceToBackbone(canvas: GridCanvas, start: Point): number {
  const passable = new Set([TileType.DOOR, TileType.CORRIDOR, TileType.JUNCTION])
  const queue: Array<{ point: Point; distance: number }> = [{ point: start, distance: 0 }]
  const visited = new Set([`${start.x},${start.y}`])
  let head = 0

  while (head < queue.length) {
    const current = queue[head++]
    const tile = canvas.tiles[current.point.y]?.[current.point.x]
    if (tile?.spineLevel === 0) return current.distance

    for (const direction of [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]) {
      const next = {
        x: current.point.x + direction.x,
        y: current.point.y + direction.y,
      }
      const key = `${next.x},${next.y}`
      const nextTile = canvas.tiles[next.y]?.[next.x]
      if (visited.has(key) || !nextTile || !passable.has(nextTile.type)) continue
      visited.add(key)
      queue.push({ point: next, distance: current.distance + 1 })
    }
  }

  return Infinity
}

describe('ship longitudinal circulation', () => {
  it.each(SIZE_TIERS)('carves a centered longitudinal route interrupted only by transit rooms for %s ships', sizeTier => {
    const result = generateGridMap({
      seed: SEED,
      archetype: 'ship',
      subtype: 'explorer',
      sizeTier,
    })
    expect(result.success, result.error).toBe(true)

    const main = pointsForConnector(result.canvas!, 'spine-main')
    const xValues = Array.from(new Set(main.map(point => point.x)))
    const yValues = Array.from(new Set(main.map(point => point.y))).sort((a, b) => a - b)
    const bounds = hullBounds(result.canvas!)

    expect(xValues).toHaveLength(1)
    expect(Math.abs(xValues[0] - (bounds.minX + bounds.maxX) / 2)).toBeLessThanOrEqual(1)
    for (let y = yValues[0]; y <= yValues[yValues.length - 1]; y += 1) {
      const tile = result.canvas!.tiles[y][xValues[0]]
      const transitRoom = result.placements!.find(room =>
        room.tiles.some(point => point.x === xValues[0] && point.y === y) &&
        (room.circulationRole === 'through' || room.circulationRole === 'hub')
      )
      expect(
        getTileConnectorIds(tile).includes('spine-main') || !!transitRoom,
        `longitudinal route has an unexplained gap at (${xValues[0]}, ${y})`
      ).toBe(true)
    }
    expect(yValues.length / (bounds.maxY - bounds.minY + 1)).toBeGreaterThanOrEqual(0.8)
  })

  it.each(SIZE_TIERS)('carves the expected transverse backbone count for %s ships', sizeTier => {
    const result = generateGridMap({
      seed: SEED,
      archetype: 'ship',
      subtype: 'explorer',
      sizeTier,
    })
    const expectedCount = sizeTier === 'xs' || sizeTier === 'sm' ? 1 : 2
    const main = pointsForConnector(result.canvas!, 'spine-main')
    const mainX = main[0].x

    for (let index = 1; index <= expectedCount; index += 1) {
      const connectorId = `spine-transverse-${index}`
      const branch = pointsForConnector(result.canvas!, connectorId)
      const branchYs = Array.from(new Set(branch.map(point => point.y)))
      const branchXs = Array.from(new Set(branch.map(point => point.x))).sort((a, b) => a - b)

      expect(branch.length).toBeGreaterThanOrEqual(5)
      expect(branchYs).toHaveLength(1)
      for (let x = branchXs[0]; x <= branchXs[branchXs.length - 1]; x += 1) {
        const tile = result.canvas!.tiles[branchYs[0]][x]
        const transitRoom = result.placements!.find(room =>
          room.tiles.some(point => point.x === x && point.y === branchYs[0]) &&
          (room.circulationRole === 'through' || room.circulationRole === 'hub')
        )
        expect(
          getTileConnectorIds(tile).includes(connectorId) || !!transitRoom,
          `transverse route has an unexplained gap at (${x}, ${branchYs[0]})`
        ).toBe(true)
      }
      expect(branchXs).toContain(mainX)
      expect(
        getTileConnectorIds(result.canvas!.tiles[branchYs[0]][mainX])
      ).toEqual(expect.arrayContaining(['spine-main', connectorId]))
    }

    expect(pointsForConnector(result.canvas!, `spine-transverse-${expectedCount + 1}`)).toEqual([])
  })

  it.each(['courier', 'cargo', 'military', 'explorer'])(
    'keeps the %s backbone inside the original hull mask',
    subtype => {
      const result = generateGridMap({
        seed: SEED,
        archetype: 'ship',
        subtype,
        sizeTier: 'md',
      })
      const originalHull = createCanvas('ship', 'md')
      carveHull(originalHull, getDefaultHullConfig('ship', subtype), createRNG(SEED))

      for (let y = 0; y < result.canvas!.height; y += 1) {
        for (let x = 0; x < result.canvas!.width; x += 1) {
          const connectorIds = getTileConnectorIds(result.canvas!.tiles[y][x])
          if (!connectorIds.some(id => id.startsWith('spine-'))) continue
          expect(originalHull.tiles[y][x].type, `backbone escaped at (${x}, ${y})`)
            .not.toBe(TileType.VOID)
        }
      }
    }
  )

  it('connects every room bay to the backbone with predominantly short stubs', () => {
    const result = generateGridMap({
      seed: SEED,
      archetype: 'ship',
      subtype: 'explorer',
      sizeTier: 'md',
    })
    const distances = result.placements!.flatMap(placement =>
      placement.doorPositions.map(door => shortestDistanceToBackbone(result.canvas!, door))
    )

    expect(distances.length).toBeGreaterThan(0)
    expect(distances.every(Number.isFinite)).toBe(true)
    expect(distances.filter(distance => distance <= 3).length / distances.length)
      .toBeGreaterThanOrEqual(0.75)
  })

  it('is deeply deterministic for tiles, placements, and exported connectors', () => {
    const options = {
      seed: SEED,
      archetype: 'ship' as const,
      subtype: 'explorer',
      sizeTier: 'md' as const,
    }
    const first = generateGridMap(options)
    const second = generateGridMap(options)

    expect(first.canvas!.tiles).toEqual(second.canvas!.tiles)
    expect(first.placements).toEqual(second.placements)
    expect(first.map!.decks[0].connectors).toEqual(second.map!.decks[0].connectors)
  })
})
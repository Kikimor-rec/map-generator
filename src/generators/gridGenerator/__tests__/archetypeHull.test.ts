import { describe, expect, it } from 'vitest'
import { createRNG } from '../../rng'
import { createCanvas } from '../canvas'
import { carveHull, getDefaultHullConfig } from '../hull'
import { generateGridMap } from '../index'
import { TileType, type GridCanvas } from '../types'

const CASES = [
  { archetype: 'ship', subtype: 'courier' },
  { archetype: 'station', subtype: 'habitat' },
  { archetype: 'outpost', subtype: 'science' },
] as const

const SEED = 'archetype-hull-acceptance'
const LOOPINESS = 0.5

function tileTypes(canvas: GridCanvas): number[][] {
  return canvas.tiles.map(row => row.map(tile => tile.type))
}

function occupiedRowWidths(canvas: GridCanvas): number[] {
  return canvas.tiles.map(row =>
    row.reduce((count, tile) => count + (tile.type === TileType.VOID ? 0 : 1), 0)
  )
}

function occupiedBounds(canvas: GridCanvas): {
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

function countVoidInsideOccupiedBounds(canvas: GridCanvas): number {
  const bounds = occupiedBounds(canvas)
  let count = 0
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (canvas.tiles[y][x].type === TileType.VOID) count += 1
    }
  }
  return count
}

function countEnclosedVoidComponents(canvas: GridCanvas): number {
  const visited = new Set<string>()
  let enclosed = 0

  for (let startY = 0; startY < canvas.height; startY += 1) {
    for (let startX = 0; startX < canvas.width; startX += 1) {
      const startKey = `${startX},${startY}`
      if (
        visited.has(startKey) ||
        canvas.tiles[startY][startX].type !== TileType.VOID
      ) {
        continue
      }

      const queue = [{ x: startX, y: startY }]
      visited.add(startKey)
      let head = 0
      let touchesBoundary = false

      while (head < queue.length) {
        const current = queue[head++]
        if (
          current.x === 0 ||
          current.y === 0 ||
          current.x === canvas.width - 1 ||
          current.y === canvas.height - 1
        ) {
          touchesBoundary = true
        }

        for (const direction of [
          { x: 0, y: -1 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
        ]) {
          const next = {
            x: current.x + direction.x,
            y: current.y + direction.y,
          }
          const key = `${next.x},${next.y}`
          if (
            next.x < 0 ||
            next.x >= canvas.width ||
            next.y < 0 ||
            next.y >= canvas.height ||
            visited.has(key) ||
            canvas.tiles[next.y][next.x].type !== TileType.VOID
          ) {
            continue
          }
          visited.add(key)
          queue.push(next)
        }
      }

      if (!touchesBoundary) enclosed += 1
    }
  }

  return enclosed
}

describe('active occupancy generator archetype hulls', () => {
  it.each(CASES)(
    'keeps every generated $archetype tile inside its original hull mask',
    ({ archetype, subtype }) => {
      const result = generateGridMap({
        seed: SEED,
        archetype,
        subtype,
        sizeTier: 'md',
        loopiness: LOOPINESS,
      })
      expect(result.success, result.error).toBe(true)
      expect(result.placements?.length).toBeGreaterThan(0)

      const originalHull = createCanvas(archetype, 'md')
      carveHull(
        originalHull,
        getDefaultHullConfig(archetype, subtype),
        createRNG(SEED),
        { loopiness: LOOPINESS }
      )

      for (let y = 0; y < originalHull.height; y += 1) {
        for (let x = 0; x < originalHull.width; x += 1) {
          if (result.canvas!.tiles[y][x].type !== TileType.VOID) {
            expect(
              originalHull.tiles[y][x].type,
              `${archetype} produced a tile outside its hull at (${x}, ${y})`
            ).not.toBe(TileType.VOID)
          }
        }
      }
    }
  )

  it('produces an elongated ship with a changing bow-to-stern width', () => {
    const result = generateGridMap({
      seed: SEED,
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'md',
    })
    const widths = occupiedRowWidths(result.canvas!).filter(width => width > 0)

    expect(new Set(widths).size).toBeGreaterThan(4)
    expect(widths[0]).toBeLessThan(Math.max(...widths))
    expect(widths[widths.length - 1]).toBeLessThan(Math.max(...widths))
  })

  it('preserves enclosed negative space in a habitat ring station', () => {
    const result = generateGridMap({
      seed: SEED,
      archetype: 'station',
      subtype: 'habitat',
      sizeTier: 'md',
    })

    expect(countEnclosedVoidComponents(result.canvas!)).toBeGreaterThan(0)
  })

  it('produces a lobed modular outpost rather than a filled bounding box', () => {
    const result = generateGridMap({
      seed: SEED,
      archetype: 'outpost',
      subtype: 'science',
      sizeTier: 'md',
    })
    const bounds = occupiedBounds(result.canvas!)
    const boundsArea =
      (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)

    expect(countVoidInsideOccupiedBounds(result.canvas!)).toBeGreaterThan(boundsArea * 0.1)
    expect(
      new Set(occupiedRowWidths(result.canvas!).filter(width => width > 0)).size
    ).toBeGreaterThan(4)
  })

  it.each(CASES)(
    'is deterministic for the $archetype hull, tiles, and exported envelope',
    ({ archetype, subtype }) => {
      const options = {
        seed: SEED,
        archetype,
        subtype,
        sizeTier: 'md' as const,
      }
      const first = generateGridMap(options)
      const second = generateGridMap(options)

      expect(tileTypes(first.canvas!)).toEqual(tileTypes(second.canvas!))
      expect(first.map!.decks[0].geometry).toEqual(second.map!.decks[0].geometry)
    }
  )
})

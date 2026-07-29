import { describe, expect, it } from 'vitest'
import { createRNG } from '../../rng'
import { createCanvas, createCanvasCustom } from '../canvas'
import { carveHull, getDefaultHullConfig } from '../hull'
import { carveOutpostCirculation } from '../outpostCirculation'
import {
  TileType,
  type GridCanvas,
  type HullLayout,
} from '../types'

const SEED = 'outpost-circulation-foundation'

function createClusteredHull(loopiness?: number): {
  canvas: GridCanvas
  layout: HullLayout
} {
  const canvas = createCanvas('outpost', 'md')
  const layout = carveHull(
    canvas,
    getDefaultHullConfig('outpost', 'science'),
    createRNG(SEED),
    loopiness === undefined ? undefined : { loopiness }
  )

  expect(layout).toBeDefined()
  return { canvas, layout: layout! }
}

function tileTypes(canvas: GridCanvas): TileType[][] {
  return canvas.tiles.map(row => row.map(tile => tile.type))
}

function corridorReachable(canvas: GridCanvas, start: { x: number; y: number }): Set<string> {
  const queue = [start]
  const visited = new Set<string>([`${start.x},${start.y}`])
  let head = 0

  while (head < queue.length) {
    const current = queue[head++]
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
        visited.has(key) ||
        next.x < 0 ||
        next.x >= canvas.width ||
        next.y < 0 ||
        next.y >= canvas.height
      ) {
        continue
      }
      const type = canvas.tiles[next.y][next.x].type
      if (type !== TileType.CORRIDOR && type !== TileType.JUNCTION) {
        continue
      }
      visited.add(key)
      queue.push(next)
    }
  }

  return visited
}

describe('clustered outpost hull metadata', () => {
  it('returns stable module and link metadata without changing the default hull', () => {
    const first = createClusteredHull()
    const second = createClusteredHull()
    const explicitDefault = createClusteredHull(undefined)

    expect(first.layout).toEqual(second.layout)
    expect(tileTypes(first.canvas)).toEqual(tileTypes(second.canvas))
    expect(tileTypes(first.canvas)).toEqual(tileTypes(explicitDefault.canvas))

    expect(first.layout.kind).toBe('clustered-outpost')
    expect(first.layout.modules.length).toBeGreaterThanOrEqual(5)
    expect(first.layout.modules[0]).toMatchObject({
      id: 'outpost-module-0',
      kind: 'hub',
    })
    expect(
      first.layout.links.filter(link => link.kind === 'primary')
    ).toHaveLength(first.layout.modules.length - 1)
  })

  it('uses loopiness only for optional loop links while preserving module placement', () => {
    const low = createClusteredHull(0)
    const high = createClusteredHull(1)

    expect(low.layout.modules).toEqual(high.layout.modules)
    expect(low.layout.links.filter(link => link.kind === 'loop')).toHaveLength(0)
    expect(high.layout.links.filter(link => link.kind === 'loop')).toHaveLength(
      high.layout.modules.length - 1
    )
    expect(
      low.layout.links.filter(link => link.kind === 'primary')
    ).toEqual(high.layout.links.filter(link => link.kind === 'primary'))
  })
})

describe('carveOutpostCirculation', () => {
  it('connects every module hub through an orthogonal non-VOID network', () => {
    const { canvas, layout } = createClusteredHull(0.6)
    const originalTypes = tileTypes(canvas)
    const runs = carveOutpostCirculation(canvas, layout)

    expect(runs).toHaveLength(layout.links.length)
    for (const run of runs) {
      for (let index = 0; index < run.points.length; index += 1) {
        const point = run.points[index]
        expect(originalTypes[point.y][point.x]).not.toBe(TileType.VOID)
        expect(canvas.tiles[point.y][point.x].type).toBe(TileType.CORRIDOR)

        if (index > 0) {
          const previous = run.points[index - 1]
          expect(
            Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
          ).toBe(1)
        }
      }
    }

    const hub = layout.modules.find(module => module.kind === 'hub')!
    const reachable = corridorReachable(canvas, hub.center)
    for (const module of layout.modules) {
      expect(
        reachable.has(`${module.center.x},${module.center.y}`),
        `${module.id} is disconnected from ${hub.id}`
      ).toBe(true)
    }
  })

  it('rejects a link through VOID before mutating the canvas', () => {
    const canvas = createCanvasCustom(5, 3, 'outpost', 'xs')
    canvas.tiles[1][1] = { type: TileType.HULL }
    canvas.tiles[1][3] = { type: TileType.HULL }
    const before = tileTypes(canvas)
    const layout: HullLayout = {
      kind: 'clustered-outpost',
      modules: [
        {
          id: 'outpost-module-0',
          center: { x: 1, y: 1 },
          radius: 1,
          kind: 'hub',
        },
        {
          id: 'outpost-module-1',
          center: { x: 3, y: 1 },
          radius: 1,
          kind: 'satellite',
        },
      ],
      links: [
        {
          id: 'invalid-link',
          fromModuleId: 'outpost-module-0',
          toModuleId: 'outpost-module-1',
          centerline: [{ x: 1, y: 1 }, { x: 3, y: 1 }],
          kind: 'primary',
        },
      ],
    }

    expect(() => carveOutpostCirculation(canvas, layout)).toThrow(
      /leaves the hull|crosses VOID/
    )
    expect(tileTypes(canvas)).toEqual(before)
  })
})

import { describe, expect, it } from 'vitest'
import { createRNG } from '../../rng'
import { DIRECTIONS_4, createCanvas } from '../canvas'
import { getTileConnectorIds } from '../corridorGraph'
import { carveHull, getDefaultHullConfig } from '../hull'
import {
  carveStationCirculation,
  type CirculationRun,
} from '../stationCirculation'
import { TileType, type GridCanvas, type Point } from '../types'

function createStation(subtype: string = 'research'): GridCanvas {
  const canvas = createCanvas('station', 'md')
  carveHull(canvas, getDefaultHullConfig('station', subtype), createRNG('station-circulation'))
  return canvas
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function countComponents(points: Point[]): number {
  const keys = new Set(points.map(pointKey))
  const visited = new Set<string>()
  let components = 0

  for (const start of points) {
    if (visited.has(pointKey(start))) continue
    components += 1
    const queue = [start]
    visited.add(pointKey(start))
    let head = 0

    while (head < queue.length) {
      const current = queue[head++]
      for (const direction of DIRECTIONS_4) {
        const next = {
          x: current.x + direction.x,
          y: current.y + direction.y,
        }
        const key = pointKey(next)
        if (keys.has(key) && !visited.has(key)) {
          visited.add(key)
          queue.push(next)
        }
      }
    }
  }

  return components
}

function expectClosedRing(run: CirculationRun): void {
  const keys = new Set(run.points.map(pointKey))
  expect(keys.size).toBe(run.points.length)
  expect(countComponents(run.points)).toBe(1)

  for (const point of run.points) {
    const degree = DIRECTIONS_4.filter(direction =>
      keys.has(`${point.x + direction.x},${point.y + direction.y}`)
    ).length
    expect(degree, `ring degree at ${pointKey(point)}`).toBe(2)
  }
}

describe('station circulation', () => {
  it.each([
    ['research', 0.5],
    ['habitat', 0.5],
  ])('carves one closed and connected ring for %s', (subtype, loopiness) => {
    const canvas = createStation(subtype)
    const runs = carveStationCirculation(canvas, loopiness)
    const ring = runs.find(run => run.id === 'spine-station-ring')

    expect(ring).toBeDefined()
    expect(ring!.points.length).toBeGreaterThan(24)
    expectClosedRing(ring!)
  })

  it.each(['research', 'habitat'])(
    'never carves through the original VOID mask for %s',
    subtype => {
      const canvas = createStation(subtype)
      const originalTypes = canvas.tiles.map(row => row.map(tile => tile.type))
      const runs = carveStationCirculation(canvas, 0.9)

      for (const point of runs.flatMap(run => run.points)) {
        expect(
          originalTypes[point.y][point.x],
          `${subtype} circulation left its hull at ${pointKey(point)}`
        ).toBe(TileType.HULL)
      }
    }
  )

  it('uses four physical spokes for habitat stations', () => {
    const canvas = createStation('habitat')
    const runs = carveStationCirculation(canvas, 1)
    const spokes = runs.filter(run => run.id.startsWith('spine-station-spoke-'))
    const ringKeys = new Set(runs[0].points.map(pointKey))
    const center = { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) }
    const minimumSpokeRadius = Math.min(
      ...spokes.flatMap(spoke => spoke.points.map(point =>
        Math.hypot(point.x - center.x, point.y - center.y)
      ))
    )

    expect(spokes).toHaveLength(4)
    expect(minimumSpokeRadius).toBeGreaterThan(canvas.width * 0.2)
    for (const spoke of spokes) {
      expect(spoke.points.some(point => pointKey(point) === pointKey(center))).toBe(false)
      expect(spoke.points.some(point => ringKeys.has(pointKey(point)))).toBe(true)
      expect(countComponents(spoke.points)).toBe(1)
    }
  })

  it('scales circular station spokes from four to six to eight with loopiness', () => {
    const counts = [0.1, 0.5, 0.9].map(loopiness => {
      const canvas = createStation()
      return carveStationCirculation(canvas, loopiness)
        .filter(run => run.id.startsWith('spine-station-spoke-'))
        .length
    })

    expect(counts).toEqual([4, 6, 8])
  })

  it('is deterministic including run order and accumulated connector ids', () => {
    const first = createStation()
    const second = createStation()
    const firstRuns = carveStationCirculation(first, 0.9)
    const secondRuns = carveStationCirculation(second, 0.9)

    expect(firstRuns).toEqual(secondRuns)
    expect(
      first.tiles.map(row => row.map(tile => ({
        type: tile.type,
        connectorIds: getTileConnectorIds(tile),
      })))
    ).toEqual(
      second.tiles.map(row => row.map(tile => ({
        type: tile.type,
        connectorIds: getTileConnectorIds(tile),
      })))
    )
  })
})

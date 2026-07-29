import { describe, expect, it } from 'vitest'
import {
  pointInPolygon,
  rasterizeFacilityMasks,
  rasterizePolygonGeometry,
  type Polygon,
  type RasterGrid,
} from '..'

const CELL = 1024

const grid = (width: number, height: number): RasterGrid => ({
  width,
  height,
  cellSize: CELL,
})

function rectangle(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Polygon {
  return {
    outer: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  }
}

describe('rasterizePolygonGeometry', () => {
  it('rasterizes a rectangular envelope at cell centres', () => {
    const mask = rasterizePolygonGeometry(
      rectangle(0, 0, 4 * CELL, 3 * CELL),
      grid(4, 3),
    )

    expect([...mask]).toEqual([
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
    ])
  })

  it('subtracts polygon holes independent of ring winding', () => {
    const geometry: Polygon = {
      ...rectangle(0, 0, 4 * CELL, 4 * CELL),
      holes: [[
        { x: CELL, y: CELL },
        { x: CELL, y: 3 * CELL },
        { x: 3 * CELL, y: 3 * CELL },
        { x: 3 * CELL, y: CELL },
      ]],
    }

    expect([...rasterizePolygonGeometry(geometry, grid(4, 4))]).toEqual([
      1, 1, 1, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 1, 1, 1,
    ])
  })

  it('unions separated MultiPolygon parts', () => {
    const mask = rasterizePolygonGeometry(
      {
        polygons: [
          rectangle(0, 0, 2 * CELL, CELL),
          rectangle(3 * CELL, 0, 4 * CELL, CELL),
        ],
      },
      grid(4, 1),
    )

    expect([...mask]).toEqual([1, 1, 0, 1])
  })
})

describe('boundary and structural void rules', () => {
  it('includes the outer boundary and excludes a hole boundary', () => {
    const polygon: Polygon = {
      outer: [
        { x: 512, y: 512 },
        { x: 3584, y: 512 },
        { x: 3584, y: 3584 },
        { x: 512, y: 3584 },
      ],
      holes: [[
        { x: 1536, y: 1536 },
        { x: 2560, y: 1536 },
        { x: 2560, y: 2560 },
        { x: 1536, y: 2560 },
      ]],
    }

    expect(pointInPolygon({ x: 512, y: 512 }, polygon)).toBe(true)
    expect(pointInPolygon({ x: 1536, y: 2048 }, polygon)).toBe(false)
  })

  it('lets structural voids win over the envelope including boundaries', () => {
    const masks = rasterizeFacilityMasks(
      {
        envelope: rectangle(512, 512, 3584, 3584),
        structuralVoids: [rectangle(1536, 1536, 2560, 2560)],
      },
      grid(4, 4),
    )

    expect([...masks.envelope]).toEqual([
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
    ])
    expect([...masks.structuralVoids]).toEqual([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ])
    expect([...masks.usable]).toEqual([
      1, 1, 1, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 1, 1, 1,
    ])
  })
})

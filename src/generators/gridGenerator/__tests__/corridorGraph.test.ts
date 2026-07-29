import { describe, expect, it } from 'vitest'
import { createCanvasCustom } from '../canvas'
import { buildCorridorGraph } from '../corridorGraph'
import { TileType, type GridCanvas, type Point } from '../types'

function canvas(): GridCanvas {
  return createCanvasCustom(9, 9, 'station', 'sm')
}

function carve(canvas: GridCanvas, points: Point[], connectorIds: string[]): void {
  for (const point of points) {
    canvas.tiles[point.y][point.x] = {
      type: TileType.CORRIDOR,
      corridorId: connectorIds[0],
      metadata: { connectorIds },
    }
  }
}

describe('physical corridor graph extraction', () => {
  it('collapses a bend staircase into one topological edge', () => {
    const map = canvas()
    carve(map, [
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 },
      { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 },
    ], ['ring'])

    const graph = buildCorridorGraph(map)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].path).toHaveLength(6)
    expect(graph.junctions).toEqual([])
  })

  it('exports a closed degree-two ring as one deterministic self-loop', () => {
    const map = canvas()
    const ring: Point[] = []
    for (let x = 2; x <= 6; x += 1) ring.push({ x, y: 2 }, { x, y: 6 })
    for (let y = 3; y <= 5; y += 1) ring.push({ x: 2, y }, { x: 6, y })
    carve(map, ring, ['ring'])

    const first = buildCorridorGraph(map)
    const second = buildCorridorGraph(map)
    expect(first).toEqual(second)
    expect(first.nodes).toHaveLength(1)
    expect(first.edges).toHaveLength(1)
    expect(first.edges[0].fromNodeId).toBe(first.edges[0].toNodeId)
  })

  it('keeps logical ids on their physical branch without junction leakage', () => {
    const map = canvas()
    carve(map, [
      { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 },
      { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
    ], ['ring'])
    carve(map, [
      { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 3 },
      { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 },
    ], ['spoke'])
    map.tiles[4][4] = {
      type: TileType.JUNCTION,
      corridorId: 'ring',
      metadata: { connectorIds: ['ring', 'spoke'] },
    }

    const graph = buildCorridorGraph(map)
    expect(graph.junctions).toHaveLength(1)
    expect(graph.edges.every(edge => edge.connectorIds.length === 1)).toBe(true)
    expect(graph.edges.filter(edge => edge.connectorIds[0] === 'ring')).toHaveLength(2)
    expect(graph.edges.filter(edge => edge.connectorIds[0] === 'spoke')).toHaveLength(2)
  })

  it('splits only at a real shared-membership boundary, not every shared tile', () => {
    const map = canvas()
    carve(map, [{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }], ['a', 'b'])
    carve(map, [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], ['a'])

    const graph = buildCorridorGraph(map)
    expect(graph.nodes.length).toBeLessThan(6)
    expect(graph.edges.some(edge => edge.connectorIds.join('|') === 'a|b')).toBe(true)
    expect(graph.edges.some(edge => edge.connectorIds.join('|') === 'a')).toBe(true)
    expect(graph.junctions).toEqual([])
  })
})

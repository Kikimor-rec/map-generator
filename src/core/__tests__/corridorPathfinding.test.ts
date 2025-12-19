import { describe, it, expect } from 'vitest'
import { segmentIntersectsRoom, isPointInRoom } from '../corridorPathfinding'
import type { Room, Point } from '../types'

function room(x: number, y: number, w: number, h: number): Room {
  return {
    id: 'r1',
    type: 'bridge' as any,
    name: 'Room',
    bounds: { x, y, width: w, height: h },
    color: '#444',
    borderColor: '#666',
    doors: [],
    objects: [],
    metadata: {},
    deckLevel: 0,
    isVisible: true,
    isLocked: false,
  }
}

function p(x: number, y: number): Point {
  return { x, y }
}

describe('corridorPathfinding primitives', () => {
  it('detects point inside room with padding', () => {
    const r = room(0, 0, 100, 100)
    expect(isPointInRoom(p(10, 10), [r], 0)).toBe(true)
    // Outside without padding, inside with padding
    expect(isPointInRoom(p(-5, -5), [r], 0)).toBe(false)
    expect(isPointInRoom(p(-5, -5), [r], 10)).toBe(true)
  })

  it('detects segment intersection with inflated room bounds', () => {
    const r = room(0, 0, 100, 100)
    // Passes through room area
    expect(segmentIntersectsRoom(p(-20, 50), p(120, 50), r, 20)).toBe(true)
    // Parallel and outside inflated bounds
    expect(segmentIntersectsRoom(p(-20, 150), p(120, 150), r, 20)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { generateGridMap } from '../index'
import type { GridGeneratorResult } from '../index'
import type { RoomPlacement } from '../types'
import { TileType, type GridCanvas } from '../types'

function requirePlacement(
  result: GridGeneratorResult,
  roomType: string
): RoomPlacement {
  const placement = result.placements?.find(room => room.roomType === roomType)
  expect(placement, `missing required ${roomType} placement`).toBeDefined()
  return placement!
}

function centerOf(room: RoomPlacement): { x: number; y: number } {
  return {
    x: room.bounds.x + room.bounds.width / 2,
    y: room.bounds.y + room.bounds.height / 2,
  }
}

function distanceFromCanvasCenter(
  result: GridGeneratorResult,
  room: RoomPlacement
): number {
  const center = centerOf(room)
  return Math.hypot(
    center.x - result.canvas!.width / 2,
    center.y - result.canvas!.height / 2
  )
}

function touchesHullBoundary(canvas: GridCanvas, room: RoomPlacement): boolean {
  const isVoidOrOutside = (x: number, y: number) => (
    x < 0 ||
    y < 0 ||
    x >= canvas.width ||
    y >= canvas.height ||
    canvas.tiles[y][x].type === TileType.VOID
  )

  for (let x = room.bounds.x; x < room.bounds.x + room.bounds.width; x += 1) {
    if (isVoidOrOutside(x, room.bounds.y - 1)) return true
    if (isVoidOrOutside(x, room.bounds.y + room.bounds.height)) return true
  }
  for (let y = room.bounds.y; y < room.bounds.y + room.bounds.height; y += 1) {
    if (isVoidOrOutside(room.bounds.x - 1, y)) return true
    if (isVoidOrOutside(room.bounds.x + room.bounds.width, y)) return true
  }

  return false
}

describe('active functional placement grammar', () => {
  it('keeps a ship bridge toward the bow and machinery toward the stern', () => {
    const result = generateGridMap({
      seed: 'functional-ship-axis',
      archetype: 'ship',
      subtype: 'freighter',
      sizeTier: 'lg',
    })
    expect(result.success, result.error).toBe(true)

    const bridge = requirePlacement(result, 'bridge')
    const reactor = requirePlacement(result, 'reactor')
    const engineRoom = requirePlacement(result, 'engineRoom')
    const bridgeY = centerOf(bridge).y
    const reactorY = centerOf(reactor).y
    const engineY = centerOf(engineRoom).y

    expect(bridgeY).toBeLessThan(result.canvas!.height * 0.45)
    expect(reactorY).toBeGreaterThan(result.canvas!.height * 0.5)
    expect(engineY).toBeGreaterThan(result.canvas!.height * 0.5)
    expect(bridgeY).toBeLessThan(Math.min(reactorY, engineY))
  })

  it('places station command inside docking access without exact-coordinate coupling', () => {
    const result = generateGridMap({
      seed: 'functional-station-radius',
      archetype: 'station',
      subtype: 'trading',
      sizeTier: 'lg',
    })
    expect(result.success, result.error).toBe(true)

    const bridge = requirePlacement(result, 'bridge')
    const dockingBay = requirePlacement(result, 'dockingBay')
    const bridgeRadius = distanceFromCanvasCenter(result, bridge)
    const dockingRadius = distanceFromCanvasCenter(result, dockingBay)
    const usableRadius = Math.min(result.canvas!.width, result.canvas!.height) / 2

    expect(bridgeRadius).toBeLessThan(dockingRadius)
    expect(bridgeRadius).toBeLessThan(usableRadius * 0.6)
    expect(dockingRadius).toBeGreaterThan(usableRadius * 0.55)
    expect(touchesHullBoundary(result.canvas!, dockingBay)).toBe(true)
  }, 15_000)

  it('uses the clustered outpost hub for command and preserves module-zone diversity', () => {
    const result = generateGridMap({
      seed: 'functional-outpost-modules',
      archetype: 'outpost',
      subtype: 'science',
      sizeTier: 'lg',
    })
    expect(result.success, result.error).toBe(true)

    const bridge = requirePlacement(result, 'bridge')
    const bridgeRadius = distanceFromCanvasCenter(result, bridge)
    const nonMainRooms = result.placements!.filter(room => room.zone !== 'main')
    const nonMainRadii = nonMainRooms.map(room =>
      distanceFromCanvasCenter(result, room)
    )
    const zoneIds = new Set(result.placements!.map(room => room.zone))

    expect(bridge.zone).toBe('main')
    expect(nonMainRooms.length).toBeGreaterThan(0)
    expect(zoneIds.size).toBeGreaterThanOrEqual(2)
    expect(nonMainRadii.some(radius => radius > bridgeRadius)).toBe(true)
  })

  it('is deterministic for functional room bounds and assigned zones', () => {
    const options = {
      seed: 'functional-placement-determinism',
      archetype: 'station' as const,
      subtype: 'trading',
      sizeTier: 'lg' as const,
    }
    const first = generateGridMap(options)
    const second = generateGridMap(options)

    const project = (result: GridGeneratorResult) => result.placements!.map(room => ({
      roomId: room.roomId,
      roomType: room.roomType,
      bounds: room.bounds,
      zone: room.zone,
    }))

    expect(first.success, first.error).toBe(true)
    expect(second.success, second.error).toBe(true)
    expect(project(first)).toEqual(project(second))
  }, 15_000)
})

import { describe, expect, it } from 'vitest'
import { GEOMETRY_UNITS_PER_CELL } from '../../../domain/geometryUnits'
import type { Ring } from '../../../geometry/types'
import type { GenerationRequest, MapJSON, RoomProgram } from '../../types'
import { ARCHETYPE_CONFIGS } from '../../roomConfigs'
import { createCanvasCustom, setTileType } from '../canvas'
import { convertToMapJSON } from '../convert'
import { extractFacilityEnvelope } from '../geometry'
import { generateGridMap } from '../index'
import { TileType } from '../types'

function signedArea(ring: Ring): number {
  let twiceArea = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return twiceArea / 2
}

describe('extractFacilityEnvelope', () => {
  it('merges occupied cells and scales the simplified outline to canonical units', () => {
    const canvas = createCanvasCustom(5, 4, 'ship', 'xs')
    for (let y = 1; y <= 2; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        setTileType(canvas, x, y, TileType.HULL)
      }
    }

    expect(extractFacilityEnvelope(canvas)).toEqual({
      polygons: [
        {
          outer: [
            { x: 1024, y: 1024 },
            { x: 4096, y: 1024 },
            { x: 4096, y: 3072 },
            { x: 1024, y: 3072 },
          ],
        },
      ],
    })
  })

  it('preserves enclosed VOID regions as holes with opposite winding', () => {
    const canvas = createCanvasCustom(5, 5, 'station', 'xs')
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x !== 2 || y !== 2) {
          setTileType(canvas, x, y, TileType.FLOOR)
        }
      }
    }

    const envelope = extractFacilityEnvelope(canvas)
    expect(envelope.polygons).toHaveLength(1)
    expect(envelope.polygons[0].outer).toHaveLength(4)
    expect(envelope.polygons[0].holes).toHaveLength(1)
    expect(envelope.polygons[0].holes?.[0]).toHaveLength(4)
    expect(signedArea(envelope.polygons[0].outer)).toBeGreaterThan(0)
    expect(signedArea(envelope.polygons[0].holes![0])).toBeLessThan(0)
  })

  it('keeps disconnected and diagonally touching components as separate polygons', () => {
    const canvas = createCanvasCustom(4, 4, 'outpost', 'xs')
    setTileType(canvas, 0, 0, TileType.HULL)
    setTileType(canvas, 1, 1, TileType.CORRIDOR)
    setTileType(canvas, 3, 3, TileType.DOOR)

    const envelope = extractFacilityEnvelope(canvas)
    expect(envelope.polygons).toHaveLength(3)
    expect(envelope.polygons.every(polygon => polygon.outer.length === 4)).toBe(true)
  })

  it('returns an empty MultiPolygon for an empty canvas', () => {
    const canvas = createCanvasCustom(3, 3, 'ship', 'xs')
    expect(extractFacilityEnvelope(canvas)).toEqual({ polygons: [] })
  })
})

describe('convertToMapJSON geometry bridge', () => {
  const request: GenerationRequest = {
    seed: 'geometry-test',
    archetype: 'ship',
    subtype: 'courier',
    styleProfile: 'utilitarian',
    sizeTier: 'xs',
  }
  const roomProgram: RoomProgram = {
    rooms: [],
    totalRooms: 0,
    totalEstimatedTiles: 0,
    zoneDistribution: {},
    connectorHints: [],
  }

  it('serializes a canonical envelope independently from pixel tile size', () => {
    const canvas = createCanvasCustom(3, 2, 'ship', 'xs', 77)
    setTileType(canvas, 1, 0, TileType.HULL)

    const map = convertToMapJSON(canvas, [], [], request, roomProgram)
    expect(map.decks[0].geometry).toEqual({
      unitsPerCell: GEOMETRY_UNITS_PER_CELL,
      facilityEnvelope: {
        polygons: [
          {
            outer: [
              { x: 1024, y: 0 },
              { x: 2048, y: 0 },
              { x: 2048, y: 1024 },
              { x: 1024, y: 1024 },
            ],
          },
        ],
      },
      structuralVoids: [],
    })
  })

  it('keeps geometry optional for legacy MapJSON decks', () => {
    const legacyDeck: MapJSON['decks'][number] = {
      index: 0,
      label: 'Legacy Deck',
      gridWidth: 1,
      gridHeight: 1,
      rooms: [],
      connectors: [],
      junctions: [],
    }

    expect(legacyDeck.geometry).toBeUndefined()
  })
})

describe('habitat station integration', () => {
  it('exposes Habitat Ring and generates an envelope with an inner hole', () => {
    const habitat = ARCHETYPE_CONFIGS.station.subtypes.find(
      subtype => subtype.id === 'habitat'
    )

    expect(habitat).toEqual({
      id: 'habitat',
      label: 'Habitat Ring',
      additionalCores: ['quarters', 'medbay'],
      bonusRooms: ['commonArea', 'messhall', 'head', 'market'],
    })

    const result = generateGridMap({
      seed: 'habitat-ring-envelope',
      archetype: 'station',
      subtype: 'habitat',
      sizeTier: 'md',
    })

    expect(result.success).toBe(true)
    const polygons = result.map!.decks[0].geometry!.facilityEnvelope.polygons
    expect(
      polygons.some(polygon => (polygon.holes?.length ?? 0) > 0)
    ).toBe(true)
  })
})

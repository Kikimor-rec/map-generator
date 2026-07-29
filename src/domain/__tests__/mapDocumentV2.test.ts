import { describe, expect, it } from 'vitest'
import type { MultiPolygon } from '../../geometry/types'
import {
  CURRENT_GENERATOR_VERSION,
  GEOMETRY_UNITS_PER_CELL,
  MAP_DOCUMENT_V2_FORMAT,
  MAP_DOCUMENT_V2_SCHEMA_VERSION,
  cellsToGeometryUnits,
  createMapDocumentV2,
  geometryUnits,
  geometryUnitsToCells,
  normalizeMapDocumentV2,
} from '..'

function rectangle(): MultiPolygon {
  return {
    polygons: [
      {
        outer: [
          { x: 0, y: 0 },
          { x: 4 * GEOMETRY_UNITS_PER_CELL, y: 0 },
          {
            x: 4 * GEOMETRY_UNITS_PER_CELL,
            y: 2 * GEOMETRY_UNITS_PER_CELL,
          },
          { x: 0, y: 2 * GEOMETRY_UNITS_PER_CELL },
          { x: 0, y: 0 },
        ],
        holes: [],
      },
    ],
  }
}

function documentContent() {
  return {
    id: ' map-1 ',
    archetype: 'ship' as const,
    facilityEnvelope: {
      id: ' hull-1 ',
      archetype: 'ship' as const,
      geometry: rectangle(),
    },
    structuralVoids: [
      {
        id: ' reactor-keepout ',
        kind: 'machinery' as const,
        geometry: rectangle(),
        traversable: false,
        visibleToPlayer: true,
      },
    ],
    zonePolygons: [
      {
        id: ' engineering-zone ',
        role: ' engineering ',
        geometry: rectangle(),
        adjacencyConstraints: [
          { kind: 'prefer' as const, targetRole: ' cargo ', weight: 2 },
        ],
      },
    ],
  }
}

describe('geometry units', () => {
  it('converts cells to the fixed-point scale without losing exact fractions', () => {
    expect(cellsToGeometryUnits(1)).toBe(1024)
    expect(cellsToGeometryUnits(0.5)).toBe(512)
    expect(geometryUnitsToCells(cellsToGeometryUnits(2.25))).toBe(2.25)
  })

  it('rejects values that cannot be represented by safe integer units', () => {
    expect(() => cellsToGeometryUnits(0.1)).toThrow(/safe integer/)
    expect(() => geometryUnits(1.5)).toThrow(/safe integer/)
    expect(() => geometryUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe integer/
    )
  })
})

describe('MapDocumentV2', () => {
  it('creates stable metadata and normalizes entity strings and rings', () => {
    const source = documentContent()
    const document = createMapDocumentV2(source)

    expect(document).toMatchObject({
      format: MAP_DOCUMENT_V2_FORMAT,
      schemaVersion: MAP_DOCUMENT_V2_SCHEMA_VERSION,
      generatorVersion: CURRENT_GENERATOR_VERSION,
      units: {
        kind: 'fixed-point-grid',
        unitsPerCell: 1024,
      },
      id: 'map-1',
      archetype: 'ship',
      facilityEnvelope: {
        id: 'hull-1',
        archetype: 'ship',
      },
    })
    expect(document.facilityEnvelope.geometry.polygons[0].outer).toHaveLength(4)
    expect(document.zonePolygons[0].role).toBe('engineering')
    expect(document.zonePolygons[0].adjacencyConstraints[0]).toEqual({
      kind: 'prefer',
      targetRole: 'cargo',
      weight: 2,
    })

    expect(source.id).toBe(' map-1 ')
    expect(source.facilityEnvelope.geometry.polygons[0].outer).toHaveLength(5)
  })

  it('rejects malformed geometry and identity collisions', () => {
    const duplicateIds = documentContent()
    duplicateIds.structuralVoids[0].id = ' hull-1 '

    expect(() => createMapDocumentV2(duplicateIds)).toThrow(
      /Duplicate stable id/
    )

    const fractionalCoordinate = documentContent()
    fractionalCoordinate.facilityEnvelope.geometry.polygons[0].outer[1].x = 1.5

    expect(() => createMapDocumentV2(fractionalCoordinate)).toThrow(
      /safe integer/
    )
  })

  it('rejects an envelope from another archetype', () => {
    const source = documentContent()
    source.facilityEnvelope.archetype = 'station' as 'ship'

    expect(() => createMapDocumentV2(source)).toThrow(
      /does not match document archetype/
    )
  })

  it('normalizes a V2 document without mutating the imported value', () => {
    const original = createMapDocumentV2(documentContent())
    const imported = {
      ...original,
      generatorVersion: ' custom-generator ',
      facilityEnvelope: {
        ...original.facilityEnvelope,
        id: ' hull-imported ',
      },
    }

    const normalized = normalizeMapDocumentV2(imported)

    expect(normalized.generatorVersion).toBe('custom-generator')
    expect(normalized.facilityEnvelope.id).toBe('hull-imported')
    expect(imported.generatorVersion).toBe(' custom-generator ')
  })

  it('rejects unknown runtime schema metadata instead of guessing a migration', () => {
    const original = createMapDocumentV2(documentContent())
    const wrongSchema = {
      ...original,
      schemaVersion: 3,
    } as unknown as typeof original

    expect(() => normalizeMapDocumentV2(wrongSchema)).toThrow(
      /schema version/
    )
  })
})

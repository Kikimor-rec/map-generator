import { describe, expect, it } from 'vitest'
import type { DeckGeometry } from '@core/types'
import { GEOMETRY_UNITS_PER_CELL } from '../../../domain/geometryUnits'
import { convertToEditorFormat } from '../../../generators/generator'
import { generateGridMap } from '../../../generators/gridGenerator'
import { buildDeckGeometryRenderPaths } from '../deckGeometry'

const square = (left: number, top: number, right: number, bottom: number) => ({
  polygons: [{
    outer: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  }],
})

describe('buildDeckGeometryRenderPaths', () => {
  it('returns empty paths for legacy decks without geometry', () => {
    expect(buildDeckGeometryRenderPaths(undefined, 40)).toEqual({
      envelope: [],
      structuralVoids: [],
    })
  })

  it('projects canonical geometry units into editor pixels', () => {
    const geometry: DeckGeometry = {
      unitsPerCell: GEOMETRY_UNITS_PER_CELL,
      facilityEnvelope: square(
        0,
        0,
        GEOMETRY_UNITS_PER_CELL * 2,
        GEOMETRY_UNITS_PER_CELL
      ),
      structuralVoids: [],
    }

    const paths = buildDeckGeometryRenderPaths(geometry, 40)

    expect(paths.envelope[0].outer).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 0, y: 40 },
    ])
  })

  it('preserves envelope holes and structural void polygons', () => {
    const geometry: DeckGeometry = {
      unitsPerCell: GEOMETRY_UNITS_PER_CELL,
      facilityEnvelope: {
        polygons: [{
          outer: square(0, 0, 4096, 4096).polygons[0].outer,
          holes: [square(1024, 1024, 2048, 2048).polygons[0].outer],
        }],
      },
      structuralVoids: [square(2048, 2048, 3072, 3072)],
    }

    const paths = buildDeckGeometryRenderPaths(geometry, 32)

    expect(paths.envelope[0].holes[0]).toEqual([
      { x: 32, y: 32 },
      { x: 64, y: 32 },
      { x: 64, y: 64 },
      { x: 32, y: 64 },
    ])
    expect(paths.structuralVoids[0].outer).toEqual([
      { x: 64, y: 64 },
      { x: 96, y: 64 },
      { x: 96, y: 96 },
      { x: 64, y: 96 },
    ])
  })

  it('rejects invalid display scale without throwing', () => {
    const geometry: DeckGeometry = {
      unitsPerCell: 0,
      facilityEnvelope: square(0, 0, 1024, 1024),
      structuralVoids: [],
    }

    const paths = buildDeckGeometryRenderPaths(geometry, 40)
    expect(paths.envelope).toEqual([])
  })

  it('preserves generated geometry through the editor adapter', () => {
    const result = generateGridMap({
      seed: 'deck-geometry-editor-adapter',
      archetype: 'ship',
      sizeTier: 'sm',
    })

    expect(result.success).toBe(true)
    const editorData = convertToEditorFormat(result.map!)
    expect(editorData.geometry).toEqual(result.map!.decks[0].geometry)
  })
})

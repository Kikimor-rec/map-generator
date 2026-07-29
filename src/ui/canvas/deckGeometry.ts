import type { DeckGeometry, Point } from '@core/types'
import type { MultiPolygon, Ring } from '../../geometry/types'

export interface RenderPolygon {
  outer: Point[]
  holes: Point[][]
}

export interface DeckGeometryRenderPaths {
  envelope: RenderPolygon[]
  structuralVoids: RenderPolygon[]
}

function ringToPixels(
  ring: Ring,
  gridSize: number,
  unitsPerCell: number
): Point[] {
  if (!Number.isFinite(unitsPerCell) || unitsPerCell <= 0) return []

  const pixelsPerUnit = gridSize / unitsPerCell
  return ring.map(point => ({
    x: point.x * pixelsPerUnit,
    y: point.y * pixelsPerUnit,
  }))
}

function multiPolygonToPixels(
  geometry: MultiPolygon,
  gridSize: number,
  unitsPerCell: number
): RenderPolygon[] {
  return geometry.polygons
    .map(polygon => ({
      outer: ringToPixels(polygon.outer, gridSize, unitsPerCell),
      holes: (polygon.holes ?? []).map(hole =>
        ringToPixels(hole, gridSize, unitsPerCell)
      ),
    }))
    .filter(polygon => polygon.outer.length >= 3)
}

/**
 * Pure projection from canonical fixed-point deck geometry into editor pixels.
 * Missing geometry is the normal legacy-project case.
 */
export function buildDeckGeometryRenderPaths(
  geometry: DeckGeometry | undefined,
  gridSize: number
): DeckGeometryRenderPaths {
  if (!geometry || !Number.isFinite(gridSize) || gridSize <= 0) {
    return { envelope: [], structuralVoids: [] }
  }

  return {
    envelope: multiPolygonToPixels(
      geometry.facilityEnvelope,
      gridSize,
      geometry.unitsPerCell
    ),
    structuralVoids: geometry.structuralVoids.flatMap(structuralVoid =>
      multiPolygonToPixels(structuralVoid, gridSize, geometry.unitsPerCell)
    ),
  }
}

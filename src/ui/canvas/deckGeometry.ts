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

export interface BlueprintSectionLine {
  start: Point
  end: Point
  major: boolean
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


/**
 * Produces a restrained large-module drafting grid for the hull substrate.
 * Rendering clips these lines to the canonical envelope; tactical cell
 * geometry and serialized map data are not modified.
 */
export function buildBlueprintSectionLines(
  paths: DeckGeometryRenderPaths,
  gridSize: number
): BlueprintSectionLine[] {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return []

  const spacing = gridSize * 4
  const lines: BlueprintSectionLine[] = []

  for (const polygon of paths.envelope) {
    if (polygon.outer.length < 3) continue
    const xs = polygon.outer.map(point => point.x)
    const ys = polygon.outer.map(point => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    for (let x = Math.ceil(minX / spacing) * spacing; x < maxX; x += spacing) {
      lines.push({
        start: { x, y: minY },
        end: { x, y: maxY },
        major: Math.abs(x - centerX) < spacing / 2,
      })
    }
    for (let y = Math.ceil(minY / spacing) * spacing; y < maxY; y += spacing) {
      lines.push({
        start: { x: minX, y },
        end: { x: maxX, y },
        major: Math.abs(y - centerY) < spacing / 2,
      })
    }
  }

  return lines
}

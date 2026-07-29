/**
 * Canonical integer geometry primitives.
 *
 * Coordinates use fixed-point geometry units. The domain layer owns the
 * document-level unit declaration; this module only requires safe integers at
 * rasterization boundaries.
 */
export interface IntPoint {
  readonly x: number
  readonly y: number
}

export type Ring = readonly IntPoint[]

export interface Polygon {
  readonly outer: Ring
  readonly holes?: readonly Ring[]
}

export interface MultiPolygon {
  readonly polygons: readonly Polygon[]
}

export type PolygonGeometry = Polygon | MultiPolygon

// Descriptive aliases for call sites that prefer explicit geometry names.
export type GeometryPoint = IntPoint
export type LinearRing = Ring

export interface RasterGrid {
  readonly width: number
  readonly height: number
  readonly cellSize: number
  readonly origin?: IntPoint
}

/**
 * `structuralVoids` contains geometry that blocks occupancy. Domain entities
 * explicitly marked traversable must be filtered by the caller.
 */
export interface FacilityMaskInput {
  readonly envelope: PolygonGeometry
  readonly structuralVoids?: readonly PolygonGeometry[]
}

/**
 * Derived occupancy caches. A value of 1 means the cell belongs to the mask.
 *
 * `usable` is always `envelope AND NOT structuralVoids`.
 */
export interface FacilityMasks {
  readonly width: number
  readonly height: number
  readonly cellSize: number
  readonly origin: IntPoint
  readonly envelope: Uint8Array
  readonly structuralVoids: Uint8Array
  readonly usable: Uint8Array
}

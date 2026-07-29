const geometryUnitsBrand: unique symbol = Symbol('GeometryUnits')

/**
 * Renderer-independent fixed-point coordinate.
 *
 * The brand prevents accidental mixing with pixels or grid-cell coordinates
 * while retaining a plain JSON number at runtime.
 */
export type GeometryUnits = number & {
  readonly [geometryUnitsBrand]: 'GeometryUnits'
}

export const GEOMETRY_UNITS_PER_CELL = 1024 as const

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, received ${value}`)
  }
}

export function geometryUnits(value: number): GeometryUnits {
  assertSafeInteger(value, 'Geometry units')
  return value as GeometryUnits
}

export function cellsToGeometryUnits(cells: number): GeometryUnits {
  if (!Number.isFinite(cells)) {
    throw new RangeError(`Grid cells must be finite, received ${cells}`)
  }

  const units = cells * GEOMETRY_UNITS_PER_CELL
  assertSafeInteger(units, 'Converted geometry units')
  return units as GeometryUnits
}

export function geometryUnitsToCells(units: GeometryUnits): number {
  return units / GEOMETRY_UNITS_PER_CELL
}

export interface GeometryUnitSystem {
  readonly kind: 'fixed-point-grid'
  readonly unitsPerCell: typeof GEOMETRY_UNITS_PER_CELL
}

export const MAP_DOCUMENT_V2_UNITS: GeometryUnitSystem = Object.freeze({
  kind: 'fixed-point-grid',
  unitsPerCell: GEOMETRY_UNITS_PER_CELL,
})

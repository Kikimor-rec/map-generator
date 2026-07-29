import type {
  IntPoint,
  MultiPolygon,
  Polygon,
  Ring,
} from '../geometry/types'
import {
  geometryUnits,
  MAP_DOCUMENT_V2_UNITS,
  type GeometryUnitSystem,
} from './geometryUnits'

export const MAP_DOCUMENT_V2_FORMAT = 'sci-fi-map-document' as const
export const MAP_DOCUMENT_V2_SCHEMA_VERSION = 2 as const
export const CURRENT_GENERATOR_VERSION = '0.1.0' as const

const stableIdBrand: unique symbol = Symbol('StableId')
export type StableId = string & { readonly [stableIdBrand]: 'StableId' }

export type MapArchetype = 'ship' | 'station' | 'outpost'

export interface FacilityEnvelope {
  readonly id: StableId
  readonly archetype: MapArchetype
  readonly geometry: MultiPolygon
}

export type StructuralVoidKind =
  | 'armor'
  | 'fuel'
  | 'machinery'
  | 'shaft'
  | 'vacuum'
  | 'terrain'
  | 'restricted'
  | 'other'

export interface StructuralVoid {
  readonly id: StableId
  readonly kind: StructuralVoidKind
  readonly geometry: MultiPolygon
  readonly traversable: boolean
  readonly visibleToPlayer: boolean
}

export type ZoneAdjacencyKind = 'require' | 'prefer' | 'avoid'

export interface ZoneAdjacencyConstraint {
  readonly kind: ZoneAdjacencyKind
  readonly targetRole: string
  readonly weight?: number
}

export interface ZonePolygon {
  readonly id: StableId
  readonly role: string
  readonly geometry: MultiPolygon
  readonly adjacencyConstraints: readonly ZoneAdjacencyConstraint[]
}

export interface MapDocumentV2 {
  readonly format: typeof MAP_DOCUMENT_V2_FORMAT
  readonly schemaVersion: typeof MAP_DOCUMENT_V2_SCHEMA_VERSION
  readonly generatorVersion: string
  readonly units: GeometryUnitSystem
  readonly id: StableId
  readonly archetype: MapArchetype
  readonly facilityEnvelope: FacilityEnvelope
  readonly structuralVoids: readonly StructuralVoid[]
  readonly zonePolygons: readonly ZonePolygon[]
}

export interface MapDocumentV2Content {
  readonly id: string
  readonly archetype: MapArchetype
  readonly facilityEnvelope: Omit<FacilityEnvelope, 'id'> & {
    readonly id: string
  }
  readonly structuralVoids?: readonly (
    Omit<StructuralVoid, 'id'> & { readonly id: string }
  )[]
  readonly zonePolygons?: readonly (
    Omit<ZonePolygon, 'id' | 'adjacencyConstraints'> & {
      readonly id: string
      readonly adjacencyConstraints?: readonly ZoneAdjacencyConstraint[]
    }
  )[]
  readonly generatorVersion?: string
}

export function stableId(value: string): StableId {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new TypeError('Stable id must not be empty')
  }
  return normalized as StableId
}

function normalizeGeneratorVersion(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new TypeError('Generator version must not be empty')
  }
  return normalized
}

function pointsEqual(left: IntPoint, right: IntPoint): boolean {
  return left.x === right.x && left.y === right.y
}

function normalizePoint(point: IntPoint): IntPoint {
  return {
    x: geometryUnits(point.x),
    y: geometryUnits(point.y),
  }
}

/**
 * Produces an open ring (the first vertex is not repeated at the end), removes
 * consecutive duplicates, and validates fixed-point integer coordinates.
 */
export function normalizeRing(ring: Ring): Ring {
  const result: IntPoint[] = []

  for (const sourcePoint of ring) {
    const point = normalizePoint(sourcePoint)
    if (result.length === 0 || !pointsEqual(result[result.length - 1], point)) {
      result.push(point)
    }
  }

  if (result.length > 1 && pointsEqual(result[0], result[result.length - 1])) {
    result.pop()
  }

  if (result.length < 3) {
    throw new TypeError('A ring must contain at least three distinct vertices')
  }

  const twiceArea = result.reduce((sum, point, index) => {
    const next = result[(index + 1) % result.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0)

  if (!Number.isFinite(twiceArea) || twiceArea === 0) {
    throw new TypeError('A ring must enclose a non-zero finite area')
  }

  return result
}

export function normalizePolygon(polygon: Polygon): Polygon {
  return {
    outer: normalizeRing(polygon.outer),
    holes: (polygon.holes ?? []).map(normalizeRing),
  }
}

export function normalizeMultiPolygon(geometry: MultiPolygon): MultiPolygon {
  if (geometry.polygons.length === 0) {
    throw new TypeError('A multipolygon must contain at least one polygon')
  }

  return {
    polygons: geometry.polygons.map(normalizePolygon),
  }
}

function normalizeFacilityEnvelope(
  envelope: MapDocumentV2Content['facilityEnvelope'],
  archetype: MapArchetype
): FacilityEnvelope {
  if (envelope.archetype !== archetype) {
    throw new TypeError(
      `Envelope archetype ${envelope.archetype} does not match document archetype ${archetype}`
    )
  }

  return {
    id: stableId(envelope.id),
    archetype,
    geometry: normalizeMultiPolygon(envelope.geometry),
  }
}

function normalizeStructuralVoid(
  structuralVoid: NonNullable<
    MapDocumentV2Content['structuralVoids']
  >[number]
): StructuralVoid {
  return {
    id: stableId(structuralVoid.id),
    kind: structuralVoid.kind,
    geometry: normalizeMultiPolygon(structuralVoid.geometry),
    traversable: structuralVoid.traversable,
    visibleToPlayer: structuralVoid.visibleToPlayer,
  }
}

function normalizeZone(
  zone: NonNullable<MapDocumentV2Content['zonePolygons']>[number]
): ZonePolygon {
  const role = zone.role.trim()
  if (role.length === 0) {
    throw new TypeError('Zone role must not be empty')
  }

  return {
    id: stableId(zone.id),
    role,
    geometry: normalizeMultiPolygon(zone.geometry),
    adjacencyConstraints: (zone.adjacencyConstraints ?? []).map(constraint => {
      const targetRole = constraint.targetRole.trim()
      if (targetRole.length === 0) {
        throw new TypeError('Zone adjacency target role must not be empty')
      }
      if (
        constraint.weight !== undefined &&
        (!Number.isFinite(constraint.weight) || constraint.weight < 0)
      ) {
        throw new RangeError('Zone adjacency weight must be finite and non-negative')
      }

      return {
        kind: constraint.kind,
        targetRole,
        ...(constraint.weight === undefined
          ? {}
          : { weight: constraint.weight }),
      }
    }),
  }
}

function assertUniqueEntityIds(document: MapDocumentV2): void {
  const ids = new Set<string>()
  const entities = [
    document.id,
    document.facilityEnvelope.id,
    ...document.structuralVoids.map(item => item.id),
    ...document.zonePolygons.map(item => item.id),
  ]

  for (const id of entities) {
    if (ids.has(id)) {
      throw new TypeError(`Duplicate stable id: ${id}`)
    }
    ids.add(id)
  }
}

export function createMapDocumentV2(
  content: MapDocumentV2Content
): MapDocumentV2 {
  const document: MapDocumentV2 = {
    format: MAP_DOCUMENT_V2_FORMAT,
    schemaVersion: MAP_DOCUMENT_V2_SCHEMA_VERSION,
    generatorVersion: normalizeGeneratorVersion(
      content.generatorVersion ?? CURRENT_GENERATOR_VERSION
    ),
    units: MAP_DOCUMENT_V2_UNITS,
    id: stableId(content.id),
    archetype: content.archetype,
    facilityEnvelope: normalizeFacilityEnvelope(
      content.facilityEnvelope,
      content.archetype
    ),
    structuralVoids: (content.structuralVoids ?? []).map(normalizeStructuralVoid),
    zonePolygons: (content.zonePolygons ?? []).map(normalizeZone),
  }

  assertUniqueEntityIds(document)
  return document
}

/**
 * Rebuilds an already-shaped V2 document at runtime boundaries. This rejects
 * mismatched format/schema/units instead of silently upgrading unknown data.
 * Persistence migrations remain a separate concern.
 */
export function normalizeMapDocumentV2(document: MapDocumentV2): MapDocumentV2 {
  if (document.format !== MAP_DOCUMENT_V2_FORMAT) {
    throw new TypeError(`Unsupported map document format: ${document.format}`)
  }
  if (document.schemaVersion !== MAP_DOCUMENT_V2_SCHEMA_VERSION) {
    throw new TypeError(
      `Unsupported map document schema version: ${document.schemaVersion}`
    )
  }
  if (
    document.units.kind !== MAP_DOCUMENT_V2_UNITS.kind ||
    document.units.unitsPerCell !== MAP_DOCUMENT_V2_UNITS.unitsPerCell
  ) {
    throw new TypeError('Unsupported map document geometry units')
  }

  return createMapDocumentV2(document)
}

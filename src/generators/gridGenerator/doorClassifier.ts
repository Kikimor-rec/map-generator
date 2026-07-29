/**
 * Pure door/access semantics classifier.
 *
 * The result uses door names already accepted by `Port.doorType` and connector
 * kinds already present in MapJSON. It does not mutate the grid or require a
 * schema migration.
 */

import type { ConnectorKind } from '../types'

export type DoorSemantic = 'standard' | 'bulkhead' | 'secure' | 'airlock'
export type ExteriorProximity = 'interior' | 'near-hull' | 'boundary'
export type AccessBand = 'public' | 'crew' | 'restricted' | 'secure'

export type DoorClassificationReason =
  | 'exterior-boundary'
  | 'exterior-egress'
  | 'airlock-room'
  | 'secure-access-level'
  | 'access-transition'
  | 'secure-room'
  | 'secure-zone'
  | 'containment-zone-boundary'
  | 'containment-room'
  | 'exterior-room-boundary'
  | 'ordinary-interior'

export interface DoorRoomContext {
  readonly id?: string
  readonly roomType: string
  readonly zone: string
  /** Numeric access level used by ProgrammedRoom: 0 public through 3 secure. */
  readonly accessLevel: number
  readonly isExterior?: boolean
  readonly tags?: readonly string[]
}

export interface DoorClassificationInput {
  /** Stable connector/port id; used to derive persistent access metadata id. */
  readonly connectionId: string
  readonly room: DoorRoomContext
  readonly neighbor?: DoorRoomContext
  readonly exteriorProximity: ExteriorProximity
}

export interface DoorAccessMetadata {
  readonly version: 1
  readonly accessId: string
  readonly requiredLevel: 0 | 1 | 2 | 3
  readonly requiredAccess: AccessBand
  readonly lockLevel: 0 | 1 | 2 | 3
  readonly failsafe: boolean
  readonly lockedByDefault: boolean
  readonly pressureBoundary: boolean
  readonly interlocked: boolean
  readonly checkpoint: boolean
  readonly reasons: readonly DoorClassificationReason[]
}

export interface DoorClassification {
  /** Compatible with the existing free-form Port.doorType field. */
  readonly semantic: DoorSemantic
  /** Compatible with LayoutConnector.kind / MapJSON ConnectorKind. */
  readonly connectorKind: Extract<ConnectorKind, 'door' | 'airlock' | 'bulkhead'>
  readonly access: DoorAccessMetadata
}

const AIRLOCK_ROOM_TYPES = new Set([
  'airlock',
])

const SECURE_ROOM_TYPES = new Set([
  'aicore',
  'armory',
  'blacksite',
  'bridge',
  'brig',
  'cic',
  'powercore',
  'reactor',
  'security',
  'securitystation',
  'tacticalcenter',
  'weaponscontrol',
])

const CONTAINMENT_ROOM_TYPES = new Set([
  'airlock',
  'cargobay',
  'dockingbay',
  'engineering',
  'hangar',
  'hazardstorage',
  'lifesupport',
  'maintenance',
  'powercore',
  'quarantine',
  'reactor',
])

const SECURE_ZONES = new Set([
  'blacksite',
  'restricted',
  'secure',
  'security',
])

const CONTAINMENT_ZONES = new Set([
  'cargo',
  'docking',
  'engineering',
  'exterior',
  'hazard',
  'hazardous',
  'industrial',
  'quarantine',
  'reactor',
  'utilities',
])

const SECURE_TAGS = new Set([
  'classified',
  'restricted',
  'secure',
  'security',
])

const CONTAINMENT_TAGS = new Set([
  'containment',
  'engineering',
  'exterior',
  'hazard',
  'pressure',
  'reactor',
])

const REASON_ORDER: readonly DoorClassificationReason[] = [
  'exterior-boundary',
  'exterior-egress',
  'airlock-room',
  'secure-access-level',
  'access-transition',
  'secure-room',
  'secure-zone',
  'containment-zone-boundary',
  'containment-room',
  'exterior-room-boundary',
  'ordinary-interior',
]

const ACCESS_BANDS: readonly AccessBand[] = [
  'public',
  'crew',
  'restricted',
  'secure',
]

export function classifyDoor(
  input: DoorClassificationInput
): DoorClassification {
  const room = normalizeRoom(input.room)
  const neighbor = input.neighbor ? normalizeRoom(input.neighbor) : undefined
  const contexts = neighbor ? [room, neighbor] : [room]
  const accessLevels = contexts.map(context => context.accessLevel)
  const maxAccessLevel = Math.max(...accessLevels)
  const accessDifference = neighbor
    ? Math.abs(room.accessLevel - neighbor.accessLevel)
    : 0
  const zoneBoundary = !!neighbor && room.zone !== neighbor.zone

  const airlockReasons = new Set<DoorClassificationReason>()
  if (input.exteriorProximity === 'boundary') {
    airlockReasons.add('exterior-boundary')
  }
  if (
    !neighbor &&
    room.isExterior &&
    input.exteriorProximity !== 'interior'
  ) {
    airlockReasons.add('exterior-egress')
  }
  if (contexts.some(context => AIRLOCK_ROOM_TYPES.has(context.roomType))) {
    airlockReasons.add('airlock-room')
  }

  if (airlockReasons.size > 0) {
    return buildClassification(
      input.connectionId,
      'airlock',
      maxAccessLevel,
      airlockReasons
    )
  }

  const secureReasons = new Set<DoorClassificationReason>()
  if (maxAccessLevel >= 3) secureReasons.add('secure-access-level')
  if (accessDifference >= 2) secureReasons.add('access-transition')
  if (contexts.some(isSecureRoom)) secureReasons.add('secure-room')
  if (contexts.some(context => SECURE_ZONES.has(context.zone))) {
    secureReasons.add('secure-zone')
  }

  if (secureReasons.size > 0) {
    return buildClassification(
      input.connectionId,
      'secure',
      Math.max(2, maxAccessLevel),
      secureReasons
    )
  }

  const bulkheadReasons = new Set<DoorClassificationReason>()
  if (
    zoneBoundary &&
    contexts.some(context => CONTAINMENT_ZONES.has(context.zone))
  ) {
    bulkheadReasons.add('containment-zone-boundary')
  }
  if (contexts.some(isContainmentRoom)) {
    bulkheadReasons.add('containment-room')
  }
  if (
    contexts.some(context => context.isExterior) &&
    input.exteriorProximity === 'near-hull'
  ) {
    bulkheadReasons.add('exterior-room-boundary')
  }

  if (bulkheadReasons.size > 0) {
    return buildClassification(
      input.connectionId,
      'bulkhead',
      Math.max(1, maxAccessLevel),
      bulkheadReasons
    )
  }

  return buildClassification(
    input.connectionId,
    'standard',
    maxAccessLevel,
    new Set(['ordinary-interior'])
  )
}

function buildClassification(
  connectionId: string,
  semantic: DoorSemantic,
  rawRequiredLevel: number,
  reasons: ReadonlySet<DoorClassificationReason>
): DoorClassification {
  const requiredLevel = clampAccessLevel(rawRequiredLevel)
  const pressureBoundary = semantic === 'airlock' || semantic === 'bulkhead'
  const checkpoint = semantic === 'secure'

  return {
    semantic,
    connectorKind:
      semantic === 'airlock' ? 'airlock' :
      semantic === 'bulkhead' ? 'bulkhead' :
      'door',
    access: {
      version: 1,
      accessId: `${connectionId}:door-access:v1`,
      requiredLevel,
      requiredAccess: ACCESS_BANDS[requiredLevel],
      lockLevel:
        semantic === 'standard' ? 0 :
        semantic === 'secure' ? Math.max(2, requiredLevel) as 2 | 3 :
        Math.max(1, requiredLevel) as 1 | 2 | 3,
      failsafe: semantic === 'standard',
      lockedByDefault: checkpoint,
      pressureBoundary,
      interlocked: semantic === 'airlock',
      checkpoint,
      reasons: REASON_ORDER.filter(reason => reasons.has(reason)),
    },
  }
}

function normalizeRoom(context: DoorRoomContext): Required<DoorRoomContext> {
  return {
    id: context.id ?? '',
    roomType: normalizeToken(context.roomType),
    zone: normalizeToken(context.zone),
    accessLevel: clampAccessLevel(context.accessLevel),
    isExterior: context.isExterior ?? false,
    tags: (context.tags ?? []).map(normalizeToken).sort(),
  }
}

function isSecureRoom(context: Required<DoorRoomContext>): boolean {
  return SECURE_ROOM_TYPES.has(context.roomType) ||
    context.tags.some(tag => SECURE_TAGS.has(tag))
}

function isContainmentRoom(context: Required<DoorRoomContext>): boolean {
  return CONTAINMENT_ROOM_TYPES.has(context.roomType) ||
    context.tags.some(tag => CONTAINMENT_TAGS.has(tag))
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function clampAccessLevel(value: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(3, Math.round(value))) as 0 | 1 | 2 | 3
}

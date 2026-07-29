/**
 * Archetype-aware functional room placement scoring.
 *
 * This module is deliberately geometry-only and side-effect free. It does not
 * know how slots are discovered or rooms are carved, so both the occupancy
 * generator and a future polygonal placer can use the same planning grammar.
 */

import type { Archetype, ProgrammedRoom, Subtype } from '../types'
import type { Point, Rect } from './types'

export type FunctionalModuleRole = 'hub' | 'satellite' | 'link'

export type FunctionalModuleKind =
  | 'command'
  | 'habitation'
  | 'utility'
  | 'logistics'
  | 'science'
  | 'industrial'
  | 'security'
  | 'access'

export interface FunctionalRoomSlotCandidate {
  id?: string
  rect: Rect
  zoneId?: string
  /**
   * Prefer an exact hull-mask test from the caller. When omitted, the scorer
   * conservatively infers contact with the rectangular facility bounds.
   */
  touchesExterior?: boolean
  /** Manhattan length from the room-side corridor start to its backbone anchor. */
  connectionDistance?: number
  /** Optional metadata for clustered outposts. */
  moduleRole?: FunctionalModuleRole
  /** Optional semantic role for a module or sector. */
  moduleKind?: FunctionalModuleKind
}

export interface FunctionalPlacementContext {
  archetype: Archetype
  subtype?: Subtype
  width: number
  height: number
  /** Bounding box of the usable envelope; defaults to the whole canvas. */
  facilityBounds?: Rect
  /** Station/outpost center; defaults to the center of facilityBounds. */
  center?: Point
}

export interface FunctionalScoreFactor {
  rule: string
  value: number
}

export interface FunctionalPlacementScore {
  score: number
  factors: FunctionalScoreFactor[]
}

export interface RankedFunctionalSlot<T extends FunctionalRoomSlotCandidate> {
  slot: T
  score: number
  factors: FunctionalScoreFactor[]
  originalIndex: number
}

type FunctionalRoom = Pick<ProgrammedRoom, 'roomType' | 'zone' | 'isExterior'>

interface SlotGeometry {
  bow: number
  stern: number
  radial: number
  centrality: number
  touchesExterior: boolean
}

const SHIP_COMMAND = new Set([
  'bridge',
  'cic',
  'comms',
  'navigation',
  'sensorArray',
  'captainQuarters',
])

const SHIP_ENGINEERING = new Set([
  'engineering',
  'reactor',
  'engineRoom',
  'powerDistribution',
  'lifeSupport',
  'maintenance',
  'maintenanceShaft',
])

const LOGISTICS = new Set([
  'cargoBay',
  'storage',
  'airlock',
  'dockingBay',
  'hangar',
])

const EXTERIOR_ACCESS = new Set([
  'airlock',
  'dockingBay',
  'hangar',
  'escapePod',
  'observatory',
])

const STATION_HUB = new Set([
  'bridge',
  'cic',
  'comms',
  'operations',
  'securityStation',
  'serverRoom',
])

const HABITATION = new Set([
  'quarters',
  'crewQuarters',
  'captainQuarters',
  'officerQuarters',
  'barracks',
  'medbay',
  'messhall',
  'messHall',
  'commonArea',
  'recRoom',
  'recreation',
  'head',
])

const SCIENCE = new Set([
  'scienceLab',
  'laboratory',
  'lab',
  'scienceBay',
  'observatory',
  'serverRoom',
])

const INDUSTRIAL = new Set([
  'refinery',
  'factory',
  'mining',
  'engineering',
  'reactor',
  'powerDistribution',
  'maintenance',
])

/**
 * Score a candidate without mutating it. Higher scores are better.
 *
 * The score is intentionally relative: callers should compare slots for the
 * same room, not interpret a particular number as a validity threshold.
 */
export function scoreFunctionalRoomSlot(
  room: FunctionalRoom | string,
  slot: FunctionalRoomSlotCandidate,
  context: FunctionalPlacementContext
): FunctionalPlacementScore {
  const normalizedRoom: FunctionalRoom = typeof room === 'string'
    ? { roomType: room, zone: '', isExterior: false }
    : room
  const geometry = measureSlot(slot, context)
  const factors: FunctionalScoreFactor[] = []

  const add = (rule: string, value: number) => {
    if (value !== 0) factors.push({ rule, value: roundScore(value) })
  }

  scoreZoneMatch(normalizedRoom.roomType, slot, context.archetype, add)

  if (Number.isFinite(slot.connectionDistance)) {
    const extraTiles = Math.max(0, slot.connectionDistance! - 1)
    const penalty = -Math.min(24, extraTiles * 4)
    add('short-corridor-stub', penalty)
  }

  switch (context.archetype) {
    case 'ship':
      scoreShipSlot(normalizedRoom.roomType, slot, geometry, context.subtype, add)
      break
    case 'station':
      scoreStationSlot(normalizedRoom.roomType, slot, geometry, context.subtype, add)
      break
    case 'outpost':
      scoreOutpostSlot(normalizedRoom.roomType, slot, geometry, context.subtype, add)
      break
  }

  const requiresExterior = normalizedRoom.isExterior || EXTERIOR_ACCESS.has(normalizedRoom.roomType)
  if (requiresExterior) {
    add(
      geometry.touchesExterior ? 'required-exterior-contact' : 'missing-required-exterior-contact',
      geometry.touchesExterior ? 60 : -80
    )
  } else if (normalizedRoom.roomType === 'cargoBay') {
    add('cargo-exterior-access', geometry.touchesExterior ? 22 : -8)
  }

  return {
    score: roundScore(factors.reduce((total, factor) => total + factor.value, 0)),
    factors,
  }
}

/**
 * Rank candidates with a deterministic geometric tie-break. Array order only
 * remains relevant when two candidates have identical score and geometry.
 */
export function rankFunctionalRoomSlots<T extends FunctionalRoomSlotCandidate>(
  room: FunctionalRoom | string,
  slots: readonly T[],
  context: FunctionalPlacementContext
): RankedFunctionalSlot<T>[] {
  return slots
    .map((slot, originalIndex) => {
      const result = scoreFunctionalRoomSlot(room, slot, context)
      return { slot, originalIndex, ...result }
    })
    .sort((a, b) => (
      b.score - a.score ||
      a.slot.rect.y - b.slot.rect.y ||
      a.slot.rect.x - b.slot.rect.x ||
      a.slot.rect.height - b.slot.rect.height ||
      a.slot.rect.width - b.slot.rect.width ||
      a.originalIndex - b.originalIndex
    ))
}

function scoreShipSlot(
  roomType: string,
  slot: FunctionalRoomSlotCandidate,
  geometry: SlotGeometry,
  subtype: Subtype | undefined,
  add: (rule: string, value: number) => void
): void {
  if (SHIP_COMMAND.has(roomType)) {
    add('ship-command-at-bow', geometry.bow * 52)
    if (slot.zoneId === 'command') add('ship-command-zone', 24)
  }

  if (SHIP_ENGINEERING.has(roomType)) {
    add('ship-engineering-at-stern', geometry.stern * 52)
    if (slot.zoneId === 'engineering') add('ship-engineering-zone', 24)
  }

  if (LOGISTICS.has(roomType)) {
    // A mid-aft logistics block keeps cargo close to exterior loading access
    // without competing with the bridge or stern machinery.
    const midAft = closeness(geometry.stern, 0.68, 0.68)
    add('ship-logistics-mid-aft', midAft * 28)
  }

  if ((subtype === 'cargo' || subtype === 'freighter') && LOGISTICS.has(roomType)) {
    add('cargo-ship-logistics-emphasis', 14)
  }
}

function scoreStationSlot(
  roomType: string,
  slot: FunctionalRoomSlotCandidate,
  geometry: SlotGeometry,
  subtype: Subtype | undefined,
  add: (rule: string, value: number) => void
): void {
  if (STATION_HUB.has(roomType)) {
    add('station-command-at-hub', geometry.centrality * 52)
    if (slot.zoneId === 'hub') add('station-hub-zone', 24)
  }

  if (EXTERIOR_ACCESS.has(roomType) || roomType === 'cargoBay') {
    add('station-docking-at-perimeter', geometry.radial * 52)
    if (slot.zoneId === 'docking') add('station-docking-zone', 24)
  }

  if (HABITATION.has(roomType)) {
    const ringTarget = subtype === 'habitat' ? 0.68 : 0.58
    add('station-habitation-on-ring', closeness(geometry.radial, ringTarget, 0.55) * 46)
    if (slot.zoneId === 'residential') add('station-residential-zone', 24)
  }

  if (SHIP_ENGINEERING.has(roomType)) {
    add('station-utilities-inner-ring', closeness(geometry.radial, 0.38, 0.45) * 28)
    if (slot.zoneId === 'utilities') add('station-utilities-zone', 20)
  }

  if (
    (subtype === 'port' || subtype === 'trading') &&
    (EXTERIOR_ACCESS.has(roomType) || roomType === 'cargoBay')
  ) {
    add('port-station-docking-emphasis', 14)
  }
}

function scoreOutpostSlot(
  roomType: string,
  slot: FunctionalRoomSlotCandidate,
  geometry: SlotGeometry,
  subtype: Subtype | undefined,
  add: (rule: string, value: number) => void
): void {
  const moduleKind = preferredModuleKind(roomType)
  const prefersHub = STATION_HUB.has(roomType)

  if (prefersHub) {
    add('outpost-command-at-hub', geometry.centrality * 38)
    add('outpost-hub-module', slot.moduleRole === 'hub' ? 34 : slot.moduleRole === 'satellite' ? -18 : 0)
    if (slot.zoneId === 'main') add('outpost-main-zone', 20)
  } else {
    add('outpost-functional-satellite', slot.moduleRole === 'satellite' ? 24 : slot.moduleRole === 'hub' ? -8 : 0)
    add('outpost-module-separation', geometry.radial * 18)
  }

  if (moduleKind && slot.moduleKind) {
    add(
      `outpost-${moduleKind}-module`,
      slot.moduleKind === moduleKind ? 32 : -12
    )
  }

  if (
    (subtype === 'science' || subtype === 'research') &&
    SCIENCE.has(roomType)
  ) {
    add('research-outpost-science-module', 14)
  }

  if (subtype === 'mining' && INDUSTRIAL.has(roomType)) {
    add('mining-outpost-industrial-module', 14)
  }

  if (subtype === 'military' && (
    roomType === 'securityStation' ||
    roomType === 'weaponBay' ||
    roomType === 'armory' ||
    roomType === 'brig'
  )) {
    add('military-outpost-security-module', 14)
  }
}

function scoreZoneMatch(
  roomType: string,
  slot: FunctionalRoomSlotCandidate,
  archetype: Archetype,
  add: (rule: string, value: number) => void
): void {
  if (!slot.zoneId) return
  const preferredZones = preferredZoneIds(archetype, roomType)
  if (preferredZones.length === 0) return
  add(
    preferredZones.includes(slot.zoneId) ? 'preferred-functional-zone' : 'nonpreferred-functional-zone',
    preferredZones.includes(slot.zoneId) ? 18 : -6
  )
}

function preferredZoneIds(archetype: Archetype, roomType: string): string[] {
  if (archetype === 'ship') {
    if (SHIP_COMMAND.has(roomType)) return ['command']
    if (SHIP_ENGINEERING.has(roomType)) return ['engineering']
    if (LOGISTICS.has(roomType)) return ['operations', 'cargo']
    if (HABITATION.has(roomType)) return ['crew', 'medical']
  }

  if (archetype === 'station') {
    if (STATION_HUB.has(roomType)) return ['hub']
    if (EXTERIOR_ACCESS.has(roomType) || roomType === 'cargoBay') return ['docking']
    if (HABITATION.has(roomType)) return ['residential']
    if (SHIP_ENGINEERING.has(roomType)) return ['utilities']
  }

  if (archetype === 'outpost') {
    if (STATION_HUB.has(roomType)) return ['main']
    if (HABITATION.has(roomType) || SHIP_ENGINEERING.has(roomType)) return ['support']
    if (SCIENCE.has(roomType) || INDUSTRIAL.has(roomType) || LOGISTICS.has(roomType)) {
      return ['specialized']
    }
  }

  return []
}

function preferredModuleKind(roomType: string): FunctionalModuleKind | undefined {
  if (STATION_HUB.has(roomType)) return 'command'
  if (HABITATION.has(roomType)) return 'habitation'
  if (SCIENCE.has(roomType)) return 'science'
  if (EXTERIOR_ACCESS.has(roomType)) return 'access'
  if (roomType === 'cargoBay' || roomType === 'storage') return 'logistics'
  if (INDUSTRIAL.has(roomType)) {
    return roomType === 'engineering' || roomType === 'reactor' || roomType === 'powerDistribution'
      ? 'utility'
      : 'industrial'
  }
  if (roomType === 'securityStation' || roomType === 'armory' || roomType === 'brig') {
    return 'security'
  }
  return undefined
}

function measureSlot(
  slot: FunctionalRoomSlotCandidate,
  context: FunctionalPlacementContext
): SlotGeometry {
  const bounds = context.facilityBounds ?? {
    x: 0,
    y: 0,
    width: context.width,
    height: context.height,
  }
  const center = context.center ?? {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  const slotCenter = {
    x: slot.rect.x + slot.rect.width / 2,
    y: slot.rect.y + slot.rect.height / 2,
  }
  const normalizedY = clamp01((slotCenter.y - bounds.y) / Math.max(1, bounds.height))
  const halfWidth = Math.max(1, bounds.width / 2)
  const halfHeight = Math.max(1, bounds.height / 2)
  const dx = (slotCenter.x - center.x) / halfWidth
  const dy = (slotCenter.y - center.y) / halfHeight
  const radial = clamp01(Math.sqrt(dx * dx + dy * dy))
  const inferredExterior = (
    slot.rect.x <= bounds.x + 1 ||
    slot.rect.y <= bounds.y + 1 ||
    slot.rect.x + slot.rect.width >= bounds.x + bounds.width - 1 ||
    slot.rect.y + slot.rect.height >= bounds.y + bounds.height - 1
  )

  return {
    bow: 1 - normalizedY,
    stern: normalizedY,
    radial,
    centrality: 1 - radial,
    touchesExterior: slot.touchesExterior ?? inferredExterior,
  }
}

function closeness(value: number, target: number, tolerance: number): number {
  return clamp01(1 - Math.abs(value - target) / Math.max(0.001, tolerance))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000
}

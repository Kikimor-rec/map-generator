import type {
  Archetype,
  ProgrammedRoom,
  RoomCirculationRole,
  SeededRNG,
} from '../types'

export interface RoomCirculationPlan {
  desiredRole: RoomCirculationRole
  targetConnectionCount: 1 | 2 | 3
  reason:
    | 'destination'
    | 'exterior-terminal'
    | 'pressure-transition'
    | 'shared-space'
    | 'optional-shortcut'
}

const EXTERIOR_TERMINALS = new Set([
  'airlock',
  'dockingbay',
  'hangar',
  'escapepod',
])

const SHARED_HUBS = new Set([
  'commonarea',
  'market',
  'operations',
  'opshub',
])

const PREFERRED_THROUGH_ROOMS = new Set([
  'messhall',
  'galley',
  'recreation',
  'recreationroom',
  'bar',
  'lounge',
  'cargobay',
])

const OPTIONAL_THROUGH_ROOMS = new Set([
  'bridge',
  'cic',
  'commandcenter',
  'comms',
  'communicationscenter',
  'securitystation',
])

/**
 * Plans how a concrete room instance participates in circulation.
 *
 * This deliberately does not equate a room type with a mandatory role:
 * exterior docking/egress airlocks remain terminal destinations, while a
 * non-exterior airlock can become a two-sided pressure transition.
 */
export function planRoomCirculation(
  room: ProgrammedRoom,
  archetype: Archetype,
  rng: SeededRNG
): RoomCirculationPlan {
  const roomType = normalizeRoomType(room.roomType)

  if (room.isExterior && EXTERIOR_TERMINALS.has(roomType)) {
    return terminal('exterior-terminal')
  }

  if (roomType === 'airlock') {
    return {
      desiredRole: 'through',
      targetConnectionCount: 2,
      reason: 'pressure-transition',
    }
  }

  if (SHARED_HUBS.has(roomType)) {
    const canBeHub =
      room.estimatedTiles >= 20 &&
      (archetype === 'station' || archetype === 'outpost')
    return {
      desiredRole: canBeHub ? 'hub' : 'through',
      targetConnectionCount: canBeHub ? 3 : 2,
      reason: 'shared-space',
    }
  }

  const preferredChance = roomType === 'cargobay' ? 0.55 : 0.8
  if (PREFERRED_THROUGH_ROOMS.has(roomType) && rng.chance(preferredChance)) {
    return {
      desiredRole: 'through',
      targetConnectionCount: 2,
      reason: 'shared-space',
    }
  }

  if (OPTIONAL_THROUGH_ROOMS.has(roomType) && rng.chance(0.35)) {
    return {
      desiredRole: 'through',
      targetConnectionCount: 2,
      reason: 'optional-shortcut',
    }
  }

  return terminal('destination')
}

function terminal(
  reason: RoomCirculationPlan['reason']
): RoomCirculationPlan {
  return {
    desiredRole: 'terminal',
    targetConnectionCount: 1,
    reason,
  }
}

function normalizeRoomType(roomType: string): string {
  return roomType.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

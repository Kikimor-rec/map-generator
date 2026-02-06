/**
 * Adjacency Rules & Room Importance
 * Based on research: facility_structure_research_2026-02-06.md
 *
 * Encodes which rooms should/must be near each other,
 * which rooms must NEVER be adjacent, and zone placement logic.
 */

// ============================================================================
// ADJACENCY WEIGHTS (-10 to +10)
// Positive = should be near, Negative = should be far apart
// ============================================================================

/** Adjacency preference weights between room types */
const ADJACENCY_WEIGHTS: Record<string, Record<string, number>> = {
  // Command zone
  bridge: {
    comms: 8, navigation: 7, captainQuarters: 5, cic: 6,
    sensorArray: 5, serverRoom: 4,
    reactor: -8, brig: -6, cargoBay: -3,
  },
  cic: {
    weaponsBay: 7, sensorArray: 8, comms: 6, bridge: 6,
    brig: -5,
  },
  comms: {
    bridge: 8, serverRoom: 6, sensorArray: 5,
  },
  navigation: {
    bridge: 7, sensorArray: 5,
  },

  // Engineering zone
  engineering: {
    reactor: 9, powerDistribution: 8, lifeSupport: 6, maintenance: 5,
    crewQuarters: -4, medbay: -3,
  },
  reactor: {
    engineering: 9, powerDistribution: 8,
    crewQuarters: -9, medbay: -8, messHall: -7, barracks: -7,
    bridge: -8, ammunition: -8, armory: -5,
  },
  powerDistribution: {
    engineering: 8, reactor: 8, lifeSupport: 5,
  },
  lifeSupport: {
    engineering: 6, powerDistribution: 5,
  },
  maintenance: {
    engineering: 5, storage: 4,
  },

  // Habitation zone
  crewQuarters: {
    medbay: 7, messHall: 6, recreation: 5, head: 8,
    reactor: -9, weaponsBay: -4,
  },
  captainQuarters: {
    bridge: 5, messHall: 3,
    reactor: -7, brig: -4,
  },
  barracks: {
    armory: 6, messHall: 5, medbay: 4,
    reactor: -7,
  },
  messHall: {
    crewQuarters: 6, galley: 9, recreation: 4,
    reactor: -6, wasteProcessing: -7,
  },
  recreation: {
    crewQuarters: 5, messHall: 4,
  },
  head: {
    crewQuarters: 8,
  },

  // Medical zone
  medbay: {
    crewQuarters: 7, cryoBay: 6, lab: 4,
    reactor: -8, engineering: -3,
  },
  cryoBay: {
    medbay: 6,
  },

  // Cargo & logistics
  cargoBay: {
    hangar: 5, airlock: 4, storage: 5, dockingBay: 5,
  },
  storage: {
    cargoBay: 5, maintenance: 4,
  },
  hangar: {
    cargoBay: 5, maintenance: 4,
  },

  // Security
  armory: {
    securityStation: 7, barracks: 6,
    brig: -7,
  },
  securityStation: {
    armory: 7, brig: 5,
  },
  brig: {
    securityStation: 5,
    armory: -7, bridge: -6, engineering: -5,
  },

  // External access (must be on hull boundary)
  airlock: {
    cargoBay: 4,
  },
  dockingBay: {
    cargoBay: 5, customs: 6,
  },
  escapePod: {},

  // Science
  lab: {
    serverRoom: 5, sensorArray: 4, specimenStorage: 6,
    messHall: -4,
  },
  observatory: {
    sensorArray: 5, lab: 3,
  },
  serverRoom: {
    bridge: 4, comms: 6, lab: 5,
  },
}

/**
 * Get adjacency weight between two room types.
 * Returns value from -10 (must never be adjacent) to +10 (must be adjacent).
 * Returns 0 if no preference defined.
 */
export function getAdjacencyWeight(roomTypeA: string, roomTypeB: string): number {
  const weightsA = ADJACENCY_WEIGHTS[roomTypeA]
  if (weightsA && weightsA[roomTypeB] !== undefined) {
    return weightsA[roomTypeB]
  }
  const weightsB = ADJACENCY_WEIGHTS[roomTypeB]
  if (weightsB && weightsB[roomTypeA] !== undefined) {
    return weightsB[roomTypeA]
  }
  return 0
}

// ============================================================================
// ZONE PLACEMENT ORDER
// ============================================================================

/** Zone placement order for ships (bow to stern) */
export const SHIP_ZONE_ORDER: Record<string, number> = {
  command: 0,    // Bow
  crew: 1,       // Mid-forward
  medical: 2,    // Mid
  operations: 3, // Mid
  tactical: 3,   // Mid (same as operations)
  cargo: 4,      // Mid-aft
  engineering: 5, // Stern
}

/** Which room types belong to which zone */
export const ROOM_ZONE_MAP: Record<string, string> = {
  bridge: 'command',
  cic: 'command',
  comms: 'command',
  navigation: 'command',
  sensorArray: 'command',

  engineering: 'engineering',
  reactor: 'engineering',
  powerDistribution: 'engineering',
  lifeSupport: 'engineering',
  maintenance: 'engineering',

  crewQuarters: 'crew',
  captainQuarters: 'crew',
  barracks: 'crew',
  messHall: 'crew',
  recreation: 'crew',
  head: 'crew',
  galley: 'crew',

  medbay: 'medical',
  cryoBay: 'medical',

  cargoBay: 'cargo',
  storage: 'cargo',
  hangar: 'cargo',
  dockingBay: 'cargo',

  armory: 'operations',
  securityStation: 'operations',
  brig: 'operations',
  weaponsBay: 'operations',
  lab: 'operations',
  observatory: 'operations',
  serverRoom: 'operations',

  airlock: 'external',
  escapePod: 'external',
}

// ============================================================================
// EXTERIOR ROOM CHECK
// ============================================================================

/** Rooms that MUST touch the hull boundary */
export const EXTERIOR_ROOMS = new Set([
  'airlock', 'dockingBay', 'hangar', 'escapePod', 'observatory',
])

/**
 * Check if a room type must be placed on the hull boundary
 */
export function mustBeExterior(roomType: string): boolean {
  return EXTERIOR_ROOMS.has(roomType)
}

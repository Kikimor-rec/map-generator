/**
 * Room Type Configuration Catalog
 * Based on specification from 12_room_type_catalog.md
 */

import type { RoomTypeConfig, CountRule, SizeTier, Archetype, Subtype } from './types'

// ============================================================================
// SIZE TIER HELPERS
// ============================================================================

type SizeRange = { minTiles: number; maxTiles: number; ratio: string }
type SizeByTier = Partial<Record<SizeTier, SizeRange>>

function sizeByTier(
  xs?: SizeRange,
  sm?: SizeRange,
  md?: SizeRange,
  lg?: SizeRange,
  xl?: SizeRange
): SizeByTier {
  const result: SizeByTier = {}
  if (xs) result.xs = xs
  if (sm) result.sm = sm
  if (md) result.md = md
  if (lg) result.lg = lg
  if (xl) result.xl = xl
  return result
}

function range(minTiles: number, maxTiles: number, ratio = '2:1'): SizeRange {
  return { minTiles, maxTiles, ratio }
}

// ============================================================================
// CORE & COMMAND ROOMS
// ============================================================================

export const ROOM_CONFIGS: Record<string, RoomTypeConfig> = {
  // --- Core & Command ---
  'bridge': {
    id: 'bridge',
    category: 'core',
    label: 'Bridge / Control Room',
    description: 'Primary command center',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 10 },
      { archetype: 'station', quantity: { min: 1, max: 2 }, priority: 10 },
      { archetype: 'outpost', quantity: 1, priority: 10 }
    ],
    sizeByTier: sizeByTier(
      range(4, 6, '2:1'),
      range(6, 12, '2:1'),
      range(12, 20, '2:1'),
      range(20, 36, '3:2'),
      range(36, 64, '3:2')
    ),
    importance: 'primary',
    adjacencyPreferences: ['corridor', 'comms', 'securityStation'],
    accessLevel: 3,
    tags: ['command', 'essential'],
    styleHints: {
      hasViewport: true,
      consoleCount: { min: 2, max: 6 }
    }
  },

  'reactor': {
    id: 'reactor',
    category: 'core',
    label: 'Reactor / Power Plant',
    description: 'Main power generation',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 10 },
      { archetype: 'station', quantity: { min: 1, max: 3 }, priority: 10 },
      { archetype: 'outpost', quantity: 1, priority: 10 }
    ],
    sizeByTier: sizeByTier(
      range(4, 6),
      range(6, 12),
      range(12, 24),
      range(24, 48),
      range(48, 80)
    ),
    importance: 'primary',
    adjacencyPreferences: ['engineering', 'storage'],
    forbiddenAdjacencies: ['medbay', 'quarters', 'bridge'],
    accessLevel: 3,
    tags: ['power', 'essential', 'hazardous']
  },

  'lifeSupport': {
    id: 'lifeSupport',
    category: 'core',
    label: 'Life Support',
    description: 'Atmospheric and environmental control',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 9 },
      { archetype: 'station', quantity: { min: 1, max: 4 }, priority: 9 },
      { archetype: 'outpost', quantity: 1, priority: 9 }
    ],
    sizeByTier: sizeByTier(
      range(3, 5),
      range(5, 10),
      range(10, 18),
      range(18, 30),
      range(30, 50)
    ),
    importance: 'primary',
    adjacencyPreferences: ['engineering'],
    accessLevel: 2,
    tags: ['essential', 'life-support']
  },

  'engineering': {
    id: 'engineering',
    category: 'core',
    label: 'Engineering Bay',
    description: 'Technical maintenance and repair',
    countRules: [
      { archetype: 'ship', quantity: { min: 1, max: 2 }, priority: 8 },
      { archetype: 'station', quantity: { min: 1, max: 4 }, priority: 8 },
      { archetype: 'outpost', quantity: 1, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      range(4, 8),
      range(8, 16),
      range(16, 32),
      range(32, 56),
      range(56, 96)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['reactor', 'lifeSupport', 'storage'],
    accessLevel: 2,
    tags: ['maintenance', 'technical']
  },

  // --- Crew & Habitation ---
  'quarters': {
    id: 'quarters',
    category: 'habitation',
    label: 'Crew Quarters',
    description: 'Living spaces for crew',
    countRules: [
      { archetype: 'ship', quantity: { min: 2, max: 8 }, priority: 6, scaleFactor: 0.15 },
      { archetype: 'station', quantity: { min: 4, max: 20 }, priority: 6, scaleFactor: 0.2 },
      { archetype: 'outpost', quantity: { min: 2, max: 6 }, priority: 6, scaleFactor: 0.15 }
    ],
    sizeByTier: sizeByTier(
      range(2, 4),
      range(4, 8),
      range(6, 12),
      range(8, 16),
      range(12, 24)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['commonArea', 'messhall', 'head'],
    accessLevel: 1,
    tags: ['crew', 'living']
  },

  'captainQuarters': {
    id: 'captainQuarters',
    category: 'habitation',
    label: "Captain's Quarters",
    description: 'Private quarters for commanding officer',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 5 },
      { archetype: 'station', quantity: 0, priority: 0 }
    ],
    sizeByTier: sizeByTier(
      range(4, 6),
      range(6, 10),
      range(10, 16),
      range(14, 24),
      range(20, 32)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['bridge', 'corridor'],
    accessLevel: 3,
    tags: ['crew', 'officer', 'private']
  },

  'messhall': {
    id: 'messhall',
    category: 'habitation',
    label: 'Mess Hall / Galley',
    description: 'Dining and food preparation',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 5 },
      { archetype: 'station', quantity: { min: 1, max: 4 }, priority: 5 },
      { archetype: 'outpost', quantity: 1, priority: 5 }
    ],
    sizeByTier: sizeByTier(
      range(4, 8),
      range(8, 16),
      range(12, 24),
      range(20, 40),
      range(32, 64)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['quarters', 'commonArea', 'storage'],
    accessLevel: 1,
    tags: ['crew', 'social']
  },

  'commonArea': {
    id: 'commonArea',
    category: 'habitation',
    label: 'Common Area / Rec Room',
    description: 'Recreation and relaxation space',
    countRules: [
      { archetype: 'ship', sizeTier: 'md', quantity: 1, priority: 3 },
      { archetype: 'ship', sizeTier: 'lg', quantity: { min: 1, max: 2 }, priority: 3 },
      { archetype: 'station', quantity: { min: 1, max: 6 }, priority: 4 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(6, 12),
      range(10, 20),
      range(16, 32),
      range(24, 48)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['quarters', 'messhall'],
    accessLevel: 1,
    tags: ['crew', 'social', 'recreation']
  },

  'head': {
    id: 'head',
    category: 'habitation',
    label: 'Head / Lavatory',
    description: 'Sanitary facilities',
    countRules: [
      { archetype: 'ship', quantity: { min: 1, max: 4 }, priority: 4 },
      { archetype: 'station', quantity: { min: 2, max: 10 }, priority: 4, scaleFactor: 0.1 }
    ],
    sizeByTier: sizeByTier(
      range(1, 2),
      range(2, 4),
      range(3, 6),
      range(4, 8),
      range(6, 12)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['quarters', 'corridor'],
    accessLevel: 1,
    tags: ['utility', 'sanitary']
  },

  // --- Medical ---
  'medbay': {
    id: 'medbay',
    category: 'medical',
    label: 'Medical Bay',
    description: 'Primary medical facility',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 7 },
      { archetype: 'station', quantity: { min: 1, max: 4 }, priority: 7 },
      { archetype: 'outpost', quantity: 1, priority: 7 }
    ],
    sizeByTier: sizeByTier(
      range(4, 6),
      range(6, 12),
      range(12, 24),
      range(20, 40),
      range(36, 64)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['quarters', 'corridor'],
    forbiddenAdjacencies: ['reactor', 'weaponBay'],
    accessLevel: 2,
    tags: ['medical', 'essential']
  },

  'cryoBay': {
    id: 'cryoBay',
    category: 'medical',
    label: 'Cryo Bay',
    description: 'Cryogenic suspension pods',
    countRules: [
      { archetype: 'ship', subtype: 'explorer', quantity: 1, priority: 6 },
      { archetype: 'ship', subtype: 'colonizer', quantity: { min: 1, max: 4 }, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      range(4, 8),
      range(8, 16),
      range(16, 32),
      range(32, 64),
      range(64, 128)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['medbay', 'lifeSupport'],
    accessLevel: 2,
    tags: ['medical', 'cryo']
  },

  // --- Cargo & Storage ---
  'cargoBay': {
    id: 'cargoBay',
    category: 'cargo',
    label: 'Cargo Bay',
    description: 'Main cargo storage',
    countRules: [
      { archetype: 'ship', subtype: 'freighter', quantity: { min: 2, max: 8 }, priority: 9 },
      { archetype: 'ship', quantity: { min: 1, max: 4 }, priority: 5 },
      { archetype: 'station', quantity: { min: 2, max: 10 }, priority: 6 }
    ],
    sizeByTier: sizeByTier(
      range(6, 12),
      range(12, 24),
      range(24, 48),
      range(48, 96),
      range(96, 200)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['airlock', 'corridor', 'hangar'],
    accessLevel: 1,
    tags: ['cargo', 'storage']
  },

  'storage': {
    id: 'storage',
    category: 'cargo',
    label: 'Storage Room',
    description: 'General storage',
    countRules: [
      { archetype: 'ship', quantity: { min: 1, max: 6 }, priority: 4 },
      { archetype: 'station', quantity: { min: 2, max: 12 }, priority: 4 },
      { archetype: 'outpost', quantity: { min: 1, max: 4 }, priority: 4 }
    ],
    sizeByTier: sizeByTier(
      range(2, 4),
      range(4, 8),
      range(6, 12),
      range(10, 20),
      range(16, 32)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['corridor', 'engineering'],
    accessLevel: 1,
    tags: ['storage', 'utility']
  },

  // --- Security & Weapons ---
  'securityStation': {
    id: 'securityStation',
    category: 'security',
    label: 'Security Station',
    description: 'Security monitoring and armory',
    countRules: [
      { archetype: 'ship', sizeTier: 'md', quantity: 1, priority: 6 },
      { archetype: 'ship', sizeTier: 'lg', quantity: { min: 1, max: 2 }, priority: 6 },
      { archetype: 'station', quantity: { min: 1, max: 4 }, priority: 6 }
    ],
    sizeByTier: sizeByTier(
      range(3, 5),
      range(5, 10),
      range(8, 16),
      range(14, 28),
      range(24, 48)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['bridge', 'brig', 'airlock'],
    accessLevel: 3,
    tags: ['security', 'command']
  },

  'brig': {
    id: 'brig',
    category: 'security',
    label: 'Brig / Detention',
    description: 'Holding cells',
    countRules: [
      { archetype: 'ship', sizeTier: 'lg', quantity: 1, priority: 3 },
      { archetype: 'station', quantity: { min: 0, max: 2 }, priority: 3 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(3, 6),
      range(6, 12),
      range(10, 20),
      range(16, 32)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['securityStation'],
    accessLevel: 3,
    tags: ['security', 'detention']
  },

  'weaponBay': {
    id: 'weaponBay',
    category: 'security',
    label: 'Weapon Bay',
    description: 'Weapon systems mount',
    countRules: [
      { archetype: 'ship', subtype: 'military', quantity: { min: 2, max: 6 }, priority: 8 },
      { archetype: 'ship', quantity: { min: 0, max: 2 }, priority: 4 },
      { archetype: 'station', subtype: 'military', quantity: { min: 2, max: 8 }, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      range(4, 6),
      range(6, 12),
      range(10, 20),
      range(16, 32),
      range(28, 56)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['ammunition'],
    forbiddenAdjacencies: ['quarters', 'medbay'],
    accessLevel: 3,
    tags: ['military', 'weapons']
  },

  'ammunition': {
    id: 'ammunition',
    category: 'security',
    label: 'Ammunition Storage',
    description: 'Weapon ammunition storage',
    countRules: [
      { archetype: 'ship', subtype: 'military', quantity: { min: 1, max: 3 }, priority: 7 }
    ],
    sizeByTier: sizeByTier(
      range(2, 4),
      range(4, 8),
      range(6, 12),
      range(10, 20),
      range(16, 32)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['weaponBay'],
    forbiddenAdjacencies: ['reactor', 'quarters'],
    accessLevel: 3,
    tags: ['military', 'hazardous']
  },

  // --- Science & Laboratory ---
  'scienceLab': {
    id: 'scienceLab',
    category: 'science',
    label: 'Science Laboratory',
    description: 'General research facility',
    countRules: [
      { archetype: 'ship', subtype: 'explorer', quantity: { min: 1, max: 3 }, priority: 7 },
      { archetype: 'station', subtype: 'research', quantity: { min: 2, max: 8 }, priority: 9 },
      { archetype: 'outpost', subtype: 'research', quantity: { min: 1, max: 4 }, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      range(4, 8),
      range(8, 16),
      range(14, 28),
      range(24, 48),
      range(40, 80)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['storage', 'comms'],
    accessLevel: 2,
    tags: ['science', 'research']
  },

  'observatory': {
    id: 'observatory',
    category: 'science',
    label: 'Observatory',
    description: 'Astronomical observation',
    countRules: [
      { archetype: 'ship', subtype: 'explorer', quantity: 1, priority: 5 },
      { archetype: 'station', subtype: 'research', quantity: { min: 0, max: 2 }, priority: 5 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(6, 12),
      range(10, 20),
      range(16, 32),
      range(28, 56)
    ),
    importance: 'tertiary',
    adjacencyPreferences: [],
    accessLevel: 2,
    tags: ['science', 'observation'],
    styleHints: {
      hasViewport: true
    }
  },

  'serverRoom': {
    id: 'serverRoom',
    category: 'science',
    label: 'Server Room / Data Center',
    description: 'Computer and data storage',
    countRules: [
      { archetype: 'ship', sizeTier: 'md', quantity: 1, priority: 5 },
      { archetype: 'station', quantity: { min: 1, max: 4 }, priority: 6 }
    ],
    sizeByTier: sizeByTier(
      range(2, 4),
      range(4, 8),
      range(8, 16),
      range(14, 28),
      range(24, 48)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['engineering', 'bridge'],
    accessLevel: 3,
    tags: ['technical', 'computing']
  },

  // --- Communications ---
  'comms': {
    id: 'comms',
    category: 'communications',
    label: 'Communications Center',
    description: 'Long-range communications',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 6 },
      { archetype: 'station', quantity: { min: 1, max: 2 }, priority: 6 },
      { archetype: 'outpost', quantity: 1, priority: 7 }
    ],
    sizeByTier: sizeByTier(
      range(2, 4),
      range(4, 8),
      range(6, 12),
      range(10, 20),
      range(16, 32)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['bridge'],
    accessLevel: 2,
    tags: ['communications', 'essential']
  },

  // --- Propulsion & Navigation ---
  'engineRoom': {
    id: 'engineRoom',
    category: 'propulsion',
    label: 'Engine Room',
    description: 'Main propulsion systems',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 9 }
    ],
    sizeByTier: sizeByTier(
      range(6, 12),
      range(12, 24),
      range(20, 40),
      range(36, 72),
      range(60, 120)
    ),
    importance: 'primary',
    adjacencyPreferences: ['reactor', 'engineering'],
    accessLevel: 2,
    tags: ['propulsion', 'essential']
  },

  'ftlDrive': {
    id: 'ftlDrive',
    category: 'propulsion',
    label: 'FTL Drive Bay',
    description: 'Faster-than-light propulsion',
    countRules: [
      { archetype: 'ship', sizeTier: 'md', quantity: 1, priority: 7 },
      { archetype: 'ship', sizeTier: 'lg', quantity: 1, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(6, 12),
      range(12, 24),
      range(20, 40),
      range(36, 72)
    ),
    importance: 'primary',
    adjacencyPreferences: ['reactor', 'engineRoom'],
    accessLevel: 3,
    tags: ['propulsion', 'ftl']
  },

  'navigation': {
    id: 'navigation',
    category: 'propulsion',
    label: 'Navigation / Helm',
    description: 'Navigation and piloting systems',
    countRules: [
      { archetype: 'ship', quantity: 1, priority: 7 }
    ],
    sizeByTier: sizeByTier(
      range(3, 6),
      range(6, 10),
      range(8, 16),
      range(14, 24),
      range(20, 36)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['bridge'],
    accessLevel: 2,
    tags: ['navigation', 'command']
  },

  // --- Access & Docking ---
  'airlock': {
    id: 'airlock',
    category: 'access',
    label: 'Airlock',
    description: 'Pressurized entry/exit point',
    countRules: [
      { archetype: 'ship', quantity: { min: 1, max: 4 }, priority: 7 },
      { archetype: 'station', quantity: { min: 2, max: 8 }, priority: 7 },
      { archetype: 'outpost', quantity: { min: 1, max: 3 }, priority: 7 }
    ],
    sizeByTier: sizeByTier(
      range(2, 3),
      range(2, 4),
      range(3, 6),
      range(4, 8),
      range(6, 12)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['corridor', 'cargoBay', 'dockingBay'],
    isExterior: true,
    accessLevel: 1,
    tags: ['access', 'exterior']
  },

  'dockingBay': {
    id: 'dockingBay',
    category: 'access',
    label: 'Docking Bay',
    description: 'Ship docking facility',
    countRules: [
      { archetype: 'station', quantity: { min: 1, max: 6 }, priority: 8 },
      { archetype: 'outpost', quantity: { min: 0, max: 2 }, priority: 5 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(12, 24),
      range(24, 48),
      range(48, 96),
      range(96, 200)
    ),
    importance: 'primary',
    adjacencyPreferences: ['airlock', 'cargoBay'],
    isExterior: true,
    accessLevel: 1,
    tags: ['access', 'docking', 'exterior']
  },

  'hangar': {
    id: 'hangar',
    category: 'access',
    label: 'Hangar Bay',
    description: 'Small craft storage and launch',
    countRules: [
      { archetype: 'ship', sizeTier: 'lg', quantity: { min: 0, max: 2 }, priority: 5 },
      { archetype: 'ship', subtype: 'carrier', quantity: { min: 2, max: 6 }, priority: 9 },
      { archetype: 'station', quantity: { min: 0, max: 4 }, priority: 5 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      undefined,
      range(20, 40),
      range(40, 80),
      range(80, 160)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['cargoBay', 'airlock'],
    isExterior: true,
    accessLevel: 1,
    tags: ['access', 'hangar', 'exterior']
  },

  // --- Service & Maintenance ---
  'maintenanceShaft': {
    id: 'maintenanceShaft',
    category: 'service',
    label: 'Maintenance Shaft',
    description: 'Service access corridor',
    countRules: [
      { archetype: 'ship', sizeTier: 'md', quantity: { min: 0, max: 4 }, priority: 2 },
      { archetype: 'station', quantity: { min: 1, max: 8 }, priority: 3 }
    ],
    sizeByTier: sizeByTier(
      range(1, 2),
      range(1, 3),
      range(2, 4),
      range(2, 6),
      range(3, 8)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['engineering', 'reactor', 'lifeSupport'],
    accessLevel: 2,
    tags: ['service', 'maintenance']
  },

  'ventHub': {
    id: 'ventHub',
    category: 'service',
    label: 'Ventilation Hub',
    description: 'Central ventilation junction',
    countRules: [
      { archetype: 'ship', sizeTier: 'lg', quantity: { min: 1, max: 3 }, priority: 2 },
      { archetype: 'station', quantity: { min: 1, max: 6 }, priority: 3 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(1, 2),
      range(2, 4),
      range(3, 6),
      range(4, 8)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['lifeSupport'],
    accessLevel: 2,
    tags: ['service', 'ventilation']
  },

  // --- Commercial (Station/Outpost) ---
  'market': {
    id: 'market',
    category: 'commercial',
    label: 'Market / Trading Floor',
    description: 'Commercial trading area',
    countRules: [
      { archetype: 'station', subtype: 'trading', quantity: { min: 1, max: 4 }, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(12, 24),
      range(24, 48),
      range(48, 96),
      range(96, 192)
    ),
    importance: 'primary',
    adjacencyPreferences: ['dockingBay', 'storage'],
    accessLevel: 1,
    tags: ['commercial', 'trading']
  },

  'bar': {
    id: 'bar',
    category: 'commercial',
    label: 'Bar / Cantina',
    description: 'Drinking establishment',
    countRules: [
      { archetype: 'station', quantity: { min: 0, max: 3 }, priority: 4 },
      { archetype: 'outpost', quantity: { min: 0, max: 1 }, priority: 3 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(6, 12),
      range(10, 20),
      range(16, 32),
      range(28, 56)
    ),
    importance: 'tertiary',
    adjacencyPreferences: ['market', 'commonArea'],
    accessLevel: 1,
    tags: ['commercial', 'social']
  },

  // --- Industrial (Mining/Manufacturing) ---
  'refinery': {
    id: 'refinery',
    category: 'industrial',
    label: 'Refinery',
    description: 'Ore processing facility',
    countRules: [
      { archetype: 'station', subtype: 'mining', quantity: { min: 1, max: 3 }, priority: 9 },
      { archetype: 'outpost', subtype: 'mining', quantity: { min: 1, max: 2 }, priority: 8 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(12, 24),
      range(24, 48),
      range(48, 96),
      range(96, 192)
    ),
    importance: 'primary',
    adjacencyPreferences: ['cargoBay', 'storage'],
    accessLevel: 2,
    tags: ['industrial', 'mining']
  },

  'factory': {
    id: 'factory',
    category: 'industrial',
    label: 'Factory Floor',
    description: 'Manufacturing facility',
    countRules: [
      { archetype: 'station', subtype: 'manufacturing', quantity: { min: 1, max: 4 }, priority: 9 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(16, 32),
      range(32, 64),
      range(64, 128),
      range(128, 256)
    ),
    importance: 'primary',
    adjacencyPreferences: ['cargoBay', 'storage'],
    accessLevel: 2,
    tags: ['industrial', 'manufacturing']
  },

  // --- Special ---
  'escape': {
    id: 'escape',
    category: 'special',
    label: 'Escape Pod Bay',
    description: 'Emergency evacuation pods',
    countRules: [
      { archetype: 'ship', quantity: { min: 1, max: 4 }, priority: 5 },
      { archetype: 'station', quantity: { min: 2, max: 8 }, priority: 5 }
    ],
    sizeByTier: sizeByTier(
      range(2, 4),
      range(4, 8),
      range(6, 12),
      range(10, 20),
      range(16, 32)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['corridor', 'quarters'],
    isExterior: true,
    accessLevel: 1,
    tags: ['emergency', 'exterior']
  },

  'shuttle': {
    id: 'shuttle',
    category: 'special',
    label: 'Shuttle Bay',
    description: 'Small shuttle storage',
    countRules: [
      { archetype: 'ship', sizeTier: 'md', quantity: { min: 0, max: 1 }, priority: 4 },
      { archetype: 'ship', sizeTier: 'lg', quantity: { min: 1, max: 2 }, priority: 5 }
    ],
    sizeByTier: sizeByTier(
      undefined,
      range(8, 16),
      range(16, 32),
      range(28, 56),
      range(48, 96)
    ),
    importance: 'secondary',
    adjacencyPreferences: ['corridor', 'cargoBay'],
    isExterior: true,
    accessLevel: 1,
    tags: ['access', 'hangar', 'exterior']
  }
}

// ============================================================================
// ARCHETYPE CONFIGURATIONS
// ============================================================================

export interface ArchetypeConfig {
  id: Archetype
  label: string
  requiredCores: string[]
  optionalRooms: string[]
  forbiddenRooms: string[]
  sizeTiers: SizeTier[]
  subtypes: SubtypeConfig[]
}

export interface SubtypeConfig {
  id: Subtype
  label: string
  additionalCores: string[]
  bonusRooms: string[]
}

export const ARCHETYPE_CONFIGS: Record<Archetype, ArchetypeConfig> = {
  ship: {
    id: 'ship',
    label: 'Starship',
    requiredCores: ['bridge', 'reactor', 'lifeSupport', 'engineRoom'],
    optionalRooms: ['quarters', 'messhall', 'medbay', 'cargoBay', 'engineering'],
    forbiddenRooms: ['market', 'dockingBay', 'factory', 'refinery'],
    sizeTiers: ['xs', 'sm', 'md', 'lg', 'xl'],
    subtypes: [
      {
        id: 'military',
        label: 'Military Vessel',
        additionalCores: ['weaponBay', 'securityStation'],
        bonusRooms: ['brig', 'ammunition']
      },
      {
        id: 'freighter',
        label: 'Cargo Freighter',
        additionalCores: ['cargoBay'],
        bonusRooms: ['storage']
      },
      {
        id: 'explorer',
        label: 'Explorer Ship',
        additionalCores: ['scienceLab'],
        bonusRooms: ['observatory', 'cryoBay']
      },
      {
        id: 'passenger',
        label: 'Passenger Liner',
        additionalCores: ['quarters'],
        bonusRooms: ['commonArea', 'messhall', 'medbay']
      },
      {
        id: 'mining',
        label: 'Mining Ship',
        additionalCores: ['refinery'],
        bonusRooms: ['cargoBay', 'storage']
      },
      {
        id: 'carrier',
        label: 'Carrier',
        additionalCores: ['hangar'],
        bonusRooms: ['weaponBay', 'cargoBay']
      },
      {
        id: 'colonizer',
        label: 'Colony Ship',
        additionalCores: ['cryoBay'],
        bonusRooms: ['quarters', 'storage', 'medbay']
      }
    ]
  },
  station: {
    id: 'station',
    label: 'Space Station',
    requiredCores: ['bridge', 'reactor', 'lifeSupport', 'dockingBay'],
    optionalRooms: ['quarters', 'messhall', 'medbay', 'engineering', 'cargoBay'],
    forbiddenRooms: ['engineRoom', 'ftlDrive', 'navigation'],
    sizeTiers: ['sm', 'md', 'lg', 'xl'],
    subtypes: [
      {
        id: 'trading',
        label: 'Trading Hub',
        additionalCores: ['market'],
        bonusRooms: ['bar', 'cargoBay', 'storage']
      },
      {
        id: 'research',
        label: 'Research Station',
        additionalCores: ['scienceLab'],
        bonusRooms: ['observatory', 'serverRoom']
      },
      {
        id: 'military',
        label: 'Military Outpost',
        additionalCores: ['weaponBay', 'securityStation'],
        bonusRooms: ['brig', 'hangar']
      },
      {
        id: 'mining',
        label: 'Mining Station',
        additionalCores: ['refinery'],
        bonusRooms: ['cargoBay', 'storage']
      },
      {
        id: 'manufacturing',
        label: 'Factory Station',
        additionalCores: ['factory'],
        bonusRooms: ['cargoBay', 'storage']
      },
      {
        id: 'civilian',
        label: 'Civilian Station',
        additionalCores: ['quarters'],
        bonusRooms: ['commonArea', 'bar', 'messhall']
      },
      {
        id: 'habitat',
        label: 'Habitat Ring',
        additionalCores: ['quarters', 'medbay'],
        bonusRooms: ['commonArea', 'messhall', 'head', 'market']
      }
    ]
  },
  outpost: {
    id: 'outpost',
    label: 'Planetary Outpost',
    requiredCores: ['bridge', 'reactor', 'lifeSupport'],
    optionalRooms: ['quarters', 'messhall', 'medbay', 'storage'],
    forbiddenRooms: ['engineRoom', 'ftlDrive', 'navigation', 'hangar'],
    sizeTiers: ['xs', 'sm', 'md', 'lg'],
    subtypes: [
      {
        id: 'research',
        label: 'Research Outpost',
        additionalCores: ['scienceLab'],
        bonusRooms: ['observatory']
      },
      {
        id: 'mining',
        label: 'Mining Outpost',
        additionalCores: ['refinery'],
        bonusRooms: ['cargoBay']
      },
      {
        id: 'military',
        label: 'Military Outpost',
        additionalCores: ['securityStation'],
        bonusRooms: ['weaponBay', 'brig']
      }
    ]
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get room configs for a specific archetype/subtype/sizeTier combination
 */
export function getRoomConfigsForContext(
  archetype: Archetype,
  subtype?: Subtype,
  sizeTier?: SizeTier
): RoomTypeConfig[] {
  const result: RoomTypeConfig[] = []
  const archetypeConfig = ARCHETYPE_CONFIGS[archetype]
  
  for (const config of Object.values(ROOM_CONFIGS)) {
    // Check if room is forbidden for this archetype
    if (archetypeConfig.forbiddenRooms.includes(config.id)) {
      continue
    }
    
    // Check if any count rule applies
    const applicableRules = config.countRules.filter(rule => {
      if (rule.archetype !== archetype) return false
      if (rule.subtype && subtype && rule.subtype !== subtype) return false
      if (rule.sizeTier && sizeTier && rule.sizeTier !== sizeTier) return false
      return true
    })
    
    if (applicableRules.length > 0) {
      result.push(config)
    }
  }
  
  return result
}

/**
 * Get the count range for a room type given context
 */
export function getCountRange(
  roomType: string,
  archetype: Archetype,
  subtype?: Subtype,
  sizeTier?: SizeTier,
  totalRooms?: number
): { min: number; max: number; priority: number } {
  const config = ROOM_CONFIGS[roomType]
  if (!config) {
    return { min: 0, max: 0, priority: 0 }
  }
  
  // Find best matching rule
  let bestRule: CountRule | null = null
  let bestScore = -1
  
  for (const rule of config.countRules) {
    if (rule.archetype !== archetype) continue
    
    let score = 1
    
    // Exact subtype match is worth more
    if (rule.subtype) {
      if (rule.subtype === subtype) {
        score += 2
      } else {
        continue // Wrong subtype
      }
    }
    
    // Exact sizeTier match is worth more
    if (rule.sizeTier) {
      if (rule.sizeTier === sizeTier) {
        score += 1
      } else {
        continue // Wrong size tier
      }
    }
    
    if (score > bestScore) {
      bestScore = score
      bestRule = rule
    }
  }
  
  if (!bestRule) {
    return { min: 0, max: 0, priority: 0 }
  }
  
  let min: number
  let max: number
  
  if (typeof bestRule.quantity === 'number') {
    min = max = bestRule.quantity
  } else {
    min = bestRule.quantity.min
    max = bestRule.quantity.max
  }
  
  // Apply scale factor if present
  if (bestRule.scaleFactor && totalRooms) {
    const scaled = Math.floor(totalRooms * bestRule.scaleFactor)
    max = Math.min(max, scaled)
  }
  
  return { min, max, priority: bestRule.priority }
}

/**
 * Get size range for a room type at a given tier
 */
export function getSizeRange(
  roomType: string,
  sizeTier: SizeTier
): { minTiles: number; maxTiles: number; ratio: string } | null {
  const config = ROOM_CONFIGS[roomType]
  if (!config) return null
  
  const tierSize = config.sizeByTier[sizeTier]
  if (!tierSize) {
    // Fallback to closest available tier
    const tiers: SizeTier[] = ['xs', 'sm', 'md', 'lg', 'xl']
    const tierIndex = tiers.indexOf(sizeTier)
    
    for (let offset = 1; offset < tiers.length; offset++) {
      const lowerTier = tiers[tierIndex - offset]
      const upperTier = tiers[tierIndex + offset]
      
      if (lowerTier && config.sizeByTier[lowerTier]) {
        return config.sizeByTier[lowerTier]!
      }
      if (upperTier && config.sizeByTier[upperTier]) {
        return config.sizeByTier[upperTier]!
      }
    }
    
    return null
  }
  
  return tierSize
}

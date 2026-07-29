/**
 * Core types for the Sci-Fi Map Generator
 * Defines all data structures for rooms, corridors, objects, and map elements
 */

import type { MultiPolygon } from '../geometry/types'

// ============================================================================
// Basic Geometry Types
// ============================================================================

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Line {
  start: Point
  end: Point
}

// ============================================================================
// Room Types Enum
// ============================================================================

export enum RoomType {
  // Command & Control
  Bridge = 'bridge',
  CIC = 'cic', // Combat Information Center
  Communications = 'communications',
  
  // Living Quarters
  CrewQuarters = 'crew_quarters',
  CaptainQuarters = 'captain_quarters',
  OfficerQuarters = 'officer_quarters',
  Barracks = 'barracks',
  
  // Life Support & Medical
  Medbay = 'medbay',
  LifeSupport = 'life_support',
  Cryogenics = 'cryogenics',
  
  // Engineering
  Engineering = 'engineering',
  Reactor = 'reactor',
  PowerDistribution = 'power_distribution',
  Maintenance = 'maintenance',
  
  // Cargo & Storage
  CargoBay = 'cargo_bay',
  Storage = 'storage',
  Armory = 'armory',
  
  // Access & Transit
  Airlock = 'airlock',
  DockingBay = 'docking_bay',
  Hangar = 'hangar',
  Turbolift = 'turbolift',
  
  // Special Purpose
  Laboratory = 'laboratory',
  ScienceBay = 'science_bay',
  Observatory = 'observatory',
  RecRoom = 'rec_room',
  Mess = 'mess',
  
  // Utility
  JefferiesTube = 'jefferies_tube',
  ServerRoom = 'server_room',
  SecurityPost = 'security_post',
  Brig = 'brig',
  
  // Generic
  Generic = 'generic',
  Corridor = 'corridor',
}

// ============================================================================
// Room Type Configuration
// ============================================================================

export interface RoomTypeConfig {
  id: RoomType
  name: string
  nameRu: string
  description: string
  defaultColor: string
  borderColor: string
  icon: string
  minSize: Size
  maxSize: Size
  recommended: boolean
  maxPerShip?: number
  suggestedObjects: string[]
}

export const ROOM_TYPE_CONFIGS: Record<RoomType, RoomTypeConfig> = {
  [RoomType.Bridge]: {
    id: RoomType.Bridge,
    name: 'Bridge',
    nameRu: 'Мостик',
    description: 'Command center of the ship',
    defaultColor: '#1e3a5f',
    borderColor: '#3b82f6',
    icon: '🎖️',
    minSize: { width: 4, height: 4 },
    maxSize: { width: 8, height: 8 },
    recommended: true,
    maxPerShip: 1,
    suggestedObjects: ['console', 'captain_chair', 'viewscreen', 'tactical_station'],
  },
  [RoomType.CIC]: {
    id: RoomType.CIC,
    name: 'Combat Information Center',
    nameRu: 'Боевой информационный центр',
    description: 'Tactical operations center',
    defaultColor: '#1e3a5f',
    borderColor: '#ef4444',
    icon: '🎯',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 6, height: 6 },
    recommended: false,
    maxPerShip: 1,
    suggestedObjects: ['tactical_console', 'holotable', 'comms_station'],
  },
  [RoomType.Communications]: {
    id: RoomType.Communications,
    name: 'Communications',
    nameRu: 'Центр связи',
    description: 'Ship communications hub',
    defaultColor: '#1e3a5f',
    borderColor: '#06b6d4',
    icon: '📡',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    recommended: false,
    suggestedObjects: ['comms_console', 'antenna_controls'],
  },
  [RoomType.CrewQuarters]: {
    id: RoomType.CrewQuarters,
    name: 'Crew Quarters',
    nameRu: 'Каюта экипажа',
    description: 'Living quarters for crew members',
    defaultColor: '#374151',
    borderColor: '#6b7280',
    icon: '🛏️',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    recommended: true,
    suggestedObjects: ['bunk', 'locker', 'desk', 'chair'],
  },
  [RoomType.CaptainQuarters]: {
    id: RoomType.CaptainQuarters,
    name: "Captain's Quarters",
    nameRu: 'Каюта капитана',
    description: "Captain's private quarters",
    defaultColor: '#4a3728',
    borderColor: '#d97706',
    icon: '👨‍✈️',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 5, height: 5 },
    recommended: false,
    maxPerShip: 1,
    suggestedObjects: ['bed', 'desk', 'wardrobe', 'display_case'],
  },
  [RoomType.OfficerQuarters]: {
    id: RoomType.OfficerQuarters,
    name: 'Officer Quarters',
    nameRu: 'Офицерская каюта',
    description: 'Quarters for ship officers',
    defaultColor: '#3d3d3d',
    borderColor: '#9ca3af',
    icon: '🎖️',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    recommended: false,
    suggestedObjects: ['bed', 'desk', 'wardrobe'],
  },
  [RoomType.Barracks]: {
    id: RoomType.Barracks,
    name: 'Barracks',
    nameRu: 'Казарма',
    description: 'Military personnel quarters',
    defaultColor: '#374151',
    borderColor: '#6b7280',
    icon: '🪖',
    minSize: { width: 4, height: 3 },
    maxSize: { width: 8, height: 6 },
    recommended: false,
    suggestedObjects: ['bunk', 'locker', 'weapons_rack'],
  },
  [RoomType.Medbay]: {
    id: RoomType.Medbay,
    name: 'Medical Bay',
    nameRu: 'Медотсек',
    description: 'Medical treatment facility',
    defaultColor: '#1a3d2e',
    borderColor: '#10b981',
    icon: '🏥',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 6, height: 6 },
    recommended: true,
    maxPerShip: 2,
    suggestedObjects: ['med_bed', 'med_console', 'med_cabinet', 'surgery_table'],
  },
  [RoomType.LifeSupport]: {
    id: RoomType.LifeSupport,
    name: 'Life Support',
    nameRu: 'Система жизнеобеспечения',
    description: 'Life support systems',
    defaultColor: '#1e3a3a',
    borderColor: '#14b8a6',
    icon: '💨',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    recommended: true,
    suggestedObjects: ['air_processor', 'water_recycler', 'environmental_console'],
  },
  [RoomType.Cryogenics]: {
    id: RoomType.Cryogenics,
    name: 'Cryogenics Bay',
    nameRu: 'Криоотсек',
    description: 'Cryogenic sleep pods',
    defaultColor: '#1e3a4f',
    borderColor: '#38bdf8',
    icon: '❄️',
    minSize: { width: 3, height: 2 },
    maxSize: { width: 6, height: 4 },
    recommended: false,
    suggestedObjects: ['cryo_pod', 'cryo_console'],
  },
  [RoomType.Engineering]: {
    id: RoomType.Engineering,
    name: 'Engineering',
    nameRu: 'Инженерный отсек',
    description: 'Main engineering section',
    defaultColor: '#3d2f1e',
    borderColor: '#f59e0b',
    icon: '⚙️',
    minSize: { width: 4, height: 4 },
    maxSize: { width: 10, height: 8 },
    recommended: true,
    maxPerShip: 2,
    suggestedObjects: ['engineering_console', 'warp_core', 'tool_station', 'diagnostic_panel'],
  },
  [RoomType.Reactor]: {
    id: RoomType.Reactor,
    name: 'Reactor',
    nameRu: 'Реактор',
    description: 'Power reactor core',
    defaultColor: '#4a3d1e',
    borderColor: '#fbbf24',
    icon: '☢️',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 6, height: 6 },
    recommended: true,
    maxPerShip: 3,
    suggestedObjects: ['reactor_core', 'coolant_system', 'radiation_shield'],
  },
  [RoomType.PowerDistribution]: {
    id: RoomType.PowerDistribution,
    name: 'Power Distribution',
    nameRu: 'Распределение энергии',
    description: 'Power routing systems',
    defaultColor: '#3d3d1e',
    borderColor: '#eab308',
    icon: '⚡',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 3 },
    recommended: false,
    suggestedObjects: ['power_conduit', 'junction_box', 'power_console'],
  },
  [RoomType.Maintenance]: {
    id: RoomType.Maintenance,
    name: 'Maintenance',
    nameRu: 'Техническое помещение',
    description: 'Maintenance and repair bay',
    defaultColor: '#2d2d2d',
    borderColor: '#71717a',
    icon: '🔧',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    recommended: false,
    suggestedObjects: ['workbench', 'tool_cabinet', 'parts_storage'],
  },
  [RoomType.CargoBay]: {
    id: RoomType.CargoBay,
    name: 'Cargo Bay',
    nameRu: 'Грузовой отсек',
    description: 'Large cargo storage area',
    defaultColor: '#3d3d3d',
    borderColor: '#a3a3a3',
    icon: '📦',
    minSize: { width: 4, height: 4 },
    maxSize: { width: 12, height: 10 },
    recommended: true,
    suggestedObjects: ['cargo_container', 'cargo_crane', 'cargo_console'],
  },
  [RoomType.Storage]: {
    id: RoomType.Storage,
    name: 'Storage',
    nameRu: 'Склад',
    description: 'General storage room',
    defaultColor: '#2d2d2d',
    borderColor: '#737373',
    icon: '🗄️',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 5, height: 5 },
    recommended: false,
    suggestedObjects: ['shelf', 'crate', 'storage_locker'],
  },
  [RoomType.Armory]: {
    id: RoomType.Armory,
    name: 'Armory',
    nameRu: 'Оружейная',
    description: 'Weapons and equipment storage',
    defaultColor: '#3d1e1e',
    borderColor: '#dc2626',
    icon: '🔫',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 5, height: 4 },
    recommended: false,
    maxPerShip: 2,
    suggestedObjects: ['weapons_rack', 'armor_locker', 'ammo_storage'],
  },
  [RoomType.Airlock]: {
    id: RoomType.Airlock,
    name: 'Airlock',
    nameRu: 'Шлюз',
    description: 'Pressurized entry/exit point',
    defaultColor: '#1e1e3d',
    borderColor: '#6366f1',
    icon: '🚪',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 3, height: 3 },
    recommended: true,
    suggestedObjects: ['airlock_door', 'pressure_controls', 'suit_locker'],
  },
  [RoomType.DockingBay]: {
    id: RoomType.DockingBay,
    name: 'Docking Bay',
    nameRu: 'Стыковочный отсек',
    description: 'Ship docking area',
    defaultColor: '#1e2d3d',
    borderColor: '#3b82f6',
    icon: '🚀',
    minSize: { width: 4, height: 4 },
    maxSize: { width: 8, height: 8 },
    recommended: false,
    suggestedObjects: ['docking_clamps', 'fuel_lines', 'cargo_loader'],
  },
  [RoomType.Hangar]: {
    id: RoomType.Hangar,
    name: 'Hangar Bay',
    nameRu: 'Ангар',
    description: 'Spacecraft hangar',
    defaultColor: '#2d2d3d',
    borderColor: '#8b5cf6',
    icon: '🛸',
    minSize: { width: 6, height: 6 },
    maxSize: { width: 16, height: 12 },
    recommended: false,
    maxPerShip: 2,
    suggestedObjects: ['shuttle', 'fuel_pod', 'repair_station', 'hangar_controls'],
  },
  [RoomType.Turbolift]: {
    id: RoomType.Turbolift,
    name: 'Turbolift',
    nameRu: 'Турболифт',
    description: 'High-speed elevator',
    defaultColor: '#3d3d3d',
    borderColor: '#a855f7',
    icon: '🛗',
    minSize: { width: 1, height: 1 },
    maxSize: { width: 2, height: 2 },
    recommended: false,
    suggestedObjects: ['lift_controls'],
  },
  [RoomType.Laboratory]: {
    id: RoomType.Laboratory,
    name: 'Laboratory',
    nameRu: 'Лаборатория',
    description: 'Scientific research lab',
    defaultColor: '#1e3d3d',
    borderColor: '#22d3d1',
    icon: '🔬',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 6, height: 5 },
    recommended: false,
    suggestedObjects: ['lab_table', 'microscope', 'specimen_storage', 'computer_terminal'],
  },
  [RoomType.ScienceBay]: {
    id: RoomType.ScienceBay,
    name: 'Science Bay',
    nameRu: 'Научный отсек',
    description: 'Multi-purpose science facility',
    defaultColor: '#1e3d4d',
    borderColor: '#0891b2',
    icon: '🧪',
    minSize: { width: 4, height: 4 },
    maxSize: { width: 8, height: 6 },
    recommended: false,
    suggestedObjects: ['research_console', 'analysis_station', 'sample_storage'],
  },
  [RoomType.Observatory]: {
    id: RoomType.Observatory,
    name: 'Observatory',
    nameRu: 'Обсерватория',
    description: 'Stellar observation deck',
    defaultColor: '#0d1b2a',
    borderColor: '#60a5fa',
    icon: '🔭',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 6, height: 6 },
    recommended: false,
    maxPerShip: 1,
    suggestedObjects: ['telescope', 'star_chart', 'observation_chair'],
  },
  [RoomType.RecRoom]: {
    id: RoomType.RecRoom,
    name: 'Recreation Room',
    nameRu: 'Комната отдыха',
    description: 'Crew recreation area',
    defaultColor: '#2d3d2d',
    borderColor: '#4ade80',
    icon: '🎮',
    minSize: { width: 3, height: 3 },
    maxSize: { width: 6, height: 5 },
    recommended: false,
    suggestedObjects: ['sofa', 'table', 'game_console', 'holoscreen'],
  },
  [RoomType.Mess]: {
    id: RoomType.Mess,
    name: 'Mess Hall',
    nameRu: 'Столовая',
    description: 'Crew dining area',
    defaultColor: '#3d3028',
    borderColor: '#fb923c',
    icon: '🍽️',
    minSize: { width: 4, height: 3 },
    maxSize: { width: 8, height: 6 },
    recommended: true,
    suggestedObjects: ['dining_table', 'chair', 'food_replicator', 'serving_counter'],
  },
  [RoomType.JefferiesTube]: {
    id: RoomType.JefferiesTube,
    name: 'Jefferies Tube',
    nameRu: 'Технический туннель',
    description: 'Maintenance access tunnel',
    defaultColor: '#1a1a1a',
    borderColor: '#525252',
    icon: '🔩',
    minSize: { width: 1, height: 1 },
    maxSize: { width: 2, height: 2 },
    recommended: false,
    suggestedObjects: ['access_hatch', 'cable_conduit'],
  },
  [RoomType.ServerRoom]: {
    id: RoomType.ServerRoom,
    name: 'Server Room',
    nameRu: 'Серверная',
    description: 'Computer core and servers',
    defaultColor: '#1e1e2d',
    borderColor: '#818cf8',
    icon: '🖥️',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 5, height: 4 },
    recommended: false,
    suggestedObjects: ['server_rack', 'cooling_unit', 'terminal'],
  },
  [RoomType.SecurityPost]: {
    id: RoomType.SecurityPost,
    name: 'Security Post',
    nameRu: 'Пост охраны',
    description: 'Security checkpoint',
    defaultColor: '#3d2d1e',
    borderColor: '#f97316',
    icon: '🛡️',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 3 },
    recommended: false,
    suggestedObjects: ['security_console', 'weapons_locker', 'detention_field'],
  },
  [RoomType.Brig]: {
    id: RoomType.Brig,
    name: 'Brig',
    nameRu: 'Карцер',
    description: 'Detention cells',
    defaultColor: '#2d1e1e',
    borderColor: '#b91c1c',
    icon: '⛓️',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 4, height: 4 },
    recommended: false,
    maxPerShip: 1,
    suggestedObjects: ['cell', 'force_field', 'security_console'],
  },
  [RoomType.Generic]: {
    id: RoomType.Generic,
    name: 'Generic Room',
    nameRu: 'Помещение',
    description: 'Unspecified room',
    defaultColor: '#2d2d2d',
    borderColor: '#6b7280',
    icon: '⬜',
    minSize: { width: 2, height: 2 },
    maxSize: { width: 10, height: 10 },
    recommended: false,
    suggestedObjects: [],
  },
  [RoomType.Corridor]: {
    id: RoomType.Corridor,
    name: 'Corridor',
    nameRu: 'Коридор',
    description: 'Passage between rooms',
    defaultColor: '#1e1e1e',
    borderColor: '#4b5563',
    icon: '➡️',
    minSize: { width: 1, height: 1 },
    maxSize: { width: 20, height: 3 },
    recommended: false,
    suggestedObjects: [],
  },
}

// ============================================================================
// Door Types
// ============================================================================

export enum DoorType {
  Standard = 'standard',
  Blast = 'blast',
  Airlock = 'airlock',
  Emergency = 'emergency',
  Hidden = 'hidden',
  Secure = 'secure',
}

export interface Door {
  id: string
  type: DoorType
  position: Point
  rotation: number // 0, 90, 180, 270
  width: number
  isOpen: boolean
  isLocked: boolean
  securityLevel: number
}

// ============================================================================
// Room Definition
// ============================================================================

export interface Room {
  id: string
  type: RoomType
  name: string
  bounds: Rect
  color?: string
  borderColor?: string
  doors: Door[]
  objects: MapObject[]
  metadata: Record<string, unknown>
  deckLevel: number
  isVisible: boolean
  isLocked: boolean
}

// ============================================================================
// Corridor Definition
// ============================================================================

export enum CorridorStyle {
  Standard = 'standard',
  Wide = 'wide',
  Narrow = 'narrow',
  Maintenance = 'maintenance',
  VIP = 'vip',
}

export interface CorridorSegment {
  start: Point
  end: Point
}

// Attachment point - links corridor endpoint to a room wall
export interface CorridorAttachment {
  roomId: string
  wall: 'top' | 'right' | 'bottom' | 'left'
  offset: number // 0-1 position along the wall
}

/**
 * Canonical, topology-aware reference for a corridor endpoint.
 *
 * `startAttachment` / `endAttachment` remain available for legacy projects.
 * Anchors are optional during the migration and must only be emitted when the
 * referenced topology is known exactly (never inferred from a nearest room).
 */
export type CorridorEndpointAnchor =
  | {
      kind: 'roomPort'
      roomId: string
      portId: string
      doorId?: string
      position: Point
    }
  | {
      kind: 'junction'
      junctionId: string
      position: Point
    }
  | {
      kind: 'corridorPoint'
      pointId: string
      position: Point
    }
  | {
      kind: 'free'
      position: Point
    }

export interface Corridor {
  id: string
  style: CorridorStyle
  segments: CorridorSegment[]
  segmentIds?: string[]
  width: number
  color?: string
  doors: Door[]
  connectedRoomIds: string[]
  deckLevel: number
  // Optional attachments for start and end points
  startAttachment?: CorridorAttachment
  endAttachment?: CorridorAttachment
  // Canonical endpoint anchors; optional while legacy attachments are supported
  startAnchor?: CorridorEndpointAnchor
  endAnchor?: CorridorEndpointAnchor
}

// ============================================================================
// Map Objects (Furniture, Equipment, etc.)
// ============================================================================

export enum ObjectCategory {
  Furniture = 'furniture',
  Equipment = 'equipment',
  Decoration = 'decoration',
  Hazard = 'hazard',
  Interactive = 'interactive',
  Marker = 'marker',
}

export interface MapObject {
  id: string
  templateId: string
  name: string
  category: ObjectCategory
  position: Point
  size: Size
  rotation: number
  color?: string
  isVisible: boolean
  layer: LayerType
  metadata: Record<string, unknown>
}

// ============================================================================
// Layers
// ============================================================================

export enum LayerType {
  Structure = 'structure',
  Furniture = 'furniture',
  Ventilation = 'ventilation',
  Electrical = 'electrical',
  Security = 'security',
  Annotations = 'annotations',
  GM = 'gm',
}

export interface Layer {
  id: LayerType
  name: string
  nameRu: string
  isVisible: boolean
  isLocked: boolean
  opacity: number
  order: number
}

export const DEFAULT_LAYERS: Layer[] = [
  { id: LayerType.Structure, name: 'Structure', nameRu: 'Структура', isVisible: true, isLocked: false, opacity: 1, order: 0 },
  { id: LayerType.Furniture, name: 'Furniture', nameRu: 'Мебель', isVisible: true, isLocked: false, opacity: 1, order: 1 },
  { id: LayerType.Ventilation, name: 'Ventilation', nameRu: 'Вентиляция', isVisible: false, isLocked: false, opacity: 0.7, order: 2 },
  { id: LayerType.Electrical, name: 'Electrical', nameRu: 'Электрика', isVisible: false, isLocked: false, opacity: 0.7, order: 3 },
  { id: LayerType.Security, name: 'Security', nameRu: 'Безопасность', isVisible: false, isLocked: false, opacity: 0.7, order: 4 },
  { id: LayerType.Annotations, name: 'Annotations', nameRu: 'Пометки', isVisible: true, isLocked: false, opacity: 1, order: 5 },
  { id: LayerType.GM, name: 'GM Only', nameRu: 'Только для ГМ', isVisible: true, isLocked: false, opacity: 1, order: 6 },
]

// ============================================================================
// Map / Project
// ============================================================================

/**
 * Junction where corridors meet (T, X, hub, etc.)
 */
export interface CorridorJunction {
  id: string
  position: Point
  kind: 'T' | 'X' | 'hub' | 'airlockChamber'
  /** IDs of corridors connected at this junction */
  corridorIds: string[]
  /** Optional: is this a security checkpoint? */
  isCheckpoint?: boolean
  /** Optional: bulkhead door */
  isBulkhead?: boolean
}

/**
 * Line jump - visual crossing of corridors without connection
 */
export interface CorridorLineJump {
  id: string
  position: Point
  /** Corridor ID that goes "over" (continuous) */
  topCorridorId: string
  /** Corridor ID that goes "under" (has gap/arc) */
  bottomCorridorId: string
  /** Visual style */
  style: 'arc' | 'gap' | 'sharp'
  /** Size of the jump arc/gap in pixels */
  size: number
}

/**
 * Transitional per-deck bridge for canonical fixed-point facility geometry.
 *
 * Coordinates are expressed in geometry units; `unitsPerCell` declares their
 * relationship to the editor grid without coupling the document to pixels.
 */
export interface DeckGeometry {
  unitsPerCell: number
  facilityEnvelope: MultiPolygon
  structuralVoids: readonly MultiPolygon[]
}

export interface Deck {
  id: string
  name: string
  level: number
  rooms: Room[]
  corridors: Corridor[]
  /** Junctions where corridors meet */
  junctions?: CorridorJunction[]
  /** Line jumps where corridors cross without connecting */
  lineJumps?: CorridorLineJump[]
  /** Optional canonical facility envelope; absent on legacy projects. */
  geometry?: DeckGeometry
}

export interface MapProject {
  id: string
  name: string
  description: string
  version: string
  createdAt: string
  updatedAt: string
  gridSize: number
  decks: Deck[]
  layers: Layer[]
  theme: MapTheme
  metadata: Record<string, unknown>
}

// ============================================================================
// Themes
// ============================================================================

export enum MapThemeId {
  Blueprint = 'blueprint',
  Terminal = 'terminal',
  CleanDraft = 'clean_draft',
  DarkMetal = 'dark_metal',
  SciFiNeon = 'scifi_neon',
}

export interface MapTheme {
  id: MapThemeId
  name: string
  backgroundColor: string
  gridColor: string
  wallColor: string
  doorColor: string
  textColor: string
  accentColor: string
}

export const MAP_THEMES: Record<MapThemeId, MapTheme> = {
  [MapThemeId.Blueprint]: {
    id: MapThemeId.Blueprint,
    name: 'Blueprint',
    backgroundColor: '#0a1628',
    gridColor: '#1e3a5f',
    wallColor: '#4a90d9',
    doorColor: '#60a5fa',
    textColor: '#93c5fd',
    accentColor: '#3b82f6',
  },
  [MapThemeId.Terminal]: {
    id: MapThemeId.Terminal,
    name: 'Terminal',
    backgroundColor: '#0a0a0a',
    gridColor: '#1a2e1a',
    wallColor: '#00ff9f',
    doorColor: '#00d4ff',
    textColor: '#00ff9f',
    accentColor: '#00ff9f',
  },
  [MapThemeId.CleanDraft]: {
    id: MapThemeId.CleanDraft,
    name: 'Clean Draft',
    backgroundColor: '#ffffff',
    gridColor: '#e5e7eb',
    wallColor: '#1f2937',
    doorColor: '#374151',
    textColor: '#111827',
    accentColor: '#3b82f6',
  },
  [MapThemeId.DarkMetal]: {
    id: MapThemeId.DarkMetal,
    name: 'Dark Metal',
    backgroundColor: '#18181b',
    gridColor: '#27272a',
    wallColor: '#71717a',
    doorColor: '#a1a1aa',
    textColor: '#d4d4d8',
    accentColor: '#f59e0b',
  },
  [MapThemeId.SciFiNeon]: {
    id: MapThemeId.SciFiNeon,
    name: 'Sci-Fi Neon',
    backgroundColor: '#0f0d1a',
    gridColor: '#1e1b2e',
    wallColor: '#8b5cf6',
    doorColor: '#a855f7',
    textColor: '#c4b5fd',
    accentColor: '#f0abfc',
  },
}

// ============================================================================
// Editor State Types
// ============================================================================

export enum EditorTool {
  Select = 'select',
  Pan = 'pan',
  Room = 'room',
  Corridor = 'corridor',
  Door = 'door',
  Object = 'object',
  Eraser = 'eraser',
  Annotate = 'annotate',
  Text = 'text',
  Icon = 'icon',
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Selection {
  type: 'room' | 'corridor' | 'corridor-segment' | 'object' | 'door' | null
  ids: string[]
}

// ============================================================================
// Presets
// ============================================================================

export interface RoomPreset {
  id: string
  name: string
  description: string
  roomType: RoomType
  bounds: Rect
  objects: Omit<MapObject, 'id'>[]
  doors: Omit<Door, 'id'>[]
  isBuiltIn: boolean
  tags: string[]
}

// ============================================================================
// Generation Parameters
// ============================================================================

export interface GenerationParams {
  seed?: number
  roomCount: number
  deckCount: number
  requiredRooms: RoomType[]
  roomDistribution: Partial<Record<RoomType, number>>
  complexity: 'linear' | 'branching' | 'complex'
  loopiness: number // 0-1, how many extra connections
  shipType: 'fighter' | 'freighter' | 'cruiser' | 'station' | 'base'
}

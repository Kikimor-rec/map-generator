/**
 * Occupancy-first grid generator.
 *
 * This module treats the tile canvas as the source of truth. Corridors are
 * carved cells, not visual paths. Graph edges and editor polylines are derived
 * after carving.
 */

import type {
  ProgrammedRoom,
  GenerationRequest,
  RoomProgram,
  SeededRNG,
} from '../types'
import { createRNG } from '../rng'
import { generateRoomProgram } from '../roomProgram'
import { TileType, type GridCanvas, type Point, type Rect, type RoomPlacement, type ZoneDefinition } from './types'
import { createCanvas, fillRect, getTile, isInBounds } from './canvas'
import { getDefaultZones, partitionZones } from './zones'
import { convertToMapJSON, generateDebugOutput } from './convert'
import { addConnectorIdToTile, connectorIdForRooms, getTileConnectorIds } from './corridorGraph'
import { carveHull, getDefaultHullConfig } from './hull'
import { carveStationCirculation } from './stationCirculation'
import { carveOutpostCirculation } from './outpostCirculation'
import type { HullLayout } from './types'
import {
  rankFunctionalRoomSlots,
  type FunctionalModuleKind,
  type FunctionalRoomSlotCandidate,
} from './functionalRoomPlacement'
import type { GridGeneratorOptions, GridGeneratorResult } from './index'
import { classifyDoor, type ExteriorProximity } from './doorClassifier'
import {
  canInterruptBackbone,
  planRoomCirculation,
  type RoomCirculationPlan,
} from './roomCirculation'

interface CorridorRun {
  id: string
  points: Point[]
}

interface Slot {
  rect: Rect
  door: Point
  corridorStart: Point
  anchor: Point
  zone: string
}

interface BackboneTransitSlot {
  rect: Rect
  doors: Point[]
  orientation: 'horizontal' | 'vertical' | 'hub'
  runId?: string
  zone: string
}

type FunctionalSlot = Slot & FunctionalRoomSlotCandidate

interface VerticalHullRun {
  x: number
  startY: number
  endY: number
}

interface HorizontalHullSpan {
  left: number
  right: number
}

const MAIN_CORRIDOR_WIDTH = 1

export function generateGridMapV2(options: GridGeneratorOptions = {}): GridGeneratorResult {
  const startTime = performance.now()
  const timing = {
    total: 0,
    hull: 0,
    zones: 0,
    spine: 0,
    rooms: 0,
    doors: 0,
    convert: 0,
  }

  try {
    const seed = options.seed ?? Date.now().toString()
    const archetype = options.archetype ?? 'ship'
    const subtype = options.subtype ?? 'explorer'
    const sizeTier = options.sizeTier ?? 'md'
    const styleProfile = options.styleProfile ?? 'utilitarian'
    const loopiness = options.loopiness ?? 0.5
    const danger = options.danger ?? 0.3
    const rng = createRNG(seed)

    const request: GenerationRequest = {
      seed: String(seed),
      archetype,
      subtype,
      styleProfile: styleProfile as any,
      sizeTier,
      loopiness,
      danger,
    }

    const roomProgram = generateRoomProgram({ request })
    const canvas = createCanvas(archetype, sizeTier)

    const hullStart = performance.now()
    const hullLayout = carveHull(
      canvas,
      getDefaultHullConfig(archetype, subtype),
      rng,
      { loopiness }
    )
    const facilityBounds = getFacilityBounds(canvas)
    timing.hull = performance.now() - hullStart

    const zonesStart = performance.now()
    const zones = getDefaultZones(archetype, subtype)
    if (archetype === 'station') {
      partitionZones(canvas, zones, rng)
    } else if (archetype === 'outpost' && hullLayout?.kind === 'clustered-outpost') {
      assignOutpostModuleZones(canvas, zones, hullLayout, subtype)
    } else {
      assignZones(canvas, zones)
    }
    timing.zones = performance.now() - zonesStart

    const spineStart = performance.now()
    const spines = carveBaseSpines(canvas, archetype, loopiness, hullLayout)
    markJunctionTiles(canvas)
    timing.spine = performance.now() - spineStart

    const roomsStart = performance.now()
    const placements = placeRoomsOnCorridorBays(
      canvas,
      roomProgram,
      zones,
      spines,
      rng,
      subtype,
      facilityBounds,
      hullLayout
    )
    timing.rooms = performance.now() - roomsStart

    const doorsStart = performance.now()
    placeDoorTiles(canvas, placements)
    markJunctionTiles(canvas)
    timing.doors = performance.now() - doorsStart

    const convertStart = performance.now()
    const map = convertToMapJSON(canvas, placements, zones, request, roomProgram)
    timing.convert = performance.now() - convertStart

    timing.total = performance.now() - startTime

    return {
      success: true,
      map,
      canvas,
      placements,
      debugOutput: options.debug ? generateDebugOutput(canvas) : undefined,
      timing,
    }
  } catch (error) {
    timing.total = performance.now() - startTime
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timing,
    }
  }
}

function assignZones(canvas: GridCanvas, zones: ZoneDefinition[]): void {
  if (zones.length === 0) return

  for (let y = 0; y < canvas.height; y++) {
    const ratio = y / Math.max(1, canvas.height - 1)
    let cumulative = 0
    let selected = zones[zones.length - 1]
    for (const zone of zones) {
      cumulative += zone.sizePercent
      if (ratio <= cumulative) {
        selected = zone
        break
      }
    }
    for (let x = 0; x < canvas.width; x++) {
      const tile = canvas.tiles[y][x]
      if (tile.type !== TileType.VOID) {
        canvas.tiles[y][x] = { ...tile, zoneId: selected.id }
      }
    }
  }
}

function getFacilityBounds(canvas: GridCanvas): Rect {
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (canvas.tiles[y][x].type === TileType.VOID) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return maxX < minX || maxY < minY
    ? { x: 0, y: 0, width: canvas.width, height: canvas.height }
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function nearestOutpostModule(
  point: Point,
  layout: HullLayout
): HullLayout['modules'][number] {
  return [...layout.modules].sort((a, b) => {
    const distanceA = (point.x - a.center.x) ** 2 + (point.y - a.center.y) ** 2
    const distanceB = (point.x - b.center.x) ** 2 + (point.y - b.center.y) ** 2
    return distanceA - distanceB || a.id.localeCompare(b.id)
  })[0]
}

function getOutpostModuleKind(
  role: HullLayout['modules'][number]['kind'],
  satelliteIndex: number,
  subtype: string
): FunctionalModuleKind {
  if (role === 'hub') return 'command'

  const plans: Record<string, FunctionalModuleKind[]> = {
    science: ['science', 'habitation', 'utility', 'access', 'security', 'logistics'],
    research: ['science', 'habitation', 'utility', 'access', 'security', 'logistics'],
    mining: ['industrial', 'logistics', 'utility', 'habitation', 'access', 'security'],
    military: ['security', 'utility', 'habitation', 'access', 'logistics', 'industrial'],
    blacksite: ['security', 'science', 'utility', 'habitation', 'access', 'logistics'],
    frontier: ['habitation', 'utility', 'logistics', 'access', 'science', 'security'],
    ruins: ['industrial', 'utility', 'habitation', 'access', 'science', 'security'],
  }
  const plan = plans[subtype.toLowerCase()] ?? plans.frontier
  return plan[satelliteIndex % plan.length]
}

function annotateFunctionalSlot(
  canvas: GridCanvas,
  slot: Slot,
  subtype: string,
  hullLayout?: HullLayout
): FunctionalSlot {
  const annotated: FunctionalSlot = {
    ...slot,
    id: rectKey(slot.rect),
    zoneId: slot.zone,
    touchesExterior: rectTouchesExterior(canvas, slot.rect),
    connectionDistance:
      Math.abs(slot.corridorStart.x - slot.anchor.x) +
      Math.abs(slot.corridorStart.y - slot.anchor.y),
  }

  if (canvas.archetype !== 'outpost' || hullLayout?.kind !== 'clustered-outpost') {
    return annotated
  }

  const center = {
    x: slot.rect.x + slot.rect.width / 2,
    y: slot.rect.y + slot.rect.height / 2,
  }
  const nearest = nearestOutpostModule(center, hullLayout)
  const satelliteIndex = Math.max(0, hullLayout.modules.indexOf(nearest) - 1)
  return {
    ...annotated,
    moduleRole: nearest.kind,
    moduleKind: getOutpostModuleKind(nearest.kind, satelliteIndex, subtype),
  }
}

function rectTouchesExterior(canvas: GridCanvas, rect: Rect): boolean {
  for (let x = rect.x; x < rect.x + rect.width; x += 1) {
    if (isVoidOrOutOfBounds(canvas, x, rect.y - 1)) return true
    if (isVoidOrOutOfBounds(canvas, x, rect.y + rect.height)) return true
  }
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (isVoidOrOutOfBounds(canvas, rect.x - 1, y)) return true
    if (isVoidOrOutOfBounds(canvas, rect.x + rect.width, y)) return true
  }
  return false
}

function assignOutpostModuleZones(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  layout: HullLayout,
  subtype: string
): void {
  if (layout.kind !== 'clustered-outpost' || layout.modules.length === 0) return

  const mainZone = zones.find(zone => zone.id === 'main')?.id ?? zones[0]?.id ?? 'main'
  const supportZone = zones.find(zone => zone.id === 'support')?.id ?? mainZone
  const specializedZone = zones.find(zone => zone.id === 'specialized')?.id ?? supportZone

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const tile = canvas.tiles[y][x]
      if (tile.type === TileType.VOID) continue

      const nearest = nearestOutpostModule({ x, y }, layout)
      const satelliteIndex = Math.max(0, layout.modules.indexOf(nearest) - 1)
      const moduleKind = getOutpostModuleKind(nearest.kind, satelliteIndex, subtype)
      const zoneId = nearest.kind === 'hub'
        ? mainZone
        : moduleKind === 'habitation' || moduleKind === 'utility'
          ? supportZone
          : specializedZone
      canvas.tiles[y][x] = { ...tile, zoneId }
    }
  }
}

function carveBaseSpines(
  canvas: GridCanvas,
  archetype: string,
  loopiness: number,
  hullLayout?: HullLayout
): CorridorRun[] {
  if (archetype === 'ship') {
    return carveShipCirculation(canvas)
  }

  if (archetype === 'station') {
    return carveStationCirculation(canvas, loopiness)
  }

  if (archetype === 'outpost' && hullLayout?.kind === 'clustered-outpost') {
    return carveOutpostCirculation(canvas, hullLayout)
  }

  const runs: CorridorRun[] = []
  const mainX = Math.max(4, Math.floor(canvas.width * 0.5))
  const top = 2
  const bottom = canvas.height - 3
  const midY = Math.floor(canvas.height * 0.62)
  const upperY = Math.floor(canvas.height * 0.38)

  runs.push(carveRectCorridor(canvas, 'spine-main', { x: mainX, y: top, width: MAIN_CORRIDOR_WIDTH, height: bottom - top + 1 }))
  runs.push(carveRectCorridor(canvas, 'spine-mid', { x: 2, y: midY, width: canvas.width - 4, height: MAIN_CORRIDOR_WIDTH }))

  if (canvas.height >= 44) {
    runs.push(carveRectCorridor(canvas, 'spine-upper', { x: mainX, y: upperY, width: Math.max(4, canvas.width - mainX - 3), height: MAIN_CORRIDOR_WIDTH }))
  }

  if (archetype !== 'ship') {
    const crossX = Math.floor(canvas.width * 0.62)
    runs.push(carveRectCorridor(canvas, 'spine-secondary', { x: crossX, y: 2, width: MAIN_CORRIDOR_WIDTH, height: canvas.height - 4 }))
  }

  markJunctionTiles(canvas)
  return runs
}

function carveShipCirculation(canvas: GridCanvas): CorridorRun[] {
  const longestRun = findLongestVerticalHullRun(canvas)
  if (!longestRun) {
    throw new Error('Unable to find a longitudinal hull run for ship circulation')
  }

  const inset = longestRun.endY - longestRun.startY >= 4 ? 1 : 0
  const mainStartY = longestRun.startY + inset
  const mainEndY = longestRun.endY - inset
  const main = carveRectCorridor(canvas, 'spine-main', {
    x: longestRun.x,
    y: mainStartY,
    width: MAIN_CORRIDOR_WIDTH,
    height: mainEndY - mainStartY + 1,
  })

  const ratios = canvas.sizeTier === 'xs' || canvas.sizeTier === 'sm'
    ? [0.55]
    : [0.36, 0.66]
  const usedYs: number[] = []
  const transverseRuns: CorridorRun[] = []

  for (let index = 0; index < ratios.length; index += 1) {
    const y = chooseTransverseY(canvas, mainStartY, mainEndY, longestRun.x, ratios[index], usedYs)
    if (y === null) continue

    const span = findHullSpanAtRow(canvas, y, longestRun.x)
    if (!span) continue

    usedYs.push(y)
    transverseRuns.push(carveRectCorridor(canvas, `spine-transverse-${index + 1}`, {
      x: span.left + 1,
      y,
      width: span.right - span.left - 1,
      height: MAIN_CORRIDOR_WIDTH,
    }))
  }

  markJunctionTiles(canvas)
  return [main, ...transverseRuns]
}

function findLongestVerticalHullRun(canvas: GridCanvas): VerticalHullRun | null {
  let minHullX = canvas.width
  let maxHullX = -1
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (canvas.tiles[y][x].type !== TileType.HULL) continue
      minHullX = Math.min(minHullX, x)
      maxHullX = Math.max(maxHullX, x)
    }
  }
  if (maxHullX < minHullX) return null

  const hullCenterX = (minHullX + maxHullX) / 2
  let best: VerticalHullRun | null = null

  const consider = (candidate: VerticalHullRun) => {
    if (!best) {
      best = candidate
      return
    }

    const candidateLength = candidate.endY - candidate.startY + 1
    const bestLength = best.endY - best.startY + 1
    const candidateCenterDistance = Math.abs(candidate.x - hullCenterX)
    const bestCenterDistance = Math.abs(best.x - hullCenterX)
    if (
      candidateLength > bestLength ||
      (
        candidateLength === bestLength &&
        (
          candidateCenterDistance < bestCenterDistance ||
          (candidateCenterDistance === bestCenterDistance && candidate.x < best.x)
        )
      )
    ) {
      best = candidate
    }
  }

  for (let x = minHullX; x <= maxHullX; x += 1) {
    let startY: number | null = null
    for (let y = 0; y <= canvas.height; y += 1) {
      const isHull = y < canvas.height && canvas.tiles[y][x].type === TileType.HULL
      if (isHull && startY === null) {
        startY = y
      } else if (!isHull && startY !== null) {
        consider({ x, startY, endY: y - 1 })
        startY = null
      }
    }
  }

  return best
}

function chooseTransverseY(
  canvas: GridCanvas,
  mainStartY: number,
  mainEndY: number,
  mainX: number,
  targetRatio: number,
  usedYs: number[]
): number | null {
  const targetY = mainStartY + Math.round((mainEndY - mainStartY) * targetRatio)
  const candidates: Array<{ y: number; distance: number; width: number }> = []

  for (let y = mainStartY + 2; y <= mainEndY - 2; y += 1) {
    if (usedYs.some(usedY => Math.abs(usedY - y) < 6)) continue
    const span = findHullSpanAtRow(canvas, y, mainX)
    if (!span) continue
    const width = span.right - span.left + 1
    if (width < 7) continue
    candidates.push({ y, distance: Math.abs(y - targetY), width })
  }

  candidates.sort((a, b) => (
    a.distance - b.distance ||
    b.width - a.width ||
    a.y - b.y
  ))
  return candidates[0]?.y ?? null
}

function findHullSpanAtRow(
  canvas: GridCanvas,
  y: number,
  throughX: number
): HorizontalHullSpan | null {
  const isBackboneCarvable = (x: number) => {
    const tile = getTile(canvas, x, y)
    return !!tile && (
      tile.type === TileType.HULL ||
      tile.type === TileType.CORRIDOR ||
      tile.type === TileType.JUNCTION
    )
  }
  if (!isBackboneCarvable(throughX)) return null

  let left = throughX
  let right = throughX
  while (isBackboneCarvable(left - 1)) left -= 1
  while (isBackboneCarvable(right + 1)) right += 1
  return { left, right }
}

function carveRectCorridor(canvas: GridCanvas, id: string, rect: Rect): CorridorRun {
  const points: Point[] = []
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (!isInBounds(canvas, x, y)) continue
      const existing = getTile(canvas, x, y)
      if (!existing || existing.type === TileType.VOID || existing.type === TileType.FLOOR) continue
      canvas.tiles[y][x] = addConnectorIdToTile({ ...existing, type: TileType.CORRIDOR, spineLevel: 0 }, id)
      points.push({ x, y })
    }
  }
  return { id, points }
}

function placeRoomsOnCorridorBays(
  canvas: GridCanvas,
  roomProgram: RoomProgram,
  zones: ZoneDefinition[],
  spines: CorridorRun[],
  rng: SeededRNG,
  subtype: string,
  facilityBounds: Rect,
  hullLayout?: HullLayout
): RoomPlacement[] {
  const placements: RoomPlacement[] = []
  const occupied: Rect[] = []
  const sortedRooms = [...roomProgram.rooms].sort((a, b) => {
    const importance = { primary: 0, secondary: 1, tertiary: 2 }
    const ai = importance[a.importance] ?? 2
    const bi = importance[b.importance] ?? 2
    if (ai !== bi) return ai - bi
    return b.estimatedTiles - a.estimatedTiles
  })

  const circulationPlans = new Map<string, RoomCirculationPlan>()
  for (const room of sortedRooms) {
    circulationPlans.set(
      room.id,
      planRoomCirculation(room, canvas.archetype, rng)
    )
  }

  const transitPlacements = placeBackboneTransitRooms(
    canvas,
    sortedRooms,
    spines,
    circulationPlans,
    occupied,
    rng
  )
  placements.push(...transitPlacements)
  const transitRoomIds = new Set(transitPlacements.map(room => room.roomId))

  const slots = buildRoomSlots(canvas, zones, spines, rng)
  const functionalSlots = slots.map(slot => annotateFunctionalSlot(
    canvas,
    slot,
    subtype,
    hullLayout
  ))

  for (const room of sortedRooms) {
    if (transitRoomIds.has(room.id)) continue
    const preferredSlots = rankFunctionalRoomSlots(room, functionalSlots, {
      archetype: canvas.archetype,
      subtype,
      width: canvas.width,
      height: canvas.height,
      facilityBounds,
      center: hullLayout?.kind === 'clustered-outpost'
        ? hullLayout.modules.find(module => module.kind === 'hub')?.center
        : undefined,
    }).map(candidate => candidate.slot)

    let placed: RoomPlacement | null = null
    for (const slot of preferredSlots) {
      if (slot.rect.width < 2 || slot.rect.height < 2) continue
      if (rectsOverlapAny(slot.rect, occupied, 1)) continue
      if (!canPlaceRoom(canvas, slot.rect)) continue
      placed = carveRoom(canvas, room, slot)
      break
    }

    if (!placed) {
      const fallbackSlot = preferredSlots.find(slot => (
        !rectsOverlapAny(slot.rect, occupied, 1) &&
        canPlaceRoom(canvas, slot.rect)
      ))
      if (!fallbackSlot) continue
      placed = carveRoom(canvas, room, fallbackSlot)
    }

    if (!carvePortConnection(canvas, placed, placed.doorPositions[0], rng)) {
      for (const tile of placed.tiles) {
        canvas.tiles[tile.y][tile.x] = {
          type: TileType.HULL,
          zoneId: placed.zone,
        }
      }
      continue
    }

    placements.push(placed)
    occupied.push(placed.bounds)
  }

  assignRoomCirculation(canvas, placements, circulationPlans)
  return placements
}

function placeBackboneTransitRooms(
  canvas: GridCanvas,
  rooms: ProgrammedRoom[],
  spines: CorridorRun[],
  plans: Map<string, RoomCirculationPlan>,
  occupied: Rect[],
  rng: SeededRNG
): RoomPlacement[] {
  const targetCount = canvas.sizeTier === 'lg' || canvas.sizeTier === 'xl' ? 2 : 1
  const candidates = rooms.filter(canInterruptBackbone).sort((a, b) => {
    const aHub = plans.get(a.id)?.desiredRole === 'hub' ? 0 : 1
    const bHub = plans.get(b.id)?.desiredRole === 'hub' ? 0 : 1
    return aHub - bHub
  })
  const placements: RoomPlacement[] = []

  for (const room of candidates) {
    if (placements.length >= targetCount) break
    const slot = findBackboneTransitSlot(canvas, room, spines, occupied, rng)
    if (!slot) continue

    const originalPlan = plans.get(room.id)
    plans.set(room.id, originalPlan?.desiredRole === 'hub'
      ? originalPlan
      : {
          desiredRole: 'through',
          targetConnectionCount: 2,
          reason: 'backbone-interruption',
        })

    const placement = carveBackboneTransitRoom(canvas, room, slot)
    placements.push(placement)
    occupied.push(slot.rect)
  }

  return placements
}

function findBackboneTransitSlot(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  spines: CorridorRun[],
  occupied: Rect[],
  rng: SeededRNG
): BackboneTransitSlot | null {
  const preferredWidth = clampRoomDimension(room.estimatedWidth)
  const preferredHeight = clampRoomDimension(room.estimatedHeight)
  const sizes = uniqueSizes([
    { width: preferredWidth, height: preferredHeight },
    { width: 4, height: 4 },
    { width: 3, height: 3 },
  ])
  const slots: BackboneTransitSlot[] = []
  const seen = new Set<string>()

  for (const run of spines) {
    const runKeys = new Set(run.points.map(pointKey))
    for (const point of run.points) {
      const vertical =
        runKeys.has(pointKey({ x: point.x, y: point.y - 1 })) &&
        runKeys.has(pointKey({ x: point.x, y: point.y + 1 }))
      const horizontal =
        runKeys.has(pointKey({ x: point.x - 1, y: point.y })) &&
        runKeys.has(pointKey({ x: point.x + 1, y: point.y }))

      for (const size of sizes) {
        if (vertical) {
          appendTransitSlotsAt(
            canvas, slots, seen, occupied, run.id, point, size, 'vertical'
          )
        }
        if (horizontal) {
          appendTransitSlotsAt(
            canvas, slots, seen, occupied, run.id, point, size, 'horizontal'
          )
        }
      }
    }
  }

  if (canvas.archetype === 'station') {
    slots.push(...findJunctionTransitSlots(canvas, occupied))
  }

  return rng.shuffle(slots)[0] ?? null
}


function findJunctionTransitSlots(
  canvas: GridCanvas,
  occupied: Rect[]
): BackboneTransitSlot[] {
  const slots: BackboneTransitSlot[] = []

  for (let y = 2; y < canvas.height - 2; y += 1) {
    for (let x = 2; x < canvas.width - 2; x += 1) {
      const center = getTile(canvas, x, y)
      if (!isCorridorLike(center)) continue
      const corridorDegree = [
        getTile(canvas, x, y - 1),
        getTile(canvas, x + 1, y),
        getTile(canvas, x, y + 1),
        getTile(canvas, x - 1, y),
      ].filter(isCorridorLike).length
      if (corridorDegree < 3 && getTileConnectorIds(center).length < 2) continue

      const rect = { x: x - 1, y: y - 1, width: 3, height: 3 }
      if (
        rectsOverlapAny(rect, occupied, 2) ||
        !rectContainsOnlyHullAndCorridor(canvas, rect)
      ) {
        continue
      }

      const doors = junctionExitDoors(canvas, rect)
      if (doors.length < 3) continue
      slots.push({
        rect,
        doors,
        orientation: 'hub',
        zone: center?.zoneId ?? 'main',
      })
    }
  }

  return slots
}

function rectContainsOnlyHullAndCorridor(
  canvas: GridCanvas,
  rect: Rect
): boolean {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const tile = getTile(canvas, x, y)
      if (!tile || (tile.type !== TileType.HULL && !isCorridorLike(tile))) {
        return false
      }
    }
  }
  return true
}

function junctionExitDoors(canvas: GridCanvas, rect: Rect): Point[] {
  const candidates = [
    ...Array.from({ length: rect.width }, (_, offset) => ({
      door: { x: rect.x + offset, y: rect.y },
      outside: { x: rect.x + offset, y: rect.y - 1 },
      wall: 'top',
    })),
    ...Array.from({ length: rect.height }, (_, offset) => ({
      door: { x: rect.x + rect.width - 1, y: rect.y + offset },
      outside: { x: rect.x + rect.width, y: rect.y + offset },
      wall: 'right',
    })),
    ...Array.from({ length: rect.width }, (_, offset) => ({
      door: { x: rect.x + offset, y: rect.y + rect.height - 1 },
      outside: { x: rect.x + offset, y: rect.y + rect.height },
      wall: 'bottom',
    })),
    ...Array.from({ length: rect.height }, (_, offset) => ({
      door: { x: rect.x, y: rect.y + offset },
      outside: { x: rect.x - 1, y: rect.y + offset },
      wall: 'left',
    })),
  ] as Array<{ door: Point; outside: Point; wall: RoomWall }>

  const selected = new Map<RoomWall, Point>()
  for (const candidate of candidates) {
    if (!isCorridorLike(getTile(canvas, candidate.outside.x, candidate.outside.y))) {
      continue
    }
    if (!selected.has(candidate.wall)) {
      selected.set(candidate.wall, candidate.door)
    }
  }
  return [...selected.values()]
}

function appendTransitSlotsAt(
  canvas: GridCanvas,
  slots: BackboneTransitSlot[],
  seen: Set<string>,
  occupied: Rect[],
  runId: string,
  point: Point,
  size: { width: number; height: number },
  orientation: 'horizontal' | 'vertical'
): void {
  const crossSize = orientation === 'vertical' ? size.width : size.height
  const offsets = Array.from(new Set([
    Math.floor(crossSize / 2),
    1,
    Math.max(1, crossSize - 2),
  ]))

  for (const offset of offsets) {
    const rect = orientation === 'vertical'
      ? {
          x: point.x - offset,
          y: point.y - Math.floor(size.height / 2),
          width: size.width,
          height: size.height,
        }
      : {
          x: point.x - Math.floor(size.width / 2),
          y: point.y - offset,
          width: size.width,
          height: size.height,
        }
    const key = `${orientation}:${rectKey(rect)}:${runId}`
    if (
      seen.has(key) ||
      rectsOverlapAny(rect, occupied, 2) ||
      !isViableBackboneTransitSlot(canvas, rect, orientation, point, runId)
    ) {
      continue
    }
    seen.add(key)

    const doors: [Point, Point] = orientation === 'vertical'
      ? [
          { x: point.x, y: rect.y },
          { x: point.x, y: rect.y + rect.height - 1 },
        ]
      : [
          { x: rect.x, y: point.y },
          { x: rect.x + rect.width - 1, y: point.y },
        ]
    const centerTile = getTile(
      canvas,
      rect.x + Math.floor(rect.width / 2),
      rect.y + Math.floor(rect.height / 2)
    )
    slots.push({
      rect,
      doors,
      orientation,
      runId,
      zone: centerTile?.zoneId ?? 'main',
    })
  }
}

function isViableBackboneTransitSlot(
  canvas: GridCanvas,
  rect: Rect,
  orientation: 'horizontal' | 'vertical',
  axisPoint: Point,
  runId: string
): boolean {
  if (
    rect.x < 1 ||
    rect.y < 1 ||
    rect.x + rect.width >= canvas.width - 1 ||
    rect.y + rect.height >= canvas.height - 1
  ) {
    return false
  }

  const exits = orientation === 'vertical'
    ? [
        { x: axisPoint.x, y: rect.y - 1 },
        { x: axisPoint.x, y: rect.y + rect.height },
      ]
    : [
        { x: rect.x - 1, y: axisPoint.y },
        { x: rect.x + rect.width, y: axisPoint.y },
      ]
  if (!exits.every(exit => tileBelongsOnlyToRun(canvas, exit, runId))) {
    return false
  }

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const tile = getTile(canvas, x, y)
      if (!tile || (tile.type !== TileType.HULL && !isCorridorLike(tile))) {
        return false
      }
      if (!isCorridorLike(tile)) continue
      const onAxis = orientation === 'vertical'
        ? x === axisPoint.x
        : y === axisPoint.y
      if (!onAxis || !tileBelongsOnlyToRun(canvas, { x, y }, runId)) {
        return false
      }
    }
  }
  return true
}

function tileBelongsOnlyToRun(
  canvas: GridCanvas,
  point: Point,
  runId: string
): boolean {
  const tile = getTile(canvas, point.x, point.y)
  if (!isCorridorLike(tile)) return false
  const connectorIds = getTileConnectorIds(tile)
  return connectorIds.length === 1 && connectorIds[0] === runId
}

function carveBackboneTransitRoom(
  canvas: GridCanvas,
  room: ProgrammedRoom,
  slot: BackboneTransitSlot
): RoomPlacement {
  fillRect(canvas, slot.rect, TileType.FLOOR, {
    roomId: room.id,
    zoneId: slot.zone,
  })
  const tiles: Point[] = []
  for (let y = slot.rect.y; y < slot.rect.y + slot.rect.height; y += 1) {
    for (let x = slot.rect.x; x < slot.rect.x + slot.rect.width; x += 1) {
      tiles.push({ x, y })
    }
  }

  return {
    roomId: room.id,
    roomType: room.roomType,
    label: room.label,
    tiles,
    bounds: slot.rect,
    zone: slot.zone,
    doorPositions: slot.doors,
    circulationRole: 'through',
    interruptsBackbone: true,
    program: room,
  }
}

function clampRoomDimension(value: number): number {
  return Math.max(3, Math.min(5, Math.round(value)))
}

function uniqueSizes(
  sizes: Array<{ width: number; height: number }>
): Array<{ width: number; height: number }> {
  return [...new Map(sizes.map(size => [
    `${size.width}x${size.height}`,
    size,
  ])).values()]
}

function buildRoomSlots(
  canvas: GridCanvas,
  zones: ZoneDefinition[],
  spines: CorridorRun[],
  rng: SeededRNG
): Slot[] {
  const mainSpine = spines[0]
  const mainX = Math.min(...mainSpine.points.map(p => p.x))
  const yValues = Array.from(new Set(mainSpine.points.map(p => p.y))).sort((a, b) => a - b)
  const slots: Slot[] = []
  const zoneAtY = (y: number) => {
    const ratio = y / Math.max(1, canvas.height - 1)
    let cumulative = 0
    for (const zone of zones) {
      cumulative += zone.sizePercent
      if (ratio <= cumulative) return zone.id
    }
    return zones[zones.length - 1]?.id ?? 'main'
  }

  const roomHeights = [4, 5, 6, 7]
  let index = 0
  let y = yValues[0] + 3
  let previousSideLeft: boolean | null = null
  let sameSideCount = 0
  while (y < yValues[yValues.length - 1] - 4) {
    const height = roomHeights[index % roomHeights.length]
    const width = index % 3 === 0 ? 5 : 4
    const sideLeft: boolean = sameSideCount >= 2 && previousSideLeft !== null
      ? !previousSideLeft
      : rng.chance(0.5)
    sameSideCount = sideLeft === previousSideLeft ? sameSideCount + 1 : 1
    previousSideLeft = sideLeft
    const x = sideLeft ? mainX - width - 1 : mainX + MAIN_CORRIDOR_WIDTH + 1
    const rect = { x, y, width, height }
    const doorY = y + Math.floor(height / 2)
    const door = sideLeft ? { x: x + width - 1, y: doorY } : { x, y: doorY }
    const corridorStart = sideLeft ? { x: x + width, y: doorY } : { x: x - 1, y: doorY }
    const anchor = sideLeft ? { x: mainX, y: doorY } : { x: mainX + MAIN_CORRIDOR_WIDTH - 1, y: doorY }
    slots.push({ rect, door, corridorStart, anchor, zone: zoneAtY(y) })
    index++
    y += rng.randomInt(4, 6)
  }

  for (const branch of spines.slice(1)) {
    const branchYs = Array.from(new Set(branch.points.map(point => point.y)))
    if (branchYs.length !== 1) continue
    const branchY = branchYs[0]
    const branchXs = branch.points.map(point => point.x)
    const branchMinX = Math.min(...branchXs)
    const branchMaxX = Math.max(...branchXs)

    for (let x = branchMinX; x + 4 <= branchMaxX; x += 6) {
      const above = rng.chance(0.5)
      const width = 5
      const height = 4
      const y = above ? branchY - height - 1 : branchY + MAIN_CORRIDOR_WIDTH + 1
      const rect = { x, y, width, height }
      const door = above ? { x: x + Math.floor(width / 2), y: y + height - 1 } : { x: x + Math.floor(width / 2), y }
      const corridorStart = above ? { x: door.x, y: y + height } : { x: door.x, y: y - 1 }
      const anchor = above ? { x: door.x, y: branchY } : { x: door.x, y: branchY + MAIN_CORRIDOR_WIDTH - 1 }
      slots.push({ rect, door, corridorStart, anchor, zone: zoneAtY(y + Math.floor(height / 2)) })
    }
  }

  const fixedSlots = slots.filter(slot => (
    slot.rect.x >= 1 &&
    slot.rect.y >= 1 &&
    slot.rect.x + slot.rect.width < canvas.width - 1 &&
    slot.rect.y + slot.rect.height < canvas.height - 1
  ))

  // The original fixed bays are useful for elongated ships, but circular and
  // clustered hulls need candidates derived from the actual occupancy mask.
  const backboneAnchors = spines.flatMap(spine => spine.points)
  const maskAwareSlots = buildMaskAwareSlots(canvas, backboneAnchors, fixedSlots)
  if (canvas.archetype !== 'ship') {
    return interleaveSlotsBySector(canvas, maskAwareSlots)
  }

  return [...fixedSlots, ...maskAwareSlots]
}

function buildMaskAwareSlots(
  canvas: GridCanvas,
  anchors: Point[],
  existingSlots: Slot[]
): Slot[] {
  const slots: Slot[] = []
  const seen = new Set(existingSlots.map(slot => rectKey(slot.rect)))
  if (anchors.length === 0) return slots

  const sizes = [
    { width: 5, height: 5 },
    { width: 5, height: 4 },
    { width: 4, height: 5 },
    { width: 4, height: 4 },
    { width: 4, height: 3 },
    { width: 3, height: 4 },
    { width: 3, height: 3 },
  ]
  if (canvas.archetype === 'outpost') sizes.push({ width: 2, height: 2 })

  for (const size of sizes) {
    for (let y = 1; y + size.height < canvas.height - 1; y += 1) {
      for (let x = 1; x + size.width < canvas.width - 1; x += 1) {
        const rect = { x, y, ...size }
        const key = rectKey(rect)
        if (seen.has(key) || !canPlaceRoom(canvas, rect)) continue

        const connection = chooseMaskAwareDoor(canvas, rect, anchors)
        if (!connection) continue

        const centerTile = getTile(
          canvas,
          x + Math.floor(size.width / 2),
          y + Math.floor(size.height / 2)
        )
        slots.push({
          rect,
          door: connection.door,
          corridorStart: connection.outside,
          anchor: connection.anchor,
          zone: centerTile?.zoneId ?? 'main',
        })
        seen.add(key)
      }
    }
  }

  return slots
}

/**
 * Keep the first-fit room placer from exhausting one side of a circular or
 * clustered hull before it considers the rest of the structure.
 */
function interleaveSlotsBySector(canvas: GridCanvas, slots: Slot[]): Slot[] {
  const center = {
    x: (canvas.width - 1) / 2,
    y: (canvas.height - 1) / 2,
  }
  const sectorCount = 8
  const buckets = Array.from({ length: sectorCount }, () => [] as Slot[])

  for (const slot of slots) {
    const slotCenter = {
      x: slot.rect.x + (slot.rect.width - 1) / 2,
      y: slot.rect.y + (slot.rect.height - 1) / 2,
    }
    const angle = Math.atan2(slotCenter.y - center.y, slotCenter.x - center.x)
    const normalized = (angle + Math.PI * 2 + Math.PI / 2) % (Math.PI * 2)
    const sector = Math.floor(normalized / (Math.PI * 2 / sectorCount)) % sectorCount
    buckets[sector].push(slot)
  }

  const ordered: Slot[] = []
  let index = 0
  while (ordered.length < slots.length) {
    let appended = false
    for (const bucket of buckets) {
      if (index >= bucket.length) continue
      ordered.push(bucket[index])
      appended = true
    }
    if (!appended) break
    index += 1
  }

  return ordered
}

function chooseMaskAwareDoor(
  canvas: GridCanvas,
  rect: Rect,
  anchors: Point[]
): { door: Point; outside: Point; anchor: Point } | null {
  const candidates: Array<{ door: Point; outside: Point }> = []
  const centerX = rect.x + Math.floor(rect.width / 2)
  const centerY = rect.y + Math.floor(rect.height / 2)

  candidates.push(
    { door: { x: rect.x, y: centerY }, outside: { x: rect.x - 1, y: centerY } },
    {
      door: { x: rect.x + rect.width - 1, y: centerY },
      outside: { x: rect.x + rect.width, y: centerY },
    },
    { door: { x: centerX, y: rect.y }, outside: { x: centerX, y: rect.y - 1 } },
    {
      door: { x: centerX, y: rect.y + rect.height - 1 },
      outside: { x: centerX, y: rect.y + rect.height },
    }
  )

  let best: { door: Point; outside: Point; anchor: Point; distance: number } | null = null
  for (const candidate of candidates) {
    const outsideTile = getTile(canvas, candidate.outside.x, candidate.outside.y)
    if (
      !outsideTile ||
      outsideTile.type === TileType.VOID ||
      outsideTile.type === TileType.FLOOR ||
      outsideTile.type === TileType.DOOR
    ) {
      continue
    }

    for (const anchor of anchors) {
      const distance =
        Math.abs(candidate.outside.x - anchor.x) +
        Math.abs(candidate.outside.y - anchor.y)
      if (!best || distance < best.distance) {
        best = { ...candidate, anchor, distance }
      }
    }
  }

  return best
}

function rectKey(rect: Rect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`
}

function carveRoom(canvas: GridCanvas, room: RoomProgram['rooms'][number], slot: Slot): RoomPlacement {
  fillRect(canvas, slot.rect, TileType.FLOOR, { roomId: room.id, zoneId: slot.zone })
  const tiles: Point[] = []
  for (let y = slot.rect.y; y < slot.rect.y + slot.rect.height; y++) {
    for (let x = slot.rect.x; x < slot.rect.x + slot.rect.width; x++) {
      tiles.push({ x, y })
    }
  }

  return {
    roomId: room.id,
    roomType: room.roomType,
    label: room.label,
    tiles,
    bounds: slot.rect,
    zone: slot.zone,
    doorPositions: [slot.door],
    circulationRole: 'terminal',
    program: room,
  }
}

function carvePortConnection(
  canvas: GridCanvas,
  room: RoomPlacement,
  door: Point,
  _rng: SeededRNG
): boolean {
  const connectorId = connectorIdForRooms(room.roomId, 'corridor-network')
  const outside = stepOutsideRoom(room.bounds, door)
  const path = findHullPathToNearestCorridor(canvas, outside, room.bounds)
  if (path.length === 0) return false

  for (const point of path) {
    const existing = getTile(canvas, point.x, point.y)
    if (
      !existing ||
      existing.type === TileType.VOID ||
      existing.type === TileType.FLOOR ||
      existing.type === TileType.DOOR
    ) {
      continue
    }
    canvas.tiles[point.y][point.x] = addConnectorIdToTile(
      { ...existing, type: TileType.CORRIDOR, spineLevel: 1 },
      connectorId
    )
  }

  const tile = getTile(canvas, door.x, door.y)
  if (tile) {
    canvas.tiles[door.y][door.x] = { ...tile, type: TileType.DOOR, roomId: room.roomId }
  }

  return true
}

interface AdditionalRoomConnection {
  door: Point
  path: Point[]
}

type RoomWall = 'top' | 'right' | 'bottom' | 'left'

function assignRoomCirculation(
  canvas: GridCanvas,
  placements: RoomPlacement[],
  plans: Map<string, RoomCirculationPlan>
): void {
  for (const room of placements) {
    const plan = plans.get(room.roomId)
    if (!plan) continue
    if (plan.targetConnectionCount <= 1 || room.doorPositions.length === 0) {
      room.circulationRole = 'terminal'
      continue
    }

    const primaryDoor = room.doorPositions[0]
    const primaryNetworkPoint = stepOutsideRoom(room.bounds, primaryDoor)

    while (room.doorPositions.length < plan.targetConnectionCount) {
      const connection = findAdditionalRoomConnection(
        canvas,
        room,
        primaryNetworkPoint
      )
      if (!connection) break

      const connectorId = connectorIdForRooms(
        room.roomId,
        `transit-${room.doorPositions.length}`
      )
      for (const point of connection.path) {
        const existing = getTile(canvas, point.x, point.y)
        if (!existing || existing.type === TileType.VOID) continue
        canvas.tiles[point.y][point.x] = addConnectorIdToTile(
          { ...existing, type: TileType.CORRIDOR, spineLevel: 1 },
          connectorId
        )
      }

      const doorTile = getTile(canvas, connection.door.x, connection.door.y)
      if (doorTile) {
        canvas.tiles[connection.door.y][connection.door.x] = {
          ...doorTile,
          type: TileType.DOOR,
          roomId: room.roomId,
        }
      }
      room.doorPositions.push(connection.door)
    }

    room.circulationRole =
      room.doorPositions.length >= 3 && plan.desiredRole === 'hub'
        ? 'hub'
        : room.doorPositions.length >= 2
          ? 'through'
          : 'terminal'
  }
}

function findAdditionalRoomConnection(
  canvas: GridCanvas,
  room: RoomPlacement,
  primaryNetworkPoint: Point
): AdditionalRoomConnection | null {
  const usedDoorKeys = new Set(room.doorPositions.map(pointKey))
  const usedWalls = new Set(room.doorPositions.map(door =>
    determineRoomWall(room.bounds, door)
  ))
  const primaryWall = determineRoomWall(room.bounds, room.doorPositions[0])
  const minimumTargetSeparation = Math.max(
    3,
    Math.ceil(Math.max(room.bounds.width, room.bounds.height) / 2)
  )

  const candidates = enumerateRoomDoorCandidates(room.bounds)
    .filter(door => !usedDoorKeys.has(pointKey(door)))
    .map(door => ({
      door,
      wall: determineRoomWall(room.bounds, door),
    }))
    .filter(candidate => !usedWalls.has(candidate.wall))
    .map(candidate => {
      const outside = stepOutsideRoom(room.bounds, candidate.door)
      const path = findHullPathToDistinctCorridor(
        canvas,
        outside,
        room.bounds,
        primaryNetworkPoint,
        minimumTargetSeparation
      )
      if (path.length === 0) return null
      const wallPriority =
        candidate.wall === oppositeWall(primaryWall) ? 0 : 1
      return {
        door: candidate.door,
        path,
        score: wallPriority * 1000 + path.length,
      }
    })
    .filter((candidate): candidate is AdditionalRoomConnection & { score: number } =>
      candidate !== null
    )
    .sort((a, b) =>
      a.score - b.score ||
      a.door.y - b.door.y ||
      a.door.x - b.door.x
    )

  if (candidates.length === 0) return null
  return {
    door: candidates[0].door,
    path: candidates[0].path,
  }
}

function findHullPathToDistinctCorridor(
  canvas: GridCanvas,
  start: Point,
  roomBounds: Rect,
  primaryNetworkPoint: Point,
  minimumTargetSeparation: number
): Point[] {
  const startTile = getTile(canvas, start.x, start.y)
  if (!isHullRouteTile(startTile)) return []

  const queue: Point[] = [start]
  const parents = new Map<string, Point | null>([[pointKey(start), null]])
  let head = 0

  while (head < queue.length) {
    const current = queue[head++]
    const tile = getTile(canvas, current.x, current.y)
    if (tile && isCorridorTileType(tile.type)) {
      const separation =
        Math.abs(current.x - primaryNetworkPoint.x) +
        Math.abs(current.y - primaryNetworkPoint.y)
      if (separation >= minimumTargetSeparation) {
        return reconstructPath(current, parents)
      }
      // The first nearby corridor is the same branch. Do not walk along it and
      // pretend that a distant tile is a distinct connection.
      continue
    }

    for (const direction of [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }
      const key = pointKey(next)
      if (
        parents.has(key) ||
        pointInsideRect(next, roomBounds) ||
        !isHullRouteTile(getTile(canvas, next.x, next.y))
      ) {
        continue
      }
      parents.set(key, current)
      queue.push(next)
    }
  }

  return []
}

function enumerateRoomDoorCandidates(bounds: Rect): Point[] {
  const result: Point[] = []
  const centerX = bounds.x + Math.floor(bounds.width / 2)
  const centerY = bounds.y + Math.floor(bounds.height / 2)
  const offsets = [0, -1, 1]

  for (const offset of offsets) {
    const x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - 1, centerX + offset))
    const y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - 1, centerY + offset))
    result.push(
      { x, y: bounds.y },
      { x, y: bounds.y + bounds.height - 1 },
      { x: bounds.x, y },
      { x: bounds.x + bounds.width - 1, y }
    )
  }

  return [...new Map(result.map(point => [pointKey(point), point])).values()]
}

function determineRoomWall(bounds: Rect, door: Point): RoomWall {
  if (door.y === bounds.y) return 'top'
  if (door.x === bounds.x + bounds.width - 1) return 'right'
  if (door.y === bounds.y + bounds.height - 1) return 'bottom'
  return 'left'
}

function oppositeWall(wall: RoomWall): RoomWall {
  if (wall === 'top') return 'bottom'
  if (wall === 'bottom') return 'top'
  if (wall === 'left') return 'right'
  return 'left'
}

function isCorridorTileType(type: TileType): boolean {
  return type === TileType.CORRIDOR || type === TileType.JUNCTION
}

function findHullPathToNearestCorridor(
  canvas: GridCanvas,
  start: Point,
  roomBounds: Rect
): Point[] {
  const startTile = getTile(canvas, start.x, start.y)
  if (!isHullRouteTile(startTile)) return []

  const queue: Point[] = [start]
  const parents = new Map<string, Point | null>([[pointKey(start), null]])
  let head = 0

  while (head < queue.length) {
    const current = queue[head++]
    const tile = getTile(canvas, current.x, current.y)
    if (
      tile &&
      (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)
    ) {
      return reconstructPath(current, parents)
    }

    for (const direction of [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }
      const key = pointKey(next)
      if (
        parents.has(key) ||
        pointInsideRect(next, roomBounds) ||
        !isHullRouteTile(getTile(canvas, next.x, next.y))
      ) {
        continue
      }
      parents.set(key, current)
      queue.push(next)
    }
  }

  return []
}

function isHullRouteTile(tile: ReturnType<typeof getTile>): boolean {
  return !!tile && (
    tile.type === TileType.HULL ||
    tile.type === TileType.CORRIDOR ||
    tile.type === TileType.JUNCTION ||
    tile.type === TileType.AIRLOCK
  )
}

function reconstructPath(end: Point, parents: Map<string, Point | null>): Point[] {
  const path: Point[] = []
  let current: Point | null = end
  while (current) {
    path.unshift(current)
    current = parents.get(pointKey(current)) ?? null
  }
  return path
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function stepOutsideRoom(bounds: Rect, door: Point): Point {
  if (door.x === bounds.x) return { x: door.x - 1, y: door.y }
  if (door.x === bounds.x + bounds.width - 1) return { x: door.x + 1, y: door.y }
  if (door.y === bounds.y) return { x: door.x, y: door.y - 1 }
  return { x: door.x, y: door.y + 1 }
}

function placeDoorTiles(canvas: GridCanvas, placements: RoomPlacement[]): void {
  for (const placement of placements) {
    for (let doorIndex = 0; doorIndex < placement.doorPositions.length; doorIndex += 1) {
      const door = placement.doorPositions[doorIndex]
      const tile = getTile(canvas, door.x, door.y)
      if (!tile) continue

      const outside = stepOutsideRoom(placement.bounds, door)
      const outsideTile = getTile(canvas, outside.x, outside.y)
      const exteriorProximity = classifyExteriorProximity(
        canvas,
        placement.bounds,
        outside
      )
      const classification = classifyDoor({
        connectionId: `port-${placement.roomId}-${doorIndex}`,
        room: {
          id: placement.roomId,
          roomType: placement.roomType,
          zone: placement.zone,
          accessLevel: placement.program.accessLevel,
          isExterior: placement.program.isExterior,
          tags: placement.program.tags,
        },
        neighbor: exteriorProximity === 'boundary'
          ? undefined
          : {
              id: 'corridor-network',
              roomType: 'corridor',
              zone: outsideTile?.zoneId ?? placement.zone,
              accessLevel: 1,
              isExterior: false,
              tags: ['circulation'],
            },
        exteriorProximity,
      })
      const isAirlockTile = classification.semantic === 'airlock' && (
        exteriorProximity === 'boundary' ||
        normalizeRoomType(placement.roomType) === 'airlock'
      )

      canvas.tiles[door.y][door.x] = {
        ...tile,
        type: isAirlockTile ? TileType.AIRLOCK : TileType.DOOR,
        roomId: placement.roomId,
        metadata: {
          ...(tile.metadata ?? {}),
          doorSemantic: classification.semantic,
          doorAccess: classification.access,
        },
      }
    }
  }
}

function classifyExteriorProximity(
  canvas: GridCanvas,
  bounds: Rect,
  outsideDoor: Point
): ExteriorProximity {
  const outsideTile = getTile(canvas, outsideDoor.x, outsideDoor.y)
  if (!outsideTile || outsideTile.type === TileType.VOID) return 'boundary'

  for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
    if (isVoidOrOutOfBounds(canvas, x, bounds.y - 1)) return 'near-hull'
    if (isVoidOrOutOfBounds(canvas, x, bounds.y + bounds.height)) return 'near-hull'
  }
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    if (isVoidOrOutOfBounds(canvas, bounds.x - 1, y)) return 'near-hull'
    if (isVoidOrOutOfBounds(canvas, bounds.x + bounds.width, y)) return 'near-hull'
  }

  return 'interior'
}

function isVoidOrOutOfBounds(canvas: GridCanvas, x: number, y: number): boolean {
  const tile = getTile(canvas, x, y)
  return !tile || tile.type === TileType.VOID
}

function normalizeRoomType(roomType: string): string {
  return roomType.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function markJunctionTiles(canvas: GridCanvas): void {
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (tile?.type === TileType.JUNCTION) {
        canvas.tiles[y][x] = { ...tile, type: TileType.CORRIDOR }
      }
    }
  }

  const candidates = new Set<string>()
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.CORRIDOR) continue
      const degree = [
        getTile(canvas, x - 1, y),
        getTile(canvas, x + 1, y),
        getTile(canvas, x, y - 1),
        getTile(canvas, x, y + 1),
      ].filter(isCorridorLike).length
      const connectorIds = getTileConnectorIds(tile)
      if (connectorIds.length > 1 && degree >= 3) {
        candidates.add(`${x},${y}`)
      }
    }
  }

  for (const key of candidates) {
    const [x, y] = key.split(',').map(Number)
    if (candidates.has(`${x - 1},${y}`) || candidates.has(`${x},${y - 1}`)) {
      continue
    }
    const tile = getTile(canvas, x, y)
    if (tile) {
      canvas.tiles[y][x] = { ...tile, type: TileType.JUNCTION }
    }
  }
}

function isCorridorLike(tile: ReturnType<typeof getTile>): boolean {
  return !!tile && (tile.type === TileType.CORRIDOR || tile.type === TileType.JUNCTION)
}

function canPlaceRoom(canvas: GridCanvas, rect: Rect): boolean {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const tile = getTile(canvas, x, y)
      if (!tile || tile.type !== TileType.HULL) return false
    }
  }
  return true
}

function rectsOverlapAny(rect: Rect, rects: Rect[], padding: number): boolean {
  return rects.some(other => (
    rect.x - padding < other.x + other.width &&
    rect.x + rect.width + padding > other.x &&
    rect.y - padding < other.y + other.height &&
    rect.y + rect.height + padding > other.y
  ))
}

function pointInsideRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height
}

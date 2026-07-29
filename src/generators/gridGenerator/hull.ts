/**
 * Hull Shape Carving
 * Creates the outer boundary of ships, stations, and outposts
 */

import type { SeededRNG } from '../types'
import {
  TileType,
  type GridCanvas,
  type HullCarveContext,
  type HullConfig,
  type HullLayout,
  type HullLink,
  type HullModule,
  type HullShape,
  type Point,
} from './types'
import { isInBounds, fillCircle, getCanvasCenter } from './canvas'

// ============================================================================
// MAIN HULL CARVING
// ============================================================================

/**
 * Carve hull shape into canvas, marking interior tiles as HULL
 */
export function carveHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG,
  context: HullCarveContext = {}
): HullLayout | undefined {
  switch (config.shape) {
    case 'elongated':
    case 'pointed':
      carveShipHull(canvas, config, rng)
      break
    case 'boxy':
      carveBoxyHull(canvas, config, rng)
      break
    case 'angular':
      carveAngularHull(canvas, config, rng)
      break
    case 'circular':
      carveCircularHull(canvas, config, rng)
      break
    case 'ring':
      carveRingHull(canvas, config, rng)
      break
    case 'irregular':
      carveIrregularHull(canvas, config, rng)
      break
    case 'clustered':
      return carveClusteredHull(canvas, config, rng, context)
    default:
      carveShipHull(canvas, config, rng)
  }
}

// ============================================================================
// SHIP HULL (ELONGATED/POINTED)
// ============================================================================

/**
 * Carve a classic spaceship hull shape
 * Uses ellipse math with bow/stern taper
 */
function carveShipHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG
): void {
  const centerX = Math.floor(canvas.width / 2)
  const margin = 2
  const maxWidth = Math.floor((canvas.width - margin * 2) / 2)
  const profile = createAsymmetryProfile(rng)

  for (let y = margin; y < canvas.height - margin; y++) {
    const normalizedY = (y - margin) / (canvas.height - margin * 2 - 1)
    const widthAtY = calculateShipWidthAtY(
      normalizedY,
      maxWidth,
      config.bowTaper,
      config.sternTaper,
      config.shape === 'pointed'
    )
    const row = asymmetricRow(
      centerX,
      widthAtY,
      maxWidth,
      normalizedY,
      config.symmetry,
      profile
    )

    for (let x = row.left; x <= row.right; x++) {
      if (isInBounds(canvas, x, y)) canvas.tiles[y][x] = { type: TileType.HULL }
    }
  }
}

/**
 * Calculate ship width at a given Y position
 */
function calculateShipWidthAtY(
  normalizedY: number, // 0 = bow, 1 = stern
  maxWidth: number,
  bowTaper: number,
  sternTaper: number,
  isPointed: boolean
): number {
  // Base ellipse shape
  // At y=0 (bow): narrow
  // At y=0.5 (mid): widest
  // At y=1 (stern): depends on stern taper

  if (normalizedY < 0.5) {
    // Bow section (y = 0 to 0.5)
    // More aggressive taper for pointed ships
    const bowNorm = normalizedY * 2 // 0 to 1

    if (isPointed) {
      // Sharp pointed bow
      const bowWidth = Math.pow(bowNorm, bowTaper * 2 + 0.5) * maxWidth
      return bowWidth
    } else {
      // Rounder bow
      const bowWidth = Math.sin(bowNorm * Math.PI / 2) * maxWidth
      return bowWidth * (1 - bowTaper) + bowWidth * bowTaper * bowNorm
    }
  } else {
    // Stern section (y = 0.5 to 1)
    const sternNorm = (normalizedY - 0.5) * 2 // 0 to 1

    // Start at max width, taper toward stern
    const sternWidth = maxWidth * (1 - sternTaper * sternNorm * 0.5)

    // Slight curve for realism
    return sternWidth * Math.cos(sternNorm * Math.PI / 4)
  }
}

// ============================================================================
// BOXY HULL (FREIGHTER)
// ============================================================================

/**
 * Carve a boxy freighter-style hull
 */
function carveBoxyHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG
): void {
  const centerX = Math.floor(canvas.width / 2)
  const margin = 2
  const maxWidth = Math.floor((canvas.width - margin * 2) / 2)
  const profile = createAsymmetryProfile(rng)

  for (let y = margin; y < canvas.height - margin; y++) {
    const normalizedY = (y - margin) / (canvas.height - margin * 2 - 1)
    let widthAtY = maxWidth

    if (normalizedY < 0.15) {
      const bowNorm = normalizedY / 0.15
      widthAtY = maxWidth * (1 - config.bowTaper * (1 - bowNorm) * 0.4)
    } else if (normalizedY > 0.85) {
      const sternNorm = (normalizedY - 0.85) / 0.15
      widthAtY = maxWidth * (1 - config.sternTaper * sternNorm * 0.5)
    }

    const row = asymmetricRow(
      centerX,
      widthAtY,
      maxWidth,
      normalizedY,
      config.symmetry,
      profile
    )
    for (let x = row.left; x <= row.right; x++) {
      if (isInBounds(canvas, x, y)) canvas.tiles[y][x] = { type: TileType.HULL }
    }
  }
}

// ============================================================================
// ============================================================================
// ANGULAR HULL (MILITARY)
// ============================================================================

/**
 * Carve an angular military-style hull with faceted edges
 */
function carveAngularHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG
): void {
  const centerX = Math.floor(canvas.width / 2)
  const margin = 2

  const maxWidth = Math.floor((canvas.width - margin * 2) / 2)
  const profile = createAsymmetryProfile(rng)

  // Define angular segments
  const segments = [
    { yStart: 0, yEnd: 0.12, widthStart: 0.15, widthEnd: 0.4 },    // Sharp bow
    { yStart: 0.12, yEnd: 0.25, widthStart: 0.4, widthEnd: 0.75 }, // Expanding
    { yStart: 0.25, yEnd: 0.6, widthStart: 0.75, widthEnd: 1.0 },  // Main body
    { yStart: 0.6, yEnd: 0.85, widthStart: 1.0, widthEnd: 0.9 },   // Slight taper
    { yStart: 0.85, yEnd: 1.0, widthStart: 0.9, widthEnd: 0.7 },   // Engine section
  ]

  for (let y = margin; y < canvas.height - margin; y++) {
    const normalizedY = (y - margin) / (canvas.height - margin * 2 - 1)

    // Find current segment
    let widthAtY = maxWidth
    for (const seg of segments) {
      if (normalizedY >= seg.yStart && normalizedY <= seg.yEnd) {
        const segNorm = (normalizedY - seg.yStart) / (seg.yEnd - seg.yStart)
        widthAtY = maxWidth * (seg.widthStart + (seg.widthEnd - seg.widthStart) * segNorm)
        break
      }
    }

    const row = asymmetricRow(
      centerX,
      widthAtY,
      maxWidth,
      normalizedY,
      config.symmetry,
      profile
    )
    for (let x = row.left; x <= row.right; x++) {
      if (isInBounds(canvas, x, y)) canvas.tiles[y][x] = { type: TileType.HULL }
    }
  }
}

// ============================================================================
// CIRCULAR HULL (STATION)
// ============================================================================

/**
 * Carve a circular station hull
 */
function carveCircularHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG
): void {
  const center = getCanvasCenter(canvas)
  const radius = Math.min(canvas.width, canvas.height) / 2 - 2
  const asymmetry = Math.max(0, 1 - config.symmetry)
  const phaseA = rng.randomFloat(0, Math.PI * 2)
  const phaseB = rng.randomFloat(0, Math.PI * 2)

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const dx = x - center.x
      const dy = y - center.y
      const angle = Math.atan2(dy, dx)
      const localRadius = radius * (
        1 +
        Math.sin(angle + phaseA) * asymmetry * 0.38 +
        Math.sin(angle * 3 + phaseB) * asymmetry * 0.22
      )
      if (Math.hypot(dx, dy) <= localRadius) {
        canvas.tiles[y][x] = { type: TileType.HULL }
      }
    }
  }
}

// ============================================================================
// ============================================================================
// RING HULL (STATION RING)
// ============================================================================

/**
 * Carve a ring-shaped station hull
 */
function carveRingHull(
  canvas: GridCanvas,
  config: HullConfig,
  _rng: SeededRNG
): void {
  const center = getCanvasCenter(canvas)
  const outerRadius = Math.min(canvas.width, canvas.height) / 2 - 2
  const innerRadius = outerRadius * 0.5 // Ring thickness = 50% of radius

  // Fill outer circle
  fillCircle(canvas, center.x, center.y, outerRadius, TileType.HULL)

  // Cut out inner circle (back to VOID)
  const innerR2 = innerRadius * innerRadius
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const dx = x - center.x
      const dy = y - center.y
      if (dx * dx + dy * dy < innerR2) {
        canvas.tiles[y][x] = { type: TileType.VOID }
      }
    }
  }

  // Add spokes connecting to center hub
  const spokeCount = 4
  const hubRadius = innerRadius * 0.3

  // Central hub
  fillCircle(canvas, center.x, center.y, hubRadius, TileType.HULL)

  // Spokes
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2
    const spokeWidth = 2

    for (let r = hubRadius; r < innerRadius; r++) {
      const x = Math.round(center.x + Math.cos(angle) * r)
      const y = Math.round(center.y + Math.sin(angle) * r)

      // Draw spoke with width
      for (let w = -spokeWidth; w <= spokeWidth; w++) {
        const perpAngle = angle + Math.PI / 2
        const wx = Math.round(x + Math.cos(perpAngle) * w)
        const wy = Math.round(y + Math.sin(perpAngle) * w)
        if (isInBounds(canvas, wx, wy)) {
          canvas.tiles[wy][wx] = { type: TileType.HULL }
        }
      }
    }
  }
}

// ============================================================================
// IRREGULAR HULL (OUTPOST/RUINS)
// ============================================================================

/**
 * Carve an irregular blob-like hull (outpost, ruins)
 */
function carveIrregularHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG
): void {
  const center = getCanvasCenter(canvas)
  const baseRadius = Math.min(canvas.width, canvas.height) / 2 - 4

  // Use noise-like variation
  const angleSteps = 32
  const radiusValues: number[] = []

  for (let i = 0; i < angleSteps; i++) {
    // Random radius with smoothing
    const variation = rng.randomFloat(0.6, 1.0)
    radiusValues.push(baseRadius * variation)
  }

  // Smooth the radius values
  const smoothed = smoothArray(radiusValues, 2)

  // Fill based on smoothed radii
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const dx = x - center.x
      const dy = y - center.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) + Math.PI // 0 to 2*PI

      // Interpolate radius at this angle
      const angleIndex = (angle / (Math.PI * 2)) * angleSteps
      const i0 = Math.floor(angleIndex) % angleSteps
      const i1 = (i0 + 1) % angleSteps
      const t = angleIndex - Math.floor(angleIndex)
      const radiusAtAngle = smoothed[i0] * (1 - t) + smoothed[i1] * t

      if (dist < radiusAtAngle) {
        canvas.tiles[y][x] = { type: TileType.HULL }
      }
    }
  }
}

/**
 * Smooth an array of values
 */
function smoothArray(arr: number[], passes: number): number[] {
  let result = [...arr]
  for (let p = 0; p < passes; p++) {
    const newResult: number[] = []
    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length]
      const curr = result[i]
      const next = result[(i + 1) % result.length]
      newResult.push((prev + curr * 2 + next) / 4)
    }
    result = newResult
  }
  return result
}

// ============================================================================
// CLUSTERED HULL (MODULAR OUTPOST)
// ============================================================================

/**
 * Carve a clustered hull made of connected modules
 */
function carveClusteredHull(
  canvas: GridCanvas,
  config: HullConfig,
  rng: SeededRNG,
  context: HullCarveContext
): HullLayout {
  const center = getCanvasCenter(canvas)
  const modules: HullModule[] = []
  const links: HullLink[] = []

  // Central module
  const centralRadius = Math.min(canvas.width, canvas.height) * 0.15
  modules.push({
    id: 'outpost-module-0',
    center,
    radius: centralRadius,
    kind: 'hub',
  })
  fillCircle(canvas, center.x, center.y, centralRadius, TileType.HULL)

  // Add satellite modules
  const moduleCount = rng.randomInt(4, 7)
  const minDist = centralRadius * 1.5
  const maxDist = Math.min(canvas.width, canvas.height) * 0.35

  for (let i = 0; i < moduleCount; i++) {
    const angle = (i / moduleCount) * Math.PI * 2 + rng.randomFloat(-0.3, 0.3)
    const dist = rng.randomFloat(minDist, maxDist)
    const mx = Math.round(center.x + Math.cos(angle) * dist)
    const my = Math.round(center.y + Math.sin(angle) * dist)
    const radius = rng.randomFloat(centralRadius * 0.4, centralRadius * 0.8)

    if (isInBounds(canvas, mx, my)) {
      const module: HullModule = {
        id: `outpost-module-${modules.length}`,
        center: { x: mx, y: my },
        radius,
        kind: 'satellite',
      }
      modules.push(module)
      fillCircle(canvas, mx, my, radius, TileType.HULL)

      // Connect to central module with corridor
      links.push({
        id: `outpost-primary-0-${modules.length - 1}`,
        fromModuleId: modules[0].id,
        toModuleId: module.id,
        centerline: carveClusterLink(canvas, center, module.center, 2),
        kind: 'primary',
      })
    }
  }

  // Connect some satellite modules to each other
  for (let i = 1; i < modules.length; i++) {
    const m1 = modules[i]
    const nextIdx = (i % (modules.length - 1)) + 1
    const m2 = modules[nextIdx]
    const linkProbability = context.loopiness === undefined
      ? 0.4
      : Math.max(0, Math.min(1, context.loopiness))

    if (rng.chance(linkProbability)) {
      // Connect these modules
      links.push({
        id: `outpost-loop-${i}-${nextIdx}`,
        fromModuleId: m1.id,
        toModuleId: m2.id,
        centerline: carveClusterLink(canvas, m1.center, m2.center, 1),
        kind: 'loop',
      })
    }
  }

  return {
    kind: 'clustered-outpost',
    modules,
    links,
  }
}

function carveClusterLink(
  canvas: GridCanvas,
  from: Point,
  to: Point,
  width: number
): Point[] {
  const centerline: Point[] = []
  let previousKey = ''

  for (let t = 0; t <= 1; t += 0.02) {
    const point = {
      x: Math.round(from.x + (to.x - from.x) * t),
      y: Math.round(from.y + (to.y - from.y) * t),
    }
    const key = `${point.x},${point.y}`
    if (key !== previousKey) {
      centerline.push(point)
      previousKey = key
    }
    fillCircle(canvas, point.x, point.y, width, TileType.HULL)
  }

  const last = centerline[centerline.length - 1]
  if (!last || last.x !== to.x || last.y !== to.y) {
    centerline.push({ ...to })
    fillCircle(canvas, to.x, to.y, width, TileType.HULL)
  }

  return centerline
}

interface AsymmetryProfile {
  centerPhase: number
  sidePhase: number
  centerAmplitude: number
  sideAmplitude: number
}

function createAsymmetryProfile(rng: SeededRNG): AsymmetryProfile {
  return {
    centerPhase: rng.randomFloat(0, Math.PI * 2),
    sidePhase: rng.randomFloat(0, Math.PI * 2),
    centerAmplitude: rng.randomFloat(0.55, 1),
    sideAmplitude: rng.randomFloat(0.7, 1),
  }
}

function asymmetricRow(
  centerX: number,
  baseWidth: number,
  maxWidth: number,
  normalizedY: number,
  symmetry: number,
  profile: AsymmetryProfile
): { left: number; right: number } {
  const strength = Math.max(0, Math.min(1, 1 - symmetry))
  const centerDrift = Math.round(
    Math.sin(normalizedY * Math.PI * 2 + profile.centerPhase) *
    maxWidth *
    strength *
    0.7 *
    profile.centerAmplitude
  )
  const sideBias =
    Math.sin(normalizedY * Math.PI * 3 + profile.sidePhase) *
    maxWidth *
    strength *
    0.95 *
    profile.sideAmplitude
  const leftWidth = Math.max(1, Math.round(baseWidth - sideBias))
  const rightWidth = Math.max(1, Math.round(baseWidth + sideBias))
  return {
    left: centerX + centerDrift - leftWidth,
    right: centerX + centerDrift + rightWidth,
  }
}

// ============================================================================
// HULL TEMPLATES
// ============================================================================

/**
 * Get default hull config for archetype
 */
export function getDefaultHullConfig(
  archetype: string,
  subtype?: string
): HullConfig {
  // Ship configs
  if (archetype === 'ship') {
    switch (subtype) {
      case 'courier':
      case 'smuggler':
        return {
          shape: 'pointed',
          aspectRatio: 0.35,
          bowTaper: 0.9,
          sternTaper: 0.3,
          symmetry: 0.86,
        }
      case 'cargo':
      case 'salvage':
      case 'freighter':
      case 'mining':
      case 'colonizer':
        return {
          shape: 'boxy',
          aspectRatio: 0.5,
          bowTaper: 0.3,
          sternTaper: 0.2,
          symmetry: 0.68,
        }
      case 'military':
        return {
          shape: 'angular',
          aspectRatio: 0.4,
          bowTaper: 0.7,
          sternTaper: 0.4,
          symmetry: 0.92,
        }
      default:
        return {
          shape: 'elongated',
          aspectRatio: 0.4,
          bowTaper: 0.6,
          sternTaper: 0.3,
          symmetry: 0.78,
        }
    }
  }

  // Station configs
  if (archetype === 'station') {
    switch (subtype) {
      case 'habitat':
        return {
          shape: 'ring',
          aspectRatio: 1.0,
          bowTaper: 0,
          sternTaper: 0,
          symmetry: 1.0,
        }
      default:
        return {
          shape: 'circular',
          aspectRatio: 1.0,
          bowTaper: 0,
          sternTaper: 0,
          symmetry: 0.82,
        }
    }
  }

  // Outpost configs
  if (archetype === 'outpost') {
    switch (subtype) {
      case 'ruins':
        return {
          shape: 'irregular',
          aspectRatio: 0.8,
          bowTaper: 0,
          sternTaper: 0,
          symmetry: 0.5,
        }
      default:
        return {
          shape: 'clustered',
          aspectRatio: 0.7,
          bowTaper: 0,
          sternTaper: 0,
          symmetry: 0.6,
        }
    }
  }

  // Default
  return {
    shape: 'elongated',
    aspectRatio: 0.5,
    bowTaper: 0.5,
    sternTaper: 0.3,
    symmetry: 0.9,
  }
}

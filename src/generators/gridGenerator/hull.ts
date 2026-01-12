/**
 * Hull Shape Carving
 * Creates the outer boundary of ships, stations, and outposts
 */

import type { SeededRNG } from '../types'
import {
  TileType,
  type GridCanvas,
  type HullConfig,
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
  rng: SeededRNG
): void {
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
      carveClusteredHull(canvas, config, rng)
      break
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
  const centerY = Math.floor(canvas.height / 2)

  // Hull dimensions
  const margin = 2
  const maxWidth = Math.floor((canvas.width - margin * 2) / 2)
  const maxHeight = Math.floor((canvas.height - margin * 2) / 2)

  // Y goes from top (bow) to bottom (stern)
  for (let y = margin; y < canvas.height - margin; y++) {
    // Normalized Y position (0 = bow, 1 = stern)
    const normalizedY = (y - margin) / (canvas.height - margin * 2 - 1)

    // Calculate hull width at this Y position
    let widthAtY = calculateShipWidthAtY(
      normalizedY,
      maxWidth,
      config.bowTaper,
      config.sternTaper,
      config.shape === 'pointed'
    )

    // Apply asymmetry if needed
    if (config.symmetry < 1) {
      const asymmetry = (1 - config.symmetry) * rng.randomFloat(-0.1, 0.1) * maxWidth
      widthAtY += asymmetry
    }

    // Clamp width
    widthAtY = Math.max(1, Math.min(maxWidth, Math.round(widthAtY)))

    // Fill row
    for (let x = centerX - widthAtY; x <= centerX + widthAtY; x++) {
      if (isInBounds(canvas, x, y)) {
        canvas.tiles[y][x] = { type: TileType.HULL }
      }
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

  for (let y = margin; y < canvas.height - margin; y++) {
    const normalizedY = (y - margin) / (canvas.height - margin * 2 - 1)

    // Boxy shape: mostly constant width with slight bow/stern taper
    let widthAtY: number

    if (normalizedY < 0.15) {
      // Bow taper
      const bowNorm = normalizedY / 0.15
      widthAtY = maxWidth * (0.6 + 0.4 * bowNorm)
    } else if (normalizedY > 0.85) {
      // Stern taper
      const sternNorm = (normalizedY - 0.85) / 0.15
      widthAtY = maxWidth * (1 - 0.3 * sternNorm)
    } else {
      // Constant middle section
      widthAtY = maxWidth
    }

    // Small random variation for organic feel
    if (config.symmetry < 1 && rng.chance(0.1)) {
      widthAtY += rng.randomInt(-1, 1)
    }

    widthAtY = Math.max(1, Math.round(widthAtY))

    for (let x = centerX - widthAtY; x <= centerX + widthAtY; x++) {
      if (isInBounds(canvas, x, y)) {
        canvas.tiles[y][x] = { type: TileType.HULL }
      }
    }
  }
}

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

    widthAtY = Math.max(1, Math.round(widthAtY))

    for (let x = centerX - widthAtY; x <= centerX + widthAtY; x++) {
      if (isInBounds(canvas, x, y)) {
        canvas.tiles[y][x] = { type: TileType.HULL }
      }
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
  _rng: SeededRNG
): void {
  const center = getCanvasCenter(canvas)
  const radius = Math.min(canvas.width, canvas.height) / 2 - 2

  fillCircle(canvas, center.x, center.y, radius, TileType.HULL)
}

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
  rng: SeededRNG
): void {
  const center = getCanvasCenter(canvas)
  const modules: Array<{ x: number; y: number; radius: number }> = []

  // Central module
  const centralRadius = Math.min(canvas.width, canvas.height) * 0.15
  modules.push({ x: center.x, y: center.y, radius: centralRadius })
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
      modules.push({ x: mx, y: my, radius })
      fillCircle(canvas, mx, my, radius, TileType.HULL)

      // Connect to central module with corridor
      const corridorWidth = 2
      for (let t = 0; t <= 1; t += 0.02) {
        const cx = Math.round(center.x + (mx - center.x) * t)
        const cy = Math.round(center.y + (my - center.y) * t)
        fillCircle(canvas, cx, cy, corridorWidth, TileType.HULL)
      }
    }
  }

  // Connect some satellite modules to each other
  for (let i = 1; i < modules.length; i++) {
    const m1 = modules[i]
    const nextIdx = (i % (modules.length - 1)) + 1
    const m2 = modules[nextIdx]

    if (rng.chance(0.4)) {
      // Connect these modules
      const corridorWidth = 1
      for (let t = 0; t <= 1; t += 0.02) {
        const cx = Math.round(m1.x + (m2.x - m1.x) * t)
        const cy = Math.round(m1.y + (m2.y - m1.y) * t)
        fillCircle(canvas, cx, cy, corridorWidth, TileType.HULL)
      }
    }
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
          symmetry: 0.95,
        }
      case 'cargo':
      case 'salvage':
        return {
          shape: 'boxy',
          aspectRatio: 0.5,
          bowTaper: 0.3,
          sternTaper: 0.2,
          symmetry: 0.85,
        }
      case 'military':
        return {
          shape: 'angular',
          aspectRatio: 0.4,
          bowTaper: 0.7,
          sternTaper: 0.4,
          symmetry: 1.0,
        }
      default:
        return {
          shape: 'elongated',
          aspectRatio: 0.4,
          bowTaper: 0.6,
          sternTaper: 0.3,
          symmetry: 0.9,
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
          symmetry: 0.95,
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

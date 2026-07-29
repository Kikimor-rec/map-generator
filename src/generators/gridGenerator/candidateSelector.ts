/**
 * Deterministic best-of-N selection for the active grid generator.
 *
 * Structural and playability failures are hard gates. Candidates that pass
 * them are compared on three independent objectives and assigned Pareto
 * fronts. A balanced score is deliberately only a tie-break inside a front.
 */

import type {
  Archetype,
  CandidateSelectionObjectives,
  CandidateSelectionSummary,
  LayoutConnectorEndpointAnchor,
  MapJSON,
  SizeTier,
} from '../types'
import { getPlayabilityThresholds } from './playabilityValidator'
import { generateGridMapV2 } from './occupancyGenerator'
import type { GridGeneratorOptions, GridGeneratorResult } from './index'

export type GridCandidateHardIssue =
  | 'GENERATION_FAILED'
  | 'MISSING_QUALITY_METRICS'
  | 'PLAYABILITY_ERROR'
  | 'ROOMS_DISCONNECTED'
  | 'CRITICAL_ROOM_UNREACHABLE'
  | 'ISOLATED_ROOMS'
  | 'FALLBACK_ENTRY'
  | 'AMBIGUOUS_DOORS'
  | 'DOOR_METADATA_MISMATCH'
  | 'INVALID_CONNECTOR_GEOMETRY'
  | 'BROKEN_ROOM_PORT_ANCHOR'
  | 'NON_FINITE_OBJECTIVE'
  | 'FACILITY_STRUCTURE_ERROR'
  | 'DISCONNECTED_FACILITY_ENVELOPE'
  | 'STRUCTURAL_VOID_COLLISION'
  | 'PRESSURE_TOPOLOGY_ERROR'

export interface GridCandidateInput {
  index: number
  seed: string
  map?: MapJSON
  error?: string
}

export interface GridCandidateEvaluation {
  index: number
  seed: string
  map?: MapJSON
  hardPass: boolean
  hardIssues: GridCandidateHardIssue[]
  warnings: string[]
  objectives: CandidateSelectionObjectives
  balancedScore: number
  paretoRank: number
}

export interface GridCandidateEvaluationContext {
  archetype?: Archetype
  sizeTier?: SizeTier
  loopiness?: number
}

export interface BestGridMapResult extends GridGeneratorResult {
  selection: {
    summary: CandidateSelectionSummary
    rankedCandidates: GridCandidateEvaluation[]
  }
}

export interface AsyncGridCandidateHooks {
  signal?: AbortSignal
  onCandidate?: (completed: number, total: number) => void
}

const DEFAULT_CANDIDATE_COUNTS: Record<SizeTier, number> = {
  xs: 4,
  sm: 4,
  md: 3,
  lg: 2,
  xl: 2,
}

const ROUTE_TURN_TARGETS: Record<Archetype, number> = {
  ship: 0.18,
  station: 0.22,
  outpost: 0.28,
}

export function getDefaultGridCandidateCount(sizeTier: SizeTier = 'md'): number {
  return DEFAULT_CANDIDATE_COUNTS[sizeTier]
}

/**
 * Stable FNV-1a child seeds keep a master seed reproducible while avoiding
 * correlations caused by plain "-1", "-2" suffixes. Candidate count is not
 * part of the hash, so increasing N preserves every existing child seed.
 */
export function deriveGridCandidateSeed(masterSeed: string | number, index: number): string {
  const normalizedMaster = String(masterSeed)
  const hash = fnv1a(`${normalizedMaster}\u241fgrid-candidate-v1\u241f${index}`)
  return `${normalizedMaster}::${hash.toString(36).padStart(7, '0')}`
}

export function evaluateGridCandidate(
  input: GridCandidateInput,
  context: GridCandidateEvaluationContext = {}
): GridCandidateEvaluation {
  const metrics = input.map?.meta.ttrpgMetrics
  const archetype = context.archetype ?? input.map?.meta.archetype ?? 'ship'
  const sizeTier = context.sizeTier ?? input.map?.meta.sizeTier ?? 'md'
  const hardIssues: GridCandidateHardIssue[] = []

  if (!input.map) {
    hardIssues.push('GENERATION_FAILED')
  } else if (!hasRequiredMetrics(metrics)) {
    hardIssues.push('MISSING_QUALITY_METRICS')
  } else {
    if (metrics.playabilityStatus === 'error') hardIssues.push('PLAYABILITY_ERROR')
    if ((metrics.connectedRoomPercent ?? 0) !== 100) hardIssues.push('ROOMS_DISCONNECTED')
    if ((metrics.criticalReachability ?? 0) !== 100) hardIssues.push('CRITICAL_ROOM_UNREACHABLE')
    if ((metrics.isolatedRooms ?? 1) !== 0) hardIssues.push('ISOLATED_ROOMS')
    if (
      metrics.totalRooms > 0 &&
      (metrics.entryBasis === 'fallback-first-room' || metrics.entryBasis === 'none')
    ) {
      hardIssues.push('FALLBACK_ENTRY')
    }
    if ((metrics.ambiguousDoorCount ?? 1) !== 0) hardIssues.push('AMBIGUOUS_DOORS')
    if ((metrics.doorMetadataMismatchCount ?? 1) !== 0) {
      hardIssues.push('DOOR_METADATA_MISMATCH')
    }
    if (metrics.facilityStructureStatus === 'error') {
      hardIssues.push('FACILITY_STRUCTURE_ERROR')
    }
    if ((metrics.hullComponentCount ?? 0) !== 1) {
      hardIssues.push('DISCONNECTED_FACILITY_ENVELOPE')
    }
    if ((metrics.structuralVoidCollisionCount ?? 1) !== 0) {
      hardIssues.push('STRUCTURAL_VOID_COLLISION')
    }
    if (
      metrics.pressureStatus === 'error' ||
      (metrics.invalidPressureDoorCount ?? 1) !== 0
    ) {
      hardIssues.push('PRESSURE_TOPOLOGY_ERROR')
    }
  }

  if (input.map) {
    hardIssues.push(...validateConnectorStructure(input.map))
  }

  const objectives = metrics
    ? calculateObjectives(metrics, archetype, sizeTier, context.loopiness)
    : zeroObjectives()
  if (Object.values(objectives).some(value => !Number.isFinite(value))) {
    hardIssues.push('NON_FINITE_OBJECTIVE')
  }
  const warnings = input.map
    ? uniqueSorted([
        ...(metrics?.playabilityViolationCodes ?? []),
        ...(metrics?.aestheticViolationCodes ?? []),
        ...(metrics?.facilityStructureViolationCodes ?? []),
        ...(metrics?.pressureViolationCodes ?? []),
      ])
    : uniqueSorted([input.error ?? 'GENERATION_FAILED'])

  return {
    index: input.index,
    seed: input.seed,
    map: input.map,
    hardPass: hardIssues.length === 0,
    hardIssues: unique(hardIssues),
    warnings,
    objectives,
    balancedScore: calculateBalancedScore(objectives),
    paretoRank: Number.MAX_SAFE_INTEGER,
  }
}

export function rankGridCandidates(
  inputs: readonly GridCandidateInput[],
  context: GridCandidateEvaluationContext = {}
): GridCandidateEvaluation[] {
  const evaluated = inputs.map(input => evaluateGridCandidate(input, context))
  const pass = assignParetoRanks(evaluated.filter(candidate => candidate.hardPass))
  const rejected = assignParetoRanks(evaluated.filter(candidate => !candidate.hardPass))

  return [...pass, ...rejected].sort(compareCandidates)
}

export function generateBestGridMap(
  options: GridGeneratorOptions = {},
  candidateCount = getDefaultGridCandidateCount(options.sizeTier)
): BestGridMapResult {
  const safeCount = clampInteger(candidateCount, 1, 12)
  const masterSeed = String(options.seed ?? Date.now())
  const attempts: CandidateAttempt[] = []

  for (let index = 0; index < safeCount; index++) {
    attempts.push(generateAttempt(options, masterSeed, safeCount, index))
  }

  return finalizeAttempts(options, masterSeed, safeCount, attempts)
}

export async function generateBestGridMapAsync(
  options: GridGeneratorOptions = {},
  candidateCount = getDefaultGridCandidateCount(options.sizeTier),
  hooks: AsyncGridCandidateHooks = {}
): Promise<BestGridMapResult> {
  const safeCount = clampInteger(candidateCount, 1, 12)
  const masterSeed = String(options.seed ?? Date.now())
  const attempts: CandidateAttempt[] = []

  for (let index = 0; index < safeCount; index++) {
    if (hooks.signal?.aborted) {
      return cancelledResult(masterSeed, safeCount, attempts)
    }
    attempts.push(generateAttempt(options, masterSeed, safeCount, index))
    hooks.onCandidate?.(index + 1, safeCount)
    if (index < safeCount - 1) {
      await yieldToEventLoop()
    }
  }

  if (hooks.signal?.aborted) {
    return cancelledResult(masterSeed, safeCount, attempts)
  }
  return finalizeAttempts(options, masterSeed, safeCount, attempts)
}

interface CandidateAttempt {
  index: number
  seed: string
  result: GridGeneratorResult
}

function generateAttempt(
  options: GridGeneratorOptions,
  masterSeed: string,
  count: number,
  index: number
): CandidateAttempt {
  const seed = count === 1
    ? masterSeed
    : deriveGridCandidateSeed(masterSeed, index)
  return {
    index,
    seed,
    result: generateGridMapV2({
      ...options,
      seed,
    }),
  }
}

function finalizeAttempts(
  options: GridGeneratorOptions,
  masterSeed: string,
  requestedCandidates: number,
  attempts: CandidateAttempt[]
): BestGridMapResult {
  const rankedCandidates = rankGridCandidates(
    attempts.map(attempt => ({
      index: attempt.index,
      seed: attempt.seed,
      map: attempt.result.map,
      error: attempt.result.error,
    })),
    {
      archetype: options.archetype,
      sizeTier: options.sizeTier,
      loopiness: options.loopiness,
    }
  )
  const summary = buildSelectionSummary(masterSeed, requestedCandidates, rankedCandidates)
  const selected = rankedCandidates[0]
  const selectedAttempt = attempts.find(attempt => attempt.index === selected?.index)

  if (!selected || !selected.hardPass || !selectedAttempt || !selectedAttempt.result.map) {
    return {
      success: false,
      error: `NO_VALID_CANDIDATE: ${summarizeRejections(rankedCandidates)}`,
      timing: sumTimings(attempts.map(attempt => attempt.result)),
      selection: { summary, rankedCandidates },
    }
  }

  const timing = sumTimings(attempts.map(attempt => attempt.result))
  selectedAttempt.result.map.meta.candidateSelection = summary

  return {
    ...selectedAttempt.result,
    timing,
    selection: { summary, rankedCandidates },
  }
}

function cancelledResult(
  masterSeed: string,
  requestedCandidates: number,
  attempts: CandidateAttempt[]
): BestGridMapResult {
  const rankedCandidates = rankGridCandidates(attempts.map(attempt => ({
    index: attempt.index,
    seed: attempt.seed,
    map: attempt.result.map,
    error: attempt.result.error,
  })))
  return {
    success: false,
    error: 'CANCELLED',
    timing: sumTimings(attempts.map(attempt => attempt.result)),
    selection: {
      summary: buildSelectionSummary(masterSeed, requestedCandidates, rankedCandidates),
      rankedCandidates,
    },
  }
}

function hasRequiredMetrics(
  metrics: MapJSON['meta']['ttrpgMetrics'] | undefined
): metrics is MapJSON['meta']['ttrpgMetrics'] {
  return Boolean(
    metrics &&
    metrics.playabilityStatus &&
    metrics.connectedRoomPercent !== undefined &&
    metrics.criticalReachability !== undefined &&
    metrics.isolatedRooms !== undefined &&
    metrics.entryBasis !== undefined &&
    metrics.ambiguousDoorCount !== undefined &&
    metrics.doorMetadataMismatchCount !== undefined &&
    metrics.facilityStructureStatus !== undefined &&
    metrics.hullComponentCount !== undefined &&
    metrics.structuralVoidCollisionCount !== undefined &&
    metrics.pressureStatus !== undefined &&
    metrics.invalidPressureDoorCount !== undefined
  )
}

function calculateObjectives(
  metrics: MapJSON['meta']['ttrpgMetrics'],
  archetype: Archetype,
  sizeTier: SizeTier,
  loopiness = 0.5
): CandidateSelectionObjectives {
  const turnRatio = metrics.corridorTurnRatio ?? Number.NaN
  const turnTarget = ROUTE_TURN_TARGETS[archetype]
  const turnScore = clamp01(1 - turnRatio / (turnTarget * 2))
  const junctionClusterScore = clamp01(1 - (metrics.clusteredJunctionPairs ?? Number.NaN) / 5)
  const routeClarity = round(turnScore * 0.7 + junctionClusterScore * 0.3)

  const hullMinimum = getHullUseMinimum(archetype, sizeTier)
  const hullUse = metrics.hullUtilizationPercent ?? Number.NaN
  const hullUtilizationFit = clamp01(hullUse / hullMinimum)
  const silhouetteFit = clamp01(
    (metrics.silhouetteFitScore ?? Number.NaN) / 100
  )
  const hullUseFit = round(hullUtilizationFit * 0.55 + silhouetteFit * 0.45)

  const thresholds = getPlayabilityThresholds(archetype, sizeTier, loopiness)
  const connected = clamp01((metrics.connectedRoomPercent ?? Number.NaN) / 100)
  const critical = clamp01((metrics.criticalReachability ?? Number.NaN) / 100)
  const alternate = (metrics.alternateRoutePairCandidateCount ?? 0) === 0
    ? 0.5
    : clamp01((metrics.alternateRoutePairPercent ?? Number.NaN) / 100)
  const deadEndRatio = metrics.deadEndRatio ?? Number.NaN
  const deadEndScore = deadEndRatio <= thresholds.corridorDeadEndRatioMax
    ? 1
    : clamp01(1 - (deadEndRatio - thresholds.corridorDeadEndRatioMax) /
      Math.max(0.01, 1 - thresholds.corridorDeadEndRatioMax))
  const junctionCount = metrics.junctionCount ?? Number.NaN
  const junctionScore = thresholds.junctionCountMin === 0
    ? 1
    : clamp01(junctionCount / thresholds.junctionCountMin)
  const ttrpgChoice = round(
    connected * 0.2 +
    critical * 0.2 +
    alternate * 0.3 +
    deadEndScore * 0.15 +
    junctionScore * 0.15
  )

  return { routeClarity, hullUseFit, ttrpgChoice }
}

function calculateBalancedScore(objectives: CandidateSelectionObjectives): number {
  const values = objectiveValues(objectives)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return round(mean * 0.5 + Math.min(...values) * 0.5)
}

function assignParetoRanks(candidates: GridCandidateEvaluation[]): GridCandidateEvaluation[] {
  const remaining = [...candidates]
  let rank = 0
  while (remaining.length > 0) {
    const front = remaining.filter(candidate =>
      !remaining.some(other => other !== candidate && dominates(other, candidate))
    )
    for (const candidate of front) candidate.paretoRank = rank
    for (const candidate of front) remaining.splice(remaining.indexOf(candidate), 1)
    rank++
  }
  return candidates
}

function dominates(a: GridCandidateEvaluation, b: GridCandidateEvaluation): boolean {
  const aValues = objectiveValues(a.objectives)
  const bValues = objectiveValues(b.objectives)
  return aValues.every((value, index) => value >= bValues[index]) &&
    aValues.some((value, index) => value > bValues[index])
}

function compareCandidates(a: GridCandidateEvaluation, b: GridCandidateEvaluation): number {
  if (a.hardPass !== b.hardPass) return a.hardPass ? -1 : 1
  if (!a.hardPass && a.hardIssues.length !== b.hardIssues.length) {
    return a.hardIssues.length - b.hardIssues.length
  }
  if (a.paretoRank !== b.paretoRank) return a.paretoRank - b.paretoRank
  if (a.balancedScore !== b.balancedScore) return b.balancedScore - a.balancedScore
  return a.index - b.index
}

function buildSelectionSummary(
  masterSeed: string,
  requestedCandidates: number,
  rankedCandidates: readonly GridCandidateEvaluation[]
): CandidateSelectionSummary {
  const selected = rankedCandidates[0]
  const passedCandidates = rankedCandidates.filter(candidate => candidate.hardPass).length
  return {
    schemaVersion: 2,
    evaluatorVersion: 'grid-candidate-v2',
    masterSeed,
    requestedCandidates,
    evaluatedCandidates: rankedCandidates.length,
    passedCandidates,
    rejectedCandidates: rankedCandidates.length - passedCandidates,
    selectedSeed: selected?.seed ?? masterSeed,
    selectedIndex: selected?.index ?? -1,
    paretoRank: selected?.paretoRank ?? 0,
    balancedScore: selected?.balancedScore ?? 0,
    objectives: selected?.objectives ?? zeroObjectives(),
    reasonCodes: selected
      ? uniqueSorted([
          selected.hardPass ? 'HARD_GATES_PASSED' : 'NO_VALID_CANDIDATE',
          ...selected.hardIssues,
          ...selected.warnings,
        ])
      : ['NO_VALID_CANDIDATE'],
  }
}

function validateConnectorStructure(map: MapJSON): GridCandidateHardIssue[] {
  let invalidGeometry = false
  let brokenAnchor = false
  for (const deck of map.decks) {
    const rooms = new Map(deck.rooms.map(room => [room.id, room]))
    for (const connector of deck.connectors) {
      if (
        connector.path.length < 2 ||
        connector.path.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))
      ) invalidGeometry = true
      for (let index = 1; index < connector.path.length; index++) {
        const previous = connector.path[index - 1]
        const current = connector.path[index]
        if (previous.x !== current.x && previous.y !== current.y) invalidGeometry = true
      }
      for (const anchor of [connector.startAnchor, connector.endAnchor]) {
        if (anchor?.kind === 'roomPort' && !roomPortAnchorExists(anchor, rooms)) brokenAnchor = true
      }
    }
  }
  return [
    ...(invalidGeometry ? ['INVALID_CONNECTOR_GEOMETRY' as const] : []),
    ...(brokenAnchor ? ['BROKEN_ROOM_PORT_ANCHOR' as const] : []),
  ]
}

function roomPortAnchorExists(
  anchor: Extract<LayoutConnectorEndpointAnchor, { kind: 'roomPort' }>,
  rooms: Map<string, MapJSON['decks'][number]['rooms'][number]>
): boolean {
  const room = rooms.get(anchor.roomId)
  const port = room?.ports.find(candidate => candidate.id === anchor.portId)
  return Boolean(
    port &&
    Number.isFinite(anchor.position.x) &&
    Number.isFinite(anchor.position.y) &&
    port.x === anchor.position.x &&
    port.y === anchor.position.y
  )
}

function getHullUseMinimum(archetype: Archetype, sizeTier: SizeTier): number {
  const tierIndex = Math.max(0, ['xs', 'sm', 'md', 'lg', 'xl'].indexOf(sizeTier))
  const base = [26, 28, 30, 32, 34][tierIndex]
  return base + (archetype === 'station' ? -3 : archetype === 'outpost' ? -5 : 0)
}

function summarizeRejections(candidates: readonly GridCandidateEvaluation[]): string {
  if (candidates.length === 0) return 'generation produced no candidates'
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    for (const issue of candidate.hardIssues) counts.set(issue, (counts.get(issue) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => `${code}=${count}`)
    .join(', ')
}

function sumTimings(results: readonly GridGeneratorResult[]): GridGeneratorResult['timing'] {
  return results.reduce<GridGeneratorResult['timing']>((total, result) => ({
    total: total.total + result.timing.total,
    hull: total.hull + result.timing.hull,
    zones: total.zones + result.timing.zones,
    spine: total.spine + result.timing.spine,
    rooms: total.rooms + result.timing.rooms,
    doors: total.doors + result.timing.doors,
    convert: total.convert + result.timing.convert,
  }), {
    total: 0,
    hull: 0,
    zones: 0,
    spine: 0,
    rooms: 0,
    doors: 0,
    convert: 0,
  })
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function objectiveValues(objectives: CandidateSelectionObjectives): number[] {
  return [objectives.routeClarity, objectives.hullUseFit, objectives.ttrpgChoice]
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function zeroObjectives(): CandidateSelectionObjectives {
  return { routeClarity: 0, hullUseFit: 0, ttrpgChoice: 0 }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Number(value.toFixed(4))
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

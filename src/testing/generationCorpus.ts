import {
  generateMap,
  type GenerationResult,
  type GeneratorOptions,
} from '../generators/generator'
import type { TTRPGMetrics, ValidationIssue } from '../generators/types'

import { stableHash } from './stableJson'

type ExplicitRequestFields =
  | 'seed'
  | 'archetype'
  | 'subtype'
  | 'sizeTier'
  | 'loopiness'
  | 'danger'
  | 'qualityProfile'

export type GenerationCorpusRequest =
  & Required<Pick<GeneratorOptions, ExplicitRequestFields>>
  & Pick<GeneratorOptions, 'styleProfile'>

type SemanticStatus = NonNullable<TTRPGMetrics['playabilityStatus']>
type SemanticStatusKey =
  | 'playabilityStatus'
  | 'facilityStructureStatus'
  | 'pressureStatus'

export interface GenerationCorpusCase {
  id: string
  request: GenerationCorpusRequest
  expected: GenerationCorpusSummary
}

export interface GenerationCorpusSummary {
  caseId: string
  requestHash: string
  documentHash: string
  roomCount: number
  connectorCount: number
  doorCount: number
  candidateCount: number
  selectedCandidateIndex: number
  issueCodes: string[]
  playabilityStatus: SemanticStatus
  facilityStructureStatus: SemanticStatus
  pressureStatus: SemanticStatus
}

export interface GenerationHistoricalInputCase extends GenerationCorpusCase {
  coverage: string
  request: GenerationCorpusRequest & Required<Pick<GeneratorOptions, 'styleProfile'>>
}

export type GenerationCorpusRunner = (options: GeneratorOptions) => GenerationResult

export class GenerationCorpusError extends Error {
  constructor(
    public readonly caseId: string,
    public readonly issues: readonly ValidationIssue[],
  ) {
    const detail = issues.map(issue => `${issue.stage}: ${issue.message}`).join('; ')
    super(`Generation corpus case ${caseId} failed: ${detail || 'no issue data'}`)
    this.name = 'GenerationCorpusError'
  }

  toJSON(): { caseId: string; issues: readonly ValidationIssue[] } {
    return {
      caseId: this.caseId,
      issues: this.issues,
    }
  }
}

export const GENERATION_CORPUS = [
  {
    id: 'ship-courier-xs',
    request: {
      seed: 'corpus-ship-courier-v1',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'xs',
      loopiness: 0.45,
      danger: 0.3,
      qualityProfile: 'standard',
    },
    expected: {
      caseId: 'ship-courier-xs',
      requestHash: 'deb7a7f7',
      documentHash: '64263c78',
      roomCount: 8,
      connectorCount: 14,
      doorCount: 9,
      candidateCount: 4,
      selectedCandidateIndex: 2,
      issueCodes: [],
      playabilityStatus: 'pass',
      facilityStructureStatus: 'pass',
      pressureStatus: 'pass',
    },
  },
  {
    id: 'station-research-xs',
    request: {
      seed: 'corpus-station-research-v1',
      archetype: 'station',
      subtype: 'research',
      sizeTier: 'xs',
      loopiness: 0.55,
      danger: 0.35,
      qualityProfile: 'standard',
    },
    expected: {
      caseId: 'station-research-xs',
      requestHash: '68410663',
      documentHash: '15ce5de9',
      roomCount: 8,
      connectorCount: 25,
      doorCount: 9,
      candidateCount: 4,
      selectedCandidateIndex: 1,
      issueCodes: [],
      playabilityStatus: 'pass',
      facilityStructureStatus: 'pass',
      pressureStatus: 'pass',
    },
  },
  {
    id: 'outpost-mining-xs',
    request: {
      seed: 'corpus-outpost-mining-v1',
      archetype: 'outpost',
      subtype: 'mining',
      sizeTier: 'xs',
      loopiness: 0.4,
      danger: 0.4,
      qualityProfile: 'standard',
    },
    expected: {
      caseId: 'outpost-mining-xs',
      requestHash: '9000ff49',
      documentHash: 'a078a3eb',
      roomCount: 8,
      connectorCount: 47,
      doorCount: 10,
      candidateCount: 4,
      selectedCandidateIndex: 2,
      issueCodes: [],
      playabilityStatus: 'pass',
      facilityStructureStatus: 'pass',
      pressureStatus: 'pass',
    },
  },
] as const satisfies readonly GenerationCorpusCase[]

export const GENERATION_HISTORICAL_INPUTS = [
  {
    id: 'ship-freighter-qwhjgv9k-historical-grid-smoke',
    request: {
      seed: 'QWHJGV9K',
      archetype: 'ship',
      subtype: 'freighter',
      styleProfile: 'utilitarian',
      sizeTier: 'md',
      loopiness: 0.5,
      danger: 0.3,
      qualityProfile: 'draft',
    },
    coverage: 'current occupancy-engine smoke coverage using the historical QWHJGV9K freeze input',
    expected: {
      caseId: 'ship-freighter-qwhjgv9k-historical-grid-smoke',
      requestHash: '5b1aff1c',
      documentHash: 'd9db8a1f',
      roomCount: 18,
      connectorCount: 26,
      doorCount: 22,
      candidateCount: 1,
      selectedCandidateIndex: 0,
      issueCodes: [],
      playabilityStatus: 'pass',
      facilityStructureStatus: 'pass',
      pressureStatus: 'pass',
    },
  },
] as const satisfies readonly GenerationHistoricalInputCase[]

export function runGenerationCorpusCase(
  fixture: GenerationCorpusCase,
  runner: GenerationCorpusRunner = generateMap,
): GenerationCorpusSummary {
  const result = runner(fixture.request)

  if (!result.success || !result.map) {
    const issues = result.issues.length > 0
      ? result.issues.map(issue => ({ ...issue }))
      : [{
          severity: 'error' as const,
          stage: 'generator',
          message: 'Generation failed without issue data',
        }]
    throw new GenerationCorpusError(fixture.id, issues)
  }

  const document = JSON.parse(JSON.stringify(result.map)) as typeof result.map
  const { generatedAt: _generatedAt, ...stableMeta } = document.meta
  const normalizedDocument = { ...document, meta: stableMeta }

  const metrics = document.meta.ttrpgMetrics
  const selection = document.meta.candidateSelection
  if (!selection) {
    throw new GenerationCorpusError(fixture.id, [{
      severity: 'error',
      stage: 'corpus',
      message: 'Missing candidate selection metadata',
    }])
  }
  const roomCount = document.decks.reduce((count, deck) => count + deck.rooms.length, 0)
  const connectorCount = document.decks.reduce((count, deck) => count + deck.connectors.length, 0)
  const doorCount = document.decks.reduce(
    (count, deck) => count + deck.rooms.reduce(
      (deckCount, room) => deckCount + room.ports.length,
      0,
    ),
    0,
  )

  return {
    caseId: fixture.id,
    requestHash: stableHash(fixture.request),
    documentHash: stableHash(normalizedDocument),
    roomCount,
    connectorCount,
    doorCount,
    candidateCount: selection.requestedCandidates,
    selectedCandidateIndex: selection.selectedIndex,
    issueCodes: result.issues
      .map(issue => `${issue.severity}:${issue.stage}:${issue.message}`)
      .sort(),
    playabilityStatus: requireSemanticStatus(fixture.id, metrics, 'playabilityStatus'),
    facilityStructureStatus: requireSemanticStatus(fixture.id, metrics, 'facilityStructureStatus'),
    pressureStatus: requireSemanticStatus(fixture.id, metrics, 'pressureStatus'),
  }
}

function requireSemanticStatus(
  caseId: string,
  metrics: TTRPGMetrics,
  key: SemanticStatusKey,
): SemanticStatus {
  const status = metrics[key]
  if (status === undefined) {
    throw new GenerationCorpusError(caseId, [{
      severity: 'error',
      stage: 'corpus',
      message: `Missing semantic validator status: ${key}`,
    }])
  }

  return status
}

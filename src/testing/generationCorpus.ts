import { generateMap, type GeneratorOptions } from '../generators/generator'

import { stableHash } from './stableJson'

export interface GenerationCorpusCase {
  id: string
  request: Required<Pick<GeneratorOptions,
    'seed' | 'archetype' | 'subtype' | 'sizeTier' | 'loopiness' | 'danger'>>
}

export interface GenerationCorpusSummary {
  caseId: string
  requestHash: string
  documentHash: string
  roomCount: number
  connectorCount: number
  issueCodes: string[]
  playabilityStatus: string
  facilityStructureStatus: string
  pressureStatus: string
}

export interface GenerationRegressionCase extends GenerationCorpusCase {
  regression: string
  request: GenerationCorpusCase['request'] & Required<Pick<GeneratorOptions, 'styleProfile'>>
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
    },
  },
] as const satisfies readonly GenerationCorpusCase[]

export const GENERATION_REGRESSIONS = [
  {
    id: 'ship-freighter-qwhjgv9k-freeze',
    request: {
      seed: 'QWHJGV9K',
      archetype: 'ship',
      subtype: 'freighter',
      styleProfile: 'utilitarian',
      sizeTier: 'md',
      loopiness: 0.5,
      danger: 0.3,
    },
    regression: 'historical Ship/Freighter/MD freeze seed completes generation',
  },
] as const satisfies readonly GenerationRegressionCase[]

export function runGenerationCorpusCase(
  fixture: GenerationCorpusCase,
): GenerationCorpusSummary {
  const result = generateMap({
    ...fixture.request,
    engine: 'grid',
    gridCandidateCount: 1,
  })

  if (!result.success || !result.map) {
    const issueMessages = result.issues.map(issue => issue.message).join('; ')
    throw new Error(`Generation corpus case ${fixture.id} failed: ${issueMessages}`)
  }

  const document = JSON.parse(JSON.stringify(result.map)) as typeof result.map
  const { generatedAt: _generatedAt, ...stableMeta } = document.meta
  const normalizedDocument = { ...document, meta: stableMeta }

  const metrics = document.meta.ttrpgMetrics
  const roomCount = document.decks.reduce((count, deck) => count + deck.rooms.length, 0)
  const connectorCount = document.decks.reduce((count, deck) => count + deck.connectors.length, 0)

  return {
    caseId: fixture.id,
    requestHash: stableHash(fixture.request),
    documentHash: stableHash(normalizedDocument),
    roomCount,
    connectorCount,
    issueCodes: result.issues
      .map(issue => `${issue.severity}:${issue.stage}:${issue.message}`)
      .sort(),
    playabilityStatus: metrics.playabilityStatus ?? 'unknown',
    facilityStructureStatus: metrics.facilityStructureStatus ?? 'unknown',
    pressureStatus: metrics.pressureStatus ?? 'unknown',
  }
}

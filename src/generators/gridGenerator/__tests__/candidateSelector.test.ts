import { describe, expect, it } from 'vitest'
import type { MapJSON, TTRPGMetrics } from '../../types'
import {
  deriveGridCandidateSeed,
  generateBestGridMapAsync,
  generateBestGridMap,
  rankGridCandidates,
} from '../candidateSelector'
import { generateGridMap } from '../index'

function makeMetrics(overrides: Partial<TTRPGMetrics> = {}): TTRPGMetrics {
  return {
    totalRooms: 0,
    totalConnectors: 0,
    estimatedCombatEncounters: 0,
    estimatedExplorationMinutes: 0,
    keyLocations: 0,
    hiddenAreas: 0,
    playabilityStatus: 'pass',
    connectedRoomPercent: 100,
    criticalReachability: 100,
    isolatedRooms: 0,
    entryBasis: 'none',
    alternateRoutePairCandidateCount: 1,
    alternateRoutePairPercent: 100,
    deadEndRatio: 0,
    junctionCount: 4,
    corridorTurnRatio: 0,
    clusteredJunctionPairs: 0,
    hullUtilizationPercent: 30,
    ambiguousDoorCount: 0,
    doorMetadataMismatchCount: 0,
    facilityStructureStatus: 'pass',
    hullComponentCount: 1,
    structuralVoidCollisionCount: 0,
    silhouetteFitScore: 100,
    pressureStatus: 'pass',
    unresolvedExteriorHatchCount: 0,
    invalidInterlockGroupCount: 0,
    invalidPressureDoorCount: 0,
    playabilityViolationCodes: [],
    aestheticViolationCodes: [],
    ...overrides,
  }
}

function makeMap(seed: string, metrics: Partial<TTRPGMetrics> = {}): MapJSON {
  return {
    version: '1.0.0',
    meta: {
      name: seed,
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'md',
      seed,
      generatedAt: '2026-01-01T00:00:00.000Z',
      ttrpgMetrics: makeMetrics(metrics),
      tags: [],
    },
    grid: { cellSize: 40, snapEnabled: true },
    zones: [],
    decks: [{
      index: 0,
      label: 'Deck 1',
      gridWidth: 10,
      gridHeight: 10,
      rooms: [],
      connectors: [],
      junctions: [],
    }],
  }
}

describe('grid candidate selection', () => {
  it('derives stable unique child seeds without depending on pool size', () => {
    const firstThree = Array.from({ length: 3 }, (_, index) =>
      deriveGridCandidateSeed('master-seed', index)
    )
    const firstEight = Array.from({ length: 8 }, (_, index) =>
      deriveGridCandidateSeed('master-seed', index)
    )

    expect(firstEight.slice(0, 3)).toEqual(firstThree)
    expect(new Set(firstEight).size).toBe(8)
    expect(deriveGridCandidateSeed('master-seed', 2)).toBe(firstThree[2])
  })

  it('always ranks a hard-pass candidate ahead of a rejected candidate', () => {
    const ranked = rankGridCandidates([
      {
        index: 0,
        seed: 'rejected',
        map: makeMap('rejected', {
          connectedRoomPercent: 80,
          isolatedRooms: 1,
        }),
      },
      {
        index: 1,
        seed: 'valid',
        map: makeMap('valid', {
          corridorTurnRatio: 0.3,
          clusteredJunctionPairs: 4,
        }),
      },
    ])

    expect(ranked[0].seed).toBe('valid')
    expect(ranked[0].hardPass).toBe(true)
    expect(ranked[1].hardIssues).toContain('ROOMS_DISCONNECTED')
  })

  it('assigns dominated candidates to a later Pareto front', () => {
    const ranked = rankGridCandidates([
      {
        index: 0,
        seed: 'dominant',
        map: makeMap('dominant'),
      },
      {
        index: 1,
        seed: 'dominated',
        map: makeMap('dominated', {
          corridorTurnRatio: 0.18,
          clusteredJunctionPairs: 3,
          hullUtilizationPercent: 15,
          alternateRoutePairPercent: 0,
          deadEndRatio: 0.8,
          junctionCount: 1,
        }),
      },
    ])

    expect(ranked[0].seed).toBe('dominant')
    expect(ranked[0].paretoRank).toBe(0)
    expect(ranked[1].paretoRank).toBe(1)
  })

  it('uses numeric child index as the final deterministic tie-break', () => {
    const map = makeMap('same')
    const ranked = rankGridCandidates([
      { index: 10, seed: 'candidate-10', map },
      { index: 2, seed: 'candidate-2', map },
    ])

    expect(ranked.map(candidate => candidate.index)).toEqual([2, 10])
  })

  it('uses a min-aware score to prefer a balanced non-dominated candidate', () => {
    const ranked = rankGridCandidates([
      {
        index: 0,
        seed: 'extreme',
        map: makeMap('extreme', {
          alternateRoutePairPercent: 0,
          deadEndRatio: 1,
          junctionCount: 0,
        }),
      },
      {
        index: 1,
        seed: 'balanced',
        map: makeMap('balanced', {
          corridorTurnRatio: 0.1,
          hullUtilizationPercent: 24,
          alternateRoutePairPercent: 50,
        }),
      },
    ])

    expect(ranked.every(candidate => candidate.paretoRank === 0)).toBe(true)
    expect(ranked[0].seed).toBe('balanced')
    expect(ranked[0].balancedScore).toBeGreaterThan(ranked[1].balancedScore)
  })

  it('yields and honours cancellation between candidates', async () => {
    const controller = new AbortController()
    const result = await generateBestGridMapAsync({
      seed: 'selector-cancel',
      archetype: 'ship',
      sizeTier: 'xs',
    }, 4, {
      signal: controller.signal,
      onCandidate: completed => {
        if (completed === 1) controller.abort()
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('CANCELLED')
    expect(result.selection.summary.evaluatedCandidates).toBe(1)
  })

  it('rejects fallback entry and non-finite quality metrics', () => {
    const ranked = rankGridCandidates([
      {
        index: 0,
        seed: 'fallback',
        map: makeMap('fallback', {
          totalRooms: 2,
          entryBasis: 'fallback-first-room',
        }),
      },
      {
        index: 1,
        seed: 'nan',
        map: makeMap('nan', {
          corridorTurnRatio: Number.NaN,
        }),
      },
    ])

    expect(ranked.find(candidate => candidate.seed === 'fallback')?.hardIssues)
      .toContain('FALLBACK_ENTRY')
    expect(ranked.find(candidate => candidate.seed === 'nan')?.hardIssues)
      .toContain('NON_FINITE_OBJECTIVE')
  })

  it('hard-rejects facility collisions and invalid pressure topology', () => {
    const ranked = rankGridCandidates([{
      index: 0,
      seed: 'unsafe',
      map: makeMap('unsafe', {
        facilityStructureStatus: 'error',
        structuralVoidCollisionCount: 2,
        pressureStatus: 'error',
        invalidPressureDoorCount: 1,
      }),
    }])

    expect(ranked[0].hardIssues).toEqual(expect.arrayContaining([
      'FACILITY_STRUCTURE_ERROR',
      'STRUCTURAL_VOID_COLLISION',
      'PRESSURE_TOPOLOGY_ERROR',
    ]))
  })

  it('selects reproducibly and keeps the exact selected child seed', () => {
    const options = {
      seed: 'selector-integration',
      archetype: 'ship' as const,
      subtype: 'courier',
      sizeTier: 'xs' as const,
      loopiness: 0.5,
    }
    const first = generateBestGridMap(options, 3)
    const second = generateBestGridMap(options, 3)

    expect(
      first.success,
      `${first.error}\n${JSON.stringify(first.selection.summary, null, 2)}`
    ).toBe(true)
    expect(second.success).toBe(true)
    expect(first.selection.summary).toEqual(second.selection.summary)
    expect(first.map?.meta.seed).toBe(first.selection.summary.selectedSeed)
    expect(first.map?.meta.candidateSelection).toEqual(first.selection.summary)

    const exact = generateGridMap({
      ...options,
      seed: first.selection.summary.selectedSeed,
    })
    expect(exact.success).toBe(true)
    expect(exact.map?.decks).toEqual(first.map?.decks)
  })
})

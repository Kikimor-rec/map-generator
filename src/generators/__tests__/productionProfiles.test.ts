import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MapJSON } from '../types'
import * as candidateSelector from '../gridGenerator/candidateSelector'
import {
  generateMap,
  generateMapAsync,
  type GeneratorOptions,
} from '../generator'
import {
  PRODUCTION_PROFILES,
  getCandidateCount,
  type GenerationQualityProfile,
} from '../productionProfiles'
import { generateLegacyMapForRegression } from '../compatibility'
import * as compatibilityGenerators from '../compatibility'
import * as productionGenerators from '../index'
import * as qualityGenerators from '../quality'

const PROFILE_COUNTS = {
  draft: { xs: 1, sm: 1, md: 1, lg: 1, xl: 1 },
  standard: { xs: 4, sm: 4, md: 3, lg: 2, xl: 2 },
  polish: { xs: 8, sm: 8, md: 6, lg: 4, xl: 4 },
} as const

const EMPTY_MAP: MapJSON = {
  version: '1.0.0',
  meta: {
    name: 'Facade Test',
    archetype: 'ship',
    subtype: 'courier',
    sizeTier: 'xs',
    seed: 'facade-test',
    generatedAt: '2026-07-29T00:00:00.000Z',
    ttrpgMetrics: {
      totalRooms: 0,
      totalConnectors: 0,
      estimatedCombatEncounters: 0,
      estimatedExplorationMinutes: 0,
      keyLocations: 0,
      hiddenAreas: 0,
    },
    tags: [],
  },
  grid: { cellSize: 40, snapEnabled: true },
  zones: [],
  decks: [],
}

const SELECTOR_RESULT: candidateSelector.BestGridMapResult = {
  success: true,
  map: EMPTY_MAP,
  timing: {
    total: 1,
    hull: 0,
    zones: 0,
    spine: 0,
    rooms: 0,
    doors: 0,
    convert: 0,
  },
  selection: {
    summary: {
      schemaVersion: 2,
      evaluatorVersion: 'grid-candidate-v2',
      masterSeed: 'facade-test',
      requestedCandidates: 1,
      evaluatedCandidates: 1,
      passedCandidates: 1,
      rejectedCandidates: 0,
      selectedSeed: 'facade-test',
      selectedIndex: 0,
      paretoRank: 0,
      balancedScore: 1,
      objectives: {
        routeClarity: 1,
        hullUseFit: 1,
        ttrpgChoice: 1,
      },
      reasonCodes: ['HARD_GATES_PASSED'],
    },
    rankedCandidates: [],
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('production generation profiles', () => {
  it('defines the exact reviewed candidate counts for every profile and size', () => {
    expect(PRODUCTION_PROFILES).toEqual({
      draft: {
        candidateCountBySize: PROFILE_COUNTS.draft,
        requireHardPass: true,
      },
      standard: {
        candidateCountBySize: PROFILE_COUNTS.standard,
        requireHardPass: true,
      },
      polish: {
        candidateCountBySize: PROFILE_COUNTS.polish,
        requireHardPass: true,
      },
    })

    for (const [profile, counts] of Object.entries(PROFILE_COUNTS)) {
      for (const [size, count] of Object.entries(counts)) {
        expect(getCandidateCount(
          profile as GenerationQualityProfile,
          size as keyof typeof counts,
        )).toBe(count)
      }
    }
  })

  it('freezes the exact profile keys and nested count tables', () => {
    expect(Object.keys(PRODUCTION_PROFILES)).toEqual(['draft', 'standard', 'polish'])
    expect(Object.isFrozen(PRODUCTION_PROFILES)).toBe(true)

    for (const profile of Object.values(PRODUCTION_PROFILES)) {
      expect(Object.isFrozen(profile)).toBe(true)
      expect(Object.isFrozen(profile.candidateCountBySize)).toBe(true)
    }

    expect(() => {
      ;(PRODUCTION_PROFILES as Record<string, unknown>).legacy = {}
    }).toThrow()
  })
})

describe('one occupancy production facade', () => {
  it.each([
    ['draft', 1],
    ['standard', 4],
    ['polish', 8],
  ] as const)('routes the %s profile through the occupancy selector with %i XS candidates', (
    qualityProfile,
    expectedCount,
  ) => {
    const selector = vi.spyOn(candidateSelector, 'generateBestGridMap')
      .mockReturnValue(SELECTOR_RESULT)

    const result = generateMap({
      seed: 'facade-test',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'xs',
      qualityProfile,
    })

    expect(result.success).toBe(true)
    expect(selector).toHaveBeenCalledOnce()
    expect(selector).toHaveBeenCalledWith(expect.objectContaining({
      seed: 'facade-test',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'xs',
    }), expectedCount)
  })

  it('defaults to the standard profile', () => {
    const selector = vi.spyOn(candidateSelector, 'generateBestGridMap')
      .mockReturnValue(SELECTOR_RESULT)

    generateMap({
      seed: 'facade-default',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'md',
    })

    expect(selector).toHaveBeenCalledWith(expect.any(Object), 3)
  })

  it('uses the same selector and profile count for async generation', async () => {
    const selector = vi.spyOn(candidateSelector, 'generateBestGridMapAsync')
      .mockResolvedValue(SELECTOR_RESULT)
    const hooks = { onCandidate: vi.fn() }

    const result = await generateMapAsync({
      seed: 'facade-async',
      archetype: 'station',
      subtype: 'research',
      sizeTier: 'lg',
      qualityProfile: 'polish',
    }, hooks)

    expect(result.success).toBe(true)
    expect(selector).toHaveBeenCalledWith(expect.objectContaining({
      seed: 'facade-async',
      archetype: 'station',
      sizeTier: 'lg',
    }), 4, hooks)
  })

  it('does not expose obsolete engine, quality, or raw candidate-count request keys', () => {
    type ForbiddenProductionOption = Extract<
      'engine' | 'useQuality' | 'gridCandidateCount',
      keyof GeneratorOptions
    >
    const noForbiddenProductionOptions:
      ForbiddenProductionOption extends never ? true : false = true

    expect(noForbiddenProductionOptions).toBe(true)

    const selector = vi.spyOn(candidateSelector, 'generateBestGridMap')
      .mockReturnValue(SELECTOR_RESULT)
    generateMap({
      seed: 'obsolete-options-ignored',
      sizeTier: 'xs',
      engine: 'legacy',
      useQuality: true,
      gridCandidateCount: 12,
    } as GeneratorOptions)

    expect(selector).toHaveBeenCalledWith(expect.any(Object), 4)
  })
})

describe('legacy compatibility boundary', () => {
  it('keeps legacy regression generation available from compatibility only', () => {
    expect(generateLegacyMapForRegression).toBeTypeOf('function')

    const result = generateLegacyMapForRegression({
      seed: 'legacy-regression-boundary',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'xs',
      skipValidation: true,
    })

    expect(result.success).toBe(true)
    expect(result.map?.decks.flatMap(deck => deck.connectors).every(connector =>
      connector.representation === 'room-route-v1'
    )).toBe(true)
  })
  it('does not expose competing geometry from the production barrel', () => {
    const productionExports = productionGenerators as Record<string, unknown>

    expect(productionExports).not.toHaveProperty('MapGenerator')
    expect(productionExports).not.toHaveProperty('generateFromPreset')
    expect(productionExports).not.toHaveProperty('GENERATION_PRESETS')
    expect(productionExports).not.toHaveProperty('generateTopology')
    expect(productionExports).not.toHaveProperty('validateTopology')
    expect(productionExports).not.toHaveProperty('generateLayout')
    expect(productionExports).not.toHaveProperty('validateLayout')
    expect(productionExports).not.toHaveProperty('runQualityPipeline')
    expect(productionExports).not.toHaveProperty('generateWithQuality')
  })

  it('exposes quality-pipeline runtime entry points only through compatibility', () => {
    const compatibilityExports = compatibilityGenerators as Record<string, unknown>
    const qualityExports = qualityGenerators as Record<string, unknown>

    expect(compatibilityExports).toHaveProperty('runQualityPipeline')
    expect(compatibilityExports).toHaveProperty('generateWithQuality')
    expect(qualityExports).not.toHaveProperty('runQualityPipeline')
    expect(qualityExports).not.toHaveProperty('generateWithQuality')
  })
})

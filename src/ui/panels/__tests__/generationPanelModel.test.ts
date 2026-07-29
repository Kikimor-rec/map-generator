import { describe, expect, it } from 'vitest'

import {
  aggregateGalleryAttempts,
  buildGalleryProject,
  buildGenerationWorkerRequest,
  formatGallerySelectionSummary,
  getGenerationProfileOptions,
  getGenerationProfilePresentation,
} from '../generationPanelModel'

describe('generation panel profile options', () => {
  it.each([
    ['xs', [1, 4, 8]],
    ['sm', [1, 4, 8]],
    ['md', [1, 3, 6]],
    ['lg', [1, 2, 4]],
    ['xl', [1, 2, 4]],
  ] as const)('shows the exact profiles and candidate counts for %s maps', (size, counts) => {
    const options = getGenerationProfileOptions(size)

    expect(options.map(option => option.id)).toEqual(['draft', 'standard', 'polish'])
    expect(options.map(option => option.label)).toEqual(['Draft', 'Standard', 'Polish'])
    expect(options.map(option => option.candidateCount)).toEqual(counts)
    expect(options.map(option => option.description)).toEqual([
      'Hard-gate selection from 1 candidate.',
      `Hard-gate selection from ${counts[1]} candidates.`,
      `Hard-gate selection from ${counts[2]} candidates.`,
    ])
  })

  it('presents Draft as fixed in gallery while retaining the single-map profile', () => {
    const gallery = getGenerationProfilePresentation('md', 'polish', true)

    expect(gallery.options.map(option => ({
      id: option.id,
      active: option.active,
      disabled: option.disabled,
    }))).toEqual([
      { id: 'draft', active: true, disabled: true },
      { id: 'standard', active: false, disabled: true },
      { id: 'polish', active: false, disabled: true },
    ])
    expect(gallery.description).toBe(
      'Gallery generates multiple Draft seeded variants, then ranks them.',
    )

    const singleMap = getGenerationProfilePresentation('md', 'polish', false)

    expect(singleMap.options.find(option => option.active)?.id).toBe('polish')
    expect(singleMap.options.every(option => !option.disabled)).toBe(true)
    expect(singleMap.description).toBe(
      'Hard-gate selection from 6 candidates.',
    )
  })

  it('describes gallery ranking with a neutral selection score label', () => {
    expect(formatGallerySelectionSummary(0.876, 1)).toBe(
      'Selection score: 88% · Pareto 2',
    )
  })
})
describe('gallery result model', () => {
  it('keeps successful variants and summarizes partial failures by reason', () => {
    const first = { seed: 'gallery-ok-1' }
    const second = { seed: 'gallery-ok-2' }

    const result = aggregateGalleryAttempts([
      { status: 'failure', reason: 'Pressure hard gate' },
      { status: 'success', value: first },
      { status: 'failure', reason: 'No valid candidate' },
      { status: 'failure', reason: 'Pressure hard gate' },
      { status: 'success', value: second },
    ])

    expect(result.successes).toEqual([first, second])
    expect(result.failure).toEqual({
      failedCount: 3,
      totalCount: 5,
      allFailed: false,
      reasonSummary: 'No valid candidate (1); Pressure hard gate (2)',
    })
  })

  it('reports an all-failed gallery without exposing rejected values', () => {
    const result = aggregateGalleryAttempts([
      { status: 'failure', reason: 'No valid candidate' },
      { status: 'failure', reason: 'No valid candidate' },
      { status: 'failure', reason: 'Pressure hard gate' },
    ])

    expect(result.successes).toEqual([])
    expect(result.failure).toEqual({
      failedCount: 3,
      totalCount: 3,
      allFailed: true,
      reasonSummary: 'No valid candidate (2); Pressure hard gate (1)',
    })
  })

  it('preserves generated geometry and pressure in a gallery project', () => {
    const geometry = {
      unitsPerCell: 40,
      facilityEnvelope: { polygons: [] },
      structuralVoids: [],
    }
    const pressure = {
      version: 1 as const,
      outsideCompartmentId: 'pressure:vacuum',
      externalEnvironment: 'vacuum' as const,
      compartments: [],
      exteriorHatches: [],
      interlockGroups: [],
    }

    const project = buildGalleryProject({
      projectId: 'gallery-project',
      deckId: 'gallery-deck',
      name: 'Gallery ship',
      description: 'Generated ship - Variant 2',
      timestamp: '2026-07-30T00:00:00.000Z',
      seed: 'gallery-pressure',
      score: 0.75,
      editorData: {
        rooms: [],
        corridors: [],
        doors: [],
        junctions: [],
        geometry,
        pressure,
      },
    })

    expect(project.decks).toHaveLength(1)
    expect(project.decks[0]).toMatchObject({
      id: 'gallery-deck',
      geometry,
      pressure,
    })
  })
})


describe('generation panel worker request', () => {
  it('builds the strict single-map worker request without legacy transport fields', () => {
    const request = buildGenerationWorkerRequest('generation-run-1', {
      seed: 'PANEL-TRANSPORT',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'md',
      styleProfile: 'utilitarian',
      loopiness: 0.5,
      danger: 0.3,
      qualityProfile: 'standard',
    })

    expect(request).toEqual({
      type: 'GENERATE',
      requestId: 'generation-run-1',
      options: {
        seed: 'PANEL-TRANSPORT',
        archetype: 'ship',
        subtype: 'courier',
        sizeTier: 'md',
        styleProfile: 'utilitarian',
        loopiness: 0.5,
        danger: 0.3,
        qualityProfile: 'standard',
      },
    })

    const serialized = JSON.stringify(request)
    expect(Object.keys(request)).toEqual(['type', 'requestId', 'options'])
    expect(Object.keys(request.options)).toEqual([
      'seed',
      'archetype',
      'subtype',
      'sizeTier',
      'styleProfile',
      'loopiness',
      'danger',
      'qualityProfile',
    ])
    expect(serialized).not.toContain('START_GENERATION')
    expect(serialized).not.toContain('"payload"')
    expect(serialized).not.toContain('"engine"')
    expect(serialized).not.toContain('"useQuality"')
    expect(serialized).not.toContain('"qualityMode"')
    expect(serialized).not.toContain('"routing"')
    expect(serialized).not.toContain('"gridCandidateCount"')
  })
})

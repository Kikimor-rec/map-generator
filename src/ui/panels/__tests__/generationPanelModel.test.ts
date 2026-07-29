import { describe, expect, it } from 'vitest'

import {
  buildGenerationWorkerRequest,
  getGenerationProfileOptions,
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

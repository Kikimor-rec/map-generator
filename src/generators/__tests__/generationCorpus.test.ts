import { describe, expect, it } from 'vitest'

import {
  generateMap,
  type GenerationResult,
  type GeneratorOptions,
} from '../generator'
import {
  GENERATION_CORPUS,
  GENERATION_HISTORICAL_INPUTS,
  runGenerationCorpusCase,
} from '../../testing/generationCorpus'

const ALL_GENERATION_FIXTURES = [
  ...GENERATION_CORPUS,
  ...GENERATION_HISTORICAL_INPUTS,
] as const

describe('generation corpus fixture provenance', () => {
  it.each(ALL_GENERATION_FIXTURES)('$id records the complete effective request', fixture => {
    expect(fixture.request).toEqual(expect.objectContaining({
      seed: expect.any(String),
      archetype: expect.any(String),
      subtype: expect.any(String),
      sizeTier: expect.any(String),
      loopiness: expect.any(Number),
      danger: expect.any(Number),
      engine: 'grid',
      gridCandidateCount: 1,
    }))
  })
})

describe.each(GENERATION_CORPUS)('$id', fixture => {
  it('matches the frozen summary and remains deterministic', () => {
    const first = runGenerationCorpusCase(fixture)
    const second = runGenerationCorpusCase(fixture)

    expect(first).toEqual(fixture.expected)
    expect(second).toEqual(fixture.expected)
    expect(first.roomCount).toBeGreaterThan(0)
    expect(first.connectorCount).toBeGreaterThan(0)
    expect(first.playabilityStatus).toMatch(/^(pass|warning)$/)
    expect(first.facilityStructureStatus).toMatch(/^(pass|warning)$/)
    expect(first.pressureStatus).toMatch(/^(pass|warning)$/)
  })
})

describe.each(GENERATION_HISTORICAL_INPUTS)('$id historical input smoke', fixture => {
  it(fixture.coverage, () => {
    const summary = runGenerationCorpusCase(fixture)

    expect(summary).toEqual(fixture.expected)
    expect(summary.roomCount).toBeGreaterThan(0)
    expect(summary.connectorCount).toBeGreaterThan(0)
    expect(summary.playabilityStatus).toMatch(/^(pass|warning)$/)
    expect(summary.facilityStructureStatus).toMatch(/^(pass|warning)$/)
    expect(summary.pressureStatus).toMatch(/^(pass|warning)$/)
  })
})

describe('generation corpus failures', () => {
  const fixture = GENERATION_CORPUS[0]

  it('carries structured case and generator issue data', () => {
    const issue = {
      severity: 'error' as const,
      stage: 'layout',
      message: 'fixture exploded',
      roomId: 'room-7',
    }
    const failGeneration = (): GenerationResult => ({
      success: false,
      issues: [issue],
      timing: {
        total: 1,
        roomProgram: 0,
        topology: 0,
        layout: 1,
        validation: 0,
      },
    })

    let caught: unknown
    try {
      runGenerationCorpusCase(fixture, failGeneration)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught).toMatchObject({
      caseId: fixture.id,
      issues: [issue],
    })
    expect(JSON.parse(JSON.stringify(caught))).toEqual({
      caseId: fixture.id,
      issues: [issue],
    })
  })

  it.each([
    'playabilityStatus',
    'facilityStructureStatus',
    'pressureStatus',
  ] as const)('rejects a missing %s', statusKey => {
    const omitStatus = (options: GeneratorOptions): GenerationResult => {
      const result = generateMap(options)
      if (result.map) {
        delete result.map.meta.ttrpgMetrics[statusKey]
      }
      return result
    }

    let caught: unknown
    try {
      runGenerationCorpusCase(fixture, omitStatus)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught).toMatchObject({
      caseId: fixture.id,
      issues: [{
        severity: 'error',
        stage: 'corpus',
        message: `Missing semantic validator status: ${statusKey}`,
      }],
    })
  })
})

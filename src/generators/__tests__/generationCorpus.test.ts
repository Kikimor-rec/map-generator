import { describe, expect, it } from 'vitest'

import {
  GENERATION_CORPUS,
  GENERATION_REGRESSIONS,
  runGenerationCorpusCase,
} from '../../testing/generationCorpus'

describe.each(GENERATION_CORPUS)('$id', fixture => {
  it('is deterministic and satisfies declared semantic status', () => {
    const first = runGenerationCorpusCase(fixture)
    const second = runGenerationCorpusCase(fixture)

    expect(second).toEqual(first)
    expect(first.roomCount).toBeGreaterThan(0)
    expect(first.connectorCount).toBeGreaterThan(0)
    expect(first.playabilityStatus).not.toBe('error')
    expect(first.facilityStructureStatus).not.toBe('error')
    expect(first.pressureStatus).not.toBe('error')
  })
})

describe.each(GENERATION_REGRESSIONS)('$id regression', fixture => {
  it(fixture.regression, () => {
    const summary = runGenerationCorpusCase(fixture)

    expect(summary.roomCount).toBeGreaterThan(0)
    expect(summary.connectorCount).toBeGreaterThan(0)
    expect(summary.playabilityStatus).not.toBe('error')
    expect(summary.facilityStructureStatus).not.toBe('error')
  })
})

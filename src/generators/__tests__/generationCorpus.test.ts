import { describe, expect, it } from 'vitest'

import {
  GENERATION_CORPUS,
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

import { describe, expect, it } from 'vitest'

import { buildGenerationWorkerRequest } from '../generationPanelModel'

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
    expect(serialized).not.toContain('START_GENERATION')
    expect(serialized).not.toContain('"payload"')
    expect(serialized).not.toContain('"engine"')
    expect(serialized).not.toContain('"useQuality"')
    expect(serialized).not.toContain('"qualityMode"')
    expect(serialized).not.toContain('"routing"')
  })
})

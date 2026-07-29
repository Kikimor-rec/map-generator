import { describe, expect, it, vi } from 'vitest'

import type {
  CandidateGenerationHooks,
  GenerationResult,
  GeneratorOptions,
  MapJSON,
} from '../../generators'
import {
  GenerationProtocolError,
  parseGenerationWorkerRequest,
  type GenerationWorkerResponse,
} from '../generationProtocol'
import { createGenerationRuntime } from '../generationRuntime'

const MAP: MapJSON = {
  version: '1.0.0',
  meta: {
    name: 'Worker Protocol Test',
    archetype: 'ship',
    subtype: 'courier',
    sizeTier: 'xs',
    seed: 'worker-protocol-test',
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
  decks: [{
    index: 0,
    label: 'Deck 1',
    gridWidth: 24,
    gridHeight: 16,
    rooms: [],
    connectors: [],
    junctions: [],
  }],
}

const SUCCESS: GenerationResult = {
  success: true,
  map: MAP,
  issues: [],
  timing: {
    total: 1,
    roomProgram: 0,
    topology: 0,
    layout: 1,
    validation: 0,
  },
}

type GenerateMapAsync = (
  options: GeneratorOptions,
  hooks?: CandidateGenerationHooks,
) => Promise<GenerationResult>

describe('typed generation runtime', () => {
  it('returns one map-json-v1 COMPLETE shape for a Draft ship request', async () => {
    const responses: GenerationWorkerResponse[] = []
    const runtime = createGenerationRuntime(responses.push.bind(responses))

    await runtime.handleRequest({
      type: 'GENERATE',
      requestId: 'draft-ship',
      options: {
        seed: 'QWHJGV9K',
        archetype: 'ship',
        subtype: 'freighter',
        styleProfile: 'utilitarian',
        sizeTier: 'md',
        loopiness: 0.5,
        danger: 0.3,
        qualityProfile: 'draft',
      },
    })

    const complete = responses.find(response => response.type === 'COMPLETE')
    expect(complete?.type).toBe('COMPLETE')
    if (complete?.type !== 'COMPLETE') throw new Error('Expected COMPLETE response')
    expect(complete.requestId).toBe('draft-ship')
    expect(complete.format).toBe('map-json-v1')
    expect(complete.map.meta.archetype).toBe('ship')
    expect(complete.map.decks.length).toBeGreaterThan(0)
    expect('bestCandidate' in complete.map).toBe(false)
  })

  it('routes Draft and Standard through the same injected production generator', async () => {
    const responses: GenerationWorkerResponse[] = []
    const generate = vi.fn<GenerateMapAsync>().mockResolvedValue(SUCCESS)
    const runtime = createGenerationRuntime(responses.push.bind(responses), generate)

    await runtime.handleRequest({
      type: 'GENERATE',
      requestId: 'draft',
      options: { qualityProfile: 'draft', archetype: 'ship' },
    })
    await runtime.handleRequest({
      type: 'GENERATE',
      requestId: 'standard',
      options: { qualityProfile: 'standard', archetype: 'station' },
    })

    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls.map(([options]) => options.qualityProfile))
      .toEqual(['draft', 'standard'])
  })

  it('maps candidate-selector progress to request-scoped protocol messages', async () => {
    const responses: GenerationWorkerResponse[] = []
    const generate = vi.fn<GenerateMapAsync>()
      .mockImplementation(async (_options, hooks) => {
        hooks?.onCandidate?.(2, 4)
        return SUCCESS
      })
    const runtime = createGenerationRuntime(responses.push.bind(responses), generate)

    await runtime.handleRequest({
      type: 'GENERATE',
      requestId: 'progress-request',
      options: { qualityProfile: 'standard' },
    })

    expect(responses).toContainEqual({
      type: 'PROGRESS',
      requestId: 'progress-request',
      progress: 72,
      stage: 'candidate-selection',
    })
  })

  it('cancels only the matching request and emits CANCELLED', async () => {
    const responses: GenerationWorkerResponse[] = []
    let resolveGeneration: ((result: GenerationResult) => void) | undefined
    const generate = vi.fn<GenerateMapAsync>()
      .mockImplementation((_options, hooks) => new Promise(resolve => {
        resolveGeneration = resolve
        hooks?.signal?.addEventListener('abort', () => resolve(SUCCESS), { once: true })
      }))
    const runtime = createGenerationRuntime(responses.push.bind(responses), generate)

    const pending = runtime.handleRequest({
      type: 'GENERATE',
      requestId: 'matching-request',
      options: { qualityProfile: 'draft' },
    })
    await runtime.handleRequest({
      type: 'CANCEL',
      requestId: 'different-request',
    })

    expect(responses).not.toContainEqual(expect.objectContaining({
      requestId: 'matching-request',
      type: 'CANCELLED',
    }))

    await runtime.handleRequest({
      type: 'CANCEL',
      requestId: 'matching-request',
    })
    resolveGeneration?.(SUCCESS)
    await pending

    expect(responses).toContainEqual({
      type: 'CANCELLED',
      requestId: 'matching-request',
    })
    expect(responses).not.toContainEqual(expect.objectContaining({
      requestId: 'matching-request',
      type: 'COMPLETE',
    }))
  })
  it('lets a queued Draft CANCEL win after its only production candidate', async () => {
    const responses: GenerationWorkerResponse[] = []
    const runtime = createGenerationRuntime(responses.push.bind(responses))
    const cancelTask = new Promise<void>(resolve => {
      setTimeout(() => {
        void runtime.handleRequest({
          type: 'CANCEL',
          requestId: 'draft-transport-cancel',
        }).then(resolve)
      }, 0)
    })

    const generationTask = runtime.handleRequest({
      type: 'GENERATE',
      requestId: 'draft-transport-cancel',
      options: {
        seed: 'QWHJGV9K',
        archetype: 'ship',
        subtype: 'freighter',
        styleProfile: 'utilitarian',
        sizeTier: 'md',
        loopiness: 0.5,
        danger: 0.3,
        qualityProfile: 'draft',
      },
    })

    await Promise.all([generationTask, cancelTask])

    expect(responses).toContainEqual({
      type: 'CANCELLED',
      requestId: 'draft-transport-cancel',
    })
    expect(responses).not.toContainEqual(expect.objectContaining({
      requestId: 'draft-transport-cancel',
      type: 'COMPLETE',
    }))
  })


  it.each(['useQuality', 'qualityMode', 'engine', 'skipValidation', 'routing'] as const)(
    'rejects unsupported %s payloads before generation dispatch',
    (unsupportedKey) => {
      const responses: GenerationWorkerResponse[] = []
      const generate = vi.fn<GenerateMapAsync>().mockResolvedValue(SUCCESS)
      const runtime = createGenerationRuntime(responses.push.bind(responses), generate)
      const value = {
        type: 'GENERATE',
        requestId: `unsupported-${unsupportedKey}`,
        options: {
          seed: 'unsupported',
          [unsupportedKey]: unsupportedKey === 'engine'
            ? 'legacy'
            : unsupportedKey === 'routing' ? { coalesceEnabled: false } : true,
        },
      }

      expect(() => {
        const request = parseGenerationWorkerRequest(value)
        void runtime.handleRequest(request)
      }).toThrow(GenerationProtocolError)
      expect(generate).not.toHaveBeenCalled()
      expect(responses).toEqual([])
    },
  )
})

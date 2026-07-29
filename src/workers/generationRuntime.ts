import {
  generateMapAsync,
  type CandidateGenerationHooks,
  type GenerationResult,
  type GeneratorOptions,
} from '../generators'
import type {
  GenerationWorkerRequest,
  GenerationWorkerResponse,
} from './generationProtocol'

export type GenerationPostMessage = (message: GenerationWorkerResponse) => void

export type ProductionGenerator = (
  options: GeneratorOptions,
  hooks?: CandidateGenerationHooks,
) => Promise<GenerationResult>

export interface GenerationRuntime {
  handleRequest(request: GenerationWorkerRequest): Promise<void>
}

interface ActiveGeneration {
  controller: AbortController
}

export function createGenerationRuntime(
  postMessage: GenerationPostMessage,
  generate: ProductionGenerator = generateMapAsync,
): GenerationRuntime {
  const activeGenerations = new Map<string, ActiveGeneration>()

  return {
    async handleRequest(request: GenerationWorkerRequest): Promise<void> {
      if (request.type === 'CANCEL') {
        const active = activeGenerations.get(request.requestId)
        if (!active) return

        active.controller.abort()
        activeGenerations.delete(request.requestId)
        postMessage({
          type: 'CANCELLED',
          requestId: request.requestId,
        })
        return
      }

      const previous = activeGenerations.get(request.requestId)
      previous?.controller.abort()

      const active: ActiveGeneration = {
        controller: new AbortController(),
      }
      activeGenerations.set(request.requestId, active)

      try {
        const result = await generate(request.options, {
          signal: active.controller.signal,
          onCandidate: (completed, total) => {
            if (!isCurrentGeneration(activeGenerations, request.requestId, active)) {
              return
            }
            postMessage({
              type: 'PROGRESS',
              requestId: request.requestId,
              progress: candidateProgress(completed, total),
              stage: 'candidate-selection',
            })
          },
        })

        if (!isCurrentGeneration(activeGenerations, request.requestId, active)) {
          return
        }
        if (!result.success || !result.map) {
          postMessage({
            type: 'ERROR',
            requestId: request.requestId,
            message: generationFailureMessage(result),
          })
          return
        }

        postMessage({
          type: 'COMPLETE',
          requestId: request.requestId,
          format: 'map-json-v1',
          map: result.map,
        })
      } catch (error: unknown) {
        if (!isCurrentGeneration(activeGenerations, request.requestId, active)) {
          return
        }
        postMessage({
          type: 'ERROR',
          requestId: request.requestId,
          message: thrownValueMessage(error),
        })
      } finally {
        if (activeGenerations.get(request.requestId) === active) {
          activeGenerations.delete(request.requestId)
        }
      }
    },
  }
}

function isCurrentGeneration(
  activeGenerations: ReadonlyMap<string, ActiveGeneration>,
  requestId: string,
  active: ActiveGeneration,
): boolean {
  return !active.controller.signal.aborted &&
    activeGenerations.get(requestId) === active
}

function candidateProgress(completed: number, total: number): number {
  const ratio = total > 0 ? completed / total : 0
  const boundedRatio = Math.max(0, Math.min(1, ratio))
  return Math.round((60 + boundedRatio * 24) * 100) / 100
}

function generationFailureMessage(result: GenerationResult): string {
  const messages = result.issues
    .map(issue => issue.message.trim())
    .filter(message => message.length > 0)
  return messages.join(', ') || 'Generation failed'
}

function thrownValueMessage(value: unknown): string {
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }
  return 'Generation failed'
}

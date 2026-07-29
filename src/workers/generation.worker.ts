/// <reference lib="webworker" />

import {
  GenerationProtocolError,
  getGenerationRequestId,
  parseGenerationWorkerRequest,
  type GenerationWorkerResponse,
} from './generationProtocol'
import { createGenerationRuntime } from './generationRuntime'

const workerScope = self as unknown as DedicatedWorkerGlobalScope
const postMessage = (message: GenerationWorkerResponse): void => {
  workerScope.postMessage(message)
}
const runtime = createGenerationRuntime(postMessage)

workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  try {
    const request = parseGenerationWorkerRequest(event.data)
    void runtime.handleRequest(request)
  } catch (error: unknown) {
    postMessage({
      type: 'ERROR',
      requestId: getGenerationRequestId(event.data) ?? 'unknown',
      message: protocolErrorMessage(error),
    })
  }
}

function protocolErrorMessage(error: unknown): string {
  if (error instanceof GenerationProtocolError) return error.message
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Invalid worker request'
}

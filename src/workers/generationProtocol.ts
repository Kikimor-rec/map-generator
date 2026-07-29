import type {
  Archetype,
  GenerationQualityProfile,
  GeneratorOptions,
  MapJSON,
  SizeTier,
  StyleProfile,
} from '../generators'

export type GenerationWorkerOptions = Pick<
  GeneratorOptions,
  | 'seed'
  | 'archetype'
  | 'subtype'
  | 'styleProfile'
  | 'sizeTier'
  | 'loopiness'
  | 'danger'
  | 'qualityProfile'
>

export type GenerationWorkerRequest =
  | {
      type: 'GENERATE'
      requestId: string
      options: GenerationWorkerOptions
    }
  | {
      type: 'CANCEL'
      requestId: string
    }

export type GenerationWorkerResponse =
  | {
      type: 'PROGRESS'
      requestId: string
      progress: number
      stage: string
    }
  | {
      type: 'COMPLETE'
      requestId: string
      format: 'map-json-v1'
      map: MapJSON
    }
  | {
      type: 'ERROR'
      requestId: string
      message: string
    }
  | {
      type: 'CANCELLED'
      requestId: string
    }

const REQUEST_KEYS = new Set(['type', 'requestId', 'options'])
const CANCEL_KEYS = new Set(['type', 'requestId'])
const OPTION_KEYS = new Set([
  'seed',
  'archetype',
  'subtype',
  'styleProfile',
  'sizeTier',
  'loopiness',
  'danger',
  'qualityProfile',
])
const UNSUPPORTED_OPTION_KEYS = new Set([
  'useQuality', 'qualityMode', 'engine', 'skipValidation', 'routing',
])

export class GenerationProtocolError extends Error {
  readonly requestId: string | undefined

  constructor(message: string, requestId?: string) {
    super(message)
    this.name = 'GenerationProtocolError'
    this.requestId = requestId
  }
}

export function parseGenerationWorkerRequest(
  value: unknown,
): GenerationWorkerRequest {
  const request = requireRecord(value, 'worker request')
  const requestId = requireNonEmptyString(request.requestId, 'requestId')

  if (request.type === 'CANCEL') {
    assertOnlyKeys(request, CANCEL_KEYS, 'CANCEL request', requestId)
    return { type: 'CANCEL', requestId }
  }

  if (request.type !== 'GENERATE') {
    throw new GenerationProtocolError(
      'Invalid worker request: type must be GENERATE or CANCEL',
      requestId,
    )
  }

  assertOnlyKeys(request, REQUEST_KEYS, 'GENERATE request', requestId)
  return {
    type: 'GENERATE',
    requestId,
    options: parseGeneratorOptions(request.options, requestId),
  }
}

export function getGenerationRequestId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.requestId === 'string' && value.requestId.length > 0
    ? value.requestId
    : undefined
}

function parseGeneratorOptions(value: unknown, requestId: string): GenerationWorkerOptions {
  const input = requireRecord(value, 'GENERATE options', requestId)

  for (const key of Object.keys(input)) {
    if (UNSUPPORTED_OPTION_KEYS.has(key)) {
      throw new GenerationProtocolError(
        `Production generation option "${key}" is not supported`,
        requestId,
      )
    }
  }
  assertOnlyKeys(input, OPTION_KEYS, 'GENERATE options', requestId)

  const options: GenerationWorkerOptions = {}
  if (input.seed !== undefined) {
    options.seed = requireString(input.seed, 'options.seed', requestId)
  }
  if (input.archetype !== undefined) {
    options.archetype = parseArchetype(input.archetype, requestId)
  }
  if (input.subtype !== undefined) {
    options.subtype = requireString(input.subtype, 'options.subtype', requestId)
  }
  if (input.styleProfile !== undefined) {
    options.styleProfile = parseStyleProfile(input.styleProfile, requestId)
  }
  if (input.sizeTier !== undefined) {
    options.sizeTier = parseSizeTier(input.sizeTier, requestId)
  }
  if (input.loopiness !== undefined) {
    options.loopiness = requireFiniteNumber(
      input.loopiness,
      'options.loopiness',
      requestId,
    )
  }
  if (input.danger !== undefined) {
    options.danger = requireFiniteNumber(
      input.danger,
      'options.danger',
      requestId,
    )
  }
  if (input.qualityProfile !== undefined) {
    options.qualityProfile = parseQualityProfile(input.qualityProfile, requestId)
  }
  return options
}

function parseArchetype(value: unknown, requestId: string): Archetype {
  if (value === 'ship' || value === 'station' || value === 'outpost') return value
  throw invalidValue('options.archetype', requestId)
}

function parseStyleProfile(value: unknown, requestId: string): StyleProfile {
  switch (value) {
    case 'utilitarian':
    case 'military':
    case 'luxury':
    case 'industrial':
    case 'organic':
    case 'alien':
    case 'realism':
    case 'futurism':
      return value
    default:
      throw invalidValue('options.styleProfile', requestId)
  }
}

function parseSizeTier(value: unknown, requestId: string): SizeTier {
  if (value === 'xs' || value === 'sm' || value === 'md' ||
      value === 'lg' || value === 'xl') {
    return value
  }
  throw invalidValue('options.sizeTier', requestId)
}

function parseQualityProfile(
  value: unknown,
  requestId: string,
): GenerationQualityProfile {
  if (value === 'draft' || value === 'standard' || value === 'polish') {
    return value
  }
  throw invalidValue('options.qualityProfile', requestId)
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  requestId?: string,
): void {
  const unexpected = Object.keys(value).find(key => !allowed.has(key))
  if (unexpected) {
    throw new GenerationProtocolError(
      `Invalid ${label}: unexpected field "${unexpected}"`,
      requestId,
    )
  }
}

function requireRecord(
  value: unknown,
  label: string,
  requestId?: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new GenerationProtocolError(`Invalid ${label}: expected an object`, requestId)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  value: unknown,
  label: string,
  requestId?: string,
): string {
  if (typeof value !== 'string') throw invalidValue(label, requestId)
  return value
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidValue(label)
  }
  return value
}

function requireFiniteNumber(
  value: unknown,
  label: string,
  requestId: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidValue(label, requestId)
  }
  return value
}

function invalidValue(
  label: string,
  requestId?: string,
): GenerationProtocolError {
  return new GenerationProtocolError(`Invalid ${label}`, requestId)
}

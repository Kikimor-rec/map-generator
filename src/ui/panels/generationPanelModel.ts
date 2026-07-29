import type {
  Archetype,
  GenerationQualityProfile,
  SizeTier,
  StyleProfile,
  Subtype,
} from '../../generators'
import type { GenerationWorkerRequest } from '../../workers/generationProtocol'

export interface GenerationFormState {
  seed: string
  archetype: Archetype
  subtype: Subtype
  sizeTier: SizeTier
  styleProfile: StyleProfile
  loopiness: number
  danger: number
  qualityProfile: GenerationQualityProfile
}

export function buildGenerationWorkerRequest(
  requestId: string,
  form: GenerationFormState,
): Extract<GenerationWorkerRequest, { type: 'GENERATE' }> {
  return {
    type: 'GENERATE',
    requestId,
    options: {
      seed: form.seed,
      archetype: form.archetype,
      subtype: form.subtype,
      sizeTier: form.sizeTier,
      styleProfile: form.styleProfile,
      loopiness: form.loopiness,
      danger: form.danger,
      qualityProfile: form.qualityProfile,
    },
  }
}

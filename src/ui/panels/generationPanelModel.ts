import {
  getCandidateCount,
  type Archetype,
  type GenerationQualityProfile,
  type MapSize,
  type SizeTier,
  type StyleProfile,
  type Subtype,
} from '../../generators'
import type { GenerationWorkerRequest } from '../../workers/generationProtocol'

export interface GenerationProfileOption {
  id: GenerationQualityProfile
  label: string
  candidateCount: number
  description: string
}

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

const PROFILE_LABELS = Object.freeze({
  draft: 'Draft',
  standard: 'Standard',
  polish: 'Polish',
}) satisfies Readonly<Record<GenerationQualityProfile, string>>

const PROFILE_IDS: readonly GenerationQualityProfile[] = Object.freeze([
  'draft',
  'standard',
  'polish',
])

export function getGenerationProfileOptions(
  size: MapSize,
): readonly GenerationProfileOption[] {
  return PROFILE_IDS.map(id => {
    const candidateCount = getCandidateCount(id, size)
    const candidateLabel = candidateCount === 1 ? 'candidate' : 'candidates'

    return {
      id,
      label: PROFILE_LABELS[id],
      candidateCount,
      description: `Hard-gate selection from ${candidateCount} ${candidateLabel}.`,
    }
  })
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

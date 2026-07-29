import {
  getCandidateCount,
  type EditorMapData,
  type Archetype,
  type GenerationQualityProfile,
  type MapSize,
  type SizeTier,
  type StyleProfile,
  type Subtype,
} from '../../generators'
import {
  DEFAULT_LAYERS,
  MAP_THEMES,
  MapThemeId,
  type MapProject,
} from '../../core/types'

import type { GenerationWorkerRequest } from '../../workers/generationProtocol'

export interface GenerationProfileOption {
  id: GenerationQualityProfile
  label: string
  candidateCount: number
  description: string
}

export interface GenerationProfilePresentationOption extends GenerationProfileOption {
  active: boolean
  disabled: boolean
}

export interface GenerationProfilePresentation {
  options: readonly GenerationProfilePresentationOption[]
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

export function getGenerationProfilePresentation(
  size: MapSize,
  selectedSingleMapProfile: GenerationQualityProfile,
  galleryMode: boolean,
): GenerationProfilePresentation {
  const options = getGenerationProfileOptions(size)
  const activeProfile = galleryMode ? 'draft' : selectedSingleMapProfile

  return {
    options: options.map(option => ({
      ...option,
      active: option.id === activeProfile,
      disabled: galleryMode,
    })),
    description: galleryMode
      ? 'Gallery generates multiple Draft seeded variants, then ranks them.'
      : options.find(option => option.id === activeProfile)?.description ?? '',
  }
}
export type GalleryGenerationAttempt<T> =
  | { status: 'success'; value: T }
  | { status: 'failure'; reason: string }

export interface GalleryFailureSummary {
  failedCount: number
  totalCount: number
  allFailed: boolean
  reasonSummary: string
}

export interface GalleryAggregation<T> {
  successes: T[]
  failure: GalleryFailureSummary | null
}

export function aggregateGalleryAttempts<T>(
  attempts: readonly GalleryGenerationAttempt<T>[],
): GalleryAggregation<T> {
  const successes: T[] = []
  const reasonCounts = new Map<string, number>()

  for (const attempt of attempts) {
    if (attempt.status === 'success') {
      successes.push(attempt.value)
      continue
    }

    const reason = attempt.reason.trim() || 'Generation failed'
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
  }

  if (reasonCounts.size === 0) return { successes, failure: null }

  const reasonSummary = [...reasonCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reason, count]) => `${reason} (${count})`)
    .join('; ')
  const failedCount = attempts.length - successes.length

  return {
    successes,
    failure: {
      failedCount,
      totalCount: attempts.length,
      allFailed: successes.length === 0,
      reasonSummary,
    },
  }
}

export interface GalleryProjectInput {
  projectId: string
  deckId: string
  name: string
  description: string
  timestamp: string
  seed: string
  score: number
  editorData: EditorMapData
}

export function buildGalleryProject(input: GalleryProjectInput): MapProject {
  return {
    id: input.projectId,
    name: input.name,
    description: input.description,
    version: '1.0.0',
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    gridSize: 40,
    decks: [{
      id: input.deckId,
      name: 'Deck 1',
      level: 1,
      rooms: input.editorData.rooms,
      corridors: input.editorData.corridors,
      junctions: input.editorData.junctions ?? [],
      geometry: input.editorData.geometry,
      pressure: input.editorData.pressure,
    }],
    layers: [...DEFAULT_LAYERS],
    theme: MAP_THEMES[MapThemeId.Blueprint],
    metadata: { seed: input.seed, score: input.score },
  }
}


export function formatGallerySelectionSummary(
  score: number,
  paretoRank: number,
): string {
  return `Selection score: ${Math.round(score * 100)}% · Pareto ${paretoRank + 1}`
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

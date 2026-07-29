import type { SizeTier } from './types'

export type MapSize = SizeTier
export type GenerationQualityProfile = 'draft' | 'standard' | 'polish'

export interface ProductionProfile {
  candidateCountBySize: Readonly<Record<MapSize, number>>
  requireHardPass: true
}

const DRAFT_COUNTS = Object.freeze({
  xs: 1,
  sm: 1,
  md: 1,
  lg: 1,
  xl: 1,
}) satisfies Readonly<Record<MapSize, number>>

const STANDARD_COUNTS = Object.freeze({
  xs: 4,
  sm: 4,
  md: 3,
  lg: 2,
  xl: 2,
}) satisfies Readonly<Record<MapSize, number>>

const POLISH_COUNTS = Object.freeze({
  xs: 8,
  sm: 8,
  md: 6,
  lg: 4,
  xl: 4,
}) satisfies Readonly<Record<MapSize, number>>

export const PRODUCTION_PROFILES: Readonly<
  Record<GenerationQualityProfile, ProductionProfile>
> = Object.freeze({
  draft: Object.freeze({
    candidateCountBySize: DRAFT_COUNTS,
    requireHardPass: true,
  }),
  standard: Object.freeze({
    candidateCountBySize: STANDARD_COUNTS,
    requireHardPass: true,
  }),
  polish: Object.freeze({
    candidateCountBySize: POLISH_COUNTS,
    requireHardPass: true,
  }),
})

export function getCandidateCount(
  profile: GenerationQualityProfile,
  size: MapSize,
): number {
  return PRODUCTION_PROFILES[profile].candidateCountBySize[size]
}

# Corridor Coalesce Specification

## Overview
Coalesce runs after routing to merge duplicate or overlapping corridor segments, clean up micro-fragments, and create proper junctions.

## Goals
1. Remove duplicate segments.  
2. Split and merge partial overlaps.  
3. Insert junctions (T/X/hub) where overlaps meet.  
4. Prefer reusing existing segments during routing (cost bonus).  

## Configuration
```ts
interface CoalesceSettings {
  enabled: boolean
  tolerancePx: number        // default: 10
  minSharedLength: number    // default: 20
  typeMergePolicy: TypeMergePolicy
  layerMergePolicy: LayerMergePolicy
  preferReuseWeight: number  // default: 0.3
  createJunctionsAtMerge: boolean
}
```

Type policy: `shareIfSameType` (default) | `shareAndPromotePriority` | `neverShareDifferentTypes`  
Layer policy: `mergeWithinLayer` (default) | `mergeAll` | `neverMergeLayers`

## Algorithm
1. **Canonize** – normalize segment direction, hash by quantized endpoints.  
2. **Deduplicate** – remove exact duplicates respecting type/layer policy.  
3. **Partial overlaps** – split shared portions when overlap ≥ `minSharedLength`.  
4. **Junctions** – create T/X/hub nodes at merge points.  
5. **Prefer reuse** – A* cost reduction when an edge overlaps an existing segment.  
6. **Simplify** – drop collinear midpoints and zero-length fragments (tolerancePx).  

## Defaults (current build)
- Enabled: **true** in standard and quality generators.
- `tolerancePx=10`, `minSharedLength=20`.
- Prefer reuse weight: **0.3** (see routing cost config for reuse bonus).
- Type policy: `shareIfSameType`; layer policy: `mergeWithinLayer`.

## Acceptance Tests
1. Duplicate removal: identical segments collapse to one.  
2. Policy respect: different types stay separate under `shareIfSameType`.  
3. Partial overlap: shared span is split out and shared.  
4. Junction creation: T/X/hub created at merge points.  
5. Integrity: corridor connectivity preserved after merges.  
6. UI toggle: disabling coalesce leaves overlaps untouched.  
7. Routing preference: paths with shared spans get lower cost when prefer-reuse is on.  

## Locations
- Types/defaults: `src/core/corridorTypes.ts`  
- Algorithm: `src/core/corridorCoalesce.ts`  
- Integration: `src/generators/generator.ts`, `src/generators/quality/pipeline.ts`  
- UI toggle: `src/ui/panels/GenerationPanel.tsx`  

## Open Issues / TODO
- Expand unit tests for partial overlaps and mixed-type policies.  
- Editor still selects whole corridor; segment-level selection needs follow-up.  

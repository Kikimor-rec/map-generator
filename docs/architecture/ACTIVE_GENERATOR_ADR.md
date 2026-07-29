# ADR: Active Production Generator

- Status: Accepted
- Date: 2026-07-29

## Context

The repository currently exposes more than one generation path. The public
generator facade accepts `engine: 'grid' | 'legacy'`, the generation UI exposes
that choice plus a separate quality-pipeline toggle, and the worker dispatches
among those paths. Grid is already the default, but default selection alone
does not establish architectural ownership.

This ADR defines the target ownership contract for production development. It
does not claim that the current runtime dispatch has already been removed.

## Decision

The occupancy-grid generator is the only production engine target.
`src/generators/gridGenerator/occupancyGenerator.ts` owns production map
generation, with deterministic best-of-N selection in
`src/generators/gridGenerator/candidateSelector.ts`.

`src/generators/quality/pipeline.ts` is not a second production generator
target. Phase 1 may extract reusable validators and scoring from it for use by
the occupancy-grid engine. After that extraction, its independent generation
path is retired.

The legacy generators are retained only for import compatibility and regression
comparison. New production behavior must not be added to them.

`MapDocumentV2`, defined in `src/domain/mapDocumentV2.ts`, is the target
canonical generated document. Current `MapJSON` and editor-shaped results are
transitional boundary formats until Phase 1 connects production generation to
`MapDocumentV2`.

## Current paths and ownership

| Path | Current state | Ownership under this decision |
| --- | --- | --- |
| `src/generators/generator.ts` | Generator facade; defaults to grid but still dispatches `engine: 'grid' | 'legacy'` and returns `MapJSON`. | Transitional production entry point. In Phase 1 it must stop production dispatch to legacy and emit or adapt to `MapDocumentV2`. |
| `src/generators/gridGenerator/occupancyGenerator.ts` | Occupancy-first implementation; carved cells are the source of truth and graph/editor geometry is derived from them. | The only production generation engine target. |
| `src/generators/gridGenerator/candidateSelector.ts` | Runs deterministic grid candidates, applies hard validation gates, and ranks passing candidates. | Production selection owned by the occupancy-grid engine, not a separate engine. |
| `src/generators/quality/pipeline.ts` | Independently generates candidates when the quality branch is selected. | Source for validator/scoring extraction only; retire the independent generation path after extraction. |
| `src/generators/mapGenerator.ts` | Older standalone BSP/graph `MapGenerator` API, still re-exported from the generator index. | Import/regression compatibility only. |
| `src/ui/panels/GenerationPanel.tsx` | Exposes `grid`/`legacy` engine selection and an independent quality-pipeline toggle; grid is the default. | Transitional UI. Phase 1 removes production choices that bypass the occupancy-grid engine. |
| `src/workers/generation.worker.ts` | Dispatches to the quality pipeline, best-of-N grid selection, or `generateMap`, which can still select legacy. | Transitional dispatch. Phase 1 narrows it to occupancy-grid generation plus extracted validation/scoring. |
| `src/domain/mapDocumentV2.ts` | Defines the renderer-neutral, JSON-safe `MapDocumentV2`; the generator does not yet produce it. | Target canonical document contract. |

## Invariants

- There is one production generation owner: the occupancy-grid engine.
- Occupancy cells are generation truth; corridors, connectivity graphs, and
  render/editor geometry are derived representations.
- Candidate selection, validation, and scoring may reject or rank generated
  maps, but they do not constitute another production engine.
- Extracted quality validators and scoring must consume occupancy-grid output or
  its canonical document, rather than regenerate competing geometry.
- Legacy generation is limited to import compatibility and regression
  comparison; it is not a feature-development target.
- `MapDocumentV2` is the canonical target. `MapJSON`, editor project objects,
  and renderer data are adapters or migration formats, not competing sources of
  truth.
- Seeded production generation and candidate selection remain deterministic.

## Phase 1 migration

Phase 1 will:

1. extract any retained validators and scoring from
   `src/generators/quality/pipeline.ts` and apply them to occupancy-grid
   candidates;
2. connect occupancy-grid output to `MapDocumentV2`;
3. remove the production `engine: 'grid' | 'legacy'` and independent-quality
   dispatch from `src/generators/generator.ts`,
   `src/ui/panels/GenerationPanel.tsx`, and
   `src/workers/generation.worker.ts`;
4. isolate legacy generation behind explicit import/regression compatibility
   boundaries; and
5. retire the remaining independent quality-generation implementation.

Production dispatch removal belongs to Phase 1. This Phase 0 ADR changes
ownership and future direction only; it deliberately makes no runtime code
change.

## Consequences

- Production fixes and features have one destination.
- Quality work can be reused without preserving a parallel geometry generator.
- Import and regression coverage can remain available while production
  ambiguity is removed.
- Phase 1 must provide adapters during the move from current `MapJSON` and
  editor-shaped results to `MapDocumentV2`.
- Until Phase 1 completes, the UI and worker can still reach non-target paths;
  that is known transitional state, not authorization for two production
  engines.

## Rejected alternatives

- **Keep grid and legacy as coequal production engines.** This duplicates
  behavior, testing, and bug ownership.
- **Keep the quality pipeline as a separate production engine.** Useful
  validation and scoring do not require an independent generation path.
- **Treat `MapJSON` or editor state as the canonical target.** Both couple
  generation to transitional consumers; `MapDocumentV2` provides the
  renderer-neutral target.
- **Delete all non-grid dispatch in Phase 0.** That would mix a runtime migration
  with the ground-truth documentation task and could remove compatibility before
  Phase 1 supplies explicit boundaries.

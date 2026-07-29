# ADR: Active Production Generator

- Status: Accepted and implemented
- Date: 2026-07-29
- Implementation reconciled: 2026-07-30

## Context

The repository historically exposed three competing ways to generate geometry:
the occupancy/grid generator, an older room-program/topology/layout pipeline,
and `quality/pipeline.ts`. The product UI and worker could reach more than one
of those paths, and connector shape was inferred from connector IDs.

Phase 1 removes that production ambiguity without deleting the historical
implementations needed for regression comparison and old-document adaptation.

## Decision

The occupancy/grid engine is the only product generation engine.
`src/generators/gridGenerator/occupancyGenerator.ts` owns geometry generation:
the tile canvas is the source of truth, and exported topology/editor geometry
is derived from carved occupancy.

`src/generators/generator.ts` is the sole production facade:

```ts
generateMap(options: GeneratorOptions): GenerationResult
generateMapAsync(
  options: GeneratorOptions,
  hooks?: CandidateGenerationHooks,
): Promise<GenerationResult>
```

Both facade functions always call the occupancy candidate selector. There is no
production engine switch. If `qualityProfile` is omitted, the facade uses
`standard`.

Draft, Standard, and Polish are deterministic candidate-selection effort
profiles, not different algorithms:

| Profile | XS | SM | MD | LG | XL |
| --- | ---: | ---: | ---: | ---: | ---: |
| Draft | 1 | 1 | 1 | 1 | 1 |
| Standard | 4 | 4 | 3 | 2 | 2 |
| Polish | 8 | 8 | 6 | 4 | 4 |

Every profile requires a hard-pass candidate. Selection uses the existing
policy in `gridGenerator/candidateSelector.ts`, in this order:

1. reject candidates that fail generation, semantic/structural/pressure gates,
   connector geometry and anchor checks, or finite-objective checks;
2. assign Pareto fronts over `routeClarity`, `hullUseFit`, and `ttrpgChoice`;
3. use the min-aware balanced score
   `0.5 * mean(objectives) + 0.5 * min(objectives)` within a front;
4. use numeric `candidateIndex` as the final tie-break.

An explicit seed plus the same request/profile produces the same candidate
family, normalized document, and selected candidate. Draft still goes through
the same hard-gated selector with one candidate.

## Product facade, worker, and UI

The product UI and worker share one typed route:

```text
GenerationPanel
  -> GenerationWorkerRequest { type: "GENERATE", requestId, options }
  -> generation.worker.ts
  -> generationRuntime.ts
  -> generateMapAsync
  -> occupancy candidate selector
  -> GenerationWorkerResponse {
       type: "COMPLETE",
       format: "map-json-v1",
       map
     }
```

`generationProtocol.ts` rejects obsolete `engine`, `useQuality`, and
`qualityMode` payload fields. The UI presents only Draft, Standard, and Polish.
Gallery variants use the same `generateMap` facade with Draft and derived
seeds, then use the occupancy candidate ranking helper.

## Compatibility boundary

Historical generation remains available only through
`src/generators/compatibility/index.ts`:

- `generateLegacyMapForRegression`;
- the old `MapGenerator` and presets;
- retained quality-pipeline entry points.

These APIs are compatibility/regression tools, not product engines. They are
not re-exported by `src/generators/index.ts`, and production code must not add
features to them.

## Machine-enforced import ownership

`npm run check:generator-boundary` traverses TypeScript imports and re-exports
from both production entry points:

- `src/ui/panels/GenerationPanel.tsx`;
- `src/workers/generation.worker.ts`.

The check fails with the full import chain if either entry point can reach the
quality pipeline, legacy pipeline, old `MapGenerator`, old layout/topology, or
either skeleton generator. Shared semantic modules such as `roomProgram` are
allowed. The boundary command is part of `npm run check`.

## Connector representation

All production `MapJSON` connectors serialize one explicit representation:

- `physical-topology-edge-v1` for occupancy-derived physical graph edges;
- `room-route-v1` for historical room-to-room routes.

The occupancy production writer emits the physical value. The retained legacy
regression writer emits the room-route value. The separately retained quality
`MapJSONCompat` writer is compatibility/regression-only: it does not use this
production discriminator unless and until its output is normalized, and it is
not reachable from the production UI or worker.

`normalizeConnectorRepresentation()` applies the compatibility rules:

1. an explicit representation always wins, regardless of ID;
2. only a discriminator-free historical ID beginning with `corridor-edge-`
   falls back to `physical-topology-edge-v1`;
3. every other discriminator-free connector falls back to `room-route-v1`.

The editor adapter normalizes each connector independently. Mixed decks may
therefore contain both representations: physical edges remain separate graph
edges, while only room routes receive legacy coalescing and endpoint-door
adaptation. No deck-wide classification is permitted.

The optional type field exists only so historical discriminator-free JSON can
still be read. Production `MapJSON` writers must always include it.

## Canonical document boundary

Phase 1 continues to return the existing `MapJSON` bridge. Completing and
extending `src/domain/mapDocumentV2.ts`, adding runtime parsing/migrations, and
introducing `importGeneratedMap` remain Phase 2 work. Phase 1 does not change
document versions or claim that `MapDocumentV2` is already the production
format.

## Invariants

- There is one production geometry owner: the occupancy/grid engine.
- Candidate selection, validation, and scoring rank occupancy output; they do
  not regenerate competing geometry.
- UI and worker use the same facade and typed request/response protocol.
- Quality and legacy generators are compatibility/regression-only.
- Production `MapJSON` connectors carry an explicit representation.
- Historical connector inference exists only in the compatibility normalizer
  and is applied per connector.
- Seeded generation and candidate selection remain deterministic.

## Consequences

- Production fixes and features have one destination.
- Profiles can trade compute for selection effort without changing geometry
  architecture.
- Historical generators and old JSON remain testable without being reachable
  from product entry points.
- Phase 2 can introduce the canonical document/import boundary on top of one
  stable production generation path.

## Rejected alternatives

- **Keep grid and legacy as coequal product engines.** This duplicates behavior,
  tests, and bug ownership.
- **Keep the quality pipeline as a second product engine.** Reusable validation
  and scoring do not require competing geometry generation.
- **Treat profile names as algorithm choices.** Draft/Standard/Polish vary only
  deterministic candidate count.
- **Infer every connector from its ID.** IDs are not a reliable format
  discriminator; fallback is retained only for old discriminator-free data.
- **Implement `MapDocumentV2` during Phase 1.** That would combine production
  routing consolidation with the separate canonical import/migration boundary.

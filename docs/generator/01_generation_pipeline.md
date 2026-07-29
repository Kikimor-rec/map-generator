# 01 — Production generation pipeline

> **Current status (2026-07-30):** the occupancy/grid engine is the only
> product generation engine. Historical generator descriptions belong to the
> explicit compatibility surface, not this production pipeline.

See [ADR: Active Production Generator](../architecture/ACTIVE_GENERATOR_ADR.md).

## 1. Product entry point

All single-map product generation calls one facade:

```ts
generateMap(options: GeneratorOptions): GenerationResult
generateMapAsync(
  options: GeneratorOptions,
  hooks?: CandidateGenerationHooks,
): Promise<GenerationResult>
```

Both functions resolve a quality profile and call the occupancy candidate
selector. Neither function dispatches to the old layout/topology generator or
to `quality/pipeline.ts`.

## 2. Selection profiles

Draft, Standard, and Polish select how many deterministic occupancy candidates
are evaluated. They do not select different geometry implementations.

| Profile | XS | SM | MD | LG | XL |
| --- | ---: | ---: | ---: | ---: | ---: |
| Draft | 1 | 1 | 1 | 1 | 1 |
| Standard | 4 | 4 | 3 | 2 | 2 |
| Polish | 8 | 8 | 6 | 4 | 4 |

The default is Standard. Every profile, including one-candidate Draft, requires
a hard-pass candidate.

## 3. One occupancy attempt

For each candidate, `generateGridMapV2()`:

1. normalizes seed, archetype, subtype, style, size, loopiness, and danger;
2. creates the seeded RNG and shared room program;
3. creates the occupancy canvas;
4. carves the archetype/subtype hull and captures the original hull mask;
5. assigns functional zones;
6. carves ship, station, or outpost circulation into the hull;
7. places mask-aware rooms beside or through circulation;
8. classifies and materializes deterministic room-side doors;
9. derives the physical corridor graph and junctions from occupied tiles;
10. materializes the static pressure-topology bridge;
11. runs playability, aesthetic, facility-structure, and pressure validation;
12. converts the result to `MapJSON`.

Occupancy cells are authoritative. Connector paths and editor polylines are
derived representations, not a second geometry source.

## 4. Deterministic candidate family

For multi-candidate profiles, child seeds are derived from:

```text
hash(masterSeed, "grid-candidate-v1", candidateIndex)
```

Candidate count is not part of the derivation, so increasing selection effort
preserves the earlier child seeds. Draft uses the master seed directly because
its pool contains one candidate.

The same explicit request, profile, and code version produces the same
candidate family, normalized document, and selected index.

## 5. Hard-gated Pareto selection

The selector rejects candidates with generation failures, missing required
metrics, semantic/structural/pressure errors, disconnected or isolated rooms,
unreachable critical rooms, fallback ingress, ambiguous/mismatched doors,
invalid connector geometry, broken room-port anchors, or non-finite
objectives.

Passing candidates are ranked in this order:

1. Pareto front over `routeClarity`, `hullUseFit`, and `ttrpgChoice`;
2. min-aware balanced score
   `0.5 * mean(objectives) + 0.5 * min(objectives)`;
3. numeric `candidateIndex`.

If no candidate passes, generation returns `NO_VALID_CANDIDATE`; a rejected
map is not silently promoted.

Selection metadata is stored at `meta.candidateSelection`, including the
schema/evaluator versions, master and selected seeds, evaluated/passed/rejected
counts, selected index, Pareto rank, objectives, balanced score, and reason
codes.

## 6. Worker path

The panel and worker share one protocol:

```text
GenerationPanel
  -> GENERATE request
  -> generation.worker.ts
  -> generationRuntime.ts
  -> generateMapAsync
  -> COMPLETE { format: "map-json-v1", map }
```

The parser accepts one `GENERATE`/`CANCEL` request union and rejects obsolete
engine/quality switches. Candidate progress and cancellation are scoped by
`requestId`.

## 7. Gallery path

Gallery mode generates each variant with `generateMap`, a derived seed, and
`qualityProfile: "draft"`. It then ranks the resulting occupancy maps with the
existing grid-candidate ranking helper. Gallery variety comes from derived
seeds, not from a legacy or quality engine.

## 8. Connector conversion

Every fresh occupancy connector is serialized with
`representation: "physical-topology-edge-v1"`. Historical room-route
generation writes `"room-route-v1"`.

The editor adapter normalizes each connector independently. Explicit
representation wins; only discriminator-free `corridor-edge-*` IDs use the
historical physical fallback. All other discriminator-free connectors become
room routes. Physical edges are preserved, while only room routes receive
legacy coalescing and endpoint-door adaptation.

## 9. Compatibility-only generation

Historical legacy and quality generation can be imported only through
`src/generators/compatibility/index.ts`. They exist for regression comparison
and old-data compatibility and are not reachable from the production UI or
worker.

## 10. Enforced boundary and corpus

- `npm run check:generator-boundary` traverses the UI and worker import graphs
  and rejects competing geometry modules.
- `generationCorpus.test.ts` runs ship, station, and outpost fixtures through
  the same production facade and checks deterministic normalized summaries.
- Connector fixtures cover explicit physical arbitrary IDs, discriminator-free
  historical data, explicit-wins behavior, and mixed decks.

## 11. Deferred work

`MapDocumentV2`, runtime migrations, and `importGeneratedMap` remain Phase 2.
Editable topology, corridor attachment/rerouting, and door manipulation remain
later editor phases. Phase 1 keeps the current `MapJSON` bridge.

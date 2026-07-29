# Архитектура процедурного генератора

> **Current status (2026-07-30):** occupancy/grid is the only product
> generation engine. Draft, Standard, and Polish are selection-effort profiles
> over that engine. Historical room-route and quality generators are available
> only from `src/generators/compatibility`.

See [ADR: Active Production Generator](./ACTIVE_GENERATOR_ADR.md).

## Production ownership

| Layer | Owner | Contract |
| --- | --- | --- |
| Product facade | `src/generators/generator.ts` | `generateMap` and `generateMapAsync`; always occupancy |
| Profile policy | `src/generators/productionProfiles.ts` | exact deterministic candidate counts |
| Geometry engine | `src/generators/gridGenerator/occupancyGenerator.ts` | carved occupancy is source of truth |
| Candidate selection | `src/generators/gridGenerator/candidateSelector.ts` | hard gates, Pareto fronts, balanced-score/index tie-break |
| Worker protocol | `src/workers/generationProtocol.ts` | one `GENERATE`/`CANCEL` request union and one response union |
| Worker orchestration | `src/workers/generationRuntime.ts` | request-scoped cancellation/progress and `generateMapAsync` |
| Product UI | `src/ui/panels/GenerationPanel.tsx` | profile selection; no engine selection |
| Compatibility | `src/generators/compatibility/index.ts` | regression/import-only historical APIs |

The production generator barrel does not export `MapGenerator`, legacy
presets, old layout/topology generation, skeleton generators, or quality
generation.

## Production request

```ts
interface GeneratorOptions {
  seed?: string
  archetype?: 'ship' | 'station' | 'outpost'
  subtype?: Subtype
  styleProfile?: StyleProfile
  sizeTier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  loopiness?: number
  danger?: number
  qualityProfile?: 'draft' | 'standard' | 'polish'
}
```

`qualityProfile` changes selection effort only:

| Profile | XS | SM | MD | LG | XL |
| --- | ---: | ---: | ---: | ---: | ---: |
| Draft | 1 | 1 | 1 | 1 | 1 |
| Standard | 4 | 4 | 3 | 2 | 2 |
| Polish | 8 | 8 | 6 | 4 | 4 |

The default profile is Standard. All counts pass through the same occupancy
candidate selector and require a hard-pass result.

## Occupancy production pipeline

`generateGridMapV2()` performs one deterministic occupancy-first attempt:

1. normalize the effective request and create the seeded RNG;
2. generate the shared room program;
3. create the grid canvas and carve an archetype/subtype hull;
4. capture the original hull mask;
5. assign zones;
6. carve archetype-specific circulation;
7. place rooms in mask-aware corridor bays and assign circulation roles;
8. classify and materialize room-side door tiles;
9. derive pressure topology, physical corridor graph, junctions, validation
   metrics, and `MapJSON`.

`generateMap`/`generateMapAsync` wrap that attempt in deterministic
candidate selection. They do not call the old layout/topology or quality
pipelines.

## Candidate selection

For a master seed, candidate indices are deterministic. Multi-candidate child
seeds use the stable `"grid-candidate-v1"` salt and do not depend on pool size,
so increasing the profile count preserves the earlier candidate family.

Candidates must pass semantic, structure, pressure, door, connector geometry,
room-port anchor, and finite-objective gates. Passing candidates are ordered by:

1. Pareto rank across `routeClarity`, `hullUseFit`, `ttrpgChoice`;
2. min-aware balanced score;
3. numeric candidate index.

If no candidate passes, the facade returns a stable `NO_VALID_CANDIDATE`
failure. The selector never returns a rejected candidate as production output.

## Worker and UI

The generation panel builds a typed `GENERATE` request through
`buildGenerationWorkerRequest`. The worker parser rejects unknown fields and
the obsolete `engine`, `useQuality`, and `qualityMode` fields. Runtime progress
and cancellation are scoped by `requestId`; completion has exactly one shape:

```ts
{
  type: 'COMPLETE'
  requestId: string
  format: 'map-json-v1'
  map: MapJSON
}
```

There is no `bestCandidate` response variant. Gallery mode generates several
Draft requests through the same synchronous facade using derived seeds and
ranks their returned occupancy maps with the same candidate evaluation policy.

## Connectors and editor adaptation

Each new connector includes:

```ts
representation:
  | 'physical-topology-edge-v1'
  | 'room-route-v1'
```

Occupancy conversion writes `physical-topology-edge-v1`; the historical legacy
pipeline writes `room-route-v1`. Explicit values win even when an ID looks
historical. Only discriminator-free `corridor-edge-*` IDs fall back to physical
topology; all other missing values fall back to room routes.

The editor adapter normalizes each connector separately. It preserves physical
graph edges without legacy coalescing, coalesces only room-route connectors,
and creates legacy endpoint doors only for room routes. This supports mixed
historical decks without a deck-wide format guess.

## Determinism evidence

`src/generators/__tests__/generationCorpus.test.ts` freezes ship, station, and
outpost requests through the same `generateMap` facade. Each fixture records
its full request/profile, normalized document hash, room/connector/door counts,
candidate count, selected index, and semantic validator statuses.

## Import graph enforcement

`npm run check:generator-boundary` statically follows imports and re-exports
from `GenerationPanel.tsx` and `generation.worker.ts`. It fails if either
production entry can reach the quality pipeline, legacy generation,
`MapGenerator`, old layout/topology, or skeleton generators. This command is
part of `npm run check`.

## Historical APIs

Use historical generation only by an explicit compatibility import:

```ts
import {
  generateLegacyMapForRegression,
} from './generators/compatibility'
```

The retained quality pipeline and old `MapGenerator`/presets live behind the
same compatibility barrel. They are not product extension points.

## Document model boundary

Production currently returns `MapJSON`. `MapDocumentV2`, runtime parsers,
migrations, and the explicit `importGeneratedMap` boundary remain Phase 2.
Phase 1 does not change document version numbers or editor store models.

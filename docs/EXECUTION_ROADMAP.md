# Execution Roadmap: Semantic Sci-Fi Blueprint Studio

**Status:** Authoritative implementation order
**Updated:** 2026-07-29
**First usable milestone:** Canonical Blueprint Editor

`PRODUCT_VISION.md` preserves the full desired product. This document controls
what is built next and why.

## Strategy

Use an architecture-first strangler sequence delivered as user-visible vertical
slices:

- fix one boundary only when the next usable workflow requires it;
- retain legacy import fixtures, but stop expanding legacy production paths;
- merge small changes behind explicit acceptance gates;
- do not start a dependent capability until its prerequisite gate is green.

For parallel work, use separate lanes with strict path ownership:

1. **Foundation:** canonical document, schema, migration, importer, commands.
2. **Generation and quality:** occupancy stages, topology, validators, ranking.
3. **Editor and output:** gesture adapters, inspectors, scene, SVG.
4. **Integration:** production dispatch, end-to-end journeys, documentation.

Only the integrator may merge a canonical schema or migration-policy change.

## Dependency spine

```text
QA baseline
  -> one production generator
  -> complete MapDocumentV2 + runtime import
  -> command transactions + dependency index
  -> resilient room/door/corridor editing
  -> renderer-neutral scene + whole-map SVG
  -> scoped locks + partial regeneration
  -> VTT adapters and advanced facility systems
```

TTRPG topology, through rooms, doors, pressure, and facility validation run
before candidate selection. The editor receives validated semantics through one
explicit importer.

## Phase 0 — Ground truth and guardrails

**Outcome:** The team can change behavior without guessing whether it regressed.
**Status:** Complete (verified 2026-07-29 by Ubuntu/Node 22 CI).

Scope:

- add canonical `test`, `typecheck`, and `check` scripts;
- run unit tests, lint, typecheck, and build from one command;
- add CI for the same command;
- define a normalized deterministic map hash;
- establish a small seed matrix covering ship, station, and outpost;
- preserve historical failure inputs as explicitly labeled current-engine smoke cases;
- record an ADR naming the occupancy generator as the only production engine;
- document ownership of legacy generator, quality pipeline, and current stores.

Gate:

- `npm run check` passes locally and in CI;
- same seed/settings/version produces the same normalized hash;
- corpus failures are machine-readable;
- any generator behavior change produces a reviewable corpus diff.

**Evidence:**

- Local gate: `npm run check`
- Determinism: `src/generators/__tests__/generationCorpus.test.ts`
- Ownership: `docs/architecture/ACTIVE_GENERATOR_ADR.md`
- CI configuration: `.github/workflows/check.yml`
- Remote CI: [workflow check #1](https://github.com/Kikimor-rec/map-generator/actions/runs/30482395857) — Success on Ubuntu with configured Node 22 for commit [`d0b43a2a02523e7c7777fef49d9ab3d532da7fed`](https://github.com/Kikimor-rec/map-generator/commit/d0b43a2a02523e7c7777fef49d9ab3d532da7fed); run 52 s, job `check` 47 s.

## Phase 1 — One production generation path

**Outcome:** Product UI and worker cannot silently select three different map
architectures.

Scope:

- route production generation only through the occupancy engine;
- convert Draft, Standard, and Polish into candidate-count/threshold profiles;
- stop using `quality/pipeline.ts` as a second production generator;
- retain legacy generation only as explicit import/regression compatibility;
- replace ID-prefix format detection with an explicit connector format.

Gate:

- the production import graph reaches one generator;
- no user-facing legacy/quality engine toggle remains;
- all three archetypes pass the seed corpus through the same entry point;
- compatibility fixtures remain readable.

## Phase 2 — Canonical document and import boundary

**Outcome:** Generation, editing, persistence, validation, and output can share
one model.

Scope:

- extend the existing `src/domain/mapDocumentV2.ts`; do not create a competing
  project model;
- represent decks, rooms, routes, junctions, doors, ports, envelope, structural
  voids, pressure, layers, locks, and provenance;
- add runtime parser, pure migrations, and strict unknown-version handling;
- add `importGeneratedMap` from generator output to `MapDocumentV2`;
- remove `as any` and ID-prefix shape guessing from the canonical path;
- provide JSON round-trip fixtures for active and legacy documents.

Gate:

- active candidates and retained legacy fixtures migrate and round-trip;
- stable IDs and unknown semantic values are preserved or explicitly rejected;
- malformed import cannot replace the current document;
- pressure and exterior-hatch chains survive serialization.

## Phase 3 — Atomic editor foundation

**Outcome:** A generated map can be changed without hidden partial mutations.

Scope:

- add typed command execution with `do`, `undo`, `redo`, and transactions;
- implement `ApplyGeneratedMap`, `MoveRoom`, `ResizeRoom`, attach, and detach as
  reference commands;
- introduce a dependency index from rooms/ports/doors to affected routes;
- store doors wall-locally as owner, side, and normalized offset;
- ensure view state and gesture previews are outside document history;
- consolidate on one editor store by feature slice;
- split `MapCanvas.tsx` into gesture adapters only when a migrated slice needs it.

Gate:

- one gesture creates one history transaction;
- undo restores the prior normalized document hash;
- Escape, pointer cancellation, and `noPath` restore the entire original state;
- UI code does not directly mutate canonical entities.

## Phase 4 — Intuitive room, corridor, and door editing

**Outcome:** Generated objects behave as users expect when dragged or reconnected.

Scope:

- preview affected routes before room move/resize commit;
- preserve attachments by default with persistent setting and `Alt` inversion;
- snap corridor endpoints to room ports, doors, junctions, or corridor points;
- add screen-space snap radius and explicit valid/invalid target feedback;
- reroute only dirty corridors around rooms, envelope, voids, and locked geometry;
- create, select, move, retype, inspect, and delete doors;
- distinguish right-drag pan from stationary application context menu;
- remove or implement every visible context-menu action.

Gate:

- generated room move carries doors/contents and only reroutes affected paths;
- impossible routing rolls back atomically with a human-readable reason;
- door edits preserve pressure/exterior semantics;
- right-drag never opens the browser context menu;
- core flows work through canvas, inspector, keyboard, and undo.

## Phase 5 — Canonical Blueprint Editor milestone

**Outcome:** A user can generate, refine, save, and publish a credible single-deck
ship, station, or base.

Scope:

- calibrate through rooms, loops, route clarity, junction spacing, crossings,
  and functional zoning;
- preserve terminal docking airlocks and two-sided internal airlocks;
- strengthen archetype/subtype silhouette grammar and controlled asymmetry;
- unify diagonal hull geometry across rendering and hit testing;
- compose hull field, structure, exterior, grid, rooms, routes, doors, and labels;
- add renderer-neutral scene plus full-map SVG and deterministic raster output;
- show equal-scale candidate previews and human-readable selection reasons.

Gate:

- ship, station, and outpost complete the same end-to-end flow:
  `generate → import → move room → undo → save/load → SVG`;
- no ambiguous adjacency, unresolved exterior hatch, invalid pressure chain,
  room/void collision, or untyped crossing remains;
- gold-set review confirms recognizable archetypes and readable entrances;
- export is independent from viewport pan and zoom.

This is the first milestone suitable for structured external user testing.

## Phase 6 — Mixed-initiative regeneration

**Outcome:** Users preserve good decisions and regenerate only what they intend.

Scope:

- locks for geometry, content, connections, routes, hull, and style;
- stable provenance and generation-stage change scopes;
- partial regeneration over an explicit region or dependency set;
- preserved/changed/removed/added diff preview;
- conflict diagnostics that suggest which constraint prevents a solution.

Gate:

- locked entities remain byte-identical;
- unaffected entities retain IDs and normalized hashes;
- partial reroll remains deterministic for the same child seed;
- application is one atomic command and all global validity gates still pass.

## Phase 7 — Persistence and publication

**Outcome:** Projects survive browser failures and can be shared or printed
reliably.

Scope:

- transactional autosave with multiple revisions, checksums, and recovery UI;
- import summary and open-as-copy workflow;
- project library only after revision storage is stable;
- publication PNG/WebP and printer profiles;
- multi-page PDF only after SVG pagination requirements are proven;
- share snapshot that never overwrites the local draft without confirmation.

Gate:

- corrupt recovery data cannot replace the last valid revision;
- save/load/export preserve the canonical document hash where appropriate;
- print and monochrome profiles retain door and layer meaning.

## Phase 8 — Multi-deck, content, and GM workflow

**Outcome:** Larger facilities become playable game artifacts rather than bare
single-deck diagrams.

Scope:

- stable lifts, ladders, stairs, and shafts across decks;
- structural alignment and optional ghost-deck view;
- room landmarks and semantic furnishing;
- hazards, objectives, secrets, notes, and GM/player visibility;
- layer hide/lock/solo and room directory/navigation.

Gate:

- vertical connectors agree across deck documents;
- player export contains no hidden GM child data;
- critical room types remain recognizable without their labels.

## Phase 9 — Semantic VTT delivery

**Outcome:** The blueprint becomes a ready-to-use VTT scene.

Scope:

- Universal VTT walls, doors, windows, grid, and lights;
- independent consumer fixture for round-trip verification;
- Foundry adapter only after Universal VTT semantics are stable;
- platform-specific notes and visibility as adapters, not canonical fields.

Gate:

- wall and door IDs match the published visual map;
- an independent consumer imports the fixture without manual geometry repair;
- Foundry scene creation does not change canonical geometry.

## Phase 10 — Experiments

Run as bounded spikes after the Canonical Blueprint Editor:

- modular hull composition and automatic function-to-hull proposals;
- linked overview/tactical representations;
- pressure simulation and infrastructure networks;
- advanced room geometry;
- diversity/novelty optimization;
- community library, collaboration, and language assistance.

Each spike must state a user hypothesis, measurement, deletion condition, and
which canonical interface it uses.

## Operating model

Permanent roles:

- **Integrator:** owns one vertical slice, canonical contracts, merge order, and
  final evidence.
- **Invariant reviewer:** independently checks topology, pressure, locks,
  history, determinism, and migration safety.
- **UX/TTRPG reviewer:** runs real browser journeys and evaluates readability,
  accessibility, and game usefulness.

Specialists are temporary and receive:

- owned paths;
- read-only paths;
- invariants that must not change;
- exact acceptance evidence;
- required reviewer.

Working cycle:

```text
accepted slice
  -> failing acceptance test
  -> smallest implementation
  -> invariant review
  -> browser journey
  -> evidence-linked status update
  -> commit
```

## Documentation governance

- `PRODUCT_VISION.md`: all desired capabilities; no implementation status.
- `EXECUTION_ROADMAP.md`: authoritative order, gates, and current phase.
- `EDITOR_UX_BACKLOG.md`: detailed editor scenarios and status evidence.
- `docs/superpowers/specs/`: approved design decisions.
- `docs/superpowers/plans/`: executable task plans.
- `docs/research/`: sources, screenshots, and extracted principles.
- ADRs: difficult-to-reverse architecture choices only.

Existing broad plans remain historical inputs until reconciled. When they
conflict, this roadmap and an accepted ADR take precedence.

## Current focus

**Completed:** Phase 0 — Ground truth and guardrails (verified by Ubuntu/Node 22 CI).
**Next:** Phase 1 — One production generation path (not started).
**First external testing target:** Phase 5 — Canonical Blueprint Editor.

# Product Roadmap Design

**Date:** 2026-07-29
**Status:** Approved direction
**Selected first milestone:** Canonical Blueprint Editor

## Context

The project already contains meaningful generator, editor, geometry, pressure,
and quality work. Its largest risk is architectural duplication:

- several generation paths can produce materially different map formats;
- the existing `MapDocumentV2` covers only part of the target document;
- editor Context and an unused Zustand store coexist;
- import and conversion infer formats through ID prefixes and type assertions;
- the large canvas component owns rendering, interactions, and repair behavior;
- roadmap documents mix product wishes, current status, and implementation order.

Adding attractive capabilities directly to those parallel paths would make
locks, partial reroll, export, and future migrations unreliable.

## Decision

Adopt:

1. an architecture-first strangler sequence;
2. user-visible vertical slices at each stable boundary;
3. a dual-track documentation model:
   - `PRODUCT_VISION.md` preserves the complete desired product;
   - `EXECUTION_ROADMAP.md` controls dependencies and implementation order;
4. the **Canonical Blueprint Editor** as the first usable milestone.

For multi-agent work, use parallel lanes only after the shared contract for the
slice is fixed. Schema and migration policy have one owner.

## Product scope

The target is a local-first, browser-based, semantic 2D editor and procedural
generator for sci-fi TTRPG ships, stations, and bases.

The canonical output includes:

- facility/deck identity and generator provenance;
- envelope, structural voids, zones, and terrain/substrate;
- rooms and their semantic roles;
- routes, junctions, ports, doors, and attachments;
- pressure compartments, bulkheads, interlocks, and exterior hatches;
- layers, annotations, locks, and render profile;
- stable IDs and versioned units.

Pixi is an interactive projection, not the persistence model. SVG, raster, and
VTT adapters read the same semantic document.

## First milestone boundary

The Canonical Blueprint Editor supports all three primary archetypes on one
deck:

1. generate deterministic candidates through the occupancy production engine;
2. validate topology, doors, pressure, envelope, and quality before selection;
3. apply a candidate through a `MapDocumentV2` importer;
4. move/resize a room with its door and contained-object dependencies;
5. reroute only affected attached corridors or roll back atomically;
6. create, move, retype, and delete a door through the same command/history
   contract;
7. save/load strict JSON;
8. export the entire map as SVG independently from the viewport.

Lock/partial reroll, multi-deck, and VTT delivery remain later milestones
because they depend on the same stable IDs, commands, and output scene.

## Architecture boundaries

### Generation

The occupancy engine is the only production generator. Candidate profiles vary
pool size and thresholds, not architecture. The former quality pipeline becomes
validation/scoring research or is retired; legacy generation remains fixture
and import compatibility only.

TTRPG topology, through-room roles, pressure semantics, and hard validation
complete before candidate selection.

### Canonical document

Extend `src/domain/mapDocumentV2.ts`. Do not introduce another project model.
All external data crosses a runtime parser and explicit migration. Unknown
versions fail safely.

### Editing

Commands are the only semantic write boundary. Preview, hover, selection, and
viewport state never enter document history. One user gesture is one atomic
transaction.

Room ports and doors are wall-local canonical anchors. Corridors refer to stable
anchors and keep only user-owned waypoint decisions; derived path geometry is
recomputable.

### Rendering and export

A renderer-neutral scene builder projects the canonical document into ordered
visual primitives. Pixi and SVG are separate adapters. Export never reads the
current Pixi viewport as its map definition.

### Validation

Validators are independent from generation and editing. They return structured
diagnostics and optional repair proposals; they do not silently mutate the
document.

## UX invariants

1. Preview and selection never mutate the document.
2. Canvas, inspector, keyboard, and menu invoke the same commands.
3. Impossible operations leave no partial change.
4. `Alt` temporarily inverts the current attachment/snap policy.
5. Locks are enforced below the UI by commands and regeneration.
6. A corridor endpoint binds to a canonical anchor or is explicitly free.
7. A traversable room adjacency always has an explicit visible threshold.
8. Right-drag pans without a browser menu; stationary right-click opens only an
   implemented application menu.
9. Undo restores a normalized document hash; view state is not part of it.
10. Generated aesthetics never override hard TTRPG or physical validity.

## Quality evidence

Automated:

- deterministic normalized hashes for a seed matrix;
- unit and property tests for geometry and commands;
- generator topology, pressure, containment, and playability invariants;
- import/migration round trips;
- headless renderer scene and SVG fixtures;
- browser interaction tests for right mouse, snap, drag, cancel, and undo.

Human:

- curated reference/gold set review;
- blind archetype recognition;
- door and route readability in color and monochrome;
- TTRPG walkthroughs for meaningful route choices.

## Agent operating model

Three standing review responsibilities:

- Integrator;
- invariant reviewer;
- UX/TTRPG reviewer.

Temporary specialists may own generation, domain, editor, or output paths.
They may not simultaneously alter shared schema. Every delegated task names
owned paths, invariants, acceptance artifacts, and reviewer.

## Alternatives considered

### Architecture-only rewrite

Rejected because it delays user evidence and risks rebuilding working behavior.
Architecture changes must unlock the next vertical workflow.

### Ship-only first product

Deferred. It is faster visually but risks encoding ship-specific assumptions
into the document and editor. The selected milestone uses small fixtures for all
three archetypes.

### Lock/reroll before canonical commands

Rejected. A lock without stable IDs, provenance, dependency tracking, and atomic
application cannot give a trustworthy preservation guarantee.

### New framework, backend, 3D, or optimization solver

Rejected for the current roadmap. React, Vite, TypeScript, and Pixi are adequate.
These additions do not solve the current model and interaction duplication.

## Documentation consequences

- Preserve all ideal capabilities in `PRODUCT_VISION.md`.
- Use `EXECUTION_ROADMAP.md` as the only authoritative sequence.
- Convert detailed work into one executable plan per phase or vertical slice.
- Status claims require a test, screenshot, fixture, or accepted review.
- Historical roadmaps must point to the canonical documents instead of creating
  a third sequence.

## Acceptance of this design

The design is accepted when:

- the full wishlist is represented without making every item immediate scope;
- phases have explicit prerequisite and exit gates;
- the first milestone is end-to-end and usable;
- current duplication is removed incrementally rather than expanded;
- each later capability has a visible dependency path.

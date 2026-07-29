# Roadmap: Sci-Fi Map Generator

The project now separates long-term product intent from executable order:

- `docs/PRODUCT_VISION.md` — complete desired product and user pains;
- `docs/EXECUTION_ROADMAP.md` — authoritative phases, dependencies, and gates;
- `docs/EDITOR_UX_BACKLOG.md` — detailed editor behavior and acceptance cases;
- `docs/superpowers/specs/2026-07-29-product-roadmap-design.md` — approved design;
- `docs/superpowers/plans/2026-07-29-phase-0-ground-truth.md` — current
  implementation plan.

## Current focus

**Phase 0: Ground truth and guardrails**

Establish canonical checks, CI, deterministic generation corpus, failure seeds,
and an ADR naming the single target production generator.

## First usable milestone

**Canonical Blueprint Editor**

A user can generate a single-deck ship, station, or base through one engine,
apply it to one canonical document, safely move rooms with their doors and
attached corridors, undo the operation, save/load strict JSON, and export the
entire blueprint to SVG.

The complete phase sequence and all later capabilities are maintained in
`docs/EXECUTION_ROADMAP.md`.

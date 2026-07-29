# Routing Intelligence Specification (v2)

> **Note:** Corridor routing is now implemented in `src/generators/gridGenerator/corridorRouter.ts` (graph-first approach with MST + A*). This document may contain outdated design ideas from the spine-first era.

Updated to reflect the current implementation (sparse-graph router with grid fallback, mandatory coalesce, shared cost function). This document replaces the corrupted legacy text.

## Goals
- **Correctness**: corridors never pass through room solids; honor clearance and corridor width.
- **Readability**: mostly orthogonal (90°), minimal bends, no micro-segments.
- **Reuse**: prefer existing corridors to form clear trunks; coalesce overlaps.
- **Predictable cost**: all routers share the same cost weights.
- **Recoverability**: fallback grid router guarantees a path when sparse routing fails.

## Routers (current code)
1) **Sparse Graph Router (primary)**  
   - Candidate X/Y lines: room port coordinates and obstacle borders inflated by clearance+halfWidth.  
   - Nodes: safe intersections of those lines outside obstacles.  
   - Edges: axis-aligned segments that do not cross inflated obstacles.  
   - Search: A* with shared cost (see below).

2) **Grid + JPS (fallback)**  
   - Occupancy grid built from inflated obstacles.  
   - A* + Jump Point Search.  
   - Post-process: snap to grid, simplify, force orthogonal.

3) **Post-process (mandatory for both)**  
   - Snap to grid/tolerance.  
   - Simplify collinear points.  
   - Coalesce overlaps (tolerancePx=10, minSharedLength=20).  
   - Junction normalization (split degree>4, merge near, enforce spacing).

## Shared Cost Function
```ts
edgeCost =
  lengthCost * distance +
  bendPenalty * bends +
  crossingPenalty * crossings +
  nearMissPenalty * nearMissCount +
  reuseBonus * reuseFactor +
  junctionDegreePenalty * overload +
  junctionProximityPenalty * spacingViolations;
```

Defaults (src/core/corridorTypes.ts):  
`bendPenalty=8`, `crossingPenalty=30`, `nearMissPenalty=4`, `reuseBonus=-3 (strength 0.5)`, `junctionDegreePenalty=2`, `junctionProximityPenalty=5`, `snapToGrid=40`.

## Obstacles and Clearance
- Obstacles = room solids + padding (clearance + corridorHalfWidth).
- Grid/sparse routers both work against the inflated obstacle set.
- Clearance comes from connector width; standard generator now uses width=1.2 tiles.

## Reuse & Coalesce
- Router adds a **reuse bonus** when an edge overlaps existing corridor segments.  
- After routing, coalesce merges overlapping/parallel segments and inserts junctions.  
- Coalesce is always **enabled** in standard generation (`tolerancePx=10`, `minSharedLength=20`).

## Quality Modes
- **Draft**: sparse router with reduced candidates, snap+simplify only.  
- **Standard**: full sparse router, coalesce, junction normalization; grid fallback if blocked.  
- **Polish**: (future) multiple attempts + beautify scoring.

## Known Gaps / TODO
- Locked waypoints and incremental re-route after moving rooms (Phase 3) are **not implemented**.  
- Segment-level editing UX still selects whole corridors in the editor; needs follow-up.  
- Crossing policy UI controls not exposed yet.  
- Corridor creation logic still produces noisy layouts in some seeds; keep tracking in dev plan.

## Grid Generator Recovery Notes
- The grid generator now keeps connector ids on corridor tiles and derives a `CorridorGraph` from the canvas.
- Overlapping corridor tiles can represent multiple logical connections instead of overwriting the previous corridor id.
- Exported connectors preserve real room endpoints. `SPINE` is not used as a placeholder endpoint in grid conversion.
- Grid connectivity is validated by flood-fill across passable tiles and repaired after door placement.
- The legacy advanced routing sliders in the generator panel are hidden for the grid engine unless the legacy/quality engines are active.
- The grid engine now uses trunk-first routing by default. A* is reserved for repair/fallback, which prevents dense bundles of long room-to-room paths.
- Generated MapJSON connectors are physical graph edges, not logical room-to-room paths, so the editor does not redraw shared trunks as stacked independent corridors.

## File Map
- Router logic: `src/core/corridorRouter.ts`
- Fallback grid: `src/core/corridorPathfinding.ts`
- Coalesce: `src/core/corridorCoalesce.ts`
- Cost defaults: `src/core/corridorTypes.ts`
- Generator integration: `src/generators/generator.ts`, `src/generators/quality/pipeline.ts`

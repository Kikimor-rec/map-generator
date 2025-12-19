# Corridor System (Updated)

This file replaces the broken legacy text and describes the current corridor model and routing flow.

## Core Types
- **Corridor**: `id`, `segments[]`, optional `segmentIds[]`, `width`, `style`, `connectedRoomIds`, attachments at start/end.
- **Segment**: `{ start: {x,y}, end: {x,y} }` – always axis-aligned after post-process.
- **Port** (future-friendly): room-side entry; currently inferred from connector endpoints.
- **Junction**: created by coalesce/normalizer when 3+ segments meet or when overlaps split.

## Routing Flow (standard generator)
1. Build inflated obstacle map from room solids + clearance (width-aware).
2. **Sparse router** attempts an orthogonal path between room ports.
3. If sparse fails, **grid + JPS fallback** finds a path on an occupancy grid.
4. Snap + simplify the polyline to grid/tolerance.
5. **Coalesce** merges overlaps (tolerancePx=10, minSharedLength=20) and inserts junctions.
6. Convert to editor format; corridors carry `segments` and `segmentIds` for per-segment selection/rendering.

## Quality Pipeline Routing
- Uses the same sparse router + grid fallback and cost weights (`DEFAULT_ROUTING_COSTS`).
- Ports limited to the best two candidates per room to reduce clutter.
- Segments snapped to half-grid for cleaner diagonals if needed; finalized as orthogonal.

## Editor Notes
- MapJSON connectors now emit `path`, `waypoints`, `segments`, and `segmentIds` so the canvas can select individual segments.
- Current UI still selects a whole corridor; segment-level selection remains TODO (see dev plan).

## Known Issues / TODO
- Locked waypoints and incremental re-route after moving rooms are not implemented.
- Crossing policy UI is not surfaced in the panel.
- Corridor creation still needs tuning for some seeds (tracks in `docs/DEVELOPMENT_PLAN.md`).

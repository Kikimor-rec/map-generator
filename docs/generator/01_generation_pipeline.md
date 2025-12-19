# Generation Pipeline (clean draft)

This replaces the corrupted version and matches the current code paths in `src/generators`.

## High-Level Stages
1) **Input**  
   - `{ seed, archetype, subtype, styleProfile, sizeTier, loopiness, danger }`.

2) **Room Program** (`generateRoomProgram`)  
   - Expands archetype/subtype into a list of rooms with importance, tags, and zone distribution.  
   - Validation emits warnings; generator continues.

3) **Topology Graph** (`generateTopology`)  
   - Connects rooms according to `loopiness` (more loops => higher connectivity).  
   - Connector kinds chosen from room tags (bulkhead/airlock/service etc.).

4) **Layout** (`generateLayout`)  
   - Places rooms on a grid (40px cell).  
   - Ensures non-overlap; respects rough zone grouping.

5) **Routing**  
   - Standard generator: sparse router + grid fallback, width=1.2 tiles, snap+simplify.  
   - Coalesce always on (`tolerancePx=10`, `minSharedLength=20`).  
   - Doors created at connector endpoints.

6) **Validation** (optional)  
   - Structural checks on program/topology/layout (warnings only in current build).

7) **MapJSON**  
   - Deck list with rooms, connectors, junctions, metadata, and grid settings.

8) **Editor Conversion** (`convertToEditorFormat`)  
   - Produces `rooms`, `corridors` (with `segments`/`segmentIds`), `doors`.  
   - Applies coalesce again for editor friendliness.

## Quality Pipeline Differences
- Same room/topology/layout inputs.  
- Routing uses quality presets, candidates, and refinement loop.  
- Ports limited to top 2 per room; segments snapped to half-grid.  
- Coalesce + simplify + junction normalization enforced.

## Known Gaps
- Corridor creation still needs tuning for some seeds (see dev plan).  
- Locked waypoints, incremental reroute, and polished multi-attempt mode are pending.

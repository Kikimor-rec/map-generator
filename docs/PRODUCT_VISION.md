# Product Vision: Semantic Sci-Fi Blueprint Studio

**Status:** Canonical capability inventory
**Updated:** 2026-07-29
**Execution order:** See `EXECUTION_ROADMAP.md`.

## Product promise

From a seed or a manual sketch, create a recognizable, playable, and fully
editable blueprint of a ship, station, or surface base. The result should look
like a designed facility rather than disconnected rectangles and accidental
corridors.

The product is a mixed-initiative 2D TTRPG tool:

- generation creates a strong, semantically valid starting point;
- the editor lets the user safely change every important decision;
- validation explains conflicts instead of silently damaging the map;
- export preserves the same geometry and game semantics.

## North-star outcomes

1. A viewer recognizes ship, station, or base without reading the title.
2. A player immediately understands entrances, traversable routes, and doors.
3. The plan creates TTRPG choices: alternate routes, choke points, transit
   spaces, restricted zones, and pressure boundaries.
4. A generated result can be refined manually without losing connectivity.
5. JSON, editor preview, print output, and VTT output describe the same map.

## Product principles

1. **Semantics before decoration.** Rooms, doors, routes, hull, pressure, and
   visibility are entities, not painted pixels.
2. **Hard validity before aesthetics.** Connectivity, containment, doors, and
   pressure gates reject broken candidates before visual scoring.
3. **Designed irregularity.** Asymmetry and silhouette variation must be
   explained by function, not one-cell noise.
4. **Explicit thresholds.** Adjacency is not an entrance. Every traversable
   room connection has a visible, typed door or opening.
5. **Safe direct manipulation.** Preview is non-mutating; commit is atomic;
   an impossible edit rolls back completely.
6. **One source of truth.** Renderers, persistence, validation, and export read
   one canonical document.
7. **Deterministic generation.** Seed, intent, and generator version reproduce
   the same normalized result.
8. **TTRPG usefulness is measurable but also reviewed by humans.** Metrics
   catch structural failures; a curated gold set calibrates authorial quality.

## Capability inventory

Priority is independent from implementation order. `Must` describes the target
product, while `EXECUTION_ROADMAP.md` determines prerequisites and sequencing.

### Must: recognizable and physically coherent facilities

| User pain | Product capability | Acceptance signal |
|---|---|---|
| Ships, stations, and bases look alike | Archetype-specific silhouette, zoning, and circulation grammar | Blind review recognizes the three archetypes in at least 80% of cases without labels |
| Ship subtypes differ only by name | Function-aware programs and hull features for freighter, scout, cruiser, research, and other supported subtypes | Target subtype traits are visible in room masses, access, and circulation |
| Every map is mirrored or narrows toward a bow | Balanced/asymmetric posture as an explicit intent, without mandatory axial symmetry | Asymmetric mode changes coarse massing; balanced mode does not mirror every room |
| Asymmetry looks random | Function-backed coarse silhouette features | No isolated one-cell protrusions; major features correspond to cargo, engines, docking, habitation, or service volumes |
| Rooms float on a generic rectangle | Semantic facility envelope and substrate | All traversable geometry is contained by a visible envelope or valid exterior base substrate |
| The background lacks style and physical meaning | Blueprint hull field, structural mass, terrain, void, and exterior composition | Hull/terrain, structure, rooms, routes, grid, and exterior remain visually distinct |
| Diagonals look like stair-steps | Canonical diagonal paths shared by render, hit testing, selection, and export | No long one-cell zigzag contours; all projections use the same path |
| There is no machinery, armor, terrain, or structural empty space | Structural voids and reserved volumes participate in collision | No room or corridor intersects a declared structural void |
| Surface bases ignore geography | Terrain, cliffs, platforms, exterior links, and keep-out regions | Routing treats blocked terrain as collision and exterior traversal as intentional |

### Must: readable and playable TTRPG topology

| User pain | Product capability | Acceptance signal |
|---|---|---|
| Corridors have too many bends | Bend-aware routing and path simplification | Median room route has no more than two bends in the calibrated gold set |
| Many corridors collide around one point | Junction clustering rules and transit hubs | Nearby junction clusters are merged or replaced with a meaningful transit space |
| Corridor crossings are ambiguous | Explicit intersection policy | Every crossing is a junction, a line jump, or rejected; ambiguous crossings are zero |
| Every room is a dead-end branch | Circulation roles for terminal, through, hub, and restricted rooms | Suitable common spaces and internal airlocks can interrupt a backbone |
| Airlocks all behave the same | Separate internal pressure-transition and terminal docking-airlock semantics | Internal airlock has two interlocked boundaries; docking airlock may terminate circulation and has an exterior hatch |
| Pressure boundaries are decorative | Compartments, bulkheads, interlocks, and exterior environment are part of topology | Removing pressure doors splits the graph into declared compartments without an ordinary-door bypass |
| A room touches a corridor but no entrance is visible | Materialized room-to-route doors | Ambiguous adjacency count is zero |
| Every door glyph is identical | Shape-readable standard, secure, bulkhead, airlock, and exterior-hatch rendering | Door types remain distinguishable in monochrome printer mode |
| Layout does not match room function | Functional adjacency, exclusion, and zoning rules | Command, engineering, cargo, habitation, medical, and docking satisfy archetype rules |
| Maps are linear or decorative rather than playable | Alternate routes, meaningful choke points, secrets, hazards, and restricted zones | Critical rooms are reachable and loop intent changes genuine route alternatives |

### Must: intuitive and resilient editing

| User pain | Product capability | Acceptance signal |
|---|---|---|
| Moving a generated room breaks the map | Constraint-aware room move/resize with dependency-based rerouting | Doors and contained objects move; only affected routes reroute; `noPath` rolls back the whole gesture |
| Corridor endpoints are hard to connect | Canonical anchors for room ports, doors, junctions, and corridor points | UI previews the target and stores a stable anchor rather than an approximate coordinate |
| Snapping prevents precise work | Persistent snap policy plus temporary modifier inversion | Setting controls the default; `Alt` inverts it only for the current gesture |
| Doors cannot be placed or moved reliably | Door preview, selection, wall-local position, inspector, and typed commands | A door can be created, selected, moved along a wall, retyped, deleted, and undone |
| Right-drag opens a browser menu | Thresholded application pan gesture | Right-drag pans without a browser menu; stationary right-click may open the application menu |
| A failed edit leaves half-applied changes | Command transactions and rollback | One gesture is one undo step; Escape and pointer cancellation restore the original document hash |
| Generated corridors cannot be adjusted naturally | Segment, waypoint, endpoint, attach/detach, and local reroute tools | Locked waypoints survive derived rerouting and unrelated corridors remain byte-identical |
| Hull is only a generated decoration | Manual envelope composition, vertex editing, and conflict diagnostics | Hull edits preserve or explicitly conflict with rooms and exterior hatches |

### Must: trustworthy generation and output

| User pain | Product capability | Acceptance signal |
|---|---|---|
| A technically valid but ugly candidate is selected | Deterministic candidate pool, hard gates, Pareto ranking, and calibrated aesthetics | Hard-invalid candidates never win; identical input selects the same child seed |
| The user chooses variants blindly | Equal-scale previews with human-readable differences and diagnostics | Selection does not mutate the document; Apply is an explicit atomic command |
| Import can destroy the current project | Runtime validation, migration, preview, and confirm-before-replace | Invalid import changes nothing |
| Save/load changes map meaning | Versioned canonical JSON with stable IDs | Round-trip preserves geometry, topology, doors, pressure, layers, and locks |
| Image export depends on the viewport | Renderer-neutral whole-map SVG and deterministic raster export | Active-deck and all-decks exports are independent from pan and zoom |
| Color is required to understand the map | Blueprint and printer profiles with line-weight hierarchy | Hull, rooms, routes, doors, hazards, and labels are readable in monochrome |
| Browser failure loses work | Transactional autosave with recovery generations | Recovery never overwrites the last valid revision and reports storage failures |

### Important after the first usable milestone

- Scoped locks for geometry, content, connectivity, routes, hull, and style.
- Partial reroll with a preserved/changed/removed/added diff.
- Candidate gallery with Functional, Balanced, and Expressive finalists.
- Room directory, filters, and focus-on-entity navigation.
- Multi-deck structure with stable vertical connector IDs.
- Semantic furnishing landmarks so key rooms read without labels.
- Hazards, objectives, secrets, and separate GM/player visibility.
- Main, service, maintenance, and ventilation circulation layers.
- Layer hide/lock/solo controls.
- Publication PNG/WebP/PDF profiles.
- Semantic Universal VTT export followed by a Foundry adapter.
- Keyboard accessibility and responsive workspace behavior.

### Experimental, explicitly non-blocking

- Station Designer-like modular silhouette kit.
- Function-to-hull synthesis with a previewed envelope change.
- Linked overview and tactical deck representations.
- Dynamic decompression overlay.
- Power, data, ventilation, and other infrastructure networks.
- Polygonal, circular, and compound rooms.
- Narrative irregularities inspired by authored maps.
- Community templates and collaboration.
- Natural-language assistance only after deterministic commands and validation.

## Product journeys

### Generate and choose

Set archetype and intent, generate deterministic candidates, compare equal-scale
previews, inspect strengths and violations, then explicitly apply one candidate
as a single command.

### Draw and connect

Create a room, corridor, or door with live geometry and snap preview. Invalid
targets explain why. Cancel leaves no entity and no history entry.

### Refine a generated map

Move or resize a room while previewing affected doors and routes. Preserve
attachments by default; use `Alt` to invert the active policy. Commit once or
roll back completely.

### Protect and regenerate

Lock the exact aspects that must remain, preview the regeneration change set,
resolve constraint conflicts, then apply the result as one undoable command.

### Save, recover, and publish

Validate and migrate project JSON, retain recovery generations, export the whole
map through a renderer-neutral scene, and optionally adapt semantic data to a
VTT.

## Release quality gates

Every milestone must provide evidence for the gates it claims:

1. **Recognition:** blind archetype/subtype review against a curated gold set.
2. **Playability:** connectivity, entry-to-critical reachability, loops,
   choke points, through rooms, and pressure tests.
3. **Physical validity:** containment, structural void, door, crossing, and
   exterior-hatch invariants.
4. **Edit resilience:** move, resize, attach, detach, reroute, snap, rollback,
   lock, and undo scenarios.
5. **Output parity:** editor → JSON → reload → SVG/PNG/VTT semantic comparison.

## Deferred choices

The vision does not commit to backend accounts, real-time collaboration, 3D,
WebGPU-only rendering, an optimization solver, or AI imagery. These may be
researched only after the canonical editor and measured user need exist.

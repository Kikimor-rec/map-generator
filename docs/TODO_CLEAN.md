# TODO (clean summary)

This file tracks high-signal action items while the legacy dev plan remains corrupted.

## Recently Completed

- **Corridor Router A* Improvements (2025-01-05)**: ✅
  - Increased cellSize from `gridSize/4` (10px) to `gridSize/2` (20px) for coarser grid
  - Significantly increased bendPenalty from 5 to 50 to strongly discourage turns
  - Added direction bonus to A* - prefers moves toward goal (-20), penalizes moves away (+30)
  - Increased nearMissPenalty (5.0) and nearMissDistance (30px) for better wall avoidance
  - Stronger reuseBonus (-15.0 with 0.7 strength) to encourage corridor sharing
  - Result: Corridors should be much straighter with fewer unnecessary bends

- **Ship/Station/Outpost layout improvements**: ✅
  - Ships now use elongated grid (2.5:1 ratio) instead of square
  - Zone-aware placement: command at bow, engineering at stern, habitation in middle
  - Main "spine" corridor runs horizontally through ship center
  - All corridors prefer to connect through the spine
  - Stronger turn penalty (8) to reduce zigzags
  - Higher reuse bonus (-8) for spine overlap

- **Corridor routing improvements**: ✅
  - Backbone-first routing (main corridors processed first)
  - Horizontal movement preference for ships
  - Proximity bonus for adjacent corridor cells
  - Shorter corridors processed before longer ones
  - Coalesce tolerance increased to 20px

- **Generation progress UI**: ✅
  - Emoji stages: 🎲 Rooms → 🔗 Graph → 📐 Layout → 🛤️ Corridors → ✨ Done
  - Pulsing indicator and stage labels

- **TTRPG playability report**: ✅
  - Deterministic read-only validation for connectivity, route distances,
    critical reachability, dead ends, junctions, cycles/edge redundancy, and
    zone transitions.
  - Structured violation codes with severity and repair hints.
  - Compact status/metrics/violation codes exported in `meta.ttrpgMetrics`.

## In Progress

- **Editor UX / post-generation editing (P0)**:
  - Source of truth: `docs/EDITOR_UX_BACKLOG.md`.
  - Preserve existing attachments by default; room drag now reroutes attached edges.
  - Alt-drag room explicitly detaches only its affected endpoints; persistent
    **Preserve attachments** toggle and full preview remain open.
  - Replace free-form editor endpoints with canonical anchors:
    `roomPort | door | junction | corridorPoint | free`.
  - Generated and manually drawn corridors must use the same attachment model.
  - Moving/resizing a room must move wall-local doors and room-local objects,
    mark only affected corridors dirty, and reroute them around rooms,
    facility envelope and structural voids.
  - Preserve locked waypoints and unchanged routes during incremental reroute.
  - One gesture plus all dependent updates is one undo transaction; Esc and
    pointer cancel restore the pre-drag document.
  - Diagonal corridor segments are invalid document geometry. The renderer
    must not silently invent bend points.

- **Facility composition (separate P0 epic)**:
  - Keep background/reference, facility envelope/hull, structural voids, rooms
    and corridors as separate canonical layers.
  - Generated and manual workflows must both support a recognizable modular
    silhouette for ship, station and base/outpost.
  - Add a manual Facility/Hull mode for placing, attaching, resizing and
    combining compatible hull/modules without implicitly changing them during
    ordinary room editing.
  - Use the same containment and export round-trip tests for generated and
    manually composed facilities.

- **Multi-deck generation and size budgets**:
  - Occupancy-first V2 currently creates one deck per run.
  - The 16-32+ room budgets remain project-level targets and must not be presented as a per-deck guarantee.

- **Playability validation next**:
  - Generalized auto-repair remains separate from the current read-only report.
  - Pressurization, service/vent loops, security bypasses, and connector/port
    semantics are not yet validated.
  - Polygon-room repair and role-readable props remain future work.

- **Per-segment drag/edit**: Phase 3 feature
- **Locked waypoints & incremental reroute**: tracked as P0 in
  `docs/EDITOR_UX_BACKLOG.md`

## Working Features

- **Segment selection**: ✅ Alt+Click selects specific segment; Delete removes
- **Junction/LineJump rendering**: ✅ T/X/hub/airlock junctions, arc/gap/sharp line jumps
- **Snapshots UI**: ✅ SnapshotsPanel in TopBar
- **Marquee selection**: ✅ Box-select rooms/corridors
- **Command Palette**: ✅ Ctrl+K
- **Gallery Mode**: ✅ Generate 2-8 variants

These working controls are building blocks only. They do not mark dependent
movement, canonical attachments, obstacle-aware incremental reroute or atomic
post-generation editing as complete.

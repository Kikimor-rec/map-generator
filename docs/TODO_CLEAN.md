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

## In Progress

- **Per-segment drag/edit**: Phase 3 feature
- **Locked waypoints & incremental reroute**: Phase 3

## Working Features

- **Segment selection**: ✅ Alt+Click selects specific segment; Delete removes
- **Junction/LineJump rendering**: ✅ T/X/hub/airlock junctions, arc/gap/sharp line jumps
- **Snapshots UI**: ✅ SnapshotsPanel in TopBar
- **Marquee selection**: ✅ Box-select rooms/corridors
- **Command Palette**: ✅ Ctrl+K
- **Gallery Mode**: ✅ Generate 2-8 variants

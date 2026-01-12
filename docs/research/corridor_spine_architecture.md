# Corridor Spine Architecture for Sci-Fi Maps — 2026-01-04

## Context (constraints from our docs)
- Ships must look like ships (elongated, bow-to-stern structure)
- Stations can be ring/hub/modular
- Outposts are compact, terrain-dependent
- TTRPG-friendly: multiple routes, chokepoints, tactical options
- Corridors should merge/coalesce, not run parallel

## Research question
How should we structure the main corridor network ("spine") for each archetype to:
1. Look realistic/believable
2. Support interesting TTRPG gameplay (multiple paths, tactical choices)
3. Avoid "spaghetti" corridors

## Sources
- Real spacecraft designs (ISS, Mir, Shuttle layouts)
- Sci-fi references (Star Trek deck plans, Alien Nostromo, Star Wars ships)
- TTRPG map design principles (chokepoints, flanking routes, escape paths)
- Game level design (L4D "main path + shortcuts", Deus Ex "hub + spokes")

## Findings

### Ships - Multiple Spine Types

Real and fictional spacecraft use several corridor patterns:

#### 1. Single Main Spine
```
[Bridge] ═══════════════════════════════ [Engineering]
              |        |        |
           [Crew]  [Medical] [Cargo]
```
- Simple, efficient
- Used in: small ships, couriers, fighters
- TTRPG: Linear, can feel restrictive

#### 2. Dual Spine (Port/Starboard)
```
[Bridge] ═══════╦══════════════════╦════ [Engineering]
                ║                  ║
            ════╬══════════════════╬════  (Secondary spine)
                |        |        |
             [Crew]  [Science] [Cargo]
```
- Redundancy, parallel routes
- Used in: military ships, larger vessels
- TTRPG: Flanking opportunities, tactical choices

#### 3. Ring/Loop Spine
```
         [Bridge]
            ╔═══╗
     [Crew] ║   ║ [Science]
            ║   ║
            ╚═══╝
        [Engineering]
```
- Can go either direction
- Used in: rotating sections, some stations
- TTRPG: Chases, ambush opportunities

#### 4. Branching Spine (Y/T shape)
```
            [Bridge]
               ║
        ═══════╬═══════
       /       |       \
   [Port]   [Center]  [Starboard]
      \        |        /
        ══════[Aft]══════
```
- Multi-deck ships, larger vessels
- TTRPG: Multiple approach routes

### Stations - Multi-Ring and Hub Patterns

#### 1. Concentric Rings
```
        ┌─────────────┐
        │  ┌───────┐  │
        │  │ [Hub] │  │
        │  └───────┘  │
        └─────────────┘
      Ring 1    Ring 2
```
- Inner ring: critical systems
- Outer ring: docking, cargo
- Connections between rings at intervals

#### 2. Hub and Spokes with Ring
```
          [Dock A]
              │
    [Arm 1]───╋───[Arm 2]
              │
          ════╪════  (Ring connector)
              │
          [Arm 3]
```
- Spokes radiate from central hub
- Ring connects spoke tips
- Used in: O'Neill cylinders, real station concepts

#### 3. Modular/Asymmetric (ISS-style)
```
    [Module A]──[Node 1]──[Module B]
                   │
    [Module C]──[Node 2]──[Module D]
                   │
               [Module E]
```
- Nodes connect modules
- Asymmetric growth
- TTRPG: Varied paths, interesting navigation

### Outposts - Terrain-Dependent Chaos

Outposts adapt to environment:

#### 1. Underground (Mining/Bunker)
```
    [Entry]
       │
    ═══╪═══  Main tunnel
    │  │  │
   [A][B][C]  Side chambers
       │
    [Deep]
```
- Follow natural caverns or dig patterns
- Dead ends common
- TTRPG: Ambush zones, escape routes

#### 2. Surface (Base camp)
```
    [Airlock]───[Hab]
        │         │
    [Storage]───[Power]
```
- Clustered for efficiency
- Short corridors (thermal loss)
- Often expandable modularly

#### 3. Ruins/Derelict
```
    [Entry]─ ─ ─[???]
       │    X
    [Room]──────[Room]
       │
    ═══╪═══  (Blocked paths)
```
- Original structure + damage
- Blocked passages, alternate routes
- TTRPG: Exploration, surprises

## Design Principles for TTRPG

1. **Rule of Three Paths**: For any important destination, aim for 2-3 ways to reach it
2. **Chokepoints**: Strategic bottlenecks (airlocks, checkpoints) every 3-5 rooms
3. **Shortcut Loops**: Secondary paths that reward exploration
4. **Dead Ends with Purpose**: Storage, airlocks, escape pods (not just filler)
5. **Vertical Options**: Vents, ladders, maintenance shafts as alternate routes

## Decision

### What we adopt:
1. **Multiple spine types** based on ship size and subtype:
   - XS-SM: Single spine
   - MD: Single or dual spine (random)
   - LG-XL: Dual or loop spine
   
2. **Stations**: Hub + spokes + optional ring connector
   
3. **Outposts**: Terrain-based patterns (cluster, tunnel, modular)

4. **Spine generation rules**:
   - Primary spine: Always exists, connects critical rooms
   - Secondary spines: Connect zones, may branch
   - Loop closures: Based on `loopiness` parameter
   - All other corridors connect TO spines, not peer-to-peer

### What we reject:
- Pure random routing (current approach) - creates spaghetti
- Single pattern for all sizes - doesn't scale

### Why:
- Matches real/fictional spacecraft design
- Creates more readable maps
- Supports TTRPG gameplay (tactical options)
- Reduces corridor clutter through merge

## Implementation Status (Updated)

### Completed in `spineLayout.ts`:

#### Ship Patterns (based on size + loopiness):
| Size | Rooms | Patterns Available |
|------|-------|--------------------|
| XS   | ≤5    | Single spine only |
| SM   | 6-10  | Single spine only |
| MD   | 11-20 | Single, Branching (Y/T), Dual |
| LG   | 21-35 | Single, Dual, Branching, Loop |
| XL   | 35+   | Dual, Branching, Loop |

#### Station Patterns (based on size + loopiness):
| Size | Rooms | Pattern |
|------|-------|---------|
| Small | ≤8 | Hub + 3-4 spokes |
| Medium | 9-20 | Hub + spokes + optional ring |
| Large | 20+ | Hub + spokes + ring(s), Multi-ring |

#### Outpost Patterns (based on subtype/terrain):
| Terrain | Subtypes | Pattern |
|---------|----------|---------|
| Underground | mine, bunker | Main tunnel + side chambers |
| Surface | base, camp | Clustered modules |
| Ruins | derelict, abandoned | Irregular, blocked paths |

### Key Functions:
- `selectShipPattern()` - Chooses pattern based on size + loopiness
- `generateShipSingleSpine()` - Classic linear layout
- `generateShipDualSpine()` - Two parallel main corridors
- `generateShipLoopSpine()` - Racetrack pattern
- `generateShipBranchingSpine()` - Y or T shaped
- `generateStationHubSpoke()` - Simple radial
- `generateStationHubRing()` - Spokes connected by ring
- `generateStationMultiRing()` - Concentric rings
- `generateOutpostUnderground()` - Tunnel + chambers
- `generateOutpostSurface()` - Clustered modules
- `generateOutpostRuins()` - Irregular connectivity

## Proposed changes

### Docs/specs to update:
- `05_layout_geometry.md` - Add spine patterns ✅ (partially done)
- `06_corridors_connectors.md` - Spine-first routing algorithm

### Code areas affected:
- `spineLayout.ts` - ✅ DONE - Full pattern implementation
- `layout.ts` - ✅ DONE - Spine-aware placement and routing integrated
- `topology.ts` - Mark backbone connections for spine (optional enhancement)

### Integration in layout.ts:

```typescript
// New functions added:
placeRoomsWithSpine()        // Places rooms near spine nodes based on zone
routeConnectorsWithSpine()   // Routes corridors via spine structure
findTargetSpineNode()        // Maps room zones to spine nodes
findPositionNearSpineNode()  // Finds valid position near target node
routeViaSpine()              // Routes corridor through spine
findNearestSpineNode()       // Locates closest spine node
findSpinePath()              // Navigates along spine segments
```

### Algorithm:

```
1. Generate spine structure based on archetype + size:
   - Ship: selectShipPattern() → single/dual/loop/branching
   - Station: size-based → hub-spoke/hub-ring/multi-ring
   - Outpost: terrain-based → tunnel/cluster/ruins

2. Place anchor rooms ON or ADJACENT TO spine nodes:
   - Command at spine start (bow/hub)
   - Engineering at spine end (stern/spoke-tip)
   - Other critical rooms at junctions

3. Route spine corridors FIRST (these become "trunk lines")

4. For each non-spine room:
   - Find nearest spine node
   - Route branch corridor TO spine (not to other room)
   
5. Coalesce overlapping segments

6. Add loop closures based on loopiness parameter
```

### Tests/acceptance impacts:
- Add visual regression tests for each archetype
- Verify spine connectivity
- Check that generated maps match expected patterns

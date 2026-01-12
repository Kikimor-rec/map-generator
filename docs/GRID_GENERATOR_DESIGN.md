# Grid-First + Zones Hybrid Generator

## Problem Statement

Current generation approach has fundamental issues:
- Corridors can overlap without creating junctions
- Corridors pass through rooms (A* fallback ignores obstacles)
- Room placement doesn't respect actual corridor structure
- Chaotic layouts despite spine-based approach

## Solution: Tile-Based Generation

Instead of generating corridors as paths then placing rooms, we use a **tile grid** where every cell has a clear type. This eliminates overlap/collision issues by design.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TileGrid (2D Array)                       │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐   │
│  │ VOID│ VOID│ VOID│ VOID│ VOID│ VOID│ VOID│ VOID│ VOID│   │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤   │
│  │ VOID│ ROOM│ ROOM│ DOOR│CORR │ DOOR│ ROOM│ ROOM│ VOID│   │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤   │
│  │ VOID│ ROOM│ ROOM│ VOID│CORR │ VOID│ ROOM│ ROOM│ VOID│   │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤   │
│  │ VOID│ VOID│ VOID│ VOID│JUNC │CORR │CORR │ DOOR│ ROOM│   │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Tile Types

```typescript
enum TileType {
  VOID = 0,      // Empty space (outside hull)
  HULL = 1,      // Ship hull/wall
  FLOOR = 2,     // Walkable floor (inside rooms)
  CORRIDOR = 3,  // Corridor tile
  DOOR = 4,      // Door/portal between spaces
  JUNCTION = 5,  // Corridor intersection
  AIRLOCK = 6,   // External access point
}

interface Tile {
  type: TileType
  roomId?: string      // If FLOOR, which room
  corridorId?: string  // If CORRIDOR/JUNCTION
  zoneId?: string      // Zone assignment
  metadata?: Record<string, any>
}
```

## Generation Pipeline

### Stage 1: Create Grid Canvas

```typescript
interface GridCanvas {
  width: number        // In tiles
  height: number       // In tiles
  tileSize: number     // Pixels per tile (default 40)
  tiles: Tile[][]      // 2D array
  archetype: Archetype
}

function createCanvas(request: GenerationRequest): GridCanvas {
  // Size based on archetype + sizeTier
  const dimensions = ARCHETYPE_DIMENSIONS[request.archetype][request.sizeTier]

  // Ships: elongated (3:1 or 2.5:1)
  // Stations: square or circular
  // Outposts: irregular/clustered

  return {
    width: dimensions.width,
    height: dimensions.height,
    tileSize: 40,
    tiles: initializeTiles(dimensions),
    archetype: request.archetype
  }
}
```

### Stage 2: Define Hull Shape

Ship hull is NOT a rectangle. We carve the actual ship shape first.

```typescript
type HullTemplate =
  | 'elongated'     // Classic ship (pointed bow, wide stern)
  | 'boxy'          // Freighter/cargo
  | 'circular'      // Station ring
  | 'irregular'     // Outpost/ruins

function carveHull(canvas: GridCanvas, template: HullTemplate, rng: SeededRNG): void {
  // Mark tiles as HULL or VOID based on template
  // Ships: use mathematical curves (ellipse + taper)
  // Stations: circles/rings
  // Outposts: noise-based blobs
}
```

### Stage 3: Zone Partitioning

Divide hull interior into logical zones.

```typescript
interface ZoneDefinition {
  id: string
  label: string
  position: 'bow' | 'mid' | 'stern' | 'port' | 'starboard' | 'center' | 'ring'
  priority: number  // For room assignment
}

const SHIP_ZONES: ZoneDefinition[] = [
  { id: 'command', label: 'Command', position: 'bow', priority: 1 },
  { id: 'crew', label: 'Crew', position: 'mid', priority: 2 },
  { id: 'operations', label: 'Operations', position: 'mid', priority: 3 },
  { id: 'engineering', label: 'Engineering', position: 'stern', priority: 1 },
]

function partitionZones(canvas: GridCanvas, zones: ZoneDefinition[]): void {
  // For ships: divide along Y axis (bow to stern)
  // For stations: radial division (hub, inner ring, outer ring)
  // For outposts: cluster-based
}
```

### Stage 4: Carve Main Spine/Corridor Network

This is the KEY difference - corridors are carved FIRST, but as tiles, not paths.

```typescript
interface SpineConfig {
  pattern: 'linear' | 'branching' | 'ring' | 'grid'
  width: 1 | 2 | 3  // Corridor width in tiles
  branches: number
}

function carveSpine(canvas: GridCanvas, config: SpineConfig): string[] {
  // Returns list of junction positions

  if (config.pattern === 'linear') {
    // Single main corridor through center
    // Mark tiles as CORRIDOR
  }

  if (config.pattern === 'branching') {
    // Main + perpendicular branches
    // Mark intersections as JUNCTION
  }

  // etc.
}
```

### Stage 5: Place Rooms (Growing from Corridors)

Rooms grow outward from corridor adjacency.

```typescript
interface RoomPlacement {
  roomId: string
  tiles: Point[]      // List of tile coordinates
  zone: string
  adjacentCorridors: Point[]  // Door candidate positions
}

function placeRooms(
  canvas: GridCanvas,
  roomProgram: RoomProgram,
  rng: SeededRNG
): RoomPlacement[] {
  const placements: RoomPlacement[] = []

  // Sort rooms by priority (primary first)
  const sortedRooms = [...roomProgram.rooms].sort(byPriority)

  for (const room of sortedRooms) {
    // Find valid zone for this room
    const targetZone = findBestZone(room, canvas)

    // Find corridor-adjacent empty space
    const seedTile = findSeedTile(canvas, targetZone, room.estimatedTiles)

    if (seedTile) {
      // Grow room from seed using flood fill
      const tiles = growRoom(canvas, seedTile, room.estimatedTiles, room)

      // Mark tiles as FLOOR with roomId
      for (const tile of tiles) {
        canvas.tiles[tile.y][tile.x] = {
          type: TileType.FLOOR,
          roomId: room.id,
          zoneId: targetZone
        }
      }

      // Find door positions (adjacent to corridor)
      const doors = findDoorPositions(canvas, tiles)

      placements.push({ roomId: room.id, tiles, zone: targetZone, adjacentCorridors: doors })
    }
  }

  return placements
}
```

### Stage 6: Connect Unconnected Rooms

Some rooms may need additional corridor connections.

```typescript
function connectIsolatedRooms(canvas: GridCanvas, placements: RoomPlacement[]): void {
  // Build connectivity graph
  const graph = buildConnectivityGraph(placements)

  // Find disconnected components
  const components = findComponents(graph)

  if (components.length > 1) {
    // Carve minimal corridors to connect
    // Use A* on the tile grid (NOT on empty space!)
    for (let i = 1; i < components.length; i++) {
      const from = components[0][0]  // Room in main component
      const to = components[i][0]    // Room in isolated component

      carveConnectingCorridor(canvas, from, to)
    }
  }
}
```

### Stage 7: Place Doors

Doors are placed at room-corridor boundaries.

```typescript
function placeDoors(canvas: GridCanvas, placements: RoomPlacement[]): void {
  for (const placement of placements) {
    for (const doorPos of placement.adjacentCorridors) {
      canvas.tiles[doorPos.y][doorPos.x].type = TileType.DOOR
    }
  }
}
```

### Stage 8: Post-Process & Beautify

```typescript
function postProcess(canvas: GridCanvas): void {
  // 1. Widen main corridors at junctions
  // 2. Add alcoves/details
  // 3. Round corners
  // 4. Add airlocks at hull edge
}
```

### Stage 9: Convert to Output Format

```typescript
function convertToMapJSON(canvas: GridCanvas): MapJSON {
  // Extract room polygons from tile regions
  // Extract corridor paths from corridor tiles
  // Build junction list from JUNCTION tiles
  // Generate doors list
}
```

## Key Algorithms

### Room Growing (Flood Fill Variant)

```typescript
function growRoom(
  canvas: GridCanvas,
  seed: Point,
  targetSize: number,
  room: ProgrammedRoom
): Point[] {
  const tiles: Point[] = [seed]
  const frontier: Point[] = [seed]
  const visited = new Set<string>()
  visited.add(`${seed.x},${seed.y}`)

  // Preferred aspect ratio based on room type
  const preferHorizontal = room.roomType === 'cargoBay' || room.roomType === 'hangar'

  while (tiles.length < targetSize && frontier.length > 0) {
    // Pick next tile to expand from
    const current = frontier.shift()!

    // Get neighbors (4-directional)
    const neighbors = getNeighbors(current)
      .filter(n => !visited.has(`${n.x},${n.y}`))
      .filter(n => canvas.tiles[n.y][n.x].type === TileType.HULL) // Only expand into hull
      .filter(n => isInZone(n, room.zone, canvas))

    // Sort by preference (shape control)
    neighbors.sort((a, b) => {
      // Prefer expansion that maintains aspect ratio
      const scoreA = preferHorizontal
        ? Math.abs(a.x - seed.x)
        : Math.abs(a.y - seed.y)
      const scoreB = preferHorizontal
        ? Math.abs(b.x - seed.x)
        : Math.abs(b.y - seed.y)
      return scoreB - scoreA
    })

    for (const neighbor of neighbors) {
      if (tiles.length >= targetSize) break

      tiles.push(neighbor)
      frontier.push(neighbor)
      visited.add(`${neighbor.x},${neighbor.y}`)
    }
  }

  return tiles
}
```

### Corridor Carving on Grid

```typescript
function carveCorridorOnGrid(
  canvas: GridCanvas,
  from: Point,
  to: Point,
  width: number = 1
): void {
  // A* pathfinding ON THE GRID
  // Cost function:
  // - HULL tiles: low cost (can carve)
  // - FLOOR tiles: high cost (avoid rooms)
  // - CORRIDOR tiles: zero cost (reuse)
  // - VOID tiles: infinite (can't go outside hull)

  const path = aStarOnGrid(canvas, from, to, {
    hullCost: 1,
    floorCost: 1000,  // Strongly avoid rooms
    corridorCost: 0,  // Free to reuse
    voidCost: Infinity
  })

  // Carve path with width
  for (const point of path) {
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < width; dy++) {
        const tile = canvas.tiles[point.y + dy]?.[point.x + dx]
        if (tile && tile.type === TileType.HULL) {
          tile.type = TileType.CORRIDOR
        }
      }
    }
  }

  // Mark junctions where corridors cross
  markJunctions(canvas)
}
```

## Archetype-Specific Templates

### Ship Templates

```typescript
const SHIP_TEMPLATES = {
  courier: {
    aspectRatio: 3.5,  // Very elongated
    hull: 'pointed',
    spine: 'linear',
    zones: ['command', 'crew', 'cargo', 'engineering'],
    roomDensity: 0.6
  },
  cargo: {
    aspectRatio: 2.0,
    hull: 'boxy',
    spine: 'branching',
    zones: ['command', 'cargo', 'cargo', 'engineering'],
    roomDensity: 0.7
  },
  military: {
    aspectRatio: 2.5,
    hull: 'angular',
    spine: 'grid',
    zones: ['command', 'tactical', 'crew', 'weapons', 'engineering'],
    roomDensity: 0.65
  }
}
```

### Station Templates

```typescript
const STATION_TEMPLATES = {
  port: {
    shape: 'ring',
    spine: 'hub-spoke',
    zones: ['hub', 'docking', 'commercial', 'residential'],
    rings: 2
  },
  research: {
    shape: 'circular',
    spine: 'hub-ring',
    zones: ['hub', 'labs', 'crew', 'utilities'],
    rings: 1
  }
}
```

## File Structure

```
src/generators/
├── gridGenerator/
│   ├── index.ts           # Main export
│   ├── types.ts           # TileType, GridCanvas, etc.
│   ├── canvas.ts          # Grid creation & manipulation
│   ├── hull.ts            # Hull shape carving
│   ├── zones.ts           # Zone partitioning
│   ├── spine.ts           # Corridor network generation
│   ├── rooms.ts           # Room placement & growing
│   ├── connections.ts     # Connectivity & door placement
│   ├── postProcess.ts     # Beautification
│   ├── convert.ts         # To MapJSON/EditorFormat
│   └── templates/
│       ├── ships.ts
│       ├── stations.ts
│       └── outposts.ts
```

## Integration with Existing System

The new generator will:
1. Implement same `GenerationResult` interface
2. Produce same `MapJSON` output format
3. Be selectable via `GeneratorOptions.engine: 'legacy' | 'grid'`
4. Reuse existing `RoomProgram` and `TopologyGraph` stages where possible

```typescript
// In generator.ts
export function generateMap(options: GeneratorOptions = {}): GenerationResult {
  if (options.engine === 'grid') {
    return generateMapGrid(options)  // New implementation
  }
  return generateMapLegacy(options)  // Current implementation
}
```

## Benefits of This Approach

1. **No Overlaps**: Impossible by design - each tile has exactly one type
2. **Natural Junctions**: JUNCTION tiles where corridors meet
3. **Room Collision Free**: Rooms can't overlap (grow stops at occupied tiles)
4. **Zone Compliance**: Rooms grow within their designated zones
5. **Predictable Shapes**: Hull templates ensure ship looks like a ship
6. **Easy Debugging**: Can visualize tile grid directly
7. **Roguelike Proven**: Same approach used in Dwarf Fortress, Caves of Qud, etc.

## Next Steps

1. [ ] Implement `TileType` enum and `GridCanvas` interface
2. [ ] Implement hull carving for ships (ellipse + taper)
3. [ ] Implement zone partitioning (simple Y-axis division for ships)
4. [ ] Implement spine carving (linear first, branching later)
5. [ ] Implement room growing algorithm
6. [ ] Implement door placement
7. [ ] Implement conversion to MapJSON
8. [ ] Integration tests with visual output
9. [ ] Add station and outpost templates
10. [ ] Beautification pass

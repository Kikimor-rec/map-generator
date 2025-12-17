# Corridor Coalesce (Merge) Specification

## Overview

Coalesce is a post-processing pass that runs after corridor generation to merge duplicate and overlapping corridor segments. This reduces visual clutter and creates proper junctions at intersection points.

## Goals

1. **Remove duplicate segments** - When two corridors share the exact same segment, keep only one
2. **Handle partial overlaps** - Split segments when they partially overlap and share the common portion
3. **Create junctions** - Automatically create T/X/hub junctions at merge points
4. **Prefer reuse** - During A* routing, prefer paths that reuse existing corridor segments (reduces cost)

## Configuration

### CoalesceSettings

```typescript
interface CoalesceSettings {
  enabled: boolean              // Enable coalesce processing
  tolerancePx: number           // Tolerance for matching (default: 4px)
  minSharedLength: number       // Minimum overlap to merge (default: 20px)
  typeMergePolicy: TypeMergePolicy
  layerMergePolicy: LayerMergePolicy
  preferReuseWeight: number     // A* cost reduction (0-1, default: 0.3)
  createJunctionsAtMerge: boolean
}
```

### Type Merge Policies

| Policy | Description |
|--------|-------------|
| `shareIfSameType` | Only merge corridors of the same type (default) |
| `shareAndPromotePriority` | Merge and pick type by priority order |
| `neverShareDifferentTypes` | Never merge different types |

**Priority order** (for `shareAndPromotePriority`):
1. `corridor` (highest)
2. `accessTunnel`
3. `ventilation`
4. `power`
5. `data`
6. `coolant` (lowest)

### Layer Merge Policies

| Policy | Description |
|--------|-------------|
| `mergeAll` | Merge corridors across all layers |
| `mergeWithinLayer` | Only merge same layer (default) |
| `neverMergeLayers` | Never merge across layers |

## Algorithm

### Phase 1: Canonization

Normalize all segments so they can be compared:

```
For each corridor segment (p1, p2):
  1. Order endpoints lexicographically: (min(x), min(y)) → (max(x), max(y))
  2. Create hash key: "x1,y1-x2,y2" (quantized by tolerance)
  3. Store in lookup map: hash → [segments...]
```

### Phase 2: Deduplication

Remove exact duplicate segments:

```
For each hash bucket with multiple segments:
  1. Check if merge policy allows merging (type/layer)
  2. Keep one segment, mark others for removal
  3. Record which corridors were modified
```

### Phase 3: Partial Overlap Detection

Handle segments that share a portion:

```
For each segment pair on the same axis:
  1. Check if they're collinear (same line equation)
  2. Check for overlap: A.start < B.end && B.start < A.end
  3. If overlap >= minSharedLength:
     a. Calculate shared portion
     b. Split both segments into: [unique1, shared, unique2]
     c. Merge shared portion
```

### Phase 4: Junction Creation

Create proper junctions at merge points:

```
For each merge point:
  1. Count connected corridor ends (including newly split ones)
  2. Determine junction type:
     - 3 connections → T
     - 4 connections → X
     - 5+ connections → hub
  3. Create Junction object and link corridors
```

### Phase 5: Prefer Reuse (A* Integration)

During routing, reduce cost for segments that reuse existing corridors:

```
When calculating A* edge cost:
  If edge overlaps with existing corridor segment:
    cost = baseCost * (1 - preferReuseWeight)
  Else:
    cost = baseCost
```

## UI Controls

### Generation Panel

```
[✓] Merge overlapping corridors
    
    Type policy: [Same type only ▼]
    Layer policy: [Same layer only ▼]
    
    [✓] Prefer reusing existing segments
```

### Default State

- Coalesce: **ON**
- Type policy: `shareIfSameType`
- Layer policy: `mergeWithinLayer`
- Prefer reuse: **ON** (weight: 0.3)

## Examples

### Example 1: Exact Duplicate

```
Before:
  Corridor A: (0,0) → (100,0) → (100,100)
  Corridor B: (50,0) → (100,0) → (100,50)
                       ^^^^^^^^
                       Shared segment

After:
  Corridor A: (0,0) → (100,0) → (100,100)
  Corridor B: (50,0) → (100,0) → (100,50)
                       ↑
                       Junction T at (100,0)
  Segment (100,0)→(100,50) is shared reference
```

### Example 2: Partial Overlap

```
Before:
  Corridor A: (0,0) → (200,0)
  Corridor B: (50,0) → (150,0)

After:
  Segments: (0,0)→(50,0) [A only]
            (50,0)→(150,0) [shared A+B]
            (150,0)→(200,0) [A only]
  Junctions: (50,0), (150,0)
```

## Acceptance Tests

1. **Duplicate removal**: Two identical segments → one remains
2. **Policy respect**: Different types don't merge when `shareIfSameType`
3. **Partial overlap**: Overlapping segments are correctly split
4. **Junction creation**: Merge points have correct junction type
5. **Corridor integrity**: All corridors remain connected after merge
6. **UI toggle**: Disabling coalesce leaves duplicates intact
7. **A* preference**: Routes prefer existing segments when enabled

## File Locations

- Types: `src/core/corridorTypes.ts` - CoalesceSettings, related interfaces
- Algorithm: `src/core/corridorCoalesce.ts` (to be created)
- UI: `src/ui/panels/GenerationPanel.tsx` - coalesce controls
- Integration: `src/core/mapGenerator.ts` - call coalesce after routing

## Implementation Status

- [x] Types defined in corridorTypes.ts
- [ ] Core algorithm in corridorCoalesce.ts
- [ ] UI controls in GenerationPanel
- [ ] A* integration for prefer-reuse
- [ ] Unit tests

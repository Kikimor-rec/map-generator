# 11 — Выходной MapJSON контракт

Этот раздел описывает текущий legacy-compatible `MapJSON`, который остаётся
production bridge после Phase 1. `MapDocumentV2`, runtime parsing, migrations и
`importGeneratedMap` остаются Phase 2; текущая production generation не выдаёт
`MapDocumentV2` и не меняет версию документа.

Существующие координаты rooms/connectors остаются в прежнем формате. Только
optional `deck.geometry` использует canonical geometry units:
`1 grid cell = 1024 geometry units`.

## 11.1 Верхний уровень
- `version`: string (например `"mapjson-1.0"`)
- `meta`:
  - `seed`, `archetype`, `subtype`, `styleProfile`, `sizeTier`
  - `ttrpgMetrics` (реализованный компактный срез из 08.6)
  - полный `issues` report пока не сериализуется; экспортируются
    `playabilityStatus` и `playabilityViolationCodes`
  - `generatedAt`
- `grid`:
  - `unit`, `bounds`, `origin`
- `zones`: список зон
- `decks`: массив палуб

### 11.1.1 Реализованный `meta.ttrpgMetrics`

Помимо legacy summary fields, active grid generator экспортирует:

* `playabilityStatus`;
* `connectedRoomPercent`, `isolatedRooms`;
* `deadEndRatio`, `corridorDeadEndCount`;
* `junctionCount`, `maxJunctionDegree`;
* `criticalReachability`, `reachableRoomPairPercent`;
* `alternateRoutePairPercent`, `circulationCycleRank`;
* `averageRoomRouteDistance`, `longestRoomRouteDistance`;
* `criticalRoomPairPathDistance`, `averageEntryToCriticalDistance`;
* `zoneTransitionCount`;
* `playabilityViolationCodes`.

Nullable route-distance fields равны `null`, когда для метрики нет подходящей
пары комнат. Полный отчёт с severity, room ids, actual/threshold и repair hint
не дублируется в MapJSON и доступен через
`validateTTRPGPlayability(canvas, placements, options)`.


## 11.2 Deck
- `deckId`: string
- `label`: string (например "Deck A")
- `rooms`: Room[]
- `connectors`: Connector[]
- `junctions`: Junction[]
- `layers`: Layer[]
- `geometry` (опционально; отсутствует у legacy-проектов):
  - `unitsPerCell`: `1024`
  - `facilityEnvelope`: MultiPolygon
  - `structuralVoids`: MultiPolygon[]

Текущий occupancy-first generator извлекает `facilityEnvelope` из non-VOID
tile mask и сохраняет его через этот bridge. `structuralVoids` сейчас
экспортируется как `[]`: поле и renderer поддержаны, но типы voids, их
проходимость и правила размещения ещё не интегрированы в MapJSON.

## 11.3 Room
- `id`, `type`, `importance`, `zoneId`, `deckId`
- `access`, `pressurized`, `tags`
- `geometry`:
  - `kind`: "rect"|"poly"
  - `rect`: {x,y,w,h} или `poly`: [{x,y},...]
- `ports`: Port[]
- `props` (опционально): для схематического наполнения
- `annotations` (опционально)

## 11.4 Port
- `id`
- `side`: "N"|"E"|"S"|"W"|"custom"
- `pos`: {x,y}
- `door`: {doorType, lockLevel, isBulkhead}
- `connectorId`: string|null
- `pressureRole`: `"inner-hatch"|"outer-hatch"|"bulkhead"` (optional)
- `pressureBoundary`: boolean (optional)
- `interlockGroupId`: string (optional)
- `fromCompartmentId`, `toCompartmentId`: string (optional)
- `exterior`: boolean (optional)
- exterior hatch ports use `connectorId: null`;
- legacy room/corridor ports keep a string connector ID.

## 11.5 Connector
- `id`
- `kind`
- `from`: {roomId, portId}
- `to`: {roomId, portId}
- `path`: [{x,y}, ...] (polyline)
- `widthClass`
- `access`
- `pressurizationBoundary`
- `isSecret`
- `layer`: "main"|"ventilation"|"service"|"cables"|"security"

### 11.5.1 Connector representation

Every production `MapJSON` connector serializes:

```ts
representation:
  | "physical-topology-edge-v1"
  | "room-route-v1"
```

`physical-topology-edge-v1` identifies graph edges derived from occupancy
tiles. `room-route-v1` identifies historical room-to-room paths. Fresh
occupancy output always writes the former; the retained legacy regression
writer writes the latter.

The separately retained quality pipeline produces `MapJSONCompat` only for
compatibility/regression use. Its connectors do not use this production
discriminator unless and until that output is normalized, and that writer never
enters the production UI or worker path.

The property remains optional in `LayoutConnector` only for old JSON that
predates the discriminator. During import:

1. an explicit value always wins;
2. a missing value with historical `corridor-edge-*` ID falls back to physical
   topology;
3. every other missing value falls back to room route.

Normalization is per connector, so mixed decks retain both representations.
Only room routes receive legacy coalescing and endpoint-door synthesis. The ID
prefix is a historical fallback, not a naming requirement for new physical
connectors.

## 11.6 Junction
- `id`
- `pos`: {x,y}
- `kind`: "T"|"X"|"hub"|"airlockChamber"
- `decor`: (опционально) подсказка рендеру
- `checkpoint`: boolean

## 11.7 Layer
- `id`: "main"|"ventilation"|...
- `elements`: ссылки на connectorIds/roomIds или собственные примитивы

## 11.7.1 Polygon geometry bridge

- `MultiPolygon`: `{ polygons: Polygon[] }`
- `Polygon`: `{ outer: Ring, holes?: Ring[] }`
- `Ring`: массив `{ x, y }` минимум из трёх целочисленных точек

Направления преобразования:

- canonical vector→mask: `src/geometry/rasterize.ts`;
- текущий occupancy mask→envelope: `src/generators/gridGenerator/geometry.ts`;
- geometry units→Pixi pixels: `src/ui/canvas/deckGeometry.ts`.

Mask-to-polygon conversion keeps the current occupancy generator compatible
with canonical vector geometry. Active grid maps export the archetype-specific
post-`carveHull` mask rather than one bounding rectangle. Containment,
silhouette and deterministic envelope behavior are covered by acceptance tests.
The internal grammar is still incomplete: service loops, typed structural
voids, polygon room editing and functional props remain future work.

## 11.7.2 Static pressure topology v1

Fresh grid decks may contain:

```ts
pressure: {
  version: 1,
  outsideCompartmentId: string,
  externalEnvironment: "vacuum" | "unknown",
  compartments: Array<{
    id: string,
    label: string,
    kind: "exterior" | "pressurized" | "airlock",
    nominalState: "vacuum" | "pressurized" | "cycling" | "unknown",
    roomIds: string[]
  }>,
  exteriorHatches: Array<{
    id: string,
    roomId: string,
    portId: string,
    wall: "top" | "bottom" | "left" | "right",
    position: {x: number, y: number},
    pressureRole: "outer-hatch",
    pressureBoundary: true,
    interlockGroupId: string,
    fromCompartmentId: string,
    toCompartmentId: string
  }>,
  interlockGroups: Array<{
    id: string,
    chamberRoomId: string,
    innerPortIds: string[],
    outerHatchId?: string
  }>
}
```

The block is optional for legacy documents. V1 stores a coarse main facility
compartment plus explicit airlock chambers and exterior environment.

## 11.8 Требование стабильности ID
ID должны быть стабильными для `seed`:
- формат: `{shortType}-{hash(seed + localIndex + type)}`

## 11.9 Debug/Trace (опционально)
- `debug.graph`: adjacency list
- `debug.steps`: список этапов с промежуточными метриками

## 11.10 Quality metadata v2

Свежие grid maps сохраняют в `meta.ttrpgMetrics` компактные optional metrics.

Facility structure:

- `facilityStructureStatus`, `facilityStructureViolationCodes`;
- `hullComponentCount`;
- `structuralVoidCount`, `structuralVoidCollisionCount`;
- `hullAspectRatio`, `hullSymmetryPercent`, `silhouetteFitScore`.

Pressure intent:

- `pressureCompartmentCount`, `interlockGroupCount`;
- `invalidInterlockGroupCount`;
- `pressureStatus`, `pressureViolationCodes`;
- `airlockRoomCount`, `validAirlockRoomCount`;
- `exteriorAirlockRoomCount`, `internalAirlockRoomCount`;
- `pressureBoundaryDoorCount`, `invalidPressureDoorCount`;
- `exteriorHatchCount`, `unresolvedExteriorHatchCount`.

Поля optional для legacy imports. Свежий selector требует их и записывает
`candidateSelection.schemaVersion = 2`,
`evaluatorVersion = "grid-candidate-v2"`.

Salt дочернего seed намеренно остаётся `"grid-candidate-v1"`: изменение
quality evaluation не должно менять само семейство generated candidates.

Для свежей static topology `validAirlockRoomCount` учитывает chamber
compartment, общий interlock и корректный внешний люк. Selector не принимает
кандидат с `unresolvedExteriorHatchCount > 0`. Legacy-документ без
`deck.pressure` сохраняет прежнюю room-side проверку и warning совместимости.

## 11.11 Production profile and selection metadata

`meta.candidateSelection` is written for maps returned by the production
facade. Its `requestedCandidates` follows the exact Draft/Standard/Polish
profile table; it also records evaluated/passed/rejected counts, master and
selected seeds, selected numeric index, Pareto rank, balanced score, three
objectives, and stable reason codes.

The production worker transports the same document only as:

```ts
{ type: "COMPLETE", requestId, format: "map-json-v1", map }
```

There is no alternate `bestCandidate` document shape.

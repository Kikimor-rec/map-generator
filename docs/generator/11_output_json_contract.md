# 11 — Выходной MapJSON контракт

Этот раздел описывает текущий legacy-compatible MapJSON. Параллельно введён
foundation `MapDocumentV2` с canonical polygon types и fixed-point units, но
полная миграция persistence/import/export на него ещё не завершена.

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

Mask→polygon нужен для совместимости текущего генератора. Active V2 уже
экспортирует не общий прямоугольник, а occupancy mask после архетипного
`carveHull` для ship/station/outpost; containment, silhouette и deterministic
envelope покрыты acceptance-тестами. Это всё ещё не завершённая внутренняя
грамматика: primary circulation уже различается по архетипам, но ship service
loop, semantic `structuralVoids`, polygon room editing и функциональные props
ещё отсутствуют.

## 11.8 Требование стабильности ID
ID должны быть стабильными для `seed`:
- формат: `{shortType}-{hash(seed + localIndex + type)}`

## 11.9 Debug/Trace (опционально)
- `debug.graph`: adjacency list
- `debug.steps`: список этапов с промежуточными метриками

# 06 — Коридоры, шлюзы, двери, контрольные точки

## 6.1 Типы связей
- `corridor` — основной проход
- `airlock` — граница pressurized ↔ vacuum/surface
- `bulkheadDoor` — гермодверь/переборка (изоляция)
- `serviceHatch` — люк в служебные сети (vents/service)
- `verticalLink` — лифт/лестница/шахта

## 6.2 Правила pressurization
Если соединяются:
- pressurized ↔ vacuum/unpressurized:
  - обязателен `airlock` (или цепочка bulkhead+airlock по профилю)
- pressurized ↔ pressurized:
  - corridor допустим
- secure ↔ public при accessPolicy=strict:
  - checkpoint/bulkhead обязателен

## 6.3 Ширина и класс коридоров
`widthClass` выбирается по:
- archetype и sizeTier,
- зонам (industrial wider, service narrow),
- setpiece (anгарные проходы wide).

## 6.4 Двери и замки
Дверь — атрибут порта/коннектора:
- `doorType`: none/standard/bulkhead/secure/airlock
- `lockLevel`: 0..3 (пример)
- `failsafe`: boolean (аварийное открытие)

Генератор обязан:
- минимум 1 путь “crew access” от входа к ops,
- если есть secure‑зоны — минимум 1 “легальный” путь через checkpoint.

## 6.5 Контрольные точки (chokepoints)
Создавать сознательно:
- на переходах зон (hab→engineering),
- перед armory/brig/blacksite,
- перед reactor/AI core (если danger↑),
Но:
- не делать chokepoint’ом каждую дверь (иначе карта станет “линейной” и раздражающей).

## 6.6 Вторичные сети (vents/service)
Vents:
- обычно узкие, часто односторонние/с ограничениями доступа,
- имеют “выходы” люками в ключевых точках,
- не должны полностью ломать security, кроме случаев subtype=blacksite/derelict.

Service tunnels:
- соединяют utility/maintenance и дают обходы вокруг main spine,
- могут быть частично завалены/закрыты (если derelict/danger).

## 6.7 Рекомендация по “красивым коридорам”
Генератор выдаёт чистые полилинии.
Рендерер применяет “skin”:
- скругления углов (fillet),
- расширение на junction,
- опциональные “тамбуры” перед bulkhead.
- Current grid implementation notes:
  - Grid corridors store logical connector ids in tile metadata (`metadata.connectorIds`).
  - A corridor tile can belong to multiple logical connections when paths overlap or share a trunk.
  - `src/generators/gridGenerator/corridorGraph.ts` derives graph nodes, edges, and junctions from the canvas.
  - Crossings and branches are represented as topology: degree 3 nodes become `tee`, degree 4+ nodes become `cross`.
  - Map export preserves real `fromRoomId` / `toRoomId`; grid conversion no longer emits `SPINE` as a fake endpoint.
  - Active grid routing is corridor-first: one or more low-obstruction trunk corridors are carved first, then rooms connect via short orthogonal stubs.
  - Peer-to-peer A* room routing is no longer the primary map grammar because it creates unreadable bundles of arbitrary paths.
  - Editor rendering treats generated corridor edges as topology, not as independent visible strokes: `MapCanvas` first draws one aggregate presentation skin for all corridor edges, then uses per-edge graphics mainly for hit areas and selection.
  - Junction and line-jump markers are hidden unless corridor topology is selected, so normal map viewing is not overloaded with debug handles.
  - Corridor render chains must be continuous. If one corridor object contains disjoint physical segments, the renderer splits it into separate chains and must not draw a diagonal bridge between them.
  - Canvas rendering and interactive corridor creation sanitize corridor segments before drawing: diagonal segments are split into orthogonal L segments instead of being rendered as direct lines.
  - Occupancy-first V2 is now the active grid generator entrypoint. It carves `CORRIDOR`/`DOOR`/`FLOOR` tiles first, then derives graph edges for MapJSON/editor export.
  - Active V2 no longer starts every archetype from the same cross. Ship
    circulation uses a central longitudinal run and one transverse run on
    XS/SM or two on MD+.
  - Circular stations use a closed orthogonal ring plus 4/6/8 spokes selected
    by `loopiness`. Habitat stations use an annular closed ring plus four
    cardinal spokes that stop at the central-hole boundary.
  - Clustered outposts preserve stable hull module/link ids. Primary links
    connect hub to satellites; optional satellite loop links are selected by
    `loopiness` and become secondary circulation runs.
  - Station/outpost prevalidate their complete run sets before mutating the
    canvas. Ship runs are derived from actual hull spans and stay hull-contained,
    but are not yet committed through one atomic prevalidation phase. No
    strategy may carve a VOID tile.
  - V2 physical corridors are one-tile centerlines; visual corridor width belongs to the renderer. This avoids exporting a doubled tile corridor as many tiny parallel graph edges.
  - V2 does not call legacy room-to-room repair/coalesce during primary generation. Connectivity is created by room ports connecting to an already-carved corridor network.
  - Room bays are rectangular, mask-aware placements anchored to all
    circulation runs and ranked by the active functional placement scorer.
    Clustered outposts already use nearest-module zone assignment plus
    module-role/module-kind slot metadata. Ship service loops remain future
    topology work; semantic `structuralVoids` are still exported as an empty
    collection.

## 6.8 Implemented now: semantic port doors

Active occupancy generation classifies every room-side port as one of:

* `standard` for an ordinary interior connection;
* `secure` for high-access, secure-room, secure-zone, or large access-level
  transitions;
* `bulkhead` for containment rooms/zones and applicable near-hull boundaries;
* `airlock` for a true hull boundary, exterior egress, or airlock room.

Each classified grid door stores deterministic `metadata.doorAccess` with
`version: 1`, stable `accessId`, required access/level, lock level, failsafe,
locked-by-default, pressure-boundary, interlock, checkpoint, and ordered reason
codes. Corridor trunk and junction tiles do not receive door metadata.

The current bridge exports `doorSemantic` as MapJSON room-port `doorType`.
The editor adapter materializes one visible room door per port:

* `standard` → standard editor door;
* `secure` → locked secure editor door;
* `bulkhead` → blast editor door;
* `airlock` → airlock editor door.

Current limits:

* classification marks pressure intent; it is not a solved pressurization
  graph and does not validate compartment pressure states;
* a room-side `airlock` port does not yet generate an exterior second hatch or
  a complete two-door airlock chamber;
* full versioned `doorAccess` remains grid tile metadata; the current MapJSON
  and editor bridge materialize the semantic `doorType`, not every access field;
* service hatches, vent/cable layers, powered locks, and runtime door-state
  simulation remain future work.


## 6.9 Physical topology and presentation cleanup

- Physical graph nodes are created only for real endpoints and degree 3+
  branches/crossings. A bend or a tile shared by several logical connector ids
  is not a junction by itself.
- Consecutive bend-only tiles are exported as one continuous physical edge.
  This removes round-cap piles and overlapping outlines at every grid step.
- Station ring diagonals are rasterized with one deterministic radial elbow per
  octagon leg instead of alternating direction at every cell. Serialized,
  rendered, hit-test, and selection geometry therefore remain the same exact H/V path.
- Door glyphs must visibly interrupt the room/corridor boundary with a clearance
  halo, bright frame, end caps, and semantic type marker.

## 6.10 Partial pressure-topology validation

`validatePressureTopology()` теперь различает роли шлюзовых помещений:

- внешний стыковочный шлюз может оставаться terminal destination;
- внутренний шлюз обязан иметь минимум две room-side airlock doors и роль
  `through` или `hub`;
- каждый airlock threshold обязан быть физическим `AIRLOCK` tile с
  `pressureBoundary=true` и `interlocked=true`;
- bulkhead pressure metadata остаётся non-interlocked;
- внешний шлюз обязан касаться сохранённой границы корпуса.

Ошибки становятся hard gates для свежих grid candidates. Validator read-only:
он не переносит комнату и не придумывает недостающий corridor.


## 6.11 Materialized static pressure topology v1

Fresh grid maps now serialize an optional `deck.pressure` block. The minimal
authoritative ingress chain is:

`exterior -> outer hatch -> airlock chamber -> inner hatch -> facility`

Rules:

- an exterior docking airlock may remain a terminal circulation room;
- the outer hatch is a room port with `connectorId=null`, never a fake corridor
  outside the hull;
- outer and inner hatches share one stable `interlockGroupId`;
- each airlock owns a cycling chamber compartment;
- ship/station exterior is nominally `vacuum`; outpost exterior remains
  explicitly `unknown`;
- hatch placement only accepts void flood-connected to the canvas boundary, so
  enclosed structural voids cannot be mistaken for open space;
- missing or inconsistent materialized topology is a hard error for fresh grid
  candidates. Calling the validator without a topology block remains a legacy
  compatibility warning.

This is a static topology, not runtime decompression simulation. The main
facility is still one coarse pressurized compartment; bulkhead-separated
component solving, door states, damage and gas propagation remain future work.

## 6.12 Serialized connector representation

`LayoutConnector.representation` distinguishes two persisted geometries:

- `physical-topology-edge-v1` — an occupancy-derived physical graph edge;
- `room-route-v1` — a historical room-to-room route.

Fresh occupancy conversion always writes `physical-topology-edge-v1`.
The retained historical generator always writes `room-route-v1`. The field is
optional in the TypeScript bridge only so discriminator-free historical JSON
can still be imported; all new documents must serialize it explicitly.

`normalizeConnectorRepresentation()` is the single historical fallback:

1. an explicit representation always wins, even when the connector ID suggests
   another representation;
2. a missing representation falls back to
   `physical-topology-edge-v1` only for an old `corridor-edge-*` ID;
3. any other missing representation falls back to `room-route-v1`.

The editor adapter applies this rule to each connector independently. A mixed
deck may therefore contain physical and room-route connectors at the same
time. Physical edges remain separate graph edges and preserve semantic
room-port doors. Only room routes receive legacy coalescing, room attachment,
and generated endpoint-door adaptation. A deck-wide prefix check or
`every(...)` classification is invalid.

This discriminator belongs to the current `MapJSON` compatibility bridge.
Migration to `MapDocumentV2` and its canonical import boundary remains Phase 2;
Phase 1 does not change document versions or editable corridor behavior.

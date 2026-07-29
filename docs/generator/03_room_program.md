# 03 — Room Program (программа помещений)

Room Program отвечает за: “какие помещения вообще должны существовать” до того, как мы рисуем геометрию.

## 3.1 Подход: data‑driven
Все типы комнат описываются в конфиге (см. 14_config_templates.md).  
Код генератора не должен “знать” про конкретные комнаты, кроме тех, что прописаны в конфиге.

## 3.2 Поля, которые программа должна сформировать для каждой комнаты
Минимум:
- `id` (стабильный/детерминированный)
- `type` (из словаря)
- `importance`: `critical | major | minor | flavor`
- `zone`: `command | habitation | engineering | power | medical | science | cargo | docking | security | industrial | social | utility`
- `sizeClass`: `tiny | small | medium | large | huge`
- `access`: `public | crew | restricted | secure`
- `pressurized`: boolean
- `tags`: string[] (combatSpace/socialSpace/stealthRoute/setpiece/etc.)

## 3.3 Обязательное ядро (must)
Независимо от subtype, для объекта “с людьми”:
- точка управления (bridge/ops),
- энергия/силовой узел,
- жизнеобеспечение (может быть логически внутри engineering на XS),
- жилой функционал (sleep + hygiene минимум),
- вход/выход (airlock/dock).

Если объект “необитаемый” (beaconRelay), список иной — см. archetypes.

## 3.4 Правила количества (count rules)
Каждый тип комнаты определяет `countRule`, например:
- `exact: 1` (bridge),
- `range: [1,2]` с условиями,
- `perCrew: 1 per 6` (quarters clusters),
- `perDock: 1 per dockPort`,
- `weightedOptional` (шанс по tier/profile),
- `fallbackMerge` (если не хватает бюджета — слить с другой комнатой).

## 3.5 Приоритет добавления (order)
Рекомендуемый порядок заполнения бюджета:
1) critical (ядро)
2) major (поддержка ядра и subtype)
3) safety/redundancy (в realism сильнее)
4) setpieces (если setpieceBias высок)
5) minor/flavor (оставшийся бюджет)

Важно: всегда резервировать budget под `junctions` (узлы коридоров), иначе топология получится “ломаной”.

## 3.6 Ограничение и агрегация
Если `roomBudget` мал:
- объединять функции (ops+comms, mess+galley, med+quarantine),
- превращать часть комнат в “нишевые” (alcove) внутри большой комнаты (в JSON это остаётся отдельным объектом `subarea` или `annotation`).

Если `roomBudget` велик:
- добавлять redundancy (backup power, аварийный мостик),
- добавлять “глубину” (maintenance shafts, secondary storage),
- но ограничивать “одно и то же” (например, не плодить 8 одинаковых баров).

## 3.7 Выход программы
`RoomProgram` должен возвращать:
- `rooms[]`
- `requiredConnectorsHints` (например, “между habitation и vacuum должен быть airlock”)
- `criticalPairs` для метрик (например, bridge↔engineering, ops↔dock, hab↔med)
- `zoneTargets` (сколько зон и их веса)
- `budgetSummary` (сколько rooms/junctions/utility)

## 3.8 Active occupancy functional placement

`functionalRoomPlacement.ts` supplies a deterministic, side-effect-free score
and named debug factors. Active occupancy generation calls
`rankFunctionalRoomSlots()` before carving each programmed room:

* ship command rooms prefer the bow, engineering/reactor prefer the stern,
  while cargo/access prefer exterior mid-aft slots;
* station command prefers the hub, habitation prefers the ring, and
  docking/access prefers the perimeter;
* clustered outposts assign every non-VOID tile to its nearest hull module;
  hub tiles receive the `main` zone, while satellite module kind selects
  `support` or `specialized`;
* outpost slot candidates carry `moduleRole` and `moduleKind`, allowing command
  to prefer the hub and habitation, utility, science, industrial, security,
  logistics, and access rooms to prefer matching satellites;
* exact hull-mask exterior contact is passed into scoring rather than inferred
  only from the rectangular canvas bounds.

The scorer ranks candidates; hull containment, collision checks, carving, and
door placement remain separate placement-stage responsibilities.

Current limits:

* room bays remain rectangular, mask-aware slots anchored to circulation runs;
* placement is sequential and has no global adjacency/forbidden-adjacency
  optimization or constraint solve;
* scoring does not create polygon rooms, room-internal layout, or functional
  props, so room roles are not yet reliably recognizable without labels.

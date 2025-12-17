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

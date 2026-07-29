# 08 — Метрики качества (TTRPG) и пороги

Разделы 8.1–8.5 описывают целевой контракт качества. Фактически реализованный
срез перечислен в 8.6; генератор возвращает его в `meta.ttrpgMetrics`.
Отсутствующие целевые метрики нельзя считать реализованными только по наличию
похожего сигнала.

## 8.1 Must‑метрики (всегда)
- `ConnectivityOK`: boolean
- `AltPathsCriticalMin`: minimum count независимых путей между critical‑парами
- `LoopinessAchieved`: число 0..1 (факт)
- `DeadEndRatio`: 0..1
- `ReadabilityScore`: 0..1 (составной)
- `ChokepointCount`: int
- `AvgCorridorTurns`: float
- `AvgPathLengthToCritical`: float

## 8.2 Рекомендуемые (если включены соответствующие фичи)
- `StealthCoverage`: 0..1 (доля комнат, достижимых через vents/service)
- `SetpieceCount`: int
- `SetpieceApproachCountMin`: min подходов к setpieces
- `SecurityBypassOptions`: int (сколько путей обхода secure checkpoint)

## 8.3 Пороговые значения (примерные рекомендации)
Тут пороги задаются конфигом по sizeTier:

### xs
- AltPathsCriticalMin ≥ 1 (иногда физически невозможно 2)
- DeadEndRatio ≤ 0.35
- LoopinessAchieved ≥ 0.15 (если запрошено >0)

### s/m
- AltPathsCriticalMin ≥ 2 (если loopiness≥0.35)
- DeadEndRatio ≤ 0.30
- SetpieceCount ≥ 1 (если setpieceBias≥0.5)

### l/xl
- AltPathsCriticalMin ≥ 2..3
- DeadEndRatio ≤ 0.25
- 1–3 крупных setpieces
- ReadabilityScore не ниже заданного

## 8.4 Как считать ReadabilityScore (составной)
Рекомендация (нормализовать в 0..1):
- штраф за пересечения коридоров,
- штраф за количество поворотов,
- штраф за слишком длинные коридоры,
- штраф за “слишком плотные параллели”,
- бонус за магистраль + понятные рукава.

## 8.5 Метрики для хоррора (Mothership‑режим)
Если archetype/subtype предполагает хоррор:
- допускаем чуть больше тупиков,
- но компенсируем:
  - секретными обходами,
  - “опасными” зонами,
  - сценическими узлами (реактор, ангар, медблок с карантином).

## 8.6 Implemented now: physical-grid playability report

`src/generators/gridGenerator/playabilityValidator.ts` выполняет
детерминированный read-only анализ активных `GridCanvas` и `RoomPlacement[]`.
Он не меняет canvas и не запускает repair.

Полный structured report считает:

* долю комнат в крупнейшем связном компоненте и список isolated rooms;
* число/долю corridor dead ends, junction count и максимальную степень junction;
* reachable room-pair percentage, среднюю и максимальную кратчайшую дистанцию;
* longest critical-room pair path и среднюю entry→critical дистанцию;
* достижимость primary/critical rooms от entry;
* physical circulation cycle rank;
* долю critical/entry пар с edge-redundant маршрутом;
* число физических рёбер перехода между зонами и список пар зон.

Сигнал альтернативного маршрута проверяется между corridor-side ingress
точками комнат после удаления graph bridges. Он подтверждает физическую
edge-redundancy, но не доказывает сюжетную независимость, скрытность или
наличие отдельной service/vent сети.

Entry rooms определяются по `isExterior` и dock/airlock-подобной семантике.
Если entry не найден, отчёт явно ставит
`entryBasis: "fallback-first-room"` и добавляет информационную диагностику;
такой fallback нельзя представлять как проверенную доступность от шлюза.

Пороги мягкие и archetype/size-aware:

* connectivity и critical reachability требуют 100%;
* допустимая доля тупиков зависит от archetype и size tier;
* рекомендуемый минимум junctions растёт с размером;
* alternate-route threshold включается только при переданном
  `requestedLoopiness >= 0.35`;
* caller может явно переопределить thresholds.

Компактный срез экспортируется в `meta.ttrpgMetrics`:

* `playabilityStatus`;
* `connectedRoomPercent`, `isolatedRooms`;
* `loopCount`, `circulationCycleRank`;
* `deadEndRatio`, `corridorDeadEndCount`;
* `junctionCount`, `maxJunctionDegree`, `averageCorridorTurns`;
* `criticalReachability`, `reachableRoomPairPercent`;
* `alternateRoutePairPercent`;
* `averageRoomRouteDistance`, `longestRoomRouteDistance`;
* `criticalRoomPairPathDistance`, `averageEntryToCriticalDistance`;
* `zoneTransitionCount`;
* `playabilityViolationCodes`.

`playabilityStatus` имеет значения `pass | warning | error`. Warning означает
нарушение мягкого TTRPG-порога, а не структурную поломку карты.

## 8.7 Next

Ещё не реализованы:

* semantic `AltPathsCriticalMin` как число независимых main/service/vent путей;
* `ReadabilityScore`, `ChokepointCount`, setpiece и stealth/security metrics;
* сюжетная оценка encounter pockets и dangerous zones;
* service loops корабля и полноценные ventilation/service layers;
* автоматическое исправление найденных playability violations;
* метрики polygon rooms и узнаваемости props.

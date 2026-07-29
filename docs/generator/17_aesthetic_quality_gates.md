# 17 — Автоматические проверки визуального качества

## Назначение

Повторяющиеся проблемы генерации должны обнаруживаться до применения карты,
а не только при ручном просмотре пользователем. Проверка является read-only:
она не меняет seed, геометрию или содержимое карты.

Результат сохраняется в `meta.ttrpgMetrics` и показывается в preview генератора.

## Проверяемые проблемы

### Использование корпуса

`hullUtilizationPercent` — доля видимого корпуса, занятая комнатами,
коридорами, дверями, шлюзами и узлами.

Низкое значение означает, что корпус слишком велик относительно внутренней
структуры. Осмысленные пустоты позднее должны быть размечены как structural
void, machinery или reserved volume, а не выглядеть случайно забытым местом.

### Плотность поворотов

`corridorTurnRatio` — отношение числа физических H/V-поворотов к количеству
тайлов циркуляции. Проверка работает по физической сетке, а не по количеству
экспортированных connector-объектов.

Цель: длинные читаемые магистрали, редкие осмысленные локти и помещения,
которые могут физически прерывать основной маршрут.

### Кластеры узлов

`clusteredJunctionPairs` считает пары физических узлов степени 3+, находящихся
ближе допустимого расстояния.

Несколько решений маршрута в одном небольшом месте должны либо стать одним
явным hub-пространством, либо быть разнесены.

### Однозначность дверей

Каждый сгенерированный door tile должен иметь:

- соседний room floor;
- соседний corridor, junction или airlock.

Отдельно проверяется совпадение `RoomPlacement.doorPositions` с физическими
door tiles. Несовпадение считается ошибкой, поскольку оно ломает editor anchors.

## Статусы

- `pass` — пороги соблюдены;
- `warning` — карта применима, но содержит повторяющуюся эстетическую проблему;
- `error` — метаданные и физическая геометрия противоречат друг другу.

Preview не блокирует Apply: пользователь сохраняет право принять намеренно
странную карту. Однако предупреждения видны до применения.

## Пороговые значения

Пороги зависят от архетипа и размера:

- корабли строже ограничивают повороты;
- станции допускают более сложную кольцевую циркуляцию;
- аванпосты допускают более свободную и повреждённую геометрию;
- крупный корпус требует немного более высокого полезного заполнения.

Все пороги доступны через `getAestheticThresholds` и могут быть переопределены
в unit-тестах или будущих style profiles.

Aesthetic warning alone does not block a map. Production selection separately
applies the structural hard gates below; a hard-rejected candidate cannot be
returned as the selected production map.

## Production selection profiles

Draft, Standard и Polish — это candidate-selection effort profiles над одним
occupancy/grid engine, а не разные генераторы.

| Profile | XS | SM | MD | LG | XL |
| --- | ---: | ---: | ---: | ---: | ---: |
| Draft | 1 | 1 | 1 | 1 | 1 |
| Standard | 4 | 4 | 3 | 2 | 2 |
| Polish | 8 | 8 | 6 | 4 | 4 |

Default profile — Standard. Каждый профиль, включая Draft с одним вариантом,
проходит тот же hard-gated selector и требует хотя бы один hard-pass.

## Реализованный deterministic best-of-N отбор

Для одного master seed production facade детерминированно строит ограниченный
profile-specific pool occupancy candidates. `quality/pipeline.ts` не участвует
в production generation или отборе.

### Hard gates

Кандидат допускается к выбору только при выполнении всех доступных инвариантов:

- генерация завершена и обязательные quality metrics присутствуют;
- `connectedRoomPercent === 100` и `isolatedRooms === 0`;
- `criticalReachability === 100`;
- существует авторитетный ingress (`provided` или `inferred`), а не fallback на первую комнату;
- физические door/airlock tiles и `RoomPlacement.doorPositions` совпадают в обе стороны;
- нет неоднозначных дверей;
- connector path состоит из конечных ортогональных координат;
- room-port anchors ссылаются на существующий port с совпадающей позицией;
- все objective values являются конечными числами.

If no candidate passes the hard gates, standard generation returns `NO_VALID_CANDIDATE` with stable reason codes. Gallery mode does not expose rejected maps; it retains the failed Draft seed count and reason summary, and shows an explicit error when all variants fail.

### Pareto objectives

Прошедшие варианты получают три независимые нормализованные цели `[0,1]`:

- `routeClarity` — мало лишних поворотов и тесных кластеров junction;
- `hullUseFit` — достижение минимально разумного заполнения корпуса без награды за переполнение;
- `ttrpgChoice` — альтернативные маршруты, допустимые dead ends и достаточные route decisions.

Сначала строятся Pareto fronts. Внутри одного front применяется min-aware tie-break `0.5 × mean + 0.5 × min`, затем числовой `candidateIndex`. Поэтому сильная одна ось не компенсирует провал другой, а `candidate 10` не обгоняет `candidate 2` из-за строковой сортировки.

### Seed и metadata contract

In multi-candidate pools, child seeds use `hash(masterSeed, "grid-candidate-v1", candidateIndex)` and do not depend on pool size, so increasing one multi-candidate pool preserves its first `K` child seeds. A one-candidate pool is the exception: Draft uses the master seed directly and is not candidate 0 of Standard or Polish. `meta.seed` contains the exact selected seed, while `meta.candidateSelection` stores the versioned summary, master seed, index, evaluated/passed counts, Pareto rank, objectives, and reason codes.

Worker yields after every completed candidate, including the final or only candidate, and then re-checks `AbortSignal`; therefore Cancel can stop Draft before finalization and no `COMPLETE` is sent.

### Дополнительные structural/pressure gates

Evaluator v2 дополнительно hard-rejects:

- disconnected preserved facility envelope;
- room/circulation occupancy за исходной hull mask;
- invalid airlock/bulkhead physical metadata;
- internal airlock, который не является двухсторонним transit space;
- exterior airlock вне hull boundary.
- unresolved exterior hatch in a fresh static topology;
- outer hatch facing an enclosed structural void;
- mismatched inner/outer interlock group;
- missing airlock chamber compartment.

`hullUseFit` теперь сочетает usable hull occupancy (55%) и измеренный
archetype silhouette fit (45%). Слабая узнаваемость остаётся soft warning, а не
запретом необычной карты.

### Следующие quality gates

1. Контраст и минимальный экранный размер дверей на fit-to-view.
2. Векторная гладкость силуэта и число коротких ступеней корпуса.
3. Распределение комнат по видимому корпусу и осмысленные reserved volumes.
4. Gold-set classifier узнаваемости без подписей.
5. Novelty/topology hash и diversity относительно предыдущих результатов.

### Текущие ограничения

Остаются ограничения:

- нет полного bulkhead-separated compartment solve и runtime pressure states;
- нет generated typed machinery/terrain keepout masses сверх экспорта
  enclosed negative space;
- нет gold-set classifier узнаваемости без подписей;
- нет novelty/topology hash и diversity относительно предыдущих результатов.

Таким образом, текущий gate обнаруживает structural escape и неправдоподобную
room-side airlock topology, но не выдаёт это за полную compartment pressure
simulation.

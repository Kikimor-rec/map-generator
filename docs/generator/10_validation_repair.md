# 10 — Валидация и Auto‑Repair

## 10.1 Must‑валидаторы
- Нет пересечений комнат (геометрия)
- Все rooms имеют хотя бы 1 связь (кроме допустимых isolated, если явно помечены)
- Граф связен
- Все critical комнаты достижимы от entry (dock/airlock)
- Pressurization границы корректны (airlock/bulkhead)
- Все connectors подключены к валидным ports
- Нет “люков в никуда” для vents/service

## 10.2 Диагностика
Каждый issue:
- `code` (например `GEOM_OVERLAP`, `NO_ALT_PATHS`, `BAD_PRESSURIZATION`)
- `severity` (error/warn)
- `entities` (roomIds/connectorIds)
- `hint` (что ремонтировать)

## 10.3 Repair strategies (детерминированно)
### Геометрия
- локально сдвинуть кластер зоны
- уменьшить minor комнаты (в пределах sizeRange)
- перестроить packing вокруг anchor

### Связность/альт‑пути
- добавить ребро (коридор) между узлами с большой дистанцией
- добавить service‑обход (секретный)
- “прорезать” bulkhead или добавить обходной шлюз (если security не строгий)

### Читабельность
- спрямить коридор (re‑route с большим штрафом за повороты)
- заменить пересечение на junction‑камера
- объединить 2 маленькие комнаты в одну (если разрешено)

### Pressurization
- вставить airlock между vacuum↔pressurized
- поднять bulkhead у границы зон

## 10.4 Stop conditions
Repair делает максимум N итераций (например 12).
Если не удалось:
- вернуть “лучший” вариант + issues (чтобы редактор мог показать предупреждения),
- или fallback‑генерация с более простым layout grammar (readability↑).

## 10.5 Implemented now

Текущий генератор и новый playability validator решают разные задачи:

* generation-time connectivity использует flood-fill по `FLOOR`, `DOOR`,
  `CORRIDOR`, `JUNCTION`, `AIRLOCK`;
* router не объявляет успешным прямой fallback через заблокированные room tiles;
* generation-time connectivity repair сначала подключает isolated room к
  существующему corridor component, затем пробует room-to-room route;
* после размещения doors связность проверяется повторно;
* `validateTTRPGPlayability()` выполняет только read-only диагностику и никогда
  не изменяет canvas.

Каждая playability-диагностика содержит `code`, `severity`, `message`, `hint`,
а где применимо — `roomIds`, `actual`, `threshold`.

Реализованные коды:

* `ROOMS_DISCONNECTED` (`error`);
* `CRITICAL_ROOM_UNREACHABLE` (`error`);
* `HIGH_CORRIDOR_DEAD_END_RATIO` (`warning`);
* `LOW_JUNCTION_COUNT` (`warning`);
* `LOW_ROUTE_REDUNDANCY` (`warning`);
* `NO_ENTRY_ROOM` (`info`).

Компактный экспорт в MapJSON сохраняет status и
`playabilityViolationCodes`; полный structured report доступен через API
валидатора. Наличие warning не означает, что карта структурно невалидна.

## 10.6 Next

Обобщённый deterministic auto-repair pipeline из 10.3 ещё не реализован.
Текущий connectivity repair — локальная часть генератора, а не универсальный
repair engine для редактора.

Остаются:

* pressurization graph и проверка vacuum↔airlock↔pressurized boundaries;
* семантическая валидация bulkhead, secure checkpoint, vents/service hatches;
* проверка connector→port и «люков в никуда» на всех слоях;
* preview/confirm/undo для repair в редакторе;
* bounded repair iterations, best-candidate return и fallback grammar;
* geometry overlap/repair для polygon rooms;
* service-loop и security-bypass repair;
* props/setpiece-aware validation.

## 10.7 Structural и pressure gates

Во время MapJSON conversion теперь выполняются два дополнительных
детерминированных read-only отчёта:

- `validateFacilityStructure()` проверяет сохранённую pre-layout hull mask,
  4-connectivity, выход occupancy за mask, enclosed voids и silhouette metrics;
- `validatePressureTopology()` проверяет room-side airlock/bulkhead metadata,
  hull contact внешних шлюзов и различие external terminal/internal transit.

Стабильные error codes включают:

- `EMPTY_FACILITY_ENVELOPE`;
- `DISCONNECTED_FACILITY_ENVELOPE`;
- `STRUCTURAL_VOID_COLLISION`;
- `EXTERIOR_AIRLOCK_OFF_HULL`;
- `INTERNAL_AIRLOCK_NOT_TRANSIT`;
- `INVALID_AIRLOCK_DOOR_METADATA`;
- `INVALID_BULKHEAD_DOOR_METADATA`.

Static topology v1 additionally rejects:

- `INVALID_EXTERIOR_HATCH_METADATA`;
- `INVALID_AIRLOCK_INTERLOCK_GROUP`;
- `PRESSURE_COMPARTMENT_MISSING`;
- a materialized exterior hatch aimed at enclosed negative space;
- a fresh exterior airlock with `unresolvedExteriorHatchCount > 0`.

For legacy calls without `deck.pressure`,
`EXTERIOR_HATCH_NOT_MATERIALIZED` remains a warning. Once the versioned
topology block exists, the same condition is an error. Validation remains
read-only: it reports broken topology but does not move rooms or create
corridors.

Future repair actions must still be planned and applied as one undoable
transaction. They must not move an airlock or create a new corridor when the
geometry is ambiguous.

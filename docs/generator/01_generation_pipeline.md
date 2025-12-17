# 01 — Пайплайн генерации

Цель: из параметров `{seed, archetype, subtype, styleProfile, sizeTier, ...}` получить:
1) **Room Program** (список помещений с типами/параметрами),
2) **Topology Graph** (связи между помещениями),
3) **Geometry Layout** (2D формы комнат + коридоры),
4) **Layers** (вентиляция/техтуннели/кабели и пр.),
5) **Scores/Validation** (метрики и список проблем),
6) **Repair Pass** (опционально — исправление нарушений),
7) **MapJSON** (единый выходной контракт).

## Этап 0. Нормализация запроса
- Привести вход к каноническому виду: значения по умолчанию, ограничения, синонимы.
- `seed` → получить RNG, который детерминирован на всех платформах (фиксированный алгоритм: mulberry32/xoshiro).
- Вывести derived‑параметры:
  - `roomBudget` (сколько комнат целимся),
  - `deckCount` (если `auto`),
  - `zoneCountTarget` (сколько зон целимся),
  - `profileKnobs` (набор коэффициентов для realism/futurism).

## Этап 1. Room Program (программа помещений)
Вход: archetype/subtype, sizeTier, styleProfile, include/exclude.
Выход:
- `rooms[]`: список логических помещений (ещё без координат), с:
  - `type`, `importance`, `zone`, `sizeClass`, `access`, `pressurized`, `tags`.
- `constraints`: глобальные ограничения на топологию (например, “минимум 2 пути между critical”, “доков ≥2”).

Ключ: программа помещений формируется **данными** (конфиг типа YAML/JSON), а не “зашивается” в код.

## Этап 2. Topology Graph (граф связей)
Вход: `rooms[]`, параметры `loopiness`, `secretness`, `danger`, профиль.
Выход:
- граф `G = (V=rooms, E=connectors)` с пометками:
  - `kind` ребра (corridor/airlock/bulkhead/vertical),
  - уровень безопасности/доступа,
  - признак “секретности” (service hatch/vent).

Алгоритм: сначала “скелет” (backbone), затем кластеры зон, затем циклы (loops), затем overlay‑сети (vents/service).

## Этап 3. Deck assignment (если decks > 1)
Вход: `rooms[]`, `G`, `deckCount`.
Выход:
- `deckId` для каждой комнаты,
- вертикальные связи (lift/ladder/service shaft).

## Этап 4. Layout: из графа в геометрию
Вход: `rooms[]` (+ deckId), `G`, `symmetry/modularity/readability`.
Выход:
- формы комнат на сетке (rect/polygon),
- порты (куда подключать коридоры),
- первичные коридоры (пока как маршруты по сетке).

Два шага:
1) разместить комнаты (packing) с учётом “грамматики” (ship/station/outpost),
2) проложить коридоры (routing), вставить junctions.

## Этап 5. Layers
Построить дополнительные сети:
- вентиляция (vents),
- техтуннели (service),
- кабели/трубопроводы (cables/pipes),
- (опционально) безопасность: камеры, контрольные точки.

Слои возвращаются как отдельные сущности, но связаны с основными rooms/connectors.

## Этап 6. Валидация и скоринг
Проверки must‑pass:
- связность, отсутствие пересечений геометрии, корректные порты,
- соблюдение pressurization границ (airlock/bulkhead),
- достижимость critical узлов.

Скоринг:
- alt‑paths, loopiness achieved, choke points, readability, stealth coverage, combat spaces.

## Этап 7. Repair pass (авто‑починка)
Если нарушены must‑constraints или score ниже порогов — применить локальные изменения:
- добавить цикл,
- переместить/переупаковать кластер,
- вставить junction,
- добавить/убрать bulkhead,
- переразложить minor rooms по палубам,
- сократить “излишнюю сложность” (спрямить коридор/уменьшить повороты).

Repair обязан быть детерминированным (на RNG из seed).

## Этап 8. Экспорт MapJSON
Сериализация в контракт, стабильные ID, версия схемы, debug/trace (опционально).

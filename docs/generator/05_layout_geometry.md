# 05 — Геометрия: раскладка комнат и коридоров в 2D

## 5.1 Задача
Перевести `Graph` в:
- геометрию комнат (rect/polygon),
- порты на границах,
- маршруты коридоров (ортогональные сегменты),
- junction‑узлы.

Геометрия должна быть:
- без пересечений комнат,
- с “красивыми” коридорами (минимум лишних изгибов),
- читаемой при печати и в VTT.

## 5.2 Грамматика формы (layout grammar)
Выбирается по archetype/subtype/profile:

### Ship
- линейная ось (nose→aft),
- мостик ближе к носу/верх,
- инженерка ближе к корме,
- груз/док ближе к “внешней границе” корпуса.

### Station
- hub‑and‑spoke (хаб и рукава),
- ring (кольцо) — опция, часто в realism,
- кластерная модульность (ISS‑like) — при modularity↑.

### Outpost
- compact cluster (1–2 блока) на xs/s,
- pods‑network (несколько модулей) на m+,
- подуровень (bunker) чаще в realism/danger.

## 5.3 Размещение комнат (packing)
Рекомендуемая стратегия:
1) Разместить anchors (critical): ops/bridge, power/engineering, dock/airlock.
2) Вокруг каждого anchor разместить rooms его зоны (cluster packing).
3) Выравнивать по сетке, разрешать небольшие изменения размеров в рамках `sizeRange`.
4) При symmetry↑:
   - либо отражать layout относительно оси,
   - либо отражать только “внешний корпус”, а внутренности оставлять частично асимметричными.

## 5.4 Порты (ports)
Каждая комната получает набор потенциальных портов:
- центры сторон (N/E/S/W) + (опционально) дополнительные.
Порт выбирается роутером коридора так, чтобы:
- минимизировать длину,
- избегать пересечения других коридоров,
- учитывать “двери” (например, жилые комнаты не должны иметь 3 двери на улицу).

## 5.5 Роутинг коридоров
Требования:
- ортогональные сегменты (90°),
- штраф за поворот,
- штраф за “параллельные близко” (чтобы линии не слипались),
- максимальная длина сегмента и коридора (настройки).

Подход:
- A* на решётке препятствий (obstacles = комнаты + запрещённые зоны),
- после маршрута — simplification:
  - слияние коллинеарных сегментов,
  - удаление “зигзагов”,
  - сглаживание углов в рендере (отдельно, но маршруты должны быть чистыми).

## 5.6 Junctions (узлы)
Когда в точке сходятся 3+ коридора:
- вставить `junction` как отдельную сущность,
- у junction есть форма (крестовина, тройник, шлюз‑камера),
- junction может быть помечен как checkpoint (security) или bulkhead.

## 5.7 “Корпус” (контур)
Обязательно: генератор возвращает физический envelope объекта:
- ship: капсула/цилиндр/клин в зависимости от subtype,
- station: кольцо/хаб/ферма,
- outpost: периметр или “подземный контур”.

Envelope является геометрическим ограничением, а не декоративным слоем:
комнаты и маршруты обязаны оставаться внутри разрешённой области, а броня,
топливо, машины, вакуум, рельеф и другие structural voids остаются
непроходимыми.

Канонические координаты envelope задаются целыми fixed-point единицами:
`1 grid cell = 1024 geometry units`. Они не зависят от `gridSize`, zoom, DPI
или размеров Pixi canvas.

### Текущее состояние foundation

Occupancy-first генератор уже выполняет переходный bridge:

1. строит рабочую tile mask;
2. детерминированно трассирует границу всех non-VOID клеток;
3. переводит её в `MultiPolygon` с holes и disconnected polygons;
4. сохраняет результат в optional `deck.geometry.facilityEnvelope`;
5. адаптер редактора переводит geometry units в пиксели и рисует envelope.

Обратное направление vector→mask реализовано чистым rasterizer в
`src/geometry/`: клетка классифицируется по центру, outer boundary включается,
hole boundary исключается, а blocking structural void имеет приоритет.

Mask→polygon extraction является compatibility bridge для текущего
occupancy-first генератора. В целевой модели canonical vector остаётся
источником истины, а occupancy masks — вычисляемым кэшем.

Архетипный envelope в active V2 уже строится до zoning/rooms через
`carveHull(canvas, getDefaultHullConfig(archetype, subtype), rng, context)`:

- ship получает вытянутый корпус с меняющейся шириной носа/кормы;
- station сохраняет hub/ring negative space;
- outpost получает лопастной/модульный периметр вместо filled bounding box;
- clustered outpost возвращает стабильные `modules[]`/`links[]`, чтобы
  circulation использовала фактическую топологию корпуса, а не восстанавливала
  её по связным компонентам tile mask.

Acceptance-тесты проверяют containment всех сгенерированных клеток внутри
исходной hull mask, различимость этих трёх силуэтов и детерминизм tile mask /
экспортированного envelope.

Active V2 также выбирает первичную circulation по архетипу:

- ship: центральная продольная магистраль по наиболее длинному вертикальному
  сечению корпуса; XS/SM получают одну поперечную ветвь, MD+ — две;
- circular station: замкнутое ортогональное кольцо и 4/6/8 радиальных спиц в
  зависимости от `loopiness`;
- habitat station: замкнутое кольцо в доступной части аннулуса и четыре
  кардинальные спицы, заканчивающиеся у границы центрального hole;
- clustered outpost: первичные связи hub→satellite и дополнительные loop-связи,
  вероятность которых задаётся `loopiness`.

Station/outpost валидируют полный набор runs до первой мутации circulation.
Ship строит runs из фактических продольных сечений и поперечных spans корпуса;
его carving hull-contained, но пока не оформлен как отдельная атомарная
prevalidation-фаза. Ни одна стратегия не режет VOID исходной hull mask. Room
bays уже mask-aware и используют все runs, но пока остаются общей прямоугольной
стратегией. Semantic `structuralVoids`, service loop корабля, module-aware
zoning базы и polygon room editing ещё не реализованы.

Требования к визуальному языку, данным и приёмке определены в
`docs/specs/ARCHETYPE_MAP_VISUAL_SPEC.md`.

## 5.8 Выход геометрии
Для каждого deck:
- `geometry?` — legacy-compatible bridge:
  - `unitsPerCell: 1024`
  - `facilityEnvelope: MultiPolygon`
  - `structuralVoids: MultiPolygon[]`
- `rooms[].geometry` (rect/polygon)
- `ports[]` с координатами
- `connectors[].path` (polyline)
- `junctions[]`

Поле `geometry` остаётся optional, чтобы старые проекты продолжали
импортироваться. Текущий генератор заполняет `facilityEnvelope` из сохранённой
исходной hull mask. Замкнутые области negative space дополнительно
экспортируются в `structuralVoids`; генерация типизированных machinery/terrain
keepouts остаётся следующим этапом.

## 5.9 Preserved hull mask и structural integrity

Active V2 сохраняет `GridCanvas.originalHullMask` сразу после `carveHull()` и
до размещения circulation/rooms. Read-only validator проверяет:

- непустой и 4-связный facility footprint;
- отсутствие поздних `FLOOR`, `CORRIDOR`, `JUNCTION`, `DOOR` и `AIRLOCK` за
  пределами исходной mask;
- количество замкнутых structural voids;
- aspect ratio, bilateral symmetry и archetype-specific silhouette fit.

`facilityEnvelope` извлекается из сохранённой mask, поэтому ошибочная поздняя
мутация не меняет внешний контракт. Этот срез даёт validation/export, но пока
не добавляет subtype-specific dock appendages, machinery masses или ручной
modular hull editor.

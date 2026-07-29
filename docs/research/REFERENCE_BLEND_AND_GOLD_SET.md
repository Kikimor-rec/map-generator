# Reference Blend и собственный Gold Set

**Статус:** целевая исследовательская спецификация
**Дата проверки источников:** 2026-07-29
**Область:** генератор кораблей, станций и баз; редактор; Blueprint/print/player presentation
**Принцип:** проект заимствует общие картографические решения и проверяемые свойства, но не копирует конкретные карты, силуэты, графические assets, шрифты или точные палитры внешних авторов.

## 1. Назначение

Reference Blend превращает набор понравившихся примеров в формальную систему
требований. Он нужен для трёх задач:

1. направлять архитектуру генератора и редактора;
2. давать независимым критикам один и тот же словарь и scorecard;
3. оценивать приближение к целевому качеству без pixel similarity и копирования
   конкретной авторской карты.

Внешние источники используются только как research material. Эталонами visual
regression становятся исключительно созданные внутри проекта fixtures.

## 2. Reference Blend Matrix

Шкала свойств:

- `3` — основной источник правила;
- `2` — существенное влияние;
- `1` — отдельные приёмы;
- `0` — источник не используется в этой категории.

| Источник | Общий вес | Силуэт | Модульная грамматика | Плотность | Линии | Двери | Подписи | Асимметрия | Маршрутность |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Lazarus / Ship Catalog | 30% | 3 | 2 | 3 | 3 | 2 | 3 | 2 | 3 |
| Station Blueprint Designer | 18% | 3 | 3 | 1 | 2 | 0 | 0 | 3 | 1 |
| Mothership Map Viewer | 14% | 0 | 1 | 1 | 1 | 3 | 2 | 1 | 2 |
| Traveller deck plans | 10% | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| A Pound of Flesh | 9% | 1 | 3 | 2 | 1 | 1 | 2 | 2 | 3 |
| NEWT Blueprint Builder | 8% | 1 | 2 | 1 | 3 | 1 | 2 | 2 | 1 |
| Mappadux | 5% | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 |
| Derelict Ship Generator | 3% | 0 | 0 | 1 | 1 | 0 | 1 | 1 | 1 |
| Vaarnish Cartographer | 3% | 0 | 0 | 0 | 2 | 0 | 1 | 1 | 0 |

Общий вес показывает влияние на продукт в целом. Он не является лицензией на
заимствование и не означает, что результат должен быть визуально похож на
конкретное произведение.

## 3. Что берём и что не берём

| Источник | Берём | Не берём |
|---|---|---|
| Lazarus / Ship Catalog | Иерархию линий, интеграцию корпуса и интерьера, функциональные props, ограниченную палитру, main/support corridors, экономные подписи | Конкретные силуэты и планы, assets, названия, шрифты, точные цвета и авторские декоративные мотивы |
| Station Blueprint Designer | Модульную сборку контура, соединённые функциональные массы, быстрый kitbash, конструктивную асимметрию | Точные формы блоков, обязательную симметрию и ограничение только обзорным силуэтом |
| Mothership Map Viewer | Snap коридора к границе комнаты, endpoint markers, разные двери/airlocks/grates, внутренние стены, GM/player visibility | Универсальную прямоугольную комнату и точный внешний вид glyph |
| Traveller deck plans | Deck datum, масштаб, сетку, легенду, межпалубное соответствие, функциональную последовательность | Обязательную осевую симметрию, точные символы и устаревшую универсальную корабельную грамматику |
| A Pound of Flesh | Два масштаба представления станции, районы и модули, pointcrawl overview | Попытку превратить городскую станцию в одну battlemap и конкретную структуру Prospero's Dream |
| NEWT Blueprint Builder | Разделение MAP/PROPS, optional symmetry, библиотеку деталей, retro-terminal profile | Ручную поклеточную сборку как основной workflow, точные props, UI и шрифты |
| Mappadux | Отдельный player/presentation view, fog, projection scale, фильтры как профили показа | Расширение генератора до полноценного VTT и эффекты, ухудшающие читаемость |
| Derelict Ship Generator | Narrative/damage pass после построения геометрии: hazards, salvage, hidden areas | Замену физического deck plan абстрактным narrative graph |
| Vaarnish Cartographer | Быстрый reroll, low-fi/dither и двухцветный print profile | ASCII/terrain-грамматику в основной тактической карте |

## 4. Source и legal manifest

Каждый внешний источник регистрируется в research manifest. Минимальные поля:

| Поле | Назначение |
|---|---|
| `sourceId` | Стабильный внутренний идентификатор |
| `title` | Название источника |
| `creator` | Автор или организация |
| `canonicalUrl` | Каноническая публичная ссылка |
| `checkedAt` | Дата последней проверки |
| `sourceType` | `tool`, `map`, `catalog`, `game-book`, `research`, `viewer` |
| `accessStatus` | `public`, `owned`, `sample-only`, `unavailable` |
| `license` | Известная лицензия либо `unknown` |
| `allowedUse` | Разрешённое использование внутри проекта |
| `prohibitedUse` | Явно запрещённое использование |
| `observedProperties` | Абстрактные наблюдения, подтверждённые источником |
| `derivedRules` | Правила проекта, выведенные из нескольких наблюдений |
| `runtimeAssetsAllowed` | Всегда `false`, если нет отдельного явного разрешения |
| `trainingUseAllowed` | Всегда `false`, если нет отдельного явного разрешения |
| `localCopyPolicy` | Можно ли хранить локальную исследовательскую копию |
| `attributionNotes` | Требования к атрибуции |
| `reviewer` | Кто подтвердил запись |

Правила manifest:

- отсутствие указания лицензии означает `unknown`, а не разрешение;
- внешние изображения не входят в репозиторий без отдельного основания;
- URL и текстовые наблюдения допустимы, если не воспроизводят существенную
  часть авторского материала;
- runtime assets, visual snapshots и обучающие наборы создаются внутри проекта;
- exact palette, font, icon, module outline и room layout не переносятся из
  источника.

## 5. Собственный Gold Reference Set

Gold fixtures создаются с нуля и принадлежат проекту. Они не являются
перерисовками внешних карт.

| ID | Fixture | Проверяемые свойства |
|---|---|---|
| `G01` | `blunt-asymmetric-cargo` | Тупой нос, разновеликие грузовые массы, явный грузовой ingress, engine block |
| `G02` | `modular-salvage-cutter` | Kitbash, рабочий рукав, внешний salvage bay, конструктивная асимметрия |
| `G03` | `compact-industrial-tug` | Компактный силуэт без обязательного сужения, буксировочный узел, короткие маршруты |
| `G04` | `angular-military-transport` | Контролируемая симметрия, compartmentation, secure checkpoints, service bypass |
| `G05` | `ring-station-irregular-docks` | Регулярная несущая кольцевая структура и неравномерные пристыкованные массы |
| `G06` | `modular-truss-station` | Hub, фермы, независимые модули, читаемые docking collars |
| `G07` | `clustered-frontier-outpost` | Несколько корпусов, внешняя сеть, рельеф/опасность как часть карты |
| `G08` | `cargo-deck-logistics` | Путь docking-cargo-storage, main/support routes, отсутствие лишних поворотов |
| `G09` | `station-ring-and-hub-deck` | Ring-and-spoke, transit rooms вместо скопления junction, центр–периферия |
| `G10` | `external-airlock-chain` | Docking collar, внешняя дверь, airlock chamber, внутренняя дверь, pressure semantics |
| `G11` | `monochrome-print-profile` | Читаемость без цвета, масштаб, легенда, line hierarchy |
| `G12` | `retro-blueprint-profile` | Ограниченная палитра, слабая сетка, screen LOD, отсутствие декоративного шума |

Каждый fixture содержит:

- seed и полный generation config;
- JSON/SVG и PNG на `fit`, `100%` и print scale;
- ожидаемый abstract feature vector;
- обязательные hard gates;
- краткое описание демонстрируемых правил;
- автора, дату утверждения, версию и лицензию проекта.

Gold fixture изменяется только отдельным review-решением. Обновление snapshots
не должно автоматически изменять целевое качество.

## 6. Visual-review scorecard

Каждая категория оценивается от `0` до `5`.

| Категория | Вес |
|---|---:|
| Узнаваемость силуэта и архетипа | 15 |
| Связь корпуса, модулей и интерьера | 15 |
| Маршрутная ясность | 14 |
| TTRPG-тактика и игровой выбор | 12 |
| Семантическое отрицательное пространство | 10 |
| Двери, шлюзы и внешние ingress | 10 |
| Узнаваемость функций помещений | 8 |
| Blueprint line hierarchy | 8 |
| Конструктивная асимметрия | 5 |
| Подписи, LOD и экспорт | 3 |
| **Итого** | **100** |

Шкала:

- `0` — свойство отсутствует или сломано;
- `1` — формально присутствует, но практически непригодно;
- `2` — читается только после объяснения;
- `3` — рабочее базовое качество;
- `4` — уверенный целевой уровень;
- `5` — уровень утверждённого gold fixture.

Условия принятия:

- итоговый weighted score не ниже `80/100`;
- ни одна категория не ниже `3`;
- silhouette, hull/interior coherence и route clarity не ниже `4`;
- любая ошибка hard gate отклоняет результат независимо от score.

Регулярный review:

1. Изменение генератора создаёт contact sheet из 24 фиксированных seed.
2. Baseline и candidate показываются критикам без указания порядка.
3. Не менее двух независимых критиков заполняют scorecard.
4. Расхождение более чем на один балл обсуждается отдельно.
5. Review log сохраняет seed, config, commit, оценки и решение.
6. Дополнительно проверяются 6–12 случайных seed для поиска outlier.

## 7. Abstract feature vector

Оценка приближения выполняется по абстрактным свойствам, а не по пикселям
внешней карты.

### 7.1 Silhouette

- `aspectRatio`;
- `areaRatio`;
- `perimeterAreaRatio`;
- `majorMassCount`;
- `protrusionCount`;
- `concavityCount`;
- `minFeatureSize`;
- `perimeterTurnDensity`;
- `bilateralDifference`;
- `centerOfMassOffset`;
- `orientationConfidence`;
- coarse radial/Fourier contour descriptor.

### 7.2 Modules и occupancy

- `moduleCount`;
- `moduleTypeHistogram`;
- module adjacency graph;
- `roomAreaRatio`;
- `corridorAreaRatio`;
- `structuralAreaRatio`;
- `semanticVoidAreaRatio`;
- `unclassifiedInteriorRatio`;
- `usableInteriorCoverage`;
- `exteriorIngressCount`;
- `verticalConnectorCount`.

### 7.3 Circulation

- degree histogram;
- `cycleRank`;
- `deadEndRatio`;
- `junctionDensity`;
- `minJunctionSpacing`;
- `fourWayJunctionRatio`;
- median и p95 `bendCount`;
- median и p95 `detourRatio`;
- `mainRouteDominance`;
- `serviceBypassCount`;
- `transitRoomJunctionCount`;
- route redundancy между ingress и critical functions.

### 7.4 Doors и pressure

- `doorWallAlignmentRate`;
- `explicitEntranceRate`;
- `airlockChainValidityRate`;
- `pressureBoundaryCoverage`;
- `doorTypeLegibilityAtFit`;
- `doorStateTypeSeparation`.

### 7.5 Presentation

- line-weight ratios;
- `paletteEntropy`;
- grid-to-wall contrast;
- `labelOverlapCount`;
- `labelDoorOverlapCount`;
- `propCoverageByRole`;
- `roomRecognitionWithoutLabelRate`;
- minimum visible glyph size at fit;
- monochrome distinguishability.

Feature targets задаются диапазонами по archetype/subtype. Один универсальный
вектор для всех кораблей, станций и баз запрещён.

## 8. Novelty rule

Pixel similarity и image embedding distance до конкретной внешней карты не
используются как функция качества.

Candidate считается подозрительно близким к одному внешнему источнику, только
если одновременно выполняются несколько условий:

1. упрощённый contour descriptor ближе установленного порога;
2. совпадает последовательность крупных масс/выступов;
3. module adjacency graphs совпадают или почти изоморфны;
4. совпадает функциональное размещение ключевых помещений;
5. присутствует сходная комбинация декоративных мотивов.

Совпадение одной универсальной формы — кольца, прямоугольного грузового блока,
продольной оси — не является нарушением.

При срабатывании novelty rule кандидат:

- не удаляется безусловно;
- получает `referenceSimilarityWarning`;
- проходит независимый человеческий review;
- может быть перегенерирован с другим module composition seed.

Runtime никогда не использует внешний image asset, contour template, точный
palette hex, шрифт или набор room coordinates.

## 9. Hybrid procedural candidate pipeline

Рекомендуемый пайплайн:

1. **Functional program.** Rule-based graph grammar задаёт функции, зоны,
   adjacency, pressure/security и обязательные ingress.
2. **Module skeleton.** Constraint placement размещает крупные инженерные массы
   и задаёт module adjacency graph.
3. **Bounded variation.** Seeded RNG меняет размеры, стороны, docking, kitbash и
   степень асимметрии в пределах subtype profile.
4. **Vector hull.** Boolean union модулей формирует envelope; simplifier удаляет
   одноклеточные зубцы и слишком мелкие детали.
5. **Semantic structure.** Создаются machinery, fuel, shafts, structural voids,
   exterior pockets и traversable areas.
6. **Circulation.** Rectilinear router использует penalty за повороты, detour,
   соседние junction, crossings и прохождение через неподходящие зоны.
7. **Room grammar.** Комнаты заполняют разрешённые модули и следуют форме
   корпуса.
8. **Ingress/doors.** Создаются wall-aligned doors, docking collars и полные
   airlock chains.
9. **Props.** Room-role grammar обеспечивает узнаваемость функции.
10. **Presentation.** Независимый render profile применяет blueprint, print или
    player style.
11. **Validation/repair.** Hard gates запускают локальный repair или отклоняют
    candidate.
12. **Scoring/selection.** Прошедшие варианты ранжируются по нескольким целям.

LLM может предлагать функциональную программу, narrative state и критиковать
готовые варианты. Он не должен определять точные координаты базовой геометрии.

## 10. Candidate generation и selection

> Implementation status: active grid generation now uses a deterministic responsive pool (`4/4/3/2/2` for `XS/SM/MD/LG/XL`), hard rejection, three-objective Pareto fronts and a min-aware tie-break. The `24–48` pool, diversity selection, novelty checks and `Functional/Balanced/Expressive` finalists below remain the calibrated target, not current runtime behavior.
Рекомендуемый первый вариант реализации:

- 24–48 кандидатов на один пользовательский seed;
- дочерние seed вычисляются детерминированно:
  `hash(masterSeed, stage, candidateIndex)`;
- сначала применяются hard gates;
- затем строится Pareto frontier;
- diversity selection не допускает три почти одинаковых финалиста.

Основные оси Pareto ranking:

- structural validity;
- silhouette recognition;
- hull/interior coherence;
- route clarity;
- semantic-space coverage;
- TTRPG loop/chokepoint quality;
- functional recognizability;
- visual hierarchy;
- novelty и разнообразие относительно недавних результатов.

Пользователю предлагаются три результата:

- `Functional` — максимальная маршрутная ясность;
- `Balanced` — основной рекомендуемый вариант;
- `Expressive` — более сильная модульность и асимметрия при сохранении hard
  gates.

Нельзя сводить отбор к одному scalar aesthetic score: это приводит к
однообразным средним картам. Weighted score используется для quality threshold,
а не вместо Pareto и diversity.

## 11. Критерии приёмки

### 11.1 Hard gates

- 100% комнат, коридоров и дверей находятся в разрешённой геометрии.
- 0 маршрутов пересекают непроходимые structural voids.
- Карта связна в соответствии с functional program.
- 100% дверей совпадают со стеной и соответствующим маршрутом.
- 100% внешних ingress имеют валидную шлюзовую цепочку, если pressure profile
  требует airlock.
- Не менее 80% площади внутри envelope, не занятой комнатами/коридорами,
  классифицировано семантически.
- Нет одиночных одноклеточных зубцов контура.
- Один seed и config дают идентичный сериализованный результат и ranking.

### 11.2 Геометрия и маршруты

- Медиана поворотов логического маршрута не выше 2, p95 не выше 4.
- Обычный detour ratio не выше 1.35; обоснованный обход препятствия не выше 1.7.
- Между degree 3+ junction не менее трёх клеток; более близкие объединяются в
  transit room/lobby.
- Четырёхлучевые перекрёстки являются редким исключением.
- MD+ имеет минимум один альтернативный маршрут вокруг не-final chokepoint.
- Каждый critical function доступен от допустимого ingress.

### 11.3 Визуальная и игровая проверка

- Weighted visual score не ниже `80/100`.
- Silhouette, hull/interior coherence и route clarity не ниже `4/5`.
- Не менее 70% ключевых помещений узнаются без подписи.
- Door glyph различим на fit и занимает минимум 6–8 экранных пикселей.
- Подписи не пересекают двери и критические тактические клетки.
- Blueprint остаётся различимым в monochrome print profile.
- В слепом тесте не менее 80% участников отличают ship/station/base по одному
  силуэту.
- Не менее 70% участников различают целевые ship subtype без заголовка.
- Из 24 фиксированных и 6–12 случайных seed нет hard-gate failure или явного
  визуального outlier.

## 12. Ограничения

- Общие инженерные формы не являются уникальной интеллектуальной собственностью;
  novelty rule должен учитывать сочетание нескольких признаков, чтобы не
  запрещать кольца, фермы или продольные корпуса.
- Веса Reference Blend являются продуктовым решением и могут меняться только с
  записью причины в review log.
- Обучаемый aesthetic ranker не нужен на первом этапе. Если он появится, его
  обучают только на собственных оценённых outputs проекта.
- Внешние авторские изображения и assets в этот документ и репозиторий не
  включаются.

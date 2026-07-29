# ADR: технологическая архитектура генератора и редактора карт

**Статус:** принято как целевое направление
**Дата:** 2026-07-28
**Связанная спецификация:** `docs/specs/ARCHETYPE_MAP_VISUAL_SPEC.md`

## 1. Решение

Проект остаётся браузерным приложением на TypeScript, React и Vite. PixiJS
остаётся интерактивным GPU-рендерером, но перестаёт быть источником данных.
Канонический документ карты хранит целочисленные векторные контуры; генератор,
роутер и валидатор работают с occupancy mask на дискретной сетке. Тяжёлая
генерация выполняется в module Web Worker. Состояние редактора постепенно
сводится к одному Zustand store с Immer patches. JSON проходит версионированную
runtime-валидацию, большие проекты сохраняются в IndexedDB. Визуальные и
геометрические инварианты проверяются Vitest, property-based тестами и
Playwright visual regression.

## 2. Почему не нужна смена платформы

Текущая задача — сложный интерактивный 2D-редактор, генератор и экспорт для
браузера/Foundry VTT. Она не требует игрового движка, desktop runtime или 3D.

| Вариант | Сильная сторона | Решение |
|---|---|---|
| PixiJS | Быстрый GPU 2D scene graph | Оставить; уже интегрирован |
| Konva | Готовые controls и hit graph | Миграция не решает геометрию |
| Fabric.js | Object model и SVG import/export | Слишком связывает document и canvas objects |
| SVG DOM | Нативный вектор и простой экспорт | Дорог на большой сетке и тысячах props |
| Three.js | 3D/WebGL сцены | Избыточен для плоской карты |
| Godot/Unity/Electron | Desktop/game tooling | Ухудшает web/Foundry-интеграцию |

PixiJS используется как projection канонической модели, а не как сериализуемая
модель карты. Это позволяет позже заменить renderer без миграции документов.

## 3. Слои системы

```text
React UI
  -> editor commands / selectors
  -> canonical MapDocument
  -> geometry kernel
  -> generation + validation worker
  -> render scene projection
  -> Pixi preview | SVG/PNG export
```

Целевые границы:

- `src/domain/` — MapDocument, ids, units, schema versions, commands;
- `src/geometry/` — polygons, masks, rasterization, contours, spatial queries;
- `src/generation/` — archetype strategies и seeded pipeline;
- `src/validation/` — invariants, diagnostics и repair proposals;
- `src/rendering/` — renderer-neutral scene и render profiles;
- `src/workers/` — typed message protocol и generation worker;
- `src/persistence/` — migrations, IndexedDB, import/export;
- `src/ui/` — React panels и Pixi interaction adapter.

Monorepo пока не нужен. Сначала нужны чистые границы импортов внутри `src`.

## 4. Геометрия: vector + occupancy

### 4.1 Канонический vector layer

Envelope, structural voids, zones, комнаты и площадки хранятся как Polygon или
MultiPolygon с holes. Координаты — целые fixed-point units:

- `1 grid cell = 1024 geometry units`;
- преобразование в экранные пиксели выполняет только renderer adapter;
- сериализованные координаты не зависят от zoom, DPI или canvas.

### 4.2 Occupancy layer

Для каждого deck/level из vector layer строятся вычисляемые typed arrays:

- `Uint8Array` для tile class / permissions;
- `Uint16Array` или `Uint32Array` для zone/room ownership;
- masks для walkable, structural, exterior и reserved.

На них выполняются A*/wavefront routing, dilation/erosion, flood fill,
connectivity, distance fields, packing и проверки envelope/voids. Эти masks —
cache, а не второй формат сохранения.

Преобразования:

- vector -> mask: детерминированный scanline rasterizer;
- mask -> preview: boundary tracing + collinear simplification;
- экспорт использует canonical vector, а не восстановленный preview contour.

### 4.3 Геометрические зависимости

Первый выбор для boolean operations — `polygon-clipping`: он принимает
Polygon/MultiPolygon, выполняет union/intersection/difference/xor и возвращает
нормализованный MultiPolygon.

Offset сначала выполняется на occupancy mask. Не следует сразу брать случайный
JavaScript-port Clipper: это критическое ядро, а у официального Clipper2 нет
первичного TypeScript distribution. Если grid offset станет недостаточен,
проводится spike официального Clipper2 C++ -> WASM за интерфейсом
`GeometryKernel`; решение принимается по correctness corpus, bundle и p95.

`RBush` добавляется как broad-phase spatial index, когда профилирование покажет
дорогие линейные hit/collision queries. Точные polygon tests остаются в ядре;
R-tree хранит только bounding boxes и candidate ids.

## 5. Генерация по стратегиям

Общий pipeline остаётся один, но envelope, zoning и circulation получают
архетипные стратегии:

```ts
interface ArchetypeStrategy {
  buildEnvelope(context: GenerationContext): FacilityEnvelope
  reserveStructure(context: GenerationContext): StructuralVoid[]
  assignZones(context: GenerationContext): ZonePolygon[]
  carvePrimaryCirculation(context: GenerationContext): OccupancyMask
  validateSemantics(document: MapDocument): Diagnostic[]
}
```

- `ShipStrategy`: bow/aft axis, longitudinal spine, hull-following rooms;
- `StationStrategy`: hub/ring/truss, radial circulation, perimeter docking;
- `OutpostStrategy`: terrain parcel, separated modules, exterior network.

Seeded RNG передаётся явно. В pure core запрещены `Math.random()`, время,
runtime ids и зависимость от порядка ключей объекта.

## 6. Web Worker

Generation, validation и expensive repair работают вне main thread. Vite
поддерживает стандартный module worker:

В проекте уже есть `src/workers/generation.worker.ts`; его нужно сохранить и
усилить, а не создавать параллельную реализацию.

```ts
new Worker(new URL('./generation.worker.ts', import.meta.url), {
  type: 'module',
})
```

Протокол — discriminated union с `requestId`, progress, result, error и cancel.
Masks передаются как transferable `ArrayBuffer`, чтобы не копировать XL-карты.
Worker не импортирует React, Pixi или DOM.

На первом этапе используется нативный `postMessage`: один явный protocol легче
тестировать, версионировать и отменять. Comlink допустим позже, если RPC surface
вырастет; сейчас он не улучшает cancellation/progress.

## 7. Renderer

Сейчас:

- сохранить PixiJS 7 во время изменения доменной модели;
- выделить `MapSceneBuilder` и тонкий `PixiRendererAdapter`;
- не хранить смысл карты в `Graphics`, `Container` и hit areas;
- перерисовывать изменённые слои, а не всю сцену из React effect.

После renderer-neutral scene выполнить отдельную миграцию на PixiJS 8. Это
breaking migration, её нельзя смешивать с envelope/schema rewrite. В production
сначала использовать стабильный WebGL renderer; WebGPU оставить opt-in до
совпадения browser behavior и visual fixtures.

Слои scene: terrain, grid, envelope/structure, rooms/corridors, props,
labels/annotations, selection/guides, GM overlay. Статические слои кэшируются
отдельно; grid не создаёт интерактивный object на каждую клетку.

## 8. Состояние и undo

В репозитории сейчас существуют две реализации: `EditorContext.tsx` на
`useReducer` и почти неиспользуемый `editorStore.ts` на Zustand. Поддерживать
обе нельзя.

Целевое решение:

- один normalized Zustand store;
- узкие selectors для React;
- typed commands для изменений документа;
- Immer patches/inverse patches вместо JSON deep clone всех decks;
- transient viewport, hover и drag вне document history;
- одна пользовательская операция = одна history transaction.

Миграция выполняется по feature slice. Старый store удаляется только после
parity tests; переписывать весь UI одним коммитом нельзя.

## 9. Схема и persistence

`MapDocument` получает `format`, `schemaVersion`, `generatorVersion`, `units`,
stable ids, geometry, layers и render profile. На import/autosave/worker boundary
документ проходит runtime validation. Предпочтителен Zod: схема валидирует
данные и выводит TypeScript type. Каждая версия имеет чистую migration function
и fixture «старый JSON -> текущий JSON».

Хранение:

- `localStorage`: preferences, последний project id и аварийный минимум;
- IndexedDB через `idb`: документы, revisions и asset metadata;
- JSON file: переносимый источник истины;
- assets: Blob/File references, не base64 в каждом history entry.

Autosave транзакционный: сначала новая revision, затем `currentRevision`.
Повреждённая запись не перетирает последнюю валидную.

## 10. Экспорт

Renderer-neutral scene имеет backends:

- PixiJS — интерактивный preview;
- SVG emitter — векторная печать, legend и technical sheet;
- Pixi render texture — PNG/WebP для VTT;
- JSON — редактируемый проект.

PDF сначала получается из SVG с фиксированным page layout. PDF-библиотека
добавляется только при необходимости многостраничности, embedded fonts и сложной
пагинации. Overview и playable deck строятся из одного MapDocument.

## 11. Тестовая архитектура

- **Vitest:** geometry, strategies, migrations, commands, fixed-seed golden JSON
  и input state machines.
- **fast-check:** seed/options/polygon cases; отсутствие crashes/NaN,
  детерминизм, containment, boolean identities, repair monotonicity.
- **Playwright:** реальные pointer/keyboard flows, short right click vs drag,
  import/export round trip и visual snapshots трёх архетипов.

Visual baseline запускается в фиксированной Chromium/OS/font среде. Pixel diff
проверяет renderer, а semantic invariants — корректность карты.

## 12. Что не добавлять сейчас

- backend, аккаунты, CRDT и multiplayer до реальной задачи sharing;
- WebGPU-only renderer;
- 3D/isometric geometry как источник истины;
- physics engine или тяжёлый GIS stack;
- нестабильный polygon offset port без correctness corpus;
- сериализацию Pixi/Konva/Fabric object graph;
- второй state store.

## 13. Порядок внедрения

1. Исправить ПКМ-pan и закрепить input regression test.
2. Ввести GeometryUnits, polygon types, MapDocumentV2 и Zod migrations.
3. Добавить vector->mask rasterizer и маски envelope/voids.
4. Изолировать pure core и укрепить typed protocol существующего Worker.
5. Реализовать три archetype strategies и semantic invariants.
6. Выделить renderer-neutral scene, SVG exporter и Lazarus render profile.
7. Консолидировать store и patch-based undo.
8. Добавить IndexedDB и versioned recovery.
9. После стабилизации scene adapter мигрировать PixiJS 7 -> 8.

## 14. Обязательные technology spikes

1. **Polygon correctness:** 1000 generated polygon pairs + pathological fixtures.
2. **Performance:** S/M/L/XL, по 100 seed, p50/p95 generation и validation.
3. **Worker transfer:** clone vs transferable masks.
4. **Renderer:** 100/500/2000 props, pan/zoom FPS и frame time.
5. **Bundle:** geometry/WASM/render chunks.
6. **Migration:** импорт всех существующих JSON fixtures в MapDocumentV2.

Критерий выбора — не популярность библиотеки, а воспроизводимая корректность на
наших картах, приемлемый p95 и заменяемость реализации за интерфейсом.

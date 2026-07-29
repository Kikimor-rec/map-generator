# План разработки: 2D-редактор sci-fi карт

## Легенда статусов
- ✅ Готово
- 🔄 В процессе
- ❌ Не начато
- ⚠️ Частично реализовано

---

## Источники требований
- Основная спецификация: `docs/spec/*.md`
- UI/QOL руководства: `docs/ui-qol/*.md`
- Правила имплементации: см. раздел "Правила имплементации новых механик"

---

## Фаза 1: Базовая инфраструктура

### 1.1 Настройка проекта
| Задача | Статус | Примечания |
|--------|--------|------------|
| Инициализация Vite + React + TypeScript | ✅ | vite 6.4.1, react 18.3.1 |
| Настройка Tailwind CSS | ✅ | Кастомная sci-fi палитра |
| Настройка path aliases (@core, @ui, @store, @generators) | ✅ | tsconfig.json |
| Подключение PixiJS | ✅ | pixi.js 7.4.2 |
| Структура папок | ✅ | src/core, ui, store, generators |

### 1.2 Управление состоянием
| Задача | Статус | Примечания |
|--------|--------|------------|
| Определение типов данных (Room, Corridor, Deck, Project) | ✅ | src/core/types.ts |
| State management (React Context + useReducer) | ✅ | Заменил Zustand из-за infinite loop |
| Actions для всех операций | ✅ | actions object в EditorContext |
| Selectors (activeDeck, rooms, corridors) | ✅ | useEditor hook |

### 1.3 Базовый UI макет
| Задача | Статус | Примечания |
|--------|--------|------------|
| EditorLayout (основной макет) | ✅ | Toolbar, Canvas, Panels |
| TopBar (меню, кнопки) | ✅ | New, Open, Save, Export, Generate |
| Toolbar (панель инструментов) | ✅ | Select, Room, Corridor, и др. |
| RightPanel (свойства) | ✅ | Room properties, библиотека типов |
| StatusBar | ✅ | Zoom, position info |
| DeckTabs | ✅ | Переключение палуб |

---

## Фаза 2: Канвас и базовое редактирование

### 2.1 PixiJS Canvas
| Задача | Статус | Примечания |
|--------|--------|------------|
| Инициализация PixiJS Application | ✅ | PixiJS 7.x API |
| Рендеринг сетки | ✅ | Динамическая при zoom |
| Zoom (колесо мыши) | ✅ | К позиции курсора |
| Pan (перемещение) | ✅ | ПКМ или средняя кнопка |
| Viewport transform | ✅ | x, y, zoom |

### 2.2 Рисование комнат
| Задача | Статус | Примечания |
|--------|--------|------------|
| Инструмент Room (рисование прямоугольником) | ✅ | Drag для создания |
| Preview при рисовании | ✅ | Полупрозрачный прямоугольник |
| Snap to grid | ✅ | Настраиваемый |
| Рендеринг комнат | ✅ | Цвет по типу, границы |
| Отображение имени комнаты | ✅ | Text в центре |
| Отображение иконки типа | ✅ | Emoji в углу |
| Круглые комнаты (shape: circle) | ❌ | radius property |
| Shape Subtract mode (вырезание ниш) | ❌ | Boolean operations для сложных форм |

### 2.3 Выделение и редактирование
| Задача | Статус | Примечания |
|--------|--------|------------|
| Инструмент Select | ✅ | Клик для выбора |
| Подсветка выбранной комнаты | ✅ | Зелёная рамка + glow |
| Подсветка при hover | ✅ | Голубая рамка |
| Перемещение комнат (drag) | ⚠️ | Базовый single-room drag; dependent doors/objects, containment и reroute см. `EDITOR_UX_BACKLOG.md` |
| Изменение размеров (resize handles) | ⚠️ | 8 маркеров есть; dependent geometry и collision contract не реализованы |
| Удаление комнат (Delete key) | ✅ | Работает |
| Множественное выделение | ⚠️ | Same-type selection есть; mixed/group drag и Shift-marquee неполны |

### 2.4 Коридоры
| Задача | Статус | Примечания |
|--------|--------|------------|
| Рендеринг коридоров | ✅ | segments с start/end |
| Инструмент Corridor (рисование) | ✅ | Клик для точек, двойной клик/Enter для завершения |
| Preview при рисовании коридора | ✅ | Линии + точки |
| Перемещение коридоров | ⚠️ | Whole-path translate есть; attachments, locks и collision-aware commit неполны |
| Редактирование коридоров | ⚠️ | Drag точек/double-click есть; perpendicular segment drag и locked waypoints не готовы |
| Автопривязка к комнатам | ⚠️ | Manual wall attachment есть; generated grid corridors импортируются без editor attachments |
| A* авто-роутинг | ✅ | corridorRouter.ts |
| Плавные углы | ⚠️ | Aggregate corridor skin в MapCanvas; true fillet/boolean outline ещё нужен |
| T-образные пересечения | ⚠️ | Junction топология есть; normal view скрывает markers, selected/debug view показывает |
| Система портов | ⚠️ | Типы N/E/S/W, fixed/sliding есть; canonical end-to-end anchors ещё не внедрены |
| Waypoints (locked/auto) | ⚠️ | Типы есть, locked waypoints + reroute Phase 3 |
| Line Jumps | ⚠️ | Типы arc/gap/sharp определены, рендеринг не реализован |
| Straightness/wander параметр | ❌ | Контроль прямолинейности (связан с bendPenalty) |

### 2.4.1 Post-generation editing contract
| Задача | Статус | Примечания |
|--------|--------|------------|
| Единый backlog и acceptance matrix | ✅ | `docs/EDITOR_UX_BACKLOG.md` |
| Canonical endpoint anchors | ⚠️ | Generated exact anchors и manual endpoint snap готовы; stable corridor-point schema/migration остаются |
| Preserve attachments default + Alt override + постоянный toggle | ⚠️ | Persistent toggle, room/endpoint Alt-инверсия и snap preview готовы; explicit actions и остальные drag machines впереди |
| Dependent room/door/object move и resize | ⚠️ | Move world-position contents готов; local schema/resize впереди |
| Dirty incremental reroute | ⚠️ | Attached room routes + room obstacles + whole-gesture noPath rollback готовы; hull/void/locked впереди |
| Locked waypoints при reroute | ❌ | Auto geometry меняется, locked geometry сохраняется |
| Atomic undo, Esc rollback и pointer capture | ⚠️ | Room/endpoint snapshots, Esc rollback и window mouseup готовы; pointercancel/no-op/единая command model впереди |
| Orthogonal model invariant | ⚠️ | Generated/imported/endpoint-edit paths H/V; schema validator и segment-drag ещё нужны |
| Facility envelope/hull/background composition epic | ⚠️ | Generated envelope есть; manual modular ship/station/base workflow отсутствует |

### 2.5 Внутренние стены и перегородки
| Задача | Статус | Примечания |
|--------|--------|------------|
| Wall Tool (внутренние стены) | ❌ | Перегородки внутри комнат |
| Wall styles (solid/dashed/dotted) | ❌ | Для secret barriers |
| Standalone walls (вне комнат) | ❌ | Для открытых зон |

---

## Фаза 3: Генерация карт

### 3.1 Алгоритм генерации
| Задача | Статус | Примечания |
|--------|--------|------------|
| Класс MapGenerator (legacy) | ✅ | src/generators/mapGenerator.ts |
| Новый 8-этапный пайплайн | ✅ | src/generators/generator.ts |
| Seeded RNG (mulberry32) | ✅ | src/generators/rng.ts |
| Каталог типов комнат (40+) | ✅ | src/generators/roomConfigs.ts |
| Room Program генератор | ✅ | Зоны, приоритеты |
| Topology Graph генератор | ✅ | Backbone, clusters, loops |
| Layout Geometry генератор | ⚠️ | Active V2 использует hull-aware `carveHull` и архетипную primary circulation; room bays пока общие rectangular mask-aware |
| Генерация коридоров | ✅ | V2 carves corridor/door/floor tiles first, then extracts graph edges |
| Параметры генерации | ✅ | archetype, subtype, sizeTier, loopiness, danger |
| Пресеты кораблей | ✅ | GENERATION_PRESETS + ARCHETYPE_CONFIGS |

### 3.1.1 Визуальная грамматика архетипов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Целевая спецификация ship/station/outpost | ✅ | `docs/specs/ARCHETYPE_MAP_VISUAL_SPEC.md` |
| Обязательный facility envelope в схеме и экспорте | ⚠️ | Hull-aware mask→MultiPolygon export, Pixi render, containment/determinism/silhouette tests готовы; legacy bridge пока optional |
| Structural voids / keepout zones | ⚠️ | Schema/render bridge есть; генератор пока экспортирует `[]`, семантика и размещение впереди |
| Архетипные circulation strategies | ⚠️ | Ship central longitudinal + 1/2 transverse; circular station closed ring + 4/6/8 spokes; habitat ring + 4 cardinal spokes; clustered outpost primary/optional loop network |
| Overview + playable deck | ❌ | Связанные представления с общими connector ids |
| Функциональные props по room role | ❌ | Помещение узнаваемо без подписи |
| Lazarus-подобный render profile | ❌ | Ограниченная палитра, line weights, grid, legend |
| Visual-regression fixtures архетипов | ❌ | Различимость по силуэту без подписей |

### 3.2 UI генерации
| Задача | Статус | Примечания |
|--------|--------|------------|
| GenerationPanel (диалог настроек) | ✅ | Полностью переработан |
| Выбор архетипа/подтипа | ✅ | ship/station/outpost + подтипы |
| Выбор размера (XS-XL) | ✅ | 4-128+ комнат |
| Профиль стиля | ✅ | utilitarian, military, luxury, etc. |
| Настройка loopiness/danger | ✅ | Слайдеры 0-1 |
| Seed для воспроизводимости | ✅ | Текстовое поле + рандомизация |

### 3.3 Логика планировки
| Задача | Статус | Примечания |
|--------|--------|------------|
| Правила размещения типов | ✅ | roomConfigs с countRules |
| Группировка по зонам | ✅ | Ship bands, station radial zones, clustered-outpost nearest-module zones |
| Функциональное archetype-aware placement | ⚠️ | Active occupancy scorer + outpost module metadata; rectangular bays, без global adjacency solve и props |
| Валидация связности | ✅ | Active V2: physical-grid connectivity + critical entry reachability |
| Предупреждения о нелогичности | ⚠️ | Structured read-only playability report готов; UI review/quick-fix ещё нет |

---

## Фаза 4: Типы помещений и темы

### 4.1 Система типов комнат
| Задача | Статус | Примечания |
|--------|--------|------------|
| Enum RoomType (30+ типов) | ✅ | src/core/types.ts |
| ROOM_TYPE_CONFIGS (иконки, цвета) | ✅ | Для каждого типа |
| Выбор типа при создании | ✅ | В RightPanel |
| Смена типа существующей комнаты | ✅ | Dropdown в RightPanel при выборе комнаты |

### 4.2 Темы оформления
| Задача | Статус | Примечания |
|--------|--------|------------|
| Определение тем (Blueprint, Terminal, etc.) | ✅ | THEMES в types.ts |
| Переключение тем | ✅ | В TopBar или RightPanel |
| Применение темы к канвасу | ✅ | Фон, цвета сетки |

### 4.3 Кастомизация цветов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Индивидуальный цвет комнаты | ✅ | Палитра + пользовательский |
| Палитра цветов | ✅ | Пресеты + color picker |
| Пипетка | ❌ | |
| Прозрачность | ❌ | |

---

## Фаза 5: Объекты и интерьер

### 5.1 Система объектов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Типы объектов (MapObject, ObjectType) | ✅ | В types.ts |
| Каталог объектов по категориям | ❌ | |
| Библиотека объектов в UI | ❌ | |

### 5.2 Размещение объектов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Инструмент Object | ❌ | |
| Drag & drop объектов | ❌ | |
| Вращение объектов | ❌ | |
| Snap объектов к сетке | ❌ | |

### 5.3 Авто-обстановка
| Задача | Статус | Примечания |
|--------|--------|------------|
| Алгоритм заполнения по типу комнаты | ❌ | |
| Шаблоны расстановки | ❌ | |
| Кнопка "Сгенерировать интерьер" | ❌ | |

---

## Фаза 6: Двери и соединения

### 6.1 Система дверей
| Задача | Статус | Примечания |
|--------|--------|------------|
| Типы дверей (DoorType) | ✅ | В types.ts |
| Инструмент Door | ✅ | Клик у стены комнаты |
| Размещение дверей на стенах | ✅ | Автоопределение ближайшей стены |
| Отрисовка дверей | ✅ | Цвет по типу |
| Автоматические двери при генерации | ✅ | Все room ports получают standard/secure/bulkhead/airlock semantic; MapJSON/editor bridge готов |
| Pressurization graph и полный двухстворчатый шлюз | ❌ | Есть pressure intent metadata, но нет external second hatch/compartment solve |

### 6.2 Расширенная система коридоров
| Задача | Статус | Примечания |
|--------|--------|------------|
| Типы портов (Port) | ✅ | corridorTypes.ts |
| Типы waypoints (locked/auto) | ✅ | corridorTypes.ts |
| CorridorRouter класс | ✅ | corridorRouter.ts |
| A* поиск пути с turn penalty | ✅ | Избегает комнат и коридоров |
| Stubs от портов | ✅ | Настраиваемая длина |
| Junction типы (T/X/hub) | ✅ | corridorTypes.ts |
| Line Jump стили | ✅ | arc/gap/sharp/none |
| IntersectionPolicy | ✅ | avoid/junction/lineJump |
| CorridorRouterSettings | ✅ | Настройки движка |

### 6.3 Coalesce (слияние) коридоров
| Задача | Статус | Примечания |
|--------|--------|------------|
| Типы CoalesceSettings | ✅ | corridorTypes.ts |
| TypeMergePolicy / LayerMergePolicy | ✅ | corridorTypes.ts |
| NormalizedSegment и хеширование | ✅ | corridorTypes.ts |
| Алгоритм канонизации сегментов | ✅ | corridorCoalesce.ts |
| Дедупликация сегментов | ✅ | corridorCoalesce.ts |
| Обнаружение частичного перекрытия | ✅ | corridorCoalesce.ts |
| Создание junction при слиянии | ✅ | corridorCoalesce.ts |
| A* prefer-reuse интеграция | ✅ | corridorRouter.ts (reuseBonus) |
| Simplify pass | ✅ | corridorCoalesce.ts (simplifyCorridorPath) |
| UI toggle в GenerationPanel | ✅ | Advanced corridor settings секция |
| Unit тесты coalesce | ✅ | 24 тестов проходят |

### 6.4 Routing Intelligence (расширенный A*)
| Задача | Статус | Примечания |
|--------|--------|------------|
| RoutingCostConfig типы | ✅ | corridorTypes.ts |
| CrossingPolicy типы | ✅ | corridorTypes.ts |
| JunctionRules типы | ✅ | corridorTypes.ts |
| TTRPGRoutingConstraints типы | ✅ | corridorTypes.ts |
| DebugOverlayOptions типы | ✅ | corridorTypes.ts |
| StyleProfileId / RoutingStyleProfile | ✅ | corridorTypes.ts |
| REALISM_PROFILE / FUTURISM_PROFILE | ✅ | corridorTypes.ts |
| Cost function в A* | ✅ | corridorRouter.ts (bend/crossing/nearMiss/reuse) |
| Junction split алгоритм | ❌ | corridorPostProcess.ts |
| Junction merge/relax | ❌ | corridorPostProcess.ts |
| Beautify pass (ортогонализация) | ❌ | corridorPostProcess.ts |
| TTRPG метрики расчёт | ✅ | `playabilityValidator.ts`; compact report экспортируется в `meta.ttrpgMetrics` |
| Валидация нелинейности | ⚠️ | Cycle rank + edge-redundant critical pairs готовы; semantic service/vent paths впереди |
| Primary spine / Secondary connectors | ⚠️ | Active V2: все runs hull-contained; station/outpost atomic prevalidation, ship пока нет; legacy `generator.ts` не переведён |
| Redundancy pass (петли) | ⚠️ | Station/outpost используют `loopiness`; ship service loop ещё не реализован |
| UI: Routing секция в GenerationPanel | ✅ | Advanced corridor settings с sliders |
| Debug overlay рендеринг | ❌ | MapCanvas.tsx |

### 6.5 Переходники
| Задача | Статус | Примечания |
|--------|--------|------------|
| Шлюзы между разными типами | ⚠️ | Типы определены |
| Лестничные узлы | ❌ | |
| Лифтовые шахты | ❌ | |

---

## Фаза 7: Слои и аннотации

### 7.1 Обязательные слои
| Задача | Статус | Примечания |
|--------|--------|------------|
| Определение слоёв (Layer type) | ✅ | В types.ts |
| Architecture layer (комнаты/коридоры/стены) | ⚠️ | Неявно существует |
| Props/Icons layer | ❌ | Отдельно от архитектуры |
| Labels/Text layer | ❌ | Аннотации |
| Overlays layer | ❌ | Fog, grid, debug |
| UI переключения слоёв | ❌ | |
| Скрытие/показ слоёв | ❌ | |
| Блокировка слоёв | ❌ | |
| Solo layer (показать только один) | ❌ | |
| Props layer не мешает архитектуре | ❌ | Отдельный selection/visibility |

### 7.2 Вентиляция и коммуникации
| Задача | Статус | Примечания |
|--------|--------|------------|
| Рисование воздуховодов | ❌ | |
| Рисование проводки | ❌ | |
| Отображение на отдельном слое | ❌ | |

### 7.3 Аннотации
| Задача | Статус | Примечания |
|--------|--------|------------|
| Инструмент Annotate | ❌ | |
| Текстовые метки | ❌ | |
| Стрелки и линии | ❌ | |
| Нумерация комнат | ❌ | |
| Легенда карты | ❌ | |

---

## Фаза 8: Пресеты и шаблоны

### 8.1 Пользовательские пресеты
| Задача | Статус | Примечания |
|--------|--------|------------|
| Сохранение комнаты как пресета | ❌ | |
| Библиотека пресетов | ❌ | |
| Вставка пресета на карту | ❌ | |

### 8.2 Встроенные пресеты
| Задача | Статус | Примечания |
|--------|--------|------------|
| Стандартные модули (шлюз, мостик, etc.) | ❌ | |
| Импорт/экспорт пресетов | ❌ | |

---

## Фаза 9: Экспорт и сохранение

> **Важно**: При реализации экспорта обязателен **Printer-Friendly режим** (см. 06_export_import_vtt_print.md)

### 9.1 Сохранение проекта
| Задача | Статус | Примечания |
|--------|--------|------------|
| Save as JSON | ✅ | Download файла |
| Open JSON | ✅ | Загрузка проекта |
| Auto-save (localStorage) | ✅ | С debounce 2 сек |
| Crash recovery | ❌ | Восстановление при перезагрузке вкладки |
| Snapshots (именованные версии) | ✅ | SnapshotsPanel подключён в TopBar |

### 9.2 Экспорт изображений
| Задача | Статус | Примечания |
|--------|--------|------------|
| Export PNG | ✅ | С preserveDrawingBuffer |
| Export WebP | ❌ | С настройками качества |
| Export SVG | ❌ | Схемный режим |
| pixels-per-cell настройка | ❌ | |
| include grid опция | ❌ | |
| include background опция | ❌ | |
| crop to bounds / full canvas | ❌ | |
| naming template | ❌ | `{mapName}_{grid}_{pxPerCell}_{seed}` |

### 9.3 Печать: Multi-page PDF (ОБЯЗАТЕЛЬНО Printer-Friendly)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Export PDF | ❌ | |
| Print Preview режим | ❌ | Границы страниц, поля, "склейка" |
| Выбор paper size | ❌ | A4/A3/Letter |
| Настройка margins | ❌ | мм/см/дюймы |
| Настройка print DPI | ❌ | 72-600 DPI |
| real-world cell size | ❌ | 1 inch / 25.4mm стандарт |
| overlap для склейки | ❌ | |
| Выбор слоёв для экспорта | ❌ | |
| Высокий контраст / ч/б режим | ❌ | Printer-friendly mode |

### 9.4 VTT-экспорт
| Задача | Статус | Примечания |
|--------|--------|------------|
| Export walls | ❌ | |
| Export doors (type + state) | ❌ | |
| Export windows | ❌ | Отдельный тип |
| Export lights | ❌ | |
| Export grid size + scale | ❌ | |
| Export notes | ❌ | |
| Universal VTT формат (dd2vtt/uvtt) | ❌ | |
| VTT Preview режим | ❌ | Визуализация walls/doors/windows |

### 9.5 Foundry экспорт (опционально)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Export as Foundry Module (zip) | ❌ | module.json, packs/, assets/ |

### 9.6 Импорт
| Задача | Статус | Примечания |
|--------|--------|------------|
| Import dd2vtt/uvtt | ❌ | Как reference layer или проект |

---

## Фаза 10: UX и полировка

### 10.1 История действий
| Задача | Статус | Примечания |
|--------|--------|------------|
| Undo | ⚠️ | Инфраструктура есть |
| Redo | ⚠️ | Инфраструктура есть |
| UI кнопки Undo/Redo | ✅ | В TopBar |

### 10.2 Горячие клавиши
| Задача | Статус | Примечания |
|--------|--------|------------|
| Delete - удаление | ✅ | |
| Escape - отмена | ✅ | |
| V - Select | ✅ | |
| R - Room | ✅ | |
| C - Corridor | ✅ | |
| D - Door | ✅ | |
| E - Erase | ✅ | |
| Space - Pan | ✅ | |
| G - Toggle grid | ✅ | |
| S - Toggle snap | ✅ | |
| Ctrl+Z - Undo | ✅ | |
| Ctrl+Y - Redo | ✅ | |
| Ctrl+S - Save | ✅ | localStorage quick save |

### 10.3 Копирование
| Задача | Статус | Примечания |
|--------|--------|------------|
| Ctrl+C - Copy | ✅ | Комнаты и коридоры |
| Ctrl+V - Paste | ✅ | Со смещением 40px |
| Ctrl+D - Duplicate | ✅ | Комнаты |

### 10.4 Другое
| Задача | Статус | Примечания |
|--------|--------|------------|
| Контекстное меню (ПКМ) | ✅ | Delete, Duplicate, Select All |
| Tooltips | ⚠️ | На некоторых кнопках |
| Индикатор загрузки | ❌ | |
| Сообщения об ошибках | ❌ | |

---

## Фаза 11: Режим графа

### 11.1 Визуализация графа
| Задача | Статус | Примечания |
|--------|--------|------------|
| Переключение в режим графа | ❌ | |
| Отображение узлов | ❌ | |
| Отображение связей | ❌ | |
| Force-directed layout | ❌ | |

### 11.2 Редактирование графа
| Задача | Статус | Примечания |
|--------|--------|------------|
| Добавление узлов | ❌ | |
| Создание связей | ❌ | |
| Удаление связей | ❌ | |
| Синхронизация с геометрией | ❌ | |

---

## Фаза 12: Многопалубность

### 12.1 Управление палубами
| Задача | Статус | Примечания |
|--------|--------|------------|
| Создание палубы | ✅ | В DeckTabs |
| Переключение палуб | ✅ | Табы |
| Удаление палубы | ❌ | |
| Переименование палубы | ❌ | |

### 12.2 Связь между палубами
| Задача | Статус | Примечания |
|--------|--------|------------|
| Лифты между палубами | ❌ | |
| Лестницы между палубами | ❌ | |
| Визуализация связей | ❌ | |
| Валидатор вертикальных ссылок | ❌ | Ссылки всегда в существующий уровень |

### 12.3 Ghost View и Isometric (08_multilevel_views.md)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Ghost view соседнего уровня | ❌ | Opacity slider |
| Isometric view (как View) | ❌ | Переключатель, не геометрия |
| Clone level | ❌ | |

---

## Фаза 13: UI/QOL - Навигация и выделение (01, 02, 11)

### 13.1 Навигация по канвасу (11_input_model_mouse_keyboard.md)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Колесо: zoom к курсору | ✅ | |
| Средняя кнопка + drag: pan | ✅ | |
| ПКМ + drag: pan без контекстного меню | ✅ | Меню открывается только при stationary right click |
| Space + ЛКМ drag: pan | ✅ | |
| Shift + колесо: горизонтальный скролл | ✅ | |
| Zoom to fit | ⚠️ | Кнопка есть |
| Zoom 100% | ✅ | Клик на % в StatusBar |
| Center on selection | ✅ | Кнопка ⌖ Center в StatusBar |
| Minimap | ❌ | С прямоугольником view |

### 13.2 Модель выделения (11_input_model_mouse_keyboard.md)
| Задача | Статус | Примечания |
|--------|--------|------------|
| ЛКМ по объекту: выделить | ✅ | |
| ЛКМ по пустому: снять выделение | ✅ | |
| Shift + ЛКМ: toggle multi-select | ⚠️ | Same-type rooms/corridors; mixed selection впереди |
| Marquee selection (рамкой) | ✅ | Drag на пустом месте |
| Shift + marquee: добавить к выделению | ❌ | Текущая реализация заменяет selection |
| Alt + marquee: touch select | ❌ | |
| Двойной клик: открыть inspector | ⚠️ | Для коридоров добавляет waypoint |

### 13.3 Слои и объекты (02_layers_objects_selection.md)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Custom Layers: создание/имя/порядок | ❌ | |
| Layer visibility/lock/opacity | ❌ | |
| Solo layer кнопка | ❌ | |
| Lock all but this | ❌ | |
| Object panel: список по типам | ❌ | rooms/corridors/doors/junctions/icons/labels |
| Object panel: поиск/фильтры | ❌ | по имени/тегу/типу |
| Выбор из списка центрирует на карте | ❌ | Опционально |
| Group/Ungroup | ❌ | |
| Save group as preset | ❌ | |
| Find & Replace объектов | ❌ | |

---

## Фаза 14: UI/QOL - Горячие клавиши и Command Palette (03)

### 14.1 Базовые хоткеи
| Задача | Статус | Примечания |
|--------|--------|------------|
| Ctrl+Z / Ctrl+Shift+Z: undo/redo | ✅ | |
| Space: pan | ✅ | |
| V: select tool | ✅ | |
| R: room tool | ✅ | |
| C: corridor tool | ✅ | |
| I: icon tool | ✅ | Добавлено |
| T: text tool | ✅ | Добавлено |
| Esc: cancel/exit/clear | ✅ | |
| Delete: удалить выбранное | ✅ | |
| Ctrl+D: duplicate | ✅ | |
| Ctrl+G / Ctrl+Shift+G: group/ungroup | ❌ | |
| Ctrl+K: command palette | ✅ | CommandPalette.tsx |
| Ctrl+S: save | ❌ | |
| Ctrl+C/V: copy/paste | ❌ | |

### 14.2 Настраиваемые шорткаты (must-have)
| Задача | Статус | Примечания |
|--------|--------|------------|
| UI для ребинда всех команд | ❌ | |
| Профили: Default/Left-handed/Photoshop-like | ❌ | |
| Экспорт/импорт keymap (JSON) | ❌ | |
| Независимость от раскладки (RU/EN) | ⚠️ | По key codes |

### 14.3 Command Palette
| Задача | Статус | Примечания |
|--------|--------|------------|
| Поиск по командам | ❌ | |
| Поиск по объектам | ❌ | "Select: Engineering" |
| Быстрые макросы | ❌ | Опционально |

### 14.4 Smart Nudges (12_inspector_toolbars_microux.md)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Стрелки: сдвиг на 1 unit | ✅ | 4px шаг |
| Shift+стрелки: на 10 units | ✅ | 40px шаг |
| Alt+стрелки: на 0.5 unit | ❌ | Опционально |

---

## Фаза 15: UI/QOL - Библиотека ассетов и пресеты (04)

### 15.1 Встроенная библиотека
| Задача | Статус | Примечания |
|--------|--------|------------|
| Иконки комнат/функций | ✅ | Emoji |
| Двери/шлюзы/люки варианты | ⚠️ | |
| Маркеры опасности | ❌ | |
| Мебель схематичная | ❌ | |
| Сети (вентиляция/кабели) | ❌ | |
| Метаданные лицензий | ❌ | Автор, источник, ограничения |

### 15.2 Импорт пользовательских ассетов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Импорт SVG/PNG/WebP | ❌ | |
| Авто-миниатюры | ❌ | |
| Теги/поиск | ❌ | |
| Favorites и Recent | ❌ | |
| Уведомление о локальном хранении | ❌ | |

### 15.3 Presets / Stamps / Modules
| Задача | Статус | Примечания |
|--------|--------|------------|
| Room preset | ❌ | Комната + иконки + подпись |
| Corridor module | ❌ | Узел/развилка/шлюз |
| Geomorph | ❌ | Блок + порты + правила соединения |
| Создать пресет из выделения | ❌ | |
| Snap по портам | ❌ | |
| Версионирование пресетов | ❌ | |

### 15.4 Style presets
| Задача | Статус | Примечания |
|--------|--------|------------|
| Палитра цветов | ⚠️ | |
| Толщины линий | ❌ | |
| Corner style (sharp/rounded) | ❌ | |
| Темы: Blueprint/Terminal/NASA-punk | ✅ | |

---

## Фаза 16: UI/QOL - Генератор и Human-in-the-loop (05)

### 16.1 Панель генерации
| Задача | Статус | Примечания |
|--------|--------|------------|
| Profile: Realism/Futurism/Custom | ⚠️ | styleProfile |
| Scale: ship/station/outpost | ✅ | archetype |
| Room program: обязательные/опциональные | ⚠️ | В пресетах |
| Topology: циклы/ветвления/chokepoints/тупики | ⚠️ | loopiness |
| Decks: 1..N | ⚠️ | Опционально |
| Seed: поле + randomize | ✅ | |

### 16.2 Reroll кнопки
| Задача | Статус | Примечания |
|--------|--------|------------|
| Generate new | ✅ | |
| Reroll layout | ❌ | |
| Reroll dressing | ❌ | |
| Reroll corridors only | ❌ | |

### 16.3 Галерея вариантов
| Задача | Статус | Примечания |
|--------|--------|------------|
| 6-12 миниатюр вариантов | ❌ | |
| Клик → применить | ❌ | |
| Pin для сравнения | ❌ | |
| Быстрый экспорт превью | ❌ | |

### 16.4 Lock / Freeze
| Задача | Статус | Примечания |
|--------|--------|------------|
| Lock rooms | ❌ | Не перемещать |
| Lock connections | ❌ | Не менять граф |
| Lock style | ❌ | Не менять палитру |
| Lock deck assignment | ❌ | Не менять уровни |
| Иконки lock на объектах | ❌ | |
| Список "Locked items" | ❌ | |

### 16.5 Метрики TTRPG
| Задача | Статус | Примечания |
|--------|--------|------------|
| Read-only structured playability report | ✅ | Deterministic metrics + violations/severity/hints |
| Main loop present | ✅ | Physical circulation cycle rank |
| Chokepoints count | ❌ | |
| Dead ends count | ✅ | Count + ratio + archetype/size-aware soft threshold |
| Alt routes между ключевыми зонами | ⚠️ | Edge-redundancy между critical/entry ingress; layer semantics впереди |
| Encounter pockets count | ❌ | |
| Auto-repair по TTRPG violations | ❌ | Validator сейчас read-only |

---

## Фаза 17: UI/QOL - Ноты и аннотации (07)

### 17.1 Labels
| Задача | Статус | Примечания |
|--------|--------|------------|
| Авто-лейблы комнат | ✅ | Имя в центре |
| Режимы: minimal/full | ❌ | |
| Привязка к комнате (pin) | ❌ | |

### 17.2 Room Notes
| Задача | Статус | Примечания |
|--------|--------|------------|
| Название комнаты | ✅ | |
| Назначение | ❌ | |
| Теги опасностей | ❌ | |
| Loot/clue/encounter | ❌ | |
| Player-visible флаг | ❌ | |

### 17.3 GM Notes Editor
| Задача | Статус | Примечания |
|--------|--------|------------|
| Rich-text редактор | ❌ | Заголовки/списки/иконки |
| Автоссылки на комнаты (roomId) | ❌ | |
| Экспорт в PDF/Markdown | ❌ | |
| Player version нотов | ❌ | |

---

## Фаза 18: UI/QOL - Доступность и производительность (09)

### 18.1 Accessibility
| Задача | Статус | Примечания |
|--------|--------|------------|
| Полнота управления с клавиатуры | ⚠️ | Основные хоткеи есть |
| Настраиваемые шорткаты | ❌ | |
| UI scale | ❌ | |
| High contrast theme | ❌ | |
| Reduced motion | ❌ | |

### 18.2 Performance
| Задача | Статус | Примечания |
|--------|--------|------------|
| Рендер по слоям с кэшированием | ⚠️ | Контейнеры PixiJS |
| Simplified preview при drag | ❌ | |
| Генерация в WebWorker | ❌ | |
| Ограничения на размер ассетов | ❌ | + предупреждения |

### 18.3 Autosave и восстановление
| Задача | Статус | Примечания |
|--------|--------|------------|
| Автосейв каждые N секунд | ✅ | 2 сек debounce |
| Crash recovery | ❌ | |
| Snapshots (20-50) | ❌ | |
| Именованные snapshots | ❌ | |

---

## Фаза 19: UI/QOL - Инспектор и тулбары (12)

### 19.1 Inspector (properties panel)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Свойства single selection | ✅ | В RightPanel |
| Batch edit для multi-selection | ❌ | Только общие свойства |
| Редактирование не сбрасывает выделение | ✅ | |
| Быстрые пресеты стиля в инспекторе | ❌ | |

### 19.2 Верхняя панель (top bar)
| Задача | Статус | Примечания |
|--------|--------|------------|
| File: New/Open/Save/Export | ✅ | |
| Undo/Redo кнопки | ✅ | |
| Grid toggle + размер | ✅ | |
| Snap toggle | ✅ | |
| Layers button | ❌ | |
| Generator button | ✅ | |
| Help/Shortcuts | ❌ | |

### 19.3 Левый тулбар
| Задача | Статус | Примечания |
|--------|--------|------------|
| Select | ✅ | |
| Room | ✅ | |
| Corridor | ✅ | |
| Icon/Prop | ⚠️ | Enum добавлен |
| Text/Label | ⚠️ | Enum добавлен |
| Eraser | ✅ | |
| Measure tool | ❌ | Полезно для TTRPG масштаба |
| Поддержка "правой панели" для левшей | ❌ | |

### 19.4 Микро-UX
| Задача | Статус | Примечания |
|--------|--------|------------|
| Tooltip с хоткеем | ⚠️ | Не все |
| First-run tutorial | ❌ | |
| Lock/hide иконки в object list | ❌ | |
| Solo layer hotkey | ❌ | |
| Быстрый "player export" | ❌ | |
| Контекстные подсказки генератора | ❌ | "noPath" quick fixes |

---

## Фаза 20: UI/QOL - Режимы и Views (13)

### 20.1 Большие режимы
| Задача | Статус | Примечания |
|--------|--------|------------|
| Edit Mode | ✅ | Ручное редактирование |
| Generate Mode | ✅ | Генерация и выбор вариантов |
| Review Mode | ❌ | Просмотр без правок, комментарии |

### 20.2 View режимы
| Задача | Статус | Примечания |
|--------|--------|------------|
| Default View | ✅ | |
| Gameplay View | ❌ | UI скрыт, для стриминга/игроков |
| Print Preview | ❌ | Границы страниц, поля, масштабы |
| VTT Preview | ❌ | Walls/doors/windows/lights |
| Isometric View | ❌ | Как view, не геометрия |

### 20.3 Глобальные инварианты UX
| Задача | Статус | Примечания |
|--------|--------|------------|
| Undo/redo во всех режимах | ⚠️ | |
| Выделение не теряется при смене view | ❌ | |
| Esc "спускается на один уровень" | ✅ | |
| Snap настройки глобальны | ✅ | |
| Alt временно отключает snap | ❌ | |

---

## Фаза 21: Mothership-Inspired Features

> Источник: Mothership Map Viewer / Map Creator. Спецификация: `docs/specs/MOTHERSHIP_FEATURES_SPEC.md`

### 21.1 Расширенная геометрия комнат
| Задача | Статус | Примечания |
|--------|--------|------------|
| Круглые комнаты (shape: circle) | ❌ | radius property |
| Internal walls внутри комнаты | ❌ | InternalWall[] |
| Wall styles (solid/dashed/dotted) | ❌ | Для secret barriers |
| Standalone walls | ❌ | Вне комнат |
| Standalone labels | ❌ | Аннотации вне помещений |

### 21.2 Corridor Endpoints & Snapping
| Задача | Статус | Примечания |
|--------|--------|------------|
| EndpointMarkerType | ✅ | none/door/grate/airlock/hatch/bulkhead/locked |
| Snap endpoint к roomPort/грани/junction/corridorPoint | ⚠️ | Canonical/legacy binding + preview готовы; создание junction при drop на segment впереди |
| Visual feedback для snap candidate | ⚠️ | Canvas ring + status готовы; target-specific glyph/label впереди |
| Endpoint marker влияет на семантику | ❌ | isGate, blocksMovement |
| None = бесшовное соединение | ❌ | Визуально сливает сегменты |

### 21.3 Маркеры (TTRPG-семантика)
| Задача | Статус | Примечания |
|--------|--------|------------|
| MarkerType enum (18 типов) | ✅ | markerTypes.ts |
| Marker entity | ✅ | id, type, pos, label, isSecret |
| MARKER_TYPE_CONFIGS | ✅ | icon, color, category |
| Инструмент Marker placement | ❌ | |
| Nested markers (в комнате) | ❌ | parentId, parentType |
| Standalone markers | ❌ | |
| Marker visibility | ❌ | Отдельно от parent |

### 21.4 Visibility & Secrets Model
| Задача | Статус | Примечания |
|--------|--------|------------|
| VisibilityState type | ✅ | visible/hidden/fog/revealed |
| GMViewMode | ✅ | player/gm/secrets |
| DefaultVisibilitySettings | ✅ | visibilityTypes.ts |
| VisibilityInheritanceRules | ✅ | roomRevealsMarkers: false (критично!) |
| Room visibility НЕ раскрывает markers | ❌ | Реализация |
| Secret passages (isSecret flag) | ❌ | |
| SecretPassageConfig | ✅ | discoveryMethod, DC |
| GM view toggle | ❌ | |
| Fog of war settings | ✅ | FogOfWarSettings |
| Visibility presets | ✅ | exploration/tactical/planning |

### 21.5 UI структура (Mothership patterns)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Context toolbar (по выделению) | ❌ | ContextToolbar.tsx |
| Info panel (подсказки по инструменту) | ⚠️ | Есть в StatusBar |
| Item details panel (inspector) | ✅ | RightPanel |
| Quick navigation dropdown | ❌ | Go to room/marker/corridor |
| Floating toolbars | ⚠️ | Есть Toolbar слева |

### 21.6 Persistence & Sharing
| Задача | Статус | Примечания |
|--------|--------|------------|
| JSON export (full project) | ✅ | |
| JSON import | ✅ | |
| Share string (gzip + base64) | ❌ | SFM1: prefix |
| Autosave to localStorage | ✅ | |
| Recovery on page load | ❌ | Dialog с предложением восстановить |
| Max backups limit | ❌ | 5 по умолчанию |

### 21.7 Клавиатурные сокращения (дополнительные)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Ctrl+C / Ctrl+V copy/paste | ✅ | |
| Ctrl+A select all | ✅ | Активная палуба; учитывает текущий инструмент |
| Reset View кнопка | ❌ | Центр/масштаб по умолчанию |

---

## Фаза 22: Geomorph режим (v2)

> Сборка станции/корабля из модулей с возможностью замены отдельных тайлов.

### 22.1 Базовая система тайлов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Geomorph tile type | ❌ | Модуль + порты для соединения |
| Tile grid editor | ❌ | Сетка для размещения тайлов |
| Port matching rules | ❌ | Порты должны совпадать при соединении |
| Tile rotation (0/90/180/270) | ❌ | |
| Tile flip (horizontal/vertical) | ❌ | |

### 22.2 Библиотека тайлов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Built-in geomorph library | ❌ | Базовые модули |
| Custom tile creation | ❌ | Сохранить выделение как тайл |
| Tile categories | ❌ | corner/edge/center/connector |
| Tile preview thumbnails | ❌ | |
| Import/export tile packs | ❌ | |

### 22.3 Генерация из тайлов
| Задача | Статус | Примечания |
|--------|--------|------------|
| Auto-generate from tiles | ❌ | Случайная сборка с правилами |
| Swap single tile (reroll) | ❌ | Заменить один модуль без полного реролла |
| Constraint solving | ❌ | WFC-like алгоритм |
| Seed для тайловой генерации | ❌ | |

### 22.4 Валидация (опционально)
| Задача | Статус | Примечания |
|--------|--------|------------|
| Port connectivity check | ❌ | Все порты соединены? |
| Island detection | ❌ | Есть изолированные зоны? |
| ~~Running tally (масса/энергия)~~ | ❌ | Отложено — overengineering |

---

## Статистика прогресса

### По фазам:
| Фаза | Прогресс |
|------|----------|
| 1. Инфраструктура | 100% |
| 2. Канвас и редактирование | 98% |
| 3. Генерация карт | 90% |
| 4. Типы и темы | 60% |
| 5. Объекты и интерьер | 10% |
| 6. Двери и соединения | 75% |
| 7. Слои и аннотации | 5% |
| 8. Пресеты | 0% |
| 9. Экспорт | 30% |
| 10. UX и полировка | 70% |
| 11. Режим графа | 0% |
| 12. Многопалубность | 40% |
| 13. UI/QOL Навигация/выделение | 40% |
| 14. UI/QOL Хоткеи/Command Palette | 50% |
| 15. UI/QOL Библиотека/пресеты | 15% |
| 16. UI/QOL Генератор HitL | 35% |
| 17. UI/QOL Ноты/аннотации | 10% |
| 18. UI/QOL Доступность/перформанс | 25% |
| 19. UI/QOL Инспектор/тулбары | 50% |
| 20. UI/QOL Режимы/Views | 30% |
| 21. Mothership Features | 25% |
| 22. Geomorph режим | 0% |

### Общий прогресс: ~45%

---

## Приоритеты на ближайшее время

### Высокий приоритет:
1. ✅ Инструмент Corridor (рисование коридоров)
2. ✅ Инструмент Door (размещение дверей)
3. ✅ Инструмент Erase (ластик)
4. ✅ Export PNG (работающий)
5. ✅ Горячие клавиши (основные)
6. ✅ Процедурная генерация (8-этапный пайплайн)
7. ⚠️ Расширенная система коридоров (порты ok, waypoints/junctions частично)
8. ✅ Marquee selection (выделение рамкой)
9. 🔄 Post-generation editing + dependent reroute (`EDITOR_UX_BACKLOG.md`, P0)
10. 🔄 Print Preview + Multi-page PDF export
11. 🔄 VTT Export (Universal VTT формат)

### Средний приоритет:
12. ⚠️ Базовое перемещение/редактирование коридоров; canonical attachments и reroute — P0
13. ✅ UI для смены цвета комнаты
14. ⚠️ Same-type multi-select; mixed/group drag — P1
15. ✅ Auto-save
16. ⚠️ Контекстное меню есть; часть actions и undo contract неполны
17. ✅ Интеграция нового роутера в UI (sliders работают)
18. ✅ Визуализация junction'ов и line jumps (render добавлен)
19. ✅ Command Palette (Ctrl+K)
20. ✅ Галерея вариантов генератора (gallery mode)
21. ❌ Lock/Freeze при генерации

### Низкий приоритет:
22. ❌ Объекты и интерьер
23. ❌ Слои (вентиляция, коммуникации)
24. ❌ Аннотации и GM Notes
25. ❌ Пресеты и геоморфы
26. ❌ Режим графа
27. ❌ Isometric View

---

## Правила имплементации новых механик (14_new_mechanics_playbook.md)

### Принципы UX

#### Discoverability (находимость)
Новая механика должна иметь минимум 2 "точки входа":
- Через UI (кнопка/меню/панель)
- Через command palette или контекстное меню

#### Predictability (предсказуемость)
- Не менять данные "молча"
- Авто-поведение (например автороут):
  - визуализируется превью
  - подтверждается применением
  - может быть отменено

#### Non-destructive
- По умолчанию не удалять/не заменять "навсегда"
- Предлагать "replace in selection", "apply as new layer", "snapshot"

#### Consistency
- Действие над объектом → в inspector и в контекстном меню
- Действие над сценой → в File/Generator панелях

### Обязательные требования к новым механикам

#### 1. Command System
Каждая механика реализуется как команда с:
```typescript
interface Command {
  do(): void
  undo(): void
  redo(): void // если отличается от do
  serialize(): HistoryEntry
  canExecute(context: EditorContext): boolean
}
```

#### 2. Инспектор и свойства
Если механика добавляет новый тип сущности:
- Добавить schema (тип/поля/дефолты/валидация)
- Добавить inspector UI (single и batch edit)
- Добавить в object panel и фильтры

#### 3. Хоткеи
- Если действие частое → хоткей обязателен
- Хоткей должен быть настраиваемый
- Независимый от раскладки
- Отражён в tooltip

#### 4. Конфликт-менеджмент хоткеев
- Нельзя захватывать: Esc, Ctrl+Z, Ctrl+K, camera controls
- Стандартные модификаторы:
  - Shift: ось/добавить
  - Alt: временно отключить snap
  - Ctrl/Cmd: дублировать/особый режим

#### 5. Контекстное меню
- Добавить пункт для соответствующего типа объекта
- Локальные к точке действия → по ПКМ на точке/сегменте

#### 6. Визуальные подсказки
- Любая "авто" операция должна иметь preview слой
- После применения → toast "что изменилось"

#### 7. Валидация и ошибки
- Определить какие ошибки возможны
- Как пользователь их исправляет
- Quick fixes (например для noPath: уменьшить clearance)

#### 8. Экспорт/импорт
- Данные сериализуются в проект JSON
- Migration (версия проекта)
- Разумные дефолты при отсутствии поля
- Экспорт в изображение не должен ломаться

#### 9. Производительность
- Тяжёлые операции → WebWorker
- Simplified preview при drag

### Чеклист для новой механики

```markdown
## [Название механики]

### Entry (как включить)
- [ ] UI точка входа
- [ ] Хоткей
- [ ] Command palette

### Active state (что отображается)
- [ ] Preview слой
- [ ] Подсветка изменяемых объектов

### Exit (как выйти)
- [ ] Esc
- [ ] Смена инструмента
- [ ] Confirm/Cancel кнопки

### Persistence (что сохраняется)
- [ ] В проект JSON
- [ ] В историю (undo/redo)

### Tests
- [ ] Unit tests
- [ ] UI тесты
```

---

## Acceptance Criteria (10_acceptance_criteria_ui.md)

### A) Workspace
1. ✅ Пан/зум работает стабильно, zoom-to-cursor корректен
2. ✅ Snap переключается мгновенно и видимо
3. ❌ Minimap отражает viewport

### B) Layers & Objects
4. ❌ Custom layer создаётся/переупорядочивается/скрывается/лочится и сохраняется
5. ❌ Object panel ищет и выбирает объекты, центрирует вид
6. ❌ Group → Save as preset → вставка пресета сохраняет порты

### C) Shortcuts
7. ❌ Ребинд хоткеев сохраняется и работает после перезагрузки
8. ❌ Command palette находит команды и объекты

### D) Generator flow
9. ❌ Есть галерея вариантов и выбор варианта не ломает историю
10. ❌ Lock rooms/edges реально фиксирует элементы при reroll

### E) Export/Print/VTT
11. ⚠️ Экспорт PNG/WebP отражает px-per-cell и имя файла по шаблону
12. ❌ Multi-page PDF учитывает cell size и margins (PRINTER-FRIENDLY!)
13. ❌ Экспорт VTT данных различает doors и windows

---

## Settings Schema (90_settings_schema.md)

Целевая структура настроек:

```json
{
  "ui": {
    "theme": "dark",
    "uiScale": 1.0,
    "language": "ru",
    "reducedMotion": false
  },
  "canvas": {
    "grid": { "type": "square", "size": 50, "snap": true, "show": true },
    "isometricView": false,
    "minimap": { "enabled": true },
    "guides": { "rulers": false, "snapObjects": true, "magnetStrength": 0.7 }
  },
  "shortcuts": {
    "profile": "default",
    "bindings": {
      "tool.select": "V",
      "tool.room": "R",
      "tool.corridor": "C",
      "tool.icon": "I",
      "tool.text": "T",
      "commandPalette": "Ctrl+K"
    }
  },
  "export": {
    "image": { "format": "webp", "pxPerCell": 128, "includeGrid": true },
    "pdf": { "paper": "A4", "marginsMm": 10, "cellSizeMm": 25.4, "dpi": 300 },
    "vtt": { "format": "dd2vtt", "includeLights": true, "includeWalls": true }
  },
  "generator": {
    "profile": "realism",
    "seed": null,
    "gallerySize": 8,
    "locks": { "rooms": false, "edges": false, "style": false }
  }
}
```

---

*Последнее обновление: 17 декабря 2025*

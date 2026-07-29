# Editor UX Critique and Source Ledger

**Статус:** живой UX-контракт и журнал исследований
**Последняя проверка:** 2026-07-29
**Продукт:** браузерный генератор и редактор sci-fi-карт для TTRPG
**Основная аудитория:** ведущий, автор приключения или картограф, который
сначала получает процедурный черновик корабля/станции/базы, затем быстро
доводит его до игровой и публикуемой карты.

Этот документ не заменяет `EDITOR_UX_BACKLOG.md`. Backlog отвечает на вопрос
«что реализовать», а этот документ — «какую пользовательскую задачу мы
защищаем, как именно должно вести себя взаимодействие и по каким наблюдаемым
критериям решение принимается».

## 1. Как использовать и обновлять документ

После заметного изменения редактора:

1. Повторить четыре контрольных сценария из раздела 3.
2. Обновить статус затронутых проблем: `подтверждено`, `частично`,
   `исправлено`, `нужна проверка`.
3. Не помечать проблему исправленной только по unit-тесту: для жестов,
   доступности и визуальной обратной связи требуется browser acceptance.
4. В журнал источников добавлять дату повторной проверки и кратко фиксировать,
   какое решение источник подтверждает. Не копировать чужой интерфейс целиком.
5. Новое сочетание клавиш не вводить без обновления матрицы в разделе 6.

### Шкала приоритетов

- **P0:** пользователь может потерять работу, получить повреждённую топологию
  или не может завершить главный сценарий.
- **P1:** главный сценарий возможен, но непредсказуем, трудно обнаружим или
  требует лишних исправлений.
- **P2:** полировка, масштабирование на большие карты, доступность расширенных
  сценариев и профессиональная эффективность.

### Отделение фактов от гипотез

- **Наблюдение** — подтверждено текущим интерфейсом, DOM/a11y snapshot или
  существующим кодом.
- **Контракт** — обязательное целевое поведение.
- **Гипотеза** — решение, которое следует проверить прототипом или
  пользовательским тестом.

## 2. Цели продукта и критерий хорошего результата

Редактор должен поддерживать непрерывную цепочку:

> сгенерировать → сравнить → применить → перестроить → наполнить →
> подготовить GM/player/VTT/print-версию.

Хорошая карта одновременно:

- узнаваема как корабль, станция или база даже без подписей;
- читается в масштабе «вся палуба» и не требует рассматривать каждый пиксель;
- имеет понятные входы, шлюзы, двери, магистрали и альтернативные маршруты;
- пригодна для игры: ведущий понимает зоны риска, узкие места, обходы,
  вертикальные связи и скрытые пути;
- остаётся полностью редактируемой после генерации;
- не теряет связи и ручные решения при перемещении комнат;
- одинаково надёжно сохраняется в JSON и экспортируется для VTT/печати.

Главный принцип: **генератор предлагает структуру, редактор сохраняет намерение
пользователя**. Автоматическая перестройка не имеет права молча уничтожать
locked waypoint, менять не затронутые коридоры или коммитить `noPath`.

## 3. Контрольные пользовательские сценарии

### Сценарий A. Получить и выбрать основу карты

1. Открыть пустой проект.
2. Выбрать archetype, subtype, size и характер связности.
3. Сгенерировать вариант.
4. Рассмотреть карту, а не только числовые метрики.
5. Применить, отклонить или reroll с сохранением параметров.

**Успех:** до Apply виден настоящий результат в масштабе всей карты; основные
действия не скрыты прокруткой; текущая карта не теряется до подтверждения.

### Сценарий B. Исправить структуру после генерации

1. Выбрать комнату с несколькими связанными проходами.
2. Переместить её с сохранением связей.
3. Повторить движение с отключённым сохранением связей.
4. Перетащить endpoint к двери, room port, коридору и в свободную точку.
5. Отменить активный жест через Esc, затем проверить Undo/Redo.

**Успех:** до отпускания мыши видно, что сохранится, отсоединится или
перестроится; один жест равен одному undo step; `noPath` не ломает карту.

### Сценарий C. Вручную поправить маршрут

1. Выбрать коридор и конкретный сегмент.
2. Переместить сегмент перпендикулярно его направлению.
3. Добавить locked waypoint.
4. Подключить ветку к существующему коридору как junction.
5. Переместить соседнюю комнату.

**Успех:** маршрут остаётся ортогональным, ручная форма не исчезает, junction
однозначно отличается от простого пересечения.

### Сценарий D. Подготовить карту к игре

1. Проверить карту в fit-to-view.
2. Переключить GM/player visibility.
3. Убедиться, что двери, шлюзы, вертикальные связи и опасности различимы.
4. Экспортировать VTT/экранную и printer-friendly версии.

**Успех:** карта читается на уровне зон в fit-view, детали раскрываются при
zoom-in, экспорт сохраняет геометрию, сетку и семантические двери.

## 4. Текущий аудит: сильные стороны

Проверено 2026-07-29 на локальной сборке в viewport `1440×1000`, сценарий:
пустой проект → Generate → Explorer/M → результат → Apply → навигация и
контекстное меню.

- Общая схема интерфейса профессионально знакома: глобальные действия сверху,
  инструменты слева, canvas в центре, inspector/layers справа, статус снизу.
- Основные инструменты имеют видимое активное состояние и shortcuts.
- Есть tiered disclosure параметров генератора, seed history, worker и
  progress-состояние.
- Генерация не коммитится сразу: существуют Apply/Discard/Reroll.
- Wheel zoom масштабирует к курсору; доступны Pan tool, Space+drag,
  middle-drag и right-drag.
- Right-drag использует порог 4 px: после движения custom/native context menu
  подавляется, стационарный right-click сохраняет контекстные действия.
- `Preserve attachments` видим до жеста, включён по умолчанию и имеет Alt
  override.
- Room drag уже переносит комнату, двери и objects и пытается перестроить
  только связанные коридоры.
- Esc способен восстановить pre-gesture snapshot для части drag-state машин.
- Генератор и editor используют ортогональные сегменты, а двери визуально
  закреплены на стенах.

## 5. Приоритетные проблемы

### P0.1 Preview не является визуальным preview

**Наблюдение:** после генерации canvas за модальным окном остаётся старым.
`Preview Ready` показывает seed, число комнат/коридоров и метрики, но не сам
вариант. Карта становится видимой только после Apply.

**Дополнительная проблема:** карточка Apply/Discard/Reroll находится в
scrollable body, а отдельный footer продолжает показывать Cancel и disabled
Generate. В проверенном viewport карточка результата оказалась ниже видимой
области; пользователь видит «Done», но не видит доступное действие Apply.

**Почему P0:** основной сценарий «сравнить до коммита» фактически отсутствует.
Пользователь вынужден применять карту вслепую и откатывать результат.

**Контракт:**

- сгенерированный draft отображается на canvas как временный project overlay;
- текущий документ остаётся неизменённым до Apply;
- единый sticky footer меняет состояние с `Cancel / Generate` на
  `Discard / Reroll / Apply`;
- Apply всегда видим при высоте viewport от 720 px;
- gallery показывает настоящие одинаково масштабированные thumbnails;
- повторный seed с теми же параметрами даёт визуально идентичный draft.

**Acceptance:**

- до Apply browser test находит draft rooms на canvas, а store document hash
  остаётся прежним;
- Apply доступен без прокрутки при `1280×720`, `1440×900`, `1920×1080`;
- Escape/Discard возвращают неизменный project hash и viewport;
- keyboard focus ограничен модальным окном и после закрытия возвращается на
  Generate.

### P0.2 Жест, reroute и history ещё не образуют единую транзакцию

**Наблюдение:** отдельные state machines обновляют store на каждом mousemove,
а commit добавляет history в mouseup. Есть window `mouseup`, но нет общего
Pointer Events + pointer capture/pointercancel command lifecycle. Locks,
resize, context menu и inspector actions не проходят через единый контракт.

**Риск:** потерянный mouseup, no-op drag, конфликт router или второй handler
могут создать лишний history step либо частично обновлённое состояние.

**Контракт:** любой жест имеет `begin → preview → commit | cancel`; preview
может быть approximate, но документ коммитится только одной командой.

**Acceptance:**

- room move + contents + detach/reroute = ровно один undo step;
- Esc и `pointercancel` возвращают document hash к состоянию на begin;
- no-op drag не создаёт history;
- `noPath` сохраняет last valid route и показывает repair actions;
- mouseup за пределами canvas корректно завершает или отменяет жест;
- Undo/Redo восстанавливает одинаковые anchors, doors, objects и segments.

### P0.3 Generated/manual parity и стабильные topology anchors не завершены

**Наблюдение:** generated edges уже получают типизированные anchors, но часть
редактирования всё ещё зависит от `corridorId:segmentIndex`; manual migration и
door-as-anchor не завершены.

**Контракт:** endpoint ссылается на stable `roomPort`, `door`, `junction`,
`corridorPoint` или `free`, а render path остаётся derived geometry.

**Acceptance:**

- split/delete segment не переназначает существующий stable id другому
  логическому сегменту;
- JSON round-trip сохраняет anchor kind и id;
- generated и manual corridor проходят один набор manipulation tests;
- door move вдоль стены детерминированно перестраивает attached corridor.

### P1.1 Fit-to-view использует не реальный размер canvas

**Наблюдение:** после Apply карта получила zoom 26%, но корпус всё равно был
обрезан снизу. `fitViewportForEditorData` рассчитывает положение по фиксированным
числам `980×720` и `788×528`, а не по фактическому canvas; hull/envelope также
не участвует в bounds.

**Контракт:** fit вычисляется от актуального viewport и всех видимых
структурных слоёв.

**Acceptance:**

- после Apply/Reset View весь hull помещается с padding 5–8%;
- fit работает при resize панели/окна и для ship/station/outpost;
- zoom-to-selection использует фактический canvas rect, а не условные 800×600;
- экстремальный zoom-out не делает главные зоны и входы неразличимыми:
  включается LOD.

### P1.2 Модель selection неоднородна

**Наблюдение:** selection имеет один `type`; marquee выбирает комнаты, а
коридоры — только если комнат не найдено. `Ctrl+A` также выбирает только один
тип. Hit priority, overlap cycling, locks и hidden layers не образуют общего
pick pipeline.

**Контракт:**

- selection хранит stable entity refs разных типов;
- hit priority: handle → port/door → object → junction → corridor → room →
  hull → canvas;
- Shift-click добавляет/удаляет entity;
- marquee слева направо выбирает только полностью содержащиеся объекты,
  справа налево — все пересечённые; цвет/паттерн рамки показывает режим;
- Tab циклически выбирает перекрывающиеся кандидаты;
- locked/hidden entity не принимает pointer events;
- `Ctrl/Cmd+A` выбирает все редактируемые видимые сущности текущего scope.

### P1.3 Modifier keys конфликтуют между документами и инструментами

**Наблюдение:** старый UX-документ назначает Alt временное отключение grid snap,
а текущий editor и backlog — инверсию `Preserve attachments`. Это два разных
понятия: геометрическое выравнивание и топологическая связь.

**Единый контракт:**

| Модификатор | Значение во время drag |
|---|---|
| `Alt` | Инвертировать **Preserve attachments** только для затронутых endpoints |
| `Ctrl/Cmd` | Временно инвертировать **Snap to grid/guides** |
| `Shift` | Ограничить движение dominant axis; для arrow nudge — крупный шаг |
| `Esc` | Отменить текущий жест до begin snapshot |

`Alt` никогда не должен одновременно означать detach и snap-off. Постоянные
toggles `Preserve attachments` и `Snap` видны в toolbar/status. В будущем
shortcuts можно переназначать, но значения по умолчанию должны быть едины.

### P1.4 Обратная связь при attachment/reroute недостаточна

**Наблюдение:** endpoint snap candidate подсвечивается, но room drag не
показывает число затронутых связей, будущий маршрут, detach state или причину
rollback. Ошибка reroute в основном остаётся `console.warn`.

**Контракт:**

- до commit показывать будущий anchor с типом (`Door`, `Port`, `Junction`,
  `Corridor`, `Free`);
- при room drag показывать `N connections preserved/detached`;
- valid preview — основной accent, approximate — warning pattern, noPath —
  danger pattern плюс последнее валидное положение;
- при долгом commit после 300 ms показывать `Routing N corridors…` и Cancel;
- failure предлагает `Reduce clearance`, `Add waypoint`, `Detach`,
  `Revert move`.

### P1.5 Corridor editing раскрыт не как единая задача

**Наблюдение:** endpoint handles, segment selection и context actions существуют
частично, но whole-route drag, perpendicular segment drag, locked waypoints и
junction/line-jump policy не имеют одного предсказуемого режима.

**Контракт:**

- click corridor — route selection;
- `Ctrl/Cmd+click` не должен конкурировать с snap override: segment выбирается
  по отдельному handle или повторному click по выбранному route;
- drag endpoint — reattach/free;
- drag segment перпендикулярно — создаёт/двигает locked waypoints;
- double-click segment — добавляет locked waypoint;
- Delete на waypoint — удаляет его и локально reroute;
- drop endpoint на corridor — junction по умолчанию; line jump выбирается
  явным mode/context action, а не скрытым модификатором;
- ручной waypoint сохраняется при последующем room move.

### P1.6 Door — важная TTRPG-сущность, но не самостоятельный объект редактора

**Наблюдение:** дверь можно разместить, но нет полного select/drag/inspector
цикла. Для игровой карты дверь означает вход, препятствие, уровень доступа и
иногда границу атмосферы.

**Контракт:** дверь выбирается раньше room fill, двигается только вдоль стены,
может быть anchor, имеет type/state/security и экспортируется как VTT semantics.

**Acceptance:**

- hit target двери не менее 24 CSS px при любом разумном zoom;
- дверь невозможно унести со стены;
- room resize сохраняет wall side и normalized offset;
- open/closed/locked/airlock различимы не только цветом;
- экспорт сохраняет проход и его состояние.

### P1.7 Layers показывают visibility, но не обеспечивают рабочий layer model

**Наблюдение:** у строк слоёв есть кнопка visibility, но a11y snapshot видит её
как безымянную кнопку. Lock, opacity, reorder, solo и гарантированное исключение
из hit testing отсутствуют или неочевидны.

**Контракт:** visibility, lock и opacity влияют и на render, и на selection.
Background/reference, hull, rooms, corridors, doors, props, annotations и GM
information — разные слои с явным порядком.

### P1.8 Доступность canvas и контролов недостаточна

**Наблюдение:** browser audit сообщил form fields без `id/name` и labels.
Layer visibility buttons не имеют accessible name. Canvas отсутствует в
доступном представлении карты; custom context menu не объявлен как menu и не
получает keyboard focus.

**Контракт:**

- toolbar имеет семантику toolbar, имя и roving focus;
- toggles сообщают `aria-pressed`, имя и состояние;
- dialogs имеют role/name, focus trap и Escape;
- context menu открывается также `Shift+F10`, получает focus и поддерживает
  arrows/Enter/Escape;
- canvas имеет доступное описание и синхронизированный object/topology list;
- действия объявляются через ненавязчивый `aria-live`;
- необходимые focus/selection/handle cues имеют контраст минимум 3:1;
- pointer targets имеют минимум 24×24 CSS px либо эквивалентное действие.

### P2.1 Информационная плотность и LOD

**Наблюдение:** в fit-view подписи комнат слишком малы, но всё равно
отрисовываются; крупные пустые области и детали корпуса конкурируют с игровой
структурой.

**Контракт LOD:**

- overview: hull, сектора, магистрали, крупные помещения, внешние интерфейсы;
- tactical: все комнаты, двери, hazards и grid;
- detail: props, wall fixtures, service networks и маленькие labels;
- label collision/priority не допускает наложения критических названий;
- legend и scale доступны в export, но не обязаны занимать рабочий canvas.

### P2.2 Смешанная локализация и визуальный язык

**Наблюдение:** глобальный UI английский, слои одновременно показывают EN/RU,
а подсказки используют длинные технические фразы. Верхняя панель смешивает
emoji и icon components.

**Контракт:** один активный locale, единый набор иконок, короткая основная
подсказка и расширенное описание в tooltip/help overlay. Термины `room`,
`corridor`, `port`, `door`, `junction`, `attachment`, `snap` должны иметь один
глоссарий.

### P2.3 Professional canvas features

- edge auto-pan во время drag;
- minimap или navigator для больших многоуровневых карт;
- focus/canvas-only mode;
- smart alignment/distribution guides;
- configurable shortcuts и trackpad mode;
- сохранение panel widths/visibility;
- non-destructive ruler/measure tool;
- search/object list и `center on result`.

## 6. Канонические interaction rules

### 6.1 Навигация

| Действие | Результат |
|---|---|
| Wheel | Zoom к позиции курсора |
| Shift+Wheel | Горизонтальный pan |
| Middle-drag | Pan |
| Space+left-drag | Временный pan из любого инструмента |
| `H` + left-drag | Постоянный Pan tool |
| Right-drag ≥ 4 px | Pan; native/custom context menu не появляется |
| Right-click < 4 px | Custom context menu; native menu всегда подавлен |
| `Shift+1` / Fit | Весь видимый structural content с padding |
| `Shift+2` | Zoom to selection |

Правый drag не должен запускать selection/draw. Right mouse state очищается при
mouseup, contextmenu, pointercancel, blur и потере capture.

### 6.2 Выделение

| Действие | Результат |
|---|---|
| Click | Выбрать верхний доступный объект |
| Shift+Click | Добавить/удалить объект из mixed selection |
| Click по выбранному перекрытию / Tab | Cycle candidates |
| Marquee L→R | Contain selection |
| Marquee R→L | Touch/intersect selection |
| Ctrl/Cmd+A | Все видимые редактируемые сущности текущей палубы |
| Escape | Сначала отменить жест/режим, затем очистить selection |

### 6.3 Перемещение комнаты

1. Pointerdown фиксирует snapshot комнаты, room-local contents, affected
   anchors и route hashes.
2. Preview перемещает комнату и contents.
3. По умолчанию connections сохраняются; Alt инвертирует это решение.
4. Ctrl/Cmd временно инвертирует grid/guides snap.
5. Shift фиксирует dominant axis после небольшого порога движения.
6. Preview показывает affected count и route status.
7. Pointerup запускает deterministic final route и одну transaction.
8. `noPath` не коммитит invalid geometry.

### 6.4 Endpoint snap priority

Победитель выбирается детерминированно по priority, distance и stable id:

1. door;
2. explicit room port;
3. junction;
4. corridor point/segment;
5. sliding room wall;
6. grid point;
7. free point.

На canvas одновременно показываются кандидат, его тип, точка будущего anchor и
короткий preview первого/последнего прямого stub. При Alt кандидат connection
не применяется и явно показывается `Free endpoint`.

### 6.5 Ручной corridor edit

- endpoint handle двигает только endpoint и соседний auto section;
- segment handle двигается только перпендикулярно;
- locked waypoint визуально отличается от auto waypoint формой, не только
  цветом;
- router не двигает locked waypoints;
- автоматический path cleanup удаляет лишние collinear points, но не ручные
  constraints;
- crossing без junction не выглядит как соединение;
- junction имеет отдельный glyph/hit target и является selectable entity.

### 6.6 Context menu

- стационарный right-click открывает меню для entity под курсором;
- если уже есть mixed selection и right-click попадает в неё, действия
  применяются ко всему selection;
- destructive action сообщает scope (`Delete 3 rooms and 5 corridors`);
- команды, открывающие dialog, получают многоточие;
- меню не выходит за viewport и доступно с клавиатуры;
- pan gesture никогда не заканчивается открытым меню.

## 7. TTRPG-specific UX requirements

### 7.1 Два режима чтения одной карты

Рабочая карта должна иметь export/view profiles:

- **GM plan:** все помещения, secret routes, hazards, notes, topology health;
- **Player handout:** только открытые зоны и разрешённые markers;
- **VTT tactical:** grid-flush image + walls/doors/lights/visibility semantics;
- **Print:** высокий контраст, grayscale-safe patterns, scale и legend.

Это не четыре независимые карты. Профили меняют visibility/style, но используют
один document.

### 7.2 Иерархия игровой информации

На любой палубе должны быстро считываться:

1. внешние входы, docking airlocks и escape interfaces;
2. основные зоны и магистраль;
3. двери/шлюзы и контролируемые choke points;
4. альтернативные/скрытые/сервисные пути;
5. вертикальные связи между палубами;
6. hazards, objectives и важные interactables.

Цвет не является единственным кодом. Для door state, route class и visibility
используются shape, pattern и/или icon.

### 7.3 Карта не обязана быть battlemap

Для Mothership полезны и точные VTT deckplans, и абстрактные zone maps.
Гипотеза для последующей проверки: при генерации предложить output intent
`Schematic / Tactical / Hybrid`.

- `Schematic` оптимизирует крупные зоны, связи и печатную читаемость.
- `Tactical` оптимизирует grid, doors, cover и точные размеры.
- `Hybrid` сохраняет точную топологию, но применяет overview LOD.

Не следует смешивать этот выбор со style theme: Blueprint — визуальная тема,
а Schematic/Tactical — уровень пространственной детализации.

## 8. Acceptance matrix

| Проверка | Unit/property | Interaction | Browser/visual |
|---|---:|---:|---:|
| Actual preview without document mutation | hash | state | required |
| Apply actions visible at 720 px height | — | — | required |
| Right-drag suppresses menu, click opens it | gesture | state | required |
| Native context menu never appears on canvas | — | — | required |
| Room move preserves only affected connections | property | state | required |
| Alt detaches only affected endpoints | property | state | required |
| Ctrl/Cmd temporarily inverts snap | unit | state | required |
| Esc/pointercancel restores begin hash | hash | state | required |
| One gesture = one undo entry | hash | state | required |
| noPath keeps last valid route | property | state | required |
| Locked waypoint survives reroute | property | state | required |
| Segment drag stays orthogonal | property | state | required |
| Mixed selection and marquee direction | unit | state | required |
| Locked/hidden layer rejects mutation | unit | state | required |
| Door remains on wall through move/resize | property | state | required |
| Fit includes hull at all target viewports | bounds | — | required |
| LOD keeps critical labels readable | — | — | visual |
| Keyboard toolbar/dialog/context menu | — | keyboard | a11y |
| Canvas object list mirrors document | schema | state | screen reader |

### Performance budgets

Контрольные карты и устройство фиксируются в тестовом профиле.

- M-map drag preview: p95 ≤ 50 ms на update.
- L-map drag preview: p95 ≤ 100 ms; допускается simplified route.
- Final reroute M: p95 ≤ 300 ms.
- Операция > 300 ms показывает понятный progress/status.
- Во время drag unrelated corridor JSON остаётся byte-identical.
- Zoom/pan не записывается в document history.

Это стартовые бюджеты, а не обещание для любого устройства; их следует
пересмотреть после замеров, но не удалять без замены.

## 9. Предлагаемый порядок реализации

### Сейчас — P0/P1 foundation

1. Настоящий draft overlay и единый sticky action footer генератора.
2. Реальный fit-to-view через measured canvas + hull bounds.
3. Unified pointer command lifecycle и no-op/history guarantees.
4. Canonical modifier matrix и видимая drag feedback.
5. Stable mixed selection refs и общий hit-test pipeline.
6. Door selectable object и topology anchor.

### Следом — playable editor

1. Segment/waypoint/junction interaction model.
2. Реальный layer lock/visibility/hit-testing.
3. Error/repair UX для `noPath` и collision.
4. Overview/tactical/detail LOD.
5. GM/player/VTT/print profiles.

### Затем — professional polish

1. Keyboard/a11y object list, semantic context menu и toolbar focus.
2. Edge auto-pan, minimap, focus mode, smart guides.
3. Object manipulation и searchable asset/object panel.
4. Shortcut preferences и trackpad/touch profiles.

## 10. Source ledger

Все ссылки проверены 2026-07-29, если не указано иное.

### Canvas и editor interaction

- [Foundry VTT — Game Controls](https://foundryvtt.com/article/controls/) —
  подтверждает right-drag pan, wheel zoom, Shift selection, Esc/cancel,
  keyboard movement и обход snap во время drag. Использовать как TTRPG
  familiarity reference, а не копировать все назначения клавиш.
- [Figma — Adjust zoom and view options](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options) —
  zoom-to-fit, zoom-to-selection, отображаемый процент и trackpad pinch.
- [Figma — Use Figma products with a keyboard](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard) —
  keyboard canvas navigation и доступ к инструментам.
- [tldraw — Editor](https://tldraw.dev/sdk-features/editor) — полезное
  архитектурное разбиение на state machine, inputs, snap, edge scroll,
  preferences, selection и camera managers.
- [tldraw — History](https://tldraw.dev/sdk-features/history) — mark/bail/squash
  как референс для atomic gesture, Esc rollback и coalesced undo.
- [Krita — View Menu](https://docs.krita.org/en/reference_manual/main_menu/view_menu.html) —
  canvas-only mode, guides/grid/snap и роль status bar.

### Connections и routing

- [draw.io — Work with connectors](https://www.drawio.com/docs/manual/connectors/) —
  различие floating/fixed ports, явные endpoint handles и изменение пути
  перетаскиванием сегмента.
- [draw.io — Connector waypoints](https://www.drawio.com/docs/manual/connectors/waypoints-connectors/) —
  добавление/удаление waypoints, clear waypoints и возвращение к shortest path.
- [yFiles — Edge Routing](https://docs.yworks.com/yfiles-html/dguide/automatic-layouts-main-chapter/polyline_router.html) —
  orthogonal routing, minimum first/last segment length, distances, grid,
  incremental scope и сохранение хороших маршрутов.
- [yFiles — Port Placement](https://docs.yworks.com/yfiles-html/dguide/port_placement/) —
  port candidates и local orthogonal correction при перемещении ports.

### TTRPG и sci-fi map workflows

- [Mothership Map Viewer / Creator](https://foundryvtt.com/packages/mothership-map-viewer) —
  hallways snap к room edges, endpoint markers Door/Grate/Airlock/None,
  right-drag pan, visibility per room/marker/hallway, JSON/share import.
- [Mothership Map Creator](https://eddiedover.github.io/mothership-map-viewer/) —
  минимальный creator flow и прямые подсказки инструментов.
- [Foundry VTT — Walls](https://foundryvtt.com/article/walls/) — двери как
  самостоятельная семантика движения/зрения/звука, wall chaining и sub-grid
  snap.
- [Foundry VTT — Canvas Layers](https://foundryvtt.com/article/canvas-layers/) —
  разделение background, foreground и GM semantic layers.
- [Station Blueprint Designer](https://stationdesigner.app/) — модульная
  сборка силуэта, rotate/flip/delete и multi-select как референс manual hull
  composition.
- [NEWT Blueprint Builder](https://delacannon.itch.io/newt-blueprint-builder) —
  retro blueprint, props layer, symmetry props, JSON, PNG и random maps.
  Комментарии также показывают цену ненадёжного round-trip, скрытых shortcuts и
  непонятной библиотеки props.
- [Lazarus Ship Catalog](https://gm-lazarus.itch.io/ship-catalog) — один набор
  кораблей поставляется как VTT deckplans, printable PDFs, infrastructure maps
  и Mothership sheets; это поддерживает идею output profiles из общего
  документа.
- [Derelict Ship Generator](https://delacannon.itch.io/derelict-ship-generator) —
  пример перехода от процедурной схемы к PDF/Twine, но комментарии отдельно
  подтверждают спрос на последующее редактирование.

### Accessibility

- [W3C APG — Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) —
  role/name, один Tab stop и arrow navigation внутри toolbar.
- [W3C APG — Menu and Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) —
  keyboard/focus contract для custom context menu.
- [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) —
  минимум 24×24 CSS px или достаточный spacing/equivalent control.
- [W3C — Non-text Contrast](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html) —
  3:1 для необходимых borders, focus, selection и graphical cues.
- [MDN — Canvas accessible content](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage#accessible_content) —
  canvas требует полезного fallback/alternative DOM, если несёт смысл.

## 11. Открытые гипотезы для пользовательской проверки

1. Marquee direction (contain/touch) понятнее, чем дополнительный modifier.
2. `Ctrl/Cmd` как временный snap override не конфликтует с привычкой drag-copy;
   если drag-copy станет обязательным, потребуется configurable mapping.
3. Junction по умолчанию при drop на corridor безопаснее скрытого Alt policy.
4. Overview/tactical/detail LOD лучше одного универсального масштаба подписей.
5. `Schematic / Tactical / Hybrid` помогает Mothership-ведущим, не усложняя
   базовый генератор.
6. Inspector лучше постоянного свойства panel, а частые route repair actions —
   компактного context toolbar рядом с selection.

Для проверки достаточно 5–7 ведущих с разным опытом. Каждому дать одинаковые
задачи из раздела 3, измерять завершение без подсказки, число Undo/rollback,
ошибочные detach и время до понимания Apply/Discard.

## 12. Известные ограничения этого аудита

- Проверен desktop mouse/keyboard flow; touch, pen и настоящий Mac modifier
  mapping не проверялись.
- Внешние продукты изучались по их публичной документации и доступным страницам,
  а не как сравнительный usability benchmark на одинаковых задачах.
- Визуальная читаемость Lazarus/NEWT/Station Designer использована как
  направляющая, но не как требование копировать защищённые ассеты или стиль.
- Полное соответствие WCAG нельзя подтвердить скриншотом и DOM snapshot:
  необходимы keyboard, screen reader и contrast tests.

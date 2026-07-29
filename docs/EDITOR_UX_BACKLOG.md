# Editor UX Backlog

**Статус:** единый backlog для post-generation editing
**Область:** комнаты, коридоры, двери, объекты, точки соединения, история и
facility composition
**Связанные документы:**
`editor/16_corridor_editor_spec.md`, `editor/17_edge_router_spec.md`,
`editor/18_corridor_acceptance_tests.md`, `ui-qol/11_input_model_mouse_keyboard.md`,
`architecture/MAP_EDITOR_TECHNOLOGY_ADR.md`

## 1. Легенда

- ✅ Готово и покрыто acceptance tests.
- ⚠️ Частично: базовый UI или типы существуют, но контракт ниже не выполнен.
- 🔄 В работе.
- ❌ Не начато.

Статус «готово» ставится только после проверки generated и manually-created
объектов одним и тем же набором acceptance tests.

## 2. Неподвижные UX-инварианты

1. После генерации все объекты остаются полноценными редактируемыми объектами.
   Generated и manual карты не должны использовать разные правила drag,
   attachment, routing или undo.
2. Связи сохраняются по умолчанию. Настройка **Preserve attachments** включена
   при первом запуске и видима в toolbar/status bar.
3. `Alt` во время room/endpoint drag временно **инвертирует**
   **Preserve attachments**. При включённом toggle Alt-drag явно перемещает
   owner без сохранения connections и detach только endpoints, anchored к нему;
   при выключенном toggle Alt временно возвращает режим сохранения. Grid snap
   управляется отдельным toggle `S`. До commit canvas показывает snap candidate
   или detach state; connections других owners не меняются.
4. Постоянный toggle **Preserve attachments** позволяет заранее выбрать режим
   серии операций. Toggle `off` даёт detach-only-affected-endpoints contract.
   Его состояние видно до начала drag, сохраняется в preferences и не меняет
   связи до фактического transform gesture.
5. Комната владеет локальной системой координат для дверей и содержащихся в ней
   объектов. Move комнаты перемещает room/door/object как одну зависимую группу.
6. Геометрия коридора в модели всегда ортогональна. Диагональный segment —
   invalid model state; renderer не имеет права молча дорисовывать колено,
   которого нет в документе.
7. Один жест пользователя вместе со всеми зависимыми изменениями является одной
   atomic history transaction. `Undo` возвращает комнату, двери, объекты,
   attachments и rerouted corridors одновременно.
8. `Esc` отменяет активный gesture и восстанавливает pre-drag snapshot.
   Pointer capture гарантирует завершение или отмену жеста, даже если курсор
   покинул canvas.
9. Reroute не изменяет незатронутые corridors и locked waypoints.
10. `noPath` не коммитит повреждённую геометрию: остаётся last valid route,
    показывается diagnostic и предлагаются конкретные repair actions.

## 3. Канонический контракт соединений

Topology хранится отдельно от вычисляемого route. Endpoint обязан ссылаться на
один из стабильных anchors:

```ts
type EndpointAnchor =
  | { kind: 'roomPort'; roomId: string; portId: string }
  | { kind: 'door'; roomId: string; doorId: string }
  | { kind: 'junction'; junctionId: string }
  | {
      kind: 'corridorPoint'
      corridorId: string
      segmentId: string
      offset: number
    }
  | { kind: 'free'; position: Point }
```

Дополнительные правила:

- `roomPort` и `door` хранят wall side и нормализованный offset `0..1`;
  world position является derived.
- `fixed` port сохраняет wall side и offset; `sliding` port сохраняет wall side,
  а offset может выбирать router.
- Corridor хранит anchors, width/clearance, intersection policy и
  locked waypoints. Auto waypoints и path являются derived/cache.
- Generated importer создаёт те же anchors, что и ручной Corridor tool.
- Junction и corridorPoint используют stable ids; индекс массива segment не
  является устойчивым идентификатором.
- Удаление owner объекта либо запрещено до подтверждения, либо выполняется
  одной командой с детерминированной политикой detach/delete dependants.

## 4. P0 — корректность post-generation editing

### P0.1 Canonical endpoint anchors

**Статус:** ⚠️ Частично — generated physical edges теперь получают точные `roomPort`, `junction`, `corridorPoint` или `free` anchors; migration и полный manual parity ещё не готовы.

**Задачи:**

- Ввести `EndpointAnchor` и stable port/door/junction/segment ids.
- Мигрировать generated и manual corridors на общий topology contract.
- Добавить versioned migration для сохранённых проектов.
- Удалить зависимость selection/editing от `corridorId:segmentIndex`.

**Acceptance criteria:**

- Любой generated room port имеет обратную ссылку на topology edge.
- JSON round-trip сохраняет тип anchor и stable ids.
- Moving a generated room обновляет связанные endpoints без ручного attach.
- Удаление или split segment не переназначает другой logical segment старому id.

### P0.2 Dependent room, door and object transforms

**Статус:** ⚠️ Частично — room drag уже перемещает bounds, absolute doors и objects одним delta; room-local schema и resize policies ещё не готовы.

**Задачи:**

- Хранить door position относительно wall комнаты.
- Хранить contained object transform в room-local coordinates.
- Определить resize policies: keep-relative, clamp-inside, reflow или diagnostic.
- Уважать room/object lock.

**Acceptance criteria:**

- Move комнаты одинаково перемещает её doors и contained objects.
- Resize сохраняет дверь на корректной стене и offset в диапазоне `0..1`.
- Ни дверь, ни объект не остаются на старых world coordinates.
- Один Undo восстанавливает всю зависимую группу.

### P0.3 Preserve attachments, Alt override and persistent toggle

**Статус:** ⚠️ Частично — видимый persistent toggle готов и хранится отдельно от
документа; `Alt` инвертирует его для room/endpoint drag. Endpoint drop умеет
создавать `roomPort`, legacy room-wall, `junction`, `corridorPoint` и `free`
binding с preview. Explicit Attach/Detach/Reattach actions, affected-count и
единая modifier policy для resize/door/object ещё не готовы.

**Задачи:**

- Добавить видимый toggle **Preserve attachments**, default `on`.
- Расширить temporary `Alt` override на все drag state machines.
- При Alt-drag room/owner или toggle `off` detach только endpoints, anchored к
  этому owner; не затрагивать connections остальных объектов.
- Показывать detach preview, affected connection count и modifier hint до commit.
- Добавить explicit **Attach**, **Detach** и **Reattach** actions.
- Показывать snap candidate и будущий anchor до mouseup.

**Acceptance criteria:**

- Обычный room drag сохраняет connections.
- Обычный endpoint drag магнитится к roomPort/door/junction/corridorPoint.
- Alt-drag endpoint позволяет создать `free` anchor без невидимого snap.
- Alt-drag room/owner detach только anchored к нему endpoints, показывает
  preview/hint и не меняет unrelated connections.
- Toggle `off` даёт тот же результат, что Alt-drag, для следующего transform.
- Toggle сохраняется после reload и его состояние визуально различимо.
- Один Undo восстанавливает transform и все detached endpoints.

### P0.4 Dirty incremental reroute

**Статус:** ⚠️ Частично — room drag/commit перестраивает только attached
legacy/roomPort corridors вокруг комнат; `noPath` откатывает комнату и все её
затронутые routes. Envelope/voids, locked waypoints и dependency index ещё не готовы.

**Задачи:**

- Построить dependency index `anchor owner -> affected corridors`.
- На move/resize помечать dirty только связанные routes и routes в collision
  region.
- Во время drag показывать throttled simplified preview; на commit запускать
  полный deterministic reroute.
- Obstacles: комнаты, inflated clearance, facility envelope, structural voids,
  locked routes и запрещённые crossing policies.
- Сохранять locked waypoints; менять только auto waypoints/segments.

**Acceptance criteria:**

- Corridor обходит перемещённую комнату и не пересекает другие комнаты.
- Route остаётся внутри разрешённого envelope и вне structural voids.
- Unaffected corridor JSON остаётся byte-identical.
- Locked waypoint остаётся byte-identical.
- Connectivity и endpoint anchors сохраняются после reroute.
- `noPath` возвращает last valid route и actionable diagnostic.

### P0.5 Atomic interaction transactions

**Статус:** ⚠️ Частично — room и corridor-point drag хранят pre-gesture
snapshot, `Esc` восстанавливает его без history entry, mouseup вне canvas
завершает активный жест, а обычный commit создаёт один history snapshot.
Pointer capture/pointercancel, no-op suppression и inspector/context actions
ещё не объединены единым command contract.

**Задачи:**

- Реализовать begin/update/commit/cancel для каждого pointer gesture.
- Добавить pointer capture и window-level fallback для pointerup/cancel.
- Объединить dependent transform и reroute в одну command transaction.
- Coalesce inspector typing в одну history entry.
- Исключить viewport, hover и preview из document history.

**Acceptance criteria:**

- Один drag создаёт ровно один undo step.
- Mouseup вне canvas корректно завершает gesture.
- `Esc` во время drag не оставляет частичных изменений.
- Undo/redo восстанавливает одинаковый document hash.
- Context menu и inspector mutations undoable.

### P0.6 Orthogonal model invariant

**Статус:** ⚠️ Частично — генератор и endpoint/waypoint drag создают явные H/V
segments на command boundary; import legacy diagonal ортогонализируется до
editor. Perpendicular segment drag и schema-level validator/reject ещё не готовы.

**Задачи:**

- Запретить commit диагональных segments на command/schema boundary.
- После endpoint/waypoint/segment drag строить явные H/V segments.
- Добавить validation/repair для старых diagonal documents.

**Acceptance criteria:**

- В документе каждый segment удовлетворяет `x1 === x2 || y1 === y2`.
- Rendered path совпадает с serialized path без скрытых bend points.
- Import invalid diagonal выдаёт migration diagnostic либо детерминированно
  ортогонализируется до render.

## 5. P0 — отдельный epic Facility Composition

### P0.F Facility envelope, hull and background composition

**Статус:** ⚠️ Частично — generated envelope и hull-aware masks существуют;
единый manual composition workflow и modular silhouette отсутствуют.

Этот epic отделён от room/corridor manipulation. Hull/background не должны
маскировать отсутствие topology attachments или вычисляться как случайный union
комнат.

**Задачи:**

- Хранить facility envelope/hull отдельным canonical layer.
- Разделить background, terrain/reference, hull/envelope, structural voids,
  rooms и corridors.
- Для генератора строить узнаваемый modular silhouette для:
  - ship: bow/aft axis, hull sections, docking/engine exterior interfaces;
  - station: hub/ring/spokes/trusses;
  - base/outpost: hub, separated modules и exterior links.
- Добавить manual **Facility/Hull mode**: place/drag/resize modular hull parts,
  соединять compatible sockets, union/subtract sections и редактировать voids.
- Позволить вручную собирать силуэт из тех же модулей/правил, которые доступны
  generator strategy.
- Валидировать room/corridor containment отдельно от background decoration.

**Acceptance criteria:**

- Ship/station/base различимы по силуэту без room labels.
- Manual map может получить envelope до или после размещения комнат.
- Room drag не изменяет hull, если Facility/Hull mode не активен.
- Background image не считается проходимой или structural geometry.
- Generated и manual modular silhouette проходят одинаковые containment tests.
- JSON/SVG/PNG round-trip сохраняет layer order, envelope и structural voids.

## 6. P1 — единая и понятная манипуляция

### P1.1 Unified selection and transform

**Статус:** ⚠️ Частично.

- Mixed selection для rooms/corridors/doors/objects/junctions.
- Hit priority: handles → ports/doors → objects → corridors → rooms → canvas.
- Shift toggle, marquee contain/touch, group drag и arrow nudge.
- Selection сохраняется при inspector edit и смене видимого panel.

**Acceptance criteria:**

- Group drag не схлопывает multi-selection до одного объекта.
- Shift-marquee добавляет к текущему selection.
- Overlap cycling позволяет выбрать объект под верхним объектом.
- Locked/hidden layer не принимает pointer events.

### P1.2 Corridor handles and manual control

**Статус:** ⚠️ Частично.

- Endpoint handles, locked waypoint handles и perpendicular segment handles.
- Double click добавляет locked waypoint.
- Delete waypoint запускает local reroute.
- Whole-route drag разрешён для free route; attached route сохраняет anchors.
- Context actions: Reroute, Lock route, Unlock auto segments, Attach/Detach,
  Convert to junction/line jump.

**Acceptance criteria:**

- Segment drag сохраняет orthogonality и locked waypoints.
- Endpoint drop на corridor создаёт junction либо line jump по выбранной policy.
- Ручной bend не исчезает при следующем room move.

### P1.3 Door editing

**Статус:** ❌ Не начато как самостоятельный selectable object.

- Select/drag door вдоль wall, inspector type/state/security, delete/duplicate.
- Door может быть endpoint anchor.
- Door hit area и handle не конкурируют с room fill.

**Acceptance criteria:**

- Door невозможно случайно унести со стены.
- Изменение door position перестраивает attached corridor.
- Door type/state сохраняются в JSON и VTT export.

### P1.4 Collision preview, diagnostics and locks

**Статус:** ⚠️ Частично.

- Live valid/conflict/noPath preview.
- Quick actions: reduce clearance, reroute, add waypoint, detach, cancel.
- Room, route, graph, style и deck locks реально блокируют mutation.
- Layer visibility/lock/opacity влияют на render и hit testing.

**Acceptance criteria:**

- Невалидный drop не проходит молча.
- Lock state одинаково соблюдается pointer, keyboard, inspector и regeneration.
- Diagnostic указывает конкретные entities и repair hint.

## 7. P2 — objects и редакторская полировка

### P2.1 Object manipulation

**Статус:** ❌ Не начато в canvas UI.

- Place/drag/resize/rotate/duplicate props.
- Grid, guide и room-interior snap.
- Collision policy по object template.
- Multi-select и batch inspector.

### P2.2 Object panel and discoverability

**Статус:** ❌ Не начато.

- Search/filter, center on object, layer grouping, lock/hide.
- Context toolbar дублирует основные inspector/context actions.
- Tooltips показывают shortcut и modifier semantics.

### P2.3 Smart guides, accessibility and performance

**Статус:** ❌ Не начато.

- Alignment/distribution guides и edge auto-pan.
- Keyboard focus, ARIA announcements и non-canvas object list.
- Reduced motion и high-contrast handles.
- Spatial index, partial scene redraw и measurable drag/reroute budgets.

**Acceptance criteria:**

- Drag preview остаётся responsive на контрольных S/M/L картах.
- Все основные transforms выполняются клавиатурой.
- Modifier behavior одинаков для room/corridor/door/object tools.

## 8. Обязательный test matrix

| Сценарий | Unit | State machine | Playwright |
|---|---:|---:|---:|
| Generated room move + attached reroute | ✅ | ✅ | ✅ |
| Room resize + door/object dependencies | ✅ | ✅ | ✅ |
| Endpoint Alt-drag to free anchor | ✅ | ✅ | ✅ |
| Persistent Preserve attachments toggle | ✅ | ✅ | ✅ |
| Locked waypoint survives reroute | ✅ | ✅ | ✅ |
| Segment drag remains orthogonal | ✅ | ✅ | ✅ |
| noPath rollback and diagnostic | ✅ | ✅ | ✅ |
| Undo/redo atomic dependent transform | ✅ | ✅ | ✅ |
| Pointerup outside canvas / Esc cancel | — | ✅ | ✅ |
| Ship/station/base modular silhouette | ✅ | — | ✅ |
| Manual hull composition + containment | ✅ | ✅ | ✅ |

Дополнительно для routing применяются property-based invariants:

- нет `NaN` и diagonal segments;
- route не входит в inflated obstacles;
- endpoint position соответствует anchor;
- connectivity не ухудшается после successful commit;
- результат детерминирован при одинаковом document, command и settings.

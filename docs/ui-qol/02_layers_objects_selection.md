# 02 — Слои, объекты, выделение и массовые операции
Дата: 2025-12-17
## 2.1 Слои (Layers)
Минимально обязательные слои:
- Background (фон/рамка/легенда)
- Rooms (геометрия комнат)
- Corridors (коридоры/двери/шлюзы)
- Icons/Props (иконки/объекты)
- Labels (тексты)
- Notes (GM/скрытые)
- Networks (vents/cables/security)
QOL: “Custom Layers”
- Пользователь может создавать свои слои: имя, тип (vector/label/overlay), порядок, видимость, lock, opacity.
- Drag&drop reorder.
- Быстрые кнопки “solo layer” и “lock all but this”.
## 2.2 Панель объектов (Object list / Object panel)
- Список объектов по типам: rooms / corridors / doors / junctions / icons / labels.
- Поиск и фильтры:
  - по имени/тегу
  - по типу
  - “locked only”, “hidden only”
- Выбор из списка подсвечивает объект на карте и центрирует (опционально).
QOL: “Командные операции из панели”
- поле ввода “команд” (command palette style), например:
  - “select locked”
  - “hide labels”
  - “unlock all”
  - “undo 25”
  - “save snapshot”
## 2.3 Выделение/манипуляции
- Marquee selection (рамкой).
- Multi-select + групповое перемещение.
- Duplicate (Ctrl+D) с “smart offset”.
- Lock/unlock (L), hide/show (H).
- Z-order в пределах слоя: bring forward/back.
## 2.4 Группы и “сохранить группу как пресет”
- Group/ungroup.
- “Save group as stamp/preset”:
  - сохраняет набор объектов как пресет,
  - с относительными координатами,
  - с настраиваемыми “портами подключения” (для модулей/геоморфов).
## 2.5 Replace / Find & Replace
- Найти все объекты “типа/тега” и заменить на другой ассет/иконку/стиль.
- Режимы:
  - “replace all”
  - “replace in selection”
  - “replace in brush area”

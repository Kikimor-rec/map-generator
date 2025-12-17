# 11 — Модель ввода: мышь/тачпад/клавиатура + контекстные действия

Дата: 2025-12-17

Этот документ фиксирует **ожидаемое поведение ввода** (input model), чтобы:
- редактор ощущался “как профессиональный” (диаграммы/графика),
- одинаково работал мышью и тачпадом,
- был предсказуемым для пользователей VTT/картографов.

---

## 11.1 Термины
- **Tool** — активный инструмент (select/room/corridor/icon/text…)
- **Mode** — подрежим инструмента (например corridor: draw/edit)
- **Modifier** — клавиши Shift/Ctrl( Cmd )/Alt
- **Object** — любая сущность на канвасе (room/corridor/junction/icon/label…)

---

## 11.2 Навигация по канвасу (camera controls)

### Мышь
- Колесо: zoom к курсору (обяз.)
- Средняя кнопка + drag: pan (обяз.)
- Space + ЛКМ drag: pan (обяз., альтернатива)
- Shift + колесо: горизонтальный скролл (если применимо)

### Тачпад
- Two-finger scroll: pan
- Pinch: zoom
- Two-finger rotate: *не использовать* по умолчанию (чтобы не было случайных поворотов), но можно включить в настройках.

### Кнопки вида
- Zoom to fit
- Zoom 100%
- Center on selection
- Toggle minimap

---

## 11.3 Общая модель выделения (selection model)

### ЛКМ клик
- по объекту: выделить объект (single selection)
- по пустому месту: очистить выделение

### Shift + ЛКМ
- добавить/убрать объект из выделения (multi-select toggle)

### Drag рамкой (marquee)
- ЛКМ drag по пустому месту: рамка выделения
- Shift: добавить рамку к текущему выделению
- Alt (опционально): “touch select” (выбирать то, что касается рамки), иначе — “contain select” (только то, что внутри)

### Двойной клик
- по комнате: открыть properties/inspector комнаты
- по коридору: добавить waypoint (или открыть inspector ребра — зависит от текущего инструмента)
- по тексту: редактирование текста

### Esc
- отмена текущей операции инструмента
- закрыть popover/контекстное меню
- очистить “preview state” (например pre-route preview)

---

## 11.4 Контекстное меню (ПКМ)

ПКМ по объекту должен открывать меню, релевантное типу объекта:

### Комната (Room)
- Rename
- Change type
- Change color/style
- Toggle locked
- Duplicate
- Add note / Open note
- Create preset from selection (если выделена группа)

### Коридор (Corridor)
- Insert waypoint
- Toggle line-jump policy (avoid / lineJump)
- Add junction here
- Convert segment to door/bulkhead/airlock (если клик по сегменту)
- Set widthClass (narrow/standard/wide)
- Toggle locked (route lock)
- Delete

### Иконка/объект (Icon/Prop)
- Change asset
- Rotate / flip (если есть)
- Bring forward/back (в пределах слоя)
- Add tag
- Lock / hide

### Выделение (несколько объектов)
- Group / Ungroup
- Save as preset
- Align / Distribute
- Lock / Hide
- Delete

### ПКМ по пустому месту
- Paste
- Create label here
- Add guide/ruler marker (опционально)
- “Generate…” быстрый доступ (если включено)

Требование: меню должно быть **keyboard-friendly** (стрелки/Enter/Esc) и доступным.

---

## 11.5 Перемещение/трансформации

### Drag перемещение
- ЛКМ drag по выделенному объекту: перемещение
- Shift при перемещении: ограничить ось (X/Y)
- Alt при перемещении: временно отключить snap
- Ctrl/Cmd при drag: дублировать “на лету” (drag-copy) — опционально

### Resize/handles
- Комнаты должны иметь handles.
- Shift при resize: сохранить пропорции (если применимо)
- Alt: ресайз от центра (опционально)

---

## 11.6 Инструмент-контракты (tool contracts)

### Select tool (V)
- основное действие: выбор/перемещение
- двойной клик: открыть inspector

### Room tool (R)
- click+drag: создать комнату прямоугольником
- click: создать комнату дефолтного размера (опционально)
- Shift: квадрат/фиксированная пропорция

### Corridor tool (C)
- click на порт: начать коридор
- drag: live preview маршрута
- click: поставить waypoint (locked) в точке
- Alt: завершение на коридоре → line jump вместо junction (или наоборот, по настройке)
- Shift: фиксировать направление сегмента (если включён “manual segment mode”)

### Icon tool (I)
- click: поставить объект
- drag: разместить с предпросмотром
- R/E: rotate (опционально)

### Text tool (T)
- click: создать текстовую метку
- двойной клик по тексту: редактировать

---

## 11.7 Быстрые клавиши (дополнение)
Должны работать независимо от локали (RU/EN раскладки):
- инструменты — через key codes (не через символ)
- альтернативы: цифры или панель инструментов

---

## 11.8 Настройки, влияющие на input
- “Right click opens context menu” (on/off)
- “Invert zoom” (on/off)
- “Pan requires Space” (on/off)
- “Marquee selects by touch/contain”
- “Disable trackpad rotate”
- “Tablet mode” (перо): long-press = context menu, two-finger pan/zoom

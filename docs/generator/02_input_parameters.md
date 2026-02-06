# 02 — Входные параметры генерации

> **Статус реализации (2026-02-06):**
> - ✅ = реализовано в коде
> - ⏳ = запланировано
> - Нереализованные параметры будут игнорироваться генератором

## 2.1 Обязательные поля
- ✅ `seed`: string | number
  Должен полностью определять результат при фиксированном конфиге.

- ✅ `archetype`:
  `ship | station | outpost`
  > ⏳ Расширенные архетипы (`asteroidMine`, `beaconRelay`, `derelict`, `factoryModule`, `prisonTransport`, `habitatCylinder`, `megaringSegment`, `colonyBlock`, `listeningPost`) — запланированы на v0.3.0+

- ✅ `subtype`: зависит от `archetype`, см. 13_archetypes_subtypes.md

- ✅ `styleProfile`: `realism | futurism`

- ✅ `sizeTier`: `xs | sm | md | lg | xl`
  Используется для `roomBudget`, размеров, вероятностей и ограничений.

## 2.2 Геометрия и читаемость
- ✅ `gridUnit`: number (например 1 = 1 клетка)
- ⏳ `boundsHint`: { w, h } (опционально) — если нужно уложиться в размер.

- ⏳ `symmetry`: number 0..1 — *запланировано v0.3.0*
  0 — свободная асимметрия, 1 — строгая симметрия (по выбранной оси/схеме).

- ⏳ `modularity`: number 0..1 — *запланировано v0.3.0*
  0 — монолитная схема, 1 — явно модульная (хабы, рукава, pods).

- ⏳ `readability`: number 0..1 — *запланировано v0.3.0*
  1 — максимально простая карта: меньше пересечений/поворотов/разветвлений.

## 2.3 Геймплей
- ✅ `loopiness`: number 0..1
  Доля циклов/обходов (нелинейность).

- ⏳ `secretness`: number 0..1 — *запланировано v0.3.0*
  Сколько скрытых путей/секретных комнат/служебных обходов.

- ✅ `danger`: number 0..1
  Сколько опасных зон, bulkhead-изоляций, "закрытых" областей.

- ⏳ `setpieceBias`: number 0..1 — *запланировано v0.3.0*
  Насколько генератор стремится создавать "большие сцены" (ангар, реакторный зал).

## 2.4 Уровни/палубы
- ⏳ `decks`: number | "auto" — *запланировано v0.3.0*
- ⏳ `maxRoomsPerDeck`: number (опционально) — *запланировано v0.3.0*
- ⏳ `verticality`: number 0..1 — *запланировано v0.3.0*

## 2.5 Контроль содержания
- ⏳ `roomCountTarget`: number — *запланировано v0.3.0*
- ⏳ `includeList`: string[] — *запланировано v0.3.0*
- ⏳ `excludeList`: string[] — *запланировано v0.3.0*
- ⏳ `mustHaveSetpieces`: string[] — *запланировано v0.3.0*
- ⏳ `accessPolicy`: "soft"|"strict" — *запланировано v0.3.0*

## 2.6 Ограничения (hard) — *все запланировано v0.3.0+*
- ⏳ `maxCorridorLength`: number
- ⏳ `maxDeadEndRatio`: number 0..1
- ⏳ `minAltPathsBetweenCritical`: number (например 2)
- ⏳ `maxIntersectionsPerDeck`: number
- ⏳ `maxRoomsTotal`: number (верхний предел)

## 2.7 Выход/отладка
- ⏳ `outputVersion`: string (например `"1.0"`)
- ✅ `debug`: boolean
- ⏳ `trace`: boolean (подробные шаги)

## 2.8 Профили по умолчанию (рекомендация)
Рекомендуется иметь встроенные preset‑наборы:
- `mothershipDerelict` (realism, danger↑, secretness↑, readability среднее)
- `nasaSurveyShip` (realism, loopiness среднее, secrecy низкое)
- `spaceOperaCruiser` (futurism, setpieces↑, social zones↑)
- `frontierOutpost` (realism, modularity↑, ventilation routes↑)

Сами пресеты — конфиг‑данные (не в коде).

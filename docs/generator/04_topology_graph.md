# 04 — Топология: генерация графа помещений

## 4.1 Представление графа
`Graph`:
- `V`: комнаты (rooms)
- `E`: связи (connectors), где connector имеет:
  - `kind`: corridor | airlock | bulkheadDoor | serviceHatch | verticalLink
  - `access`: public/crew/restricted/secure
  - `pressurizationBoundary`: boolean
  - `isSecret`: boolean
  - `widthClass`: narrow/standard/wide

Граф строится **в 2–3 слоя**:
- Primary graph (основные пути)
- Service graph (техтуннели)
- Vent graph (вентиляция)

## 4.2 Backbone (скелет)
Сначала строим минимальный “скелет”, зависящий от archetype:

### Ship backbone
Bridge/Command → Core/Habitation → Engineering/Power → Dock/Cargo

### Station backbone
Ops Hub → Dock Arms → (Sectors) → Power (может быть отдельным плечом)

### Outpost backbone
Airlock → Common/Hab → Utility/Power → (Storage/Lab/Vehicle)

Backbone формируется как дерево и гарантирует базовую связность.

## 4.3 Кластеры зон
Комнаты группируются в зоны. Внутри зоны:
- выше вероятность связей “короткими” коридорами,
- ниже безопасность (если зона public/crew),
между зонами:
- контрольные точки (bulkhead/checkpoint), если danger↑ или accessPolicy=strict.

## 4.4 Добавление циклов (loopiness)
Циклы добавляются после дерева:
- выбрать пары узлов, чья дистанция по дереву велика,
- добавить ребро так, чтобы:
  - повысить AltPathScore,
  - создать “кольцо” вокруг центральных зон,
  - не ухудшить ReadabilityScore выше заданного.

Шаблоны циклов:
- ring corridor (особенно для station/habitat),
- bypass corridor (обходной путь вокруг security checkpoint),
- maintenance bypass (секретный обход).

## 4.5 Dead ends (тупики)
Тупики допустимы и иногда нужны (склады, кладовки, лабораторные ниши).
Правила:
- `deadEndRatio` ограничен профилем,
- тупик “оправдан” если:
  - это storage/utility,
  - или это setpiece/сюжетная комната (ловушка),
  - или к тупику есть альтернативный секретный выход.

## 4.6 Service/Vent overlay
Строится отдельно:
- выбрать “якоря” (engineering, lifeSupport, labs),
- соединить их сетью с большей loopiness,
- добавить 2–K “выходов” (service hatches) в основную сеть.

Ограничения:
- vents не должны давать доступ ко всем secure зонам без контрольных точек (если не задуман “саботажный” сценарий).
- секретные комнаты должны иметь хотя бы 1 “обычный” подход или быть явно “blacksite”.

## 4.7 Вертикальные связи (если decks>1)
Добавить:
- 1 основной вертикальный “ствол” (lift/ladder) с доступом public/crew
- 1 резервный (service shaft) если danger↑ или sizeTier≥m
- связи в vent/service графах между палубами

## 4.8 Выход графа
- `rooms[]` (с deckId, zoneId)
- `connectors[]` (между roomId/portId)
- `graphMetrics` (loops, deadends, connectivity, centrality)

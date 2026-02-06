# Edge Router — Алгоритмы и реализация (grid+A* базовый, libavoid/ELK опционально)

> **Note:** Corridor routing is now implemented in `src/generators/gridGenerator/corridorRouter.ts` (graph-first approach with MST + A*). This document may contain outdated design ideas from the spine-first era.

Дата: 2025-12-17

Этот документ фиксирует “как именно” строить ортогональные маршруты.

Источники-ориентиры:
- libavoid: fast, object-avoiding orthogonal/polyline routing для интерактивных редакторов. citeturn0search0turn0search3  
- ELK: опции edgeRouting и port constraints для блок-схем, при orthogonal routing уважает port constraints. citeturn0search1turn0search15turn0search7  
- jsPlumb Toolkit Orthogonal connector: редактируемый маршрут (editable). citeturn0search2turn0search5

---

## 1) Интерфейс роутера (обязательный)

### 1.1 routeEdge
`routeEdge(request) -> result`

request:
- `start`: {x,y} (после stub)
- `end`: {x,y} (после stub)
- `lockedWaypoints`: [{x,y}...]
- `obstacles`: rect/poly (уже inflated)
- `existingEdges`: polylines (для intersection/parallel penalties)
- `grid`: {size, bounds}
- `options`: penalties, intersectionPolicy, maxSearchNodes, timeBudgetMs

result:
- `polyline`: [{x,y}...]
- `autoWaypoints`: [{x,y}...]
- `status`: ok | noPath | approximate

### 1.2 rerouteDirtyEdges
`rerouteDirtyEdges(changeset) -> updatedEdges`

changeset:
- moved/resized rooms
- added/removed edges
- changed router options

---

## 2) Базовый роутинг: grid + A*

### 2.1 Обязательное: inflation препятствий
Вводим:
- `corridorHalfWidth` по widthClass
- `clearance`
Инфлейтим препятствия на `(corridorHalfWidth + clearance)`.

### 2.2 A* на манхэттенской сетке
- 4-соседство (N/E/S/W).
- эвристика: Manhattan distance.

### 2.3 Функция стоимости (рекомендация)
`totalCost = length + turnPenalty + proximityPenalty + intersectionPenalty + parallelPenalty`

Составляющие:
- `length`: 1 за клетку
- `turnPenalty`: штраф при смене направления
- `proximityPenalty`: штраф за близость к препятствиям (по distance field)
- `intersectionPenalty`: INF (main/avoid), низкий (lineJump), или conditional (junction)
- `parallelPenalty`: штраф за параллель ближе N клеток

### 2.4 Упрощение пути
После A*:
- слить коллинеарные сегменты,
- удалить “зубцы” длиной 1, если не ломает constraints,
- оставить минимальный набор точек.

### 2.5 Live-preview
Во время drag:
- ограничить область поиска (локальное окно),
- ограничить nodes/timeBudget,
- если не успели — вернуть approximate (L-образная попытка) + визуальный конфликт,
- при mouseUp сделать полный расчёт.

---

## 3) Locked-waypoints (ручные точки)
Если есть locked-waypoints:
- роутить кусками: start -> wp1 -> wp2 -> ... -> end
- каждый кусок роутится независимо, но с общими obstacles.

---

## 4) Пересечения: junction и line jumps

### 4.1 main-layer
По умолчанию:
- пересечения запрещены (INF), роутер обязан найти обход или вернуть noPath.

### 4.2 line jumps
Если пользователь разрешил line jumps:
- intersectionPenalty снижен,
- после расчёта ищем пересечения и помечаем сегменты “jump” (arc/gap), как в draw.io. citeturn0search20turn0search17

### 4.3 junction
Если пользователь “подключается” к существующему edge:
- создаём junction,
- разрезаем исходный edge на два (или добавляем узел-развилку),
- перестраиваем локальные сегменты.

---

## 5) Альтернативные движки: libavoid / ELK (опционально)

### 5.1 libavoid (через WASM)
Использовать как альтернативный роутер, когда:
- нужна высокая “диаграммная” эстетика без сеточного квантования,
- важна качественная object-avoiding стратегия.

libavoid предназначен для интерактивных редакторов диаграмм. citeturn0search0turn0search9

### 5.2 ELK как пакетный роутинг/автолэйаут
ELK полезен для автолэйаута секторов и дальнейшего ортогонального роутинга и заявляет, что при orthogonal routing уважает port constraints. citeturn0search15turn0search1

---

## 6) Дефолты (стартовые)
- `stubLength = 2`
- `clearanceDefault = 1` (main), `0` (vents/service)
- `turnPenalty = 8`
- `parallelPenalty = 3` при dist<=2
- `intersectionPolicyDefault`:
  - main: avoid
  - vents/service: lineJump (или allow, по профилю)

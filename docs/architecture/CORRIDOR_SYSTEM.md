# Архитектура системы коридоров

## Обзор

Система коридоров обеспечивает создание, редактирование и автоматическую прокладку проходов между комнатами. Реализована согласно спецификации `16_corridor_editor_spec.md`.

## Модули

### 1. corridorTypes.ts

Определяет все типы данных для системы коридоров:

```typescript
// Виды коридоров
type CorridorKind = 'corridor' | 'airlock' | 'bulkheadDoor' | 'serviceHatch' | 'verticalLink'

// Слои
type CorridorLayer = 'main' | 'ventilation' | 'service' | 'cables' | 'security'

// Ширина
type CorridorWidthClass = 'narrow' | 'standard' | 'wide'
```

#### Порты (Ports)

Точки подключения коридоров к комнатам:

```typescript
interface Port {
  id: string
  roomId: string
  side: 'N' | 'E' | 'S' | 'W'
  mode: 'fixed' | 'sliding'
  position: number // 0-1
  connectedCorridorIds: string[]
}
```

- **fixed**: Фиксированная позиция на стене
- **sliding**: Позиция выбирается роутером автоматически

#### Waypoints

Точки изгиба маршрута:

```typescript
interface Waypoint {
  x: number
  y: number
  kind: 'locked' | 'auto'
}
```

- **locked**: Установлено пользователем, сохраняется при перерасчёте
- **auto**: Вычислено роутером, может измениться

#### Junctions

Перекрёстки коридоров:

```typescript
interface Junction {
  id: string
  pos: Point
  kind: 'T' | 'X' | 'hub' | 'airlockChamber'
  rules: JunctionRules
  connectedCorridorIds: string[]
}
```

### 2. corridorRouter.ts

Класс `CorridorRouter` обеспечивает интеллектуальную прокладку маршрутов.

#### Алгоритм A*

```typescript
class CorridorRouter {
  // Настройки
  settings: CorridorRouterSettings
  
  // Препятствия
  rooms: Room[]
  corridors: Corridor[]
  
  // Основной метод роутинга
  route(request: RouteRequest): RouteResult
}
```

#### Особенности алгоритма:

1. **Turn Penalty**: Штраф за повороты для минимизации изгибов
2. **Stubs**: Короткие сегменты от портов перед роутингом
3. **Clearance**: Отступ от стен комнат
4. **Waypoint Support**: Маршрут через заданные точки

#### Настройки роутера:

```typescript
interface CorridorRouterSettings {
  gridSnap: boolean        // Привязка к сетке
  gridSize: number         // Размер ячейки
  clearanceDefault: number // Отступ от стен
  stubLength: number       // Длина stub'ов
  turnPenalty: number      // Штраф за поворот
  intersectionPolicyDefault: IntersectionPolicy
  rerouteOnCollision: boolean
  lineJumpStyle: LineJumpStyle
}
```

### 3. corridorPathfinding.ts

Утилитарные функции для работы с путями:

- `findPathAroundRooms()` — базовый A* вокруг комнат
- `snapToRoomWall()` — привязка к стене комнаты
- `checkCorridorRoomCollision()` — проверка пересечения
- `checkCorridorCorridorCollision()` — проверка пересечения коридоров
- `autoRouteCorridor()` — автоматическая прокладка

## Поток данных

```
[User Action]
     │
     ▼
[CorridorDrawState]  ←─ UI состояние рисования
     │
     ▼
[CorridorRouter.route()]  ←─ Вычисление пути
     │
     ▼
[RouteResult]  ←─ Путь + waypoints + intersections
     │
     ▼
[Corridor Entity]  ←─ Сохранение в store
     │
     ▼
[MapCanvas Render]  ←─ Отрисовка
```

## Intersection Policies

### avoid (по умолчанию)
Маршрут избегает пересечений с другими коридорами.

### junction
Создаётся перекрёсток (T или X типа) при пересечении.

### lineJump
Визуальное пересечение без соединения (дуга/пробел/уступ).

## Line Jump стили

| Стиль | Описание |
|-------|----------|
| `none` | Без визуализации |
| `arc` | Дуга над коридором |
| `gap` | Пробел в линии |
| `sharp` | Уступ вверх-вниз |

## Интеграция с UI

### MapCanvas.tsx

1. **Рисование**: `CorridorDrawState` с `autoRouteMode`
2. **Preview**: Живой предпросмотр маршрута
3. **Editing**: Drag waypoints, добавление новых точек

### События:

- `mousedown` на порте → начало коридора
- `mousemove` → пересчёт preview
- `mouseup` на порте → завершение
- `dblclick` на коридоре → добавить waypoint
- `drag` waypoint → изменить маршрут

## Будущие улучшения

1. **Визуализация junctions**: Рендеринг T/X перекрёстков
2. **Line jump рендеринг**: Дуги и пробелы на пересечениях
3. **Sliding ports**: Автоматический выбор позиции порта
4. **Parallel routing**: Прокладка нескольких коридоров рядом
5. **Constraint-based routing**: Маршрут с учётом ограничений (зоны, clearance)

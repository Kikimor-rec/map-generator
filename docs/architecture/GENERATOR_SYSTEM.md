# Архитектура процедурного генератора

> **Current status (2026-07-29):** The occupancy-grid engine is the only
> production target. The stages below describe the legacy generator and remain
> historical/compatibility material. `quality/pipeline.ts` is not a second
> production target; Phase 1 may extract reusable validation/scoring and retire
> its independent generation path. Production dispatch changes are deferred to
> Phase 1. See [ADR: Active Production Generator](./ACTIVE_GENERATOR_ADR.md).

## Обзор

Процедурный генератор создаёт карты космических кораблей, станций и аванпостов на основе параметров. Реализован 8-этапный пайплайн согласно спецификациям в `docs/generator/`.

## Модули

### 1. types.ts

Основные типы генератора:

```typescript
// Архетипы
type Archetype = 'ship' | 'station' | 'outpost'

// Подтипы кораблей
type ShipSubtype = 'explorer' | 'freighter' | 'military' | 'liner' | 'mining'

// Размерные тиры
type SizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// Профили стиля
type StyleProfile = 'utilitarian' | 'military' | 'luxury' | 'industrial' | 'organic' | 'alien'
```

### 2. rng.ts

Детерминированный генератор случайных чисел:

```typescript
// Mulberry32 алгоритм
function createRNG(seed: string): SeededRNG

interface SeededRNG {
  next(): number        // 0-1
  nextInt(max): number  // 0 to max-1
  shuffle<T>(arr: T[]): T[]
  pick<T>(arr: T[]): T
}
```

### 3. roomConfigs.ts

Каталог из 40+ типов комнат:

```typescript
interface RoomTypeConfig {
  id: string
  category: 'core' | 'crew' | 'engineering' | 'cargo' | 'medical' | 'science' | 'security' | 'access'
  label: string
  countRules: CountRule[]
  sizeByTier: Record<SizeTier, SizeRange>
  importance: 'primary' | 'secondary' | 'support' | 'optional'
  adjacencyPreferences: string[]
  accessLevel: number
}
```

Также определены конфигурации архетипов:

```typescript
interface ArchetypeConfig {
  id: Archetype
  name: string
  subtypes: SubtypeConfig[]
  priorityRooms: string[]
  forbiddenRooms: string[]
}
```

### 4. roomProgram.ts

Генерация программы комнат (Stage 2):

```typescript
function generateRoomProgram(
  request: GenerationRequest,
  rng: SeededRNG
): RoomProgram

interface RoomProgram {
  rooms: ProgrammedRoom[]
  zoneDistribution: Record<Zone, number>
  connectorHints: ConnectorHint[]
}
```

Алгоритм:
1. Получить конфиги для архетипа/подтипа
2. Выбрать обязательные комнаты (priority)
3. Добавить дополнительные по квотам зон
4. Присвоить размеры согласно sizeTier

### 5. topology.ts

Генерация графа связности (Stage 3):

```typescript
function generateTopology(
  program: RoomProgram,
  request: GenerationRequest,
  rng: SeededRNG
): TopologyGraph

interface TopologyGraph {
  nodes: ProgrammedRoom[]
  connectors: GraphConnector[]
  decks: DeckAssignment[]
}
```

Алгоритм:
1. Построить backbone (основной хребет)
2. Добавить clusters вокруг узловых комнат
3. Добавить loops для нелинейности
4. Распределить по палубам
5. Добавить vertical links

### 6. layout.ts

Геометрическое размещение (Stages 4-5):

```typescript
function generateLayout(
  topology: TopologyGraph,
  request: GenerationRequest,
  rng: SeededRNG
): DeckLayout[]

interface DeckLayout {
  deckIndex: number
  rooms: LayoutRoom[]
  connectors: LayoutConnector[]
}
```

Паттерны размещения:
- **linear**: Линейное расположение (корабли)
- **hub**: Радиальное от центра (станции)
- **grid**: Сетка (аванпосты)

### 7. generator.ts

Главный пайплайн:

```typescript
function generateMap(options: GeneratorOptions): GenerationResult

interface GeneratorOptions {
  seed: string
  archetype: Archetype
  subtype: Subtype
  sizeTier: SizeTier
  styleProfile: StyleProfile
  loopiness: number  // 0-1
  danger: number     // 0-1
}
```

## 8-этапный пайплайн

```
┌─────────────────┐
│ 1. Normalize    │  Валидация и нормализация входных параметров
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. Room Program │  Выбор комнат по архетипу и размеру
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. Topology     │  Построение графа связности
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. Deck Assign  │  Распределение по палубам
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. Layout       │  Геометрическое размещение
└────────┬────────┘
         ▼
┌─────────────────┐
│ 6. Layers       │  Заполнение слоёв (декор, объекты)
└────────┬────────┘
         ▼
┌─────────────────┐
│ 7. Validation   │  Проверка правил и ограничений
└────────┬────────┘
         ▼
┌─────────────────┐
│ 8. Export       │  Формирование MapJSON
└────────┴────────┘
```

## Конверсия в формат редактора

```typescript
function convertToEditorFormat(
  mapJson: MapJSON, 
  deckIndex: number
): EditorMapData

interface EditorMapData {
  rooms: Room[]      // core/types.ts Room
  corridors: Corridor[]
  doors: Door[]
}
```

Маппинг типов комнат генератора → редактора:
- `bridge` → `RoomType.Bridge`
- `reactor` → `RoomType.Reactor`
- `crewQuarters` → `RoomType.CrewQuarters`
- и т.д.

## Зоны (Zones)

| Зона | Описание | Цвет |
|------|----------|------|
| command | Командная зона | Синий |
| engineering | Инженерная | Жёлтый |
| crew | Жилая | Зелёный |
| cargo | Грузовая | Коричневый |
| medical | Медицинская | Белый |
| science | Научная | Фиолетовый |
| security | Безопасность | Красный |
| access | Доступ | Серый |

## Валидация

Генератор проверяет:
- Связность графа (все комнаты достижимы)
- Наличие обязательных комнат
- Соответствие размеров типам
- Отсутствие коллизий геометрии

## Seed и воспроизводимость

Один и тот же seed гарантирует:
- Одинаковый набор комнат
- Одинаковую топологию
- Одинаковое геометрическое размещение
- Одинаковые идентификаторы объектов

## Использование

```typescript
import { generateMap, convertToEditorFormat } from '@generators'

const result = generateMap({
  seed: 'my-seed',
  archetype: 'ship',
  subtype: 'explorer',
  sizeTier: 'md',
  styleProfile: 'utilitarian',
  loopiness: 0.5,
  danger: 0.3
})

if (result.success) {
  const editorData = convertToEditorFormat(result.map, 0)
  // editorData.rooms, editorData.corridors, editorData.doors
}
```

## Расширение

### Добавление нового типа комнаты

1. Добавить в `roomConfigs.ts`:
```typescript
'myRoom': {
  id: 'myRoom',
  category: 'crew',
  label: 'My Room',
  countRules: [...],
  sizeByTier: sizeByTier(...),
  importance: 'support',
  adjacencyPreferences: ['corridor'],
  accessLevel: 1
}
```

2. Добавить в `generator.ts` маппинг:
```typescript
'myRoom': RoomTypeEnum.MyRoom
```

### Добавление нового архетипа

1. Обновить `types.ts`:
```typescript
type Archetype = 'ship' | 'station' | 'outpost' | 'myArchetype'
```

2. Добавить в `ARCHETYPE_CONFIGS` в `roomConfigs.ts`

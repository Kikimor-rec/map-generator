# Mothership-Inspired Features & UX Patterns

## Источник вдохновения

Mothership Map Viewer / Map Creator (Foundry module + web tool) — референс для TTRPG-ориентированных паттернов редактирования и visibility модели.

---

## 1. Инструменты и базовые UX-операции

### 1.1 Камера и навигация

| Операция | Управление | Статус |
|----------|------------|--------|
| Pan камеры | ПКМ + drag | ✅ Реализовано |
| Pan камеры | Средняя кнопка + drag | ✅ Реализовано |
| Pan камеры | Shift + колесо (горизонтально) | ✅ Реализовано |
| Zoom | Колесо мыши (к курсору) | ✅ Реализовано |
| Zoom 100% | Клик на % в StatusBar | ✅ Реализовано |
| Reset View | Кнопка сброса вида | ❌ TODO |
| Center on Selection | Кнопка центрирования | ✅ Реализовано |

### 1.2 Редактирование

| Операция | Управление | Статус |
|----------|------------|--------|
| Snap to Grid | Toggle в Toolbar | ✅ Реализовано |
| Copy | Ctrl+C | ❌ TODO |
| Paste | Ctrl+V | ❌ TODO |
| Cut | Ctrl+X | ❌ TODO |
| Duplicate | Ctrl+D | ❌ TODO |
| Delete | Delete / Backspace | ✅ Реализовано |
| Undo | Ctrl+Z | ✅ Реализовано |
| Redo | Ctrl+Y / Ctrl+Shift+Z | ✅ Реализовано |
| Select All | Ctrl+A | ❌ TODO |
| Deselect | Escape | ✅ Реализовано |

---

## 2. Геометрия и элементы карты

### 2.1 Rooms (комнаты)

```typescript
interface Room {
  id: string
  // === Geometry ===
  shape: 'rectangle' | 'circle' | 'polygon'  // NEW: shape types
  x: number
  y: number
  width: number    // for rectangle
  height: number   // for rectangle
  radius?: number  // for circle
  vertices?: Point[] // for polygon (future)
  
  // === Metadata ===
  name: string
  type: RoomType
  label?: string   // Display label (может отличаться от name)
  
  // === Internal structure ===
  internalWalls: InternalWall[]  // NEW
  markers: Marker[]              // NEW: nested markers
  
  // === Visibility ===
  visibility: VisibilityState    // NEW
}

interface InternalWall {
  id: string
  start: Point
  end: Point
  style: 'solid' | 'dashed' | 'dotted'
  isSecret?: boolean
}
```

### 2.2 Hallways (коридоры)

```typescript
interface Corridor {
  id: string
  // === Path ===
  segments: CorridorSegment[]  // Multi-segment support
  
  // === Endpoints ===
  startMarker: EndpointMarkerType
  endMarker: EndpointMarkerType
  
  // === Properties ===
  kind: CorridorKind
  layer: CorridorLayer
  isSecret: boolean  // NEW: secret passages
  
  // === Visibility ===
  visibility: VisibilityState
  
  // === Attachments ===
  startAttachment?: WallAttachment  // Snap to room edge
  endAttachment?: WallAttachment
}

type EndpointMarkerType = 
  | 'none'      // Бесшовное соединение (стык/магистраль)
  | 'door'      // Обычная дверь
  | 'grate'     // Решётка/вент-проход
  | 'airlock'   // Шлюз
  | 'hatch'     // Люк
  | 'bulkhead'  // Переборка

interface WallAttachment {
  roomId: string
  wallSide: 'north' | 'east' | 'south' | 'west'
  position: number  // 0-1 relative position along wall
}
```

### 2.3 Standalone Elements

```typescript
interface StandaloneWall {
  id: string
  start: Point
  end: Point
  style: WallStyle
  thickness: number
  visibility: VisibilityState
}

type WallStyle = 
  | 'solid'       // Обычная стена
  | 'dashed'      // Пунктирная (secret/soft barrier)
  | 'dotted'      // Точечная (planned/temporary)
  | 'double'      // Двойная (hull/reinforced)

interface StandaloneLabel {
  id: string
  pos: Point
  text: string
  fontSize: number
  color: string
  rotation: number
  visibility: VisibilityState
}
```

---

## 3. Маркеры (TTRPG-семантика)

### 3.1 Marker Types

```typescript
type MarkerType =
  // === Interactables ===
  | 'terminal'    // Компьютер/консоль
  | 'loot'        // Добыча/контейнер
  | 'npc'         // NPC (персонаж)
  | 'hazard'      // Опасность
  | 'trap'        // Ловушка
  
  // === Transitions ===
  | 'door'        // Дверь
  | 'airlock'     // Шлюз
  | 'ladder'      // Лестница
  | 'elevator'    // Лифт
  | 'hatch'       // Люк
  | 'window'      // Окно/иллюминатор
  
  // === Environment ===
  | 'light'       // Источник света
  | 'camera'      // Камера наблюдения
  | 'vent'        // Вентиляция
  | 'power'       // Электропанель
  
  // === Custom ===
  | 'custom'      // Пользовательский

interface Marker {
  id: string
  type: MarkerType
  pos: Point
  
  // === Display ===
  label?: string           // Короткое название
  description?: string     // Описание для GM
  icon?: string            // Custom icon (emoji or URL)
  color?: string           // Цвет маркера
  size: 'small' | 'medium' | 'large'
  
  // === Ownership ===
  parentId?: string        // Room ID если nested
  parentType?: 'room' | 'corridor'
  
  // === Visibility ===
  visibility: VisibilityState
  isSecret: boolean        // Скрыт от игроков по умолчанию
}
```

### 3.2 Marker Icons

| Type | Icon | Description |
|------|------|-------------|
| terminal | 💻 | Computer/console |
| loot | 📦 | Container/loot |
| npc | 👤 | Non-player character |
| hazard | ⚠️ | Danger zone |
| trap | 💀 | Hidden trap |
| door | 🚪 | Standard door |
| airlock | 🔒 | Airlock/secure door |
| ladder | 🪜 | Vertical access |
| elevator | 🛗 | Elevator shaft |
| hatch | ⬛ | Floor/ceiling hatch |
| window | 🔲 | Window/viewport |
| light | 💡 | Light source |
| camera | 📹 | Security camera |
| vent | 🌀 | Ventilation |
| power | ⚡ | Power panel |

---

## 4. Visibility & Secrets Model

### 4.1 Visibility State

```typescript
type VisibilityState = 
  | 'visible'    // Видно всем
  | 'hidden'     // Скрыто от всех (только GM)
  | 'fog'        // В тумане войны (не исследовано)
  | 'revealed'   // Было видно, сейчас в памяти

interface VisibilitySettings {
  // Default visibility при создании
  defaultRoomVisibility: VisibilityState
  defaultHallwayVisibility: VisibilityState
  defaultMarkerVisibility: VisibilityState
  
  // Правила наследования
  parentRevealChildren: boolean  // default: FALSE (критично!)
  
  // Secret handling
  secretsRequireExplicitReveal: boolean  // default: TRUE
}
```

### 4.2 Правило "родитель НЕ раскрывает детей"

**КРИТИЧЕСКИ ВАЖНО**: Когда комната становится visible:
- Сама комната видна ✅
- Стены комнаты видны ✅
- Внутренние стены видны ✅
- **Маркеры внутри — НЕ ВИДНЫ** ❌ (требуют отдельного reveal)
- **Секретные проходы — НЕ ВИДНЫ** ❌

```typescript
function revealRoom(room: Room, settings: VisibilitySettings) {
  room.visibility = 'visible'
  
  // Internal walls follow room
  room.internalWalls.forEach(w => w.visibility = 'visible')
  
  // Markers require explicit reveal!
  if (settings.parentRevealChildren) {
    // Опционально можно включить, но default = OFF
    room.markers
      .filter(m => !m.isSecret)
      .forEach(m => m.visibility = 'visible')
  }
  // Secret markers NEVER auto-reveal
}
```

### 4.3 Secret Passages

```typescript
interface SecretPassageConfig {
  // Visual hints
  showHintToGM: boolean        // Показывать GM пунктиром
  hintStyle: 'dashed' | 'faded' | 'icon'
  
  // Discovery
  discoveryMethod: 'manual' | 'perception' | 'interact'
  difficultyClass?: number     // DC для обнаружения
  
  // Reveal behavior
  revealBothEnds: boolean      // Раскрыть оба конца сразу
}
```

---

## 5. UI-структура

### 5.1 Floating Toolbars

```
┌─────────────────────────────────────────────────────────────┐
│ [Select] [Room] [Corridor] [Door] [Marker] [Wall] [Eraser] │  ← Main toolbar
└─────────────────────────────────────────────────────────────┘

┌─────────────┐
│ [Pan]       │
│ [Zoom+]     │
│ [Zoom-]     │
│ [Fit]       │  ← View toolbar (vertical, floating)
│ [Reset]     │
└─────────────┘
```

### 5.2 Context Toolbar (по выделению)

```
Выбрана комната:
┌───────────────────────────────────────────────────────────┐
│ Type: [Bridge ▼]  Color: [■]  Visible: [👁]  Delete: [🗑] │
└───────────────────────────────────────────────────────────┘

Выбран коридор:
┌────────────────────────────────────────────────────────────────┐
│ Kind: [Corridor ▼]  Start: [Door ▼]  End: [None ▼]  Secret: [ ]│
└────────────────────────────────────────────────────────────────┘

Выбран маркер:
┌─────────────────────────────────────────────────────────────┐
│ Type: [Terminal ▼]  Label: [___]  Secret: [✓]  Delete: [🗑] │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Info Panel (подсказки)

```
┌──────────────────────────────────────────────────────────────┐
│ 🔧 Room Tool                                                 │
│                                                              │
│ • Click and drag to create a room                           │
│ • Hold Shift for square room                                │
│ • Right-click to cancel                                     │
│                                                              │
│ Shortcuts: R = Room, C = Corridor, M = Marker               │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Item Details Panel (Inspector)

```
┌──────────────────────────────────────────────────────────────┐
│ 📋 Room Properties                                           │
├──────────────────────────────────────────────────────────────┤
│ Name:     [Engineering Bay      ]                           │
│ Type:     [Engineering     ▼]                               │
│ Shape:    ○ Rectangle  ● Circle                             │
│                                                              │
│ Position: X [240]  Y [360]                                  │
│ Size:     W [200]  H [160]                                  │
│                                                              │
│ ─── Visibility ───                                          │
│ State:    [Visible ▼]                                       │
│ [ ] Reveal markers when visible                             │
│                                                              │
│ ─── Markers (3) ───                                         │
│ • 💻 Main Terminal [hidden]                                 │
│ • ⚠️ Radiation Hazard [visible]                             │
│ • 📦 Supply Crate [hidden]                                  │
│                                                              │
│ [+ Add Marker]                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.5 Quick Navigation Dropdown

```
┌─────────────────────────────────────────┐
│ 🔍 Go to...                [Ctrl+G]    │
├─────────────────────────────────────────┤
│ ═══ Rooms ═══                          │
│   Bridge                               │
│   Engineering                          │
│   Med Bay                              │
│   Cargo Hold                           │
│ ═══ Markers ═══                        │
│   💻 Main Terminal                     │
│   👤 Captain NPC                       │
│ ═══ Hallways ═══                       │
│   Corridor #1 (Bridge → Engineering)  │
│   Corridor #2 (Engineering → Cargo)   │
└─────────────────────────────────────────┘
```

---

## 6. Import/Export & Persistence

### 6.1 JSON Export Format

```typescript
interface ProjectExport {
  version: string           // Schema version
  exportedAt: string        // ISO timestamp
  
  project: {
    name: string
    settings: ProjectSettings
  }
  
  decks: Deck[]
  rooms: Room[]
  corridors: Corridor[]
  markers: Marker[]
  standaloneWalls: StandaloneWall[]
  standaloneLabels: StandaloneLabel[]
  
  // Metadata for import
  checksums?: {
    rooms: string
    corridors: string
    markers: string
  }
}
```

### 6.2 Share String

```typescript
// Export flow
function exportShareString(project: ProjectExport): string {
  const json = JSON.stringify(project)
  const compressed = pako.gzip(json)
  const base64 = btoa(String.fromCharCode(...compressed))
  return base64
}

// Import flow
function importShareString(shareString: string): ProjectExport {
  const compressed = Uint8Array.from(atob(shareString), c => c.charCodeAt(0))
  const json = pako.ungzip(compressed, { to: 'string' })
  return JSON.parse(json)
}
```

**Формат Share String:**
- Prefix: `SFM1:` (Sci-Fi Map v1)
- Body: Base64-encoded gzipped JSON
- Example: `SFM1:H4sIAAAAAAAAA6tWKkktLlGyUlAqS...`

### 6.3 Auto-save

```typescript
interface AutosaveConfig {
  enabled: boolean
  intervalMs: number         // default: 30000 (30 sec)
  maxBackups: number         // default: 5
  storageKey: string         // localStorage key
}

// Storage structure
interface LocalStorageData {
  currentProject: ProjectExport
  lastSavedAt: string
  backups: Array<{
    savedAt: string
    project: ProjectExport
  }>
}

// Recovery on page load
function recoverAutosave(): ProjectExport | null {
  const data = localStorage.getItem('sci-fi-map-autosave')
  if (!data) return null
  
  const parsed: LocalStorageData = JSON.parse(data)
  return parsed.currentProject
}
```

---

## 7. Acceptance Criteria

### 7.1 Corridor Snapping
- [ ] Клик по ребру комнаты создаёт точку привязки коридора
- [ ] Привязка сохраняется при перемещении комнаты
- [ ] Visual feedback при hover над ребром

### 7.2 Multi-segment Corridors
- [ ] Коридор поддерживает >2 точек (L, Z, сложные пути)
- [ ] Добавление waypoint двойным кликом на сегменте
- [ ] Удаление waypoint с сохранением связности

### 7.3 Endpoint Markers
- [ ] Dropdown выбора типа маркера (none/door/grate/airlock)
- [ ] `none` визуально сливает сегменты без разрыва
- [ ] Разные маркеры на разных концах одного коридора

### 7.4 Visibility Model
- [ ] Room visibility НЕ раскрывает nested markers
- [ ] Corridor visibility НЕ раскрывает endpoint markers
- [ ] Secret flag скрывает элемент до explicit reveal
- [ ] GM toggle для просмотра hidden элементов

### 7.5 Persistence
- [ ] JSON export содержит все данные
- [ ] JSON import восстанавливает проект без потерь
- [ ] Share string корректно encode/decode
- [ ] Autosave работает и переживает refresh

---

## 8. Implementation Status

### Phase 1: Core UX (Priority)
- [ ] Copy/Paste (Ctrl+C/V)
- [ ] Reset View button
- [ ] Круглые комнаты
- [ ] Internal walls

### Phase 2: Markers
- [ ] Marker types enum
- [ ] Marker placement tool
- [ ] Marker visibility
- [ ] Nested vs standalone markers

### Phase 3: Visibility
- [ ] VisibilityState type
- [ ] "Parent doesn't reveal children" rule
- [ ] Secret passages
- [ ] GM view toggle

### Phase 4: UI Improvements
- [ ] Context toolbar
- [ ] Info panel
- [ ] Quick navigation dropdown
- [ ] Item details panel

### Phase 5: Persistence
- [ ] JSON export improvements
- [ ] Share string (gzip + base64)
- [ ] Autosave to localStorage
- [ ] Recovery on load

---

## 9. File Locations

| Feature | File |
|---------|------|
| Marker types | `src/core/markerTypes.ts` (new) |
| Visibility types | `src/core/visibilityTypes.ts` (new) |
| Room shapes | `src/core/types.ts` (extend) |
| Autosave service | `src/services/autosave.ts` (new) |
| Share string utils | `src/utils/shareString.ts` (new) |
| Context toolbar | `src/ui/components/ContextToolbar.tsx` (new) |
| Info panel | `src/ui/components/InfoPanel.tsx` (new) |

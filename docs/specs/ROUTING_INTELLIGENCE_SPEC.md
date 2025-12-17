# Routing Intelligence & Path Priorities Specification

## Обзор

Система интеллектуального роутинга коридоров, обеспечивающая читаемость схем, логичную навигацию, TTRPG-интерес и техническую корректность.

---

## 1. Цели роутинга

### 1.1 Читаемость схемы
- Минимум "дрожи" (jitter) и лишних изгибов
- Ровные ортогональные трассы (опционально 45°)
- Чистые соединения без визуального шума

### 1.2 Логичность навигации
- Выделяемые "магистрали" (primary spine)
- Понятные перекрёстки с правильной степенью
- Отсутствие дублирующихся линий (coalesce)

### 1.3 TTRPG-интерес
- Избегать линейности
- Создавать петли/обходные пути
- Точки выбора маршрута
- "Гейты" (шлюзы/двери/решётки/запертые секции)

### 1.4 Техническая корректность
- Коридоры не "режут" комнаты
- Соблюдение clearance
- Отсутствие микросегментов
- Корректное объединение в junction'ы

---

## 2. Pipeline генерации коридоров

### 2.1 Двухпроходная архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    ROUTE PASS                           │
│  Построить пути между портами/узлами графа              │
│  (rooms → ports → junction candidates)                  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  POST-PROCESS PASS                      │
│  1. Coalesce   - слияние совпадающих сегментов         │
│  2. Simplify   - удаление лишних точек                 │
│  3. Beautify   - ортогонализация, выравнивание         │
│  4. Junction   - нормализация перекрёстков             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Порядок построения связей

```typescript
enum RoutingPhase {
  PRIMARY_SPINE = 1,      // Ключевые хабы (мостик, инженерка, медблок, док)
  SECONDARY_CONNECTORS,   // Остальные комнаты к магистрали
  REDUNDANCY_PASS,        // Петли и обходы для TTRPG
  SECRET_SERVICE_PASS,    // Секретные проходы, вентиляция, техтоннели
}
```

---

## 3. Cost Function для A*/Dijkstra

### 3.1 Базовые компоненты стоимости

```typescript
interface RoutingCostConfig {
  // === Базовая стоимость ===
  /** Цена за единицу длины (основа) */
  lengthCost: number                    // default: 1.0
  
  // === Штрафы за геометрию ===
  /** Штраф за каждый поворот на 90° */
  bendPenalty: number                   // default: 5.0
  /** Штраф за поворот на 45° (если разрешены) */
  bend45Penalty: number                 // default: 3.0
  
  // === Штрафы за препятствия ===
  /** Штраф за заход в зону комнаты (очень высокий/запрет) */
  obstaclePenalty: number               // default: Infinity
  /** Штраф за близость к стенам комнат */
  nearMissPenalty: number               // default: 2.0
  /** Дистанция для nearMiss (px) */
  nearMissDistance: number              // default: 20
  
  // === Штрафы за пересечения ===
  /** Штраф за пересечение с другим коридором */
  crossingPenalty: number               // default: 10.0 (или Infinity если запрещено)
  /** Разрешить пересечения с bridge/jump маркером */
  allowCrossings: boolean               // default: true
  
  // === Бонусы за переиспользование ===
  /** Бонус (отрицательная стоимость) за использование существующего сегмента */
  reuseBonus: number                    // default: -3.0
  /** Включить prefer-reuse логику */
  preferReuseEnabled: boolean           // default: true
  /** Сила бонуса (0-1) */
  reuseBonusStrength: number            // default: 0.5
  /** Лимит "пропускной способности" сегмента */
  reuseCapacity: number                 // default: 3
  
  // === Junction штрафы ===
  /** Штраф за подключение к перегруженному junction */
  junctionDegreePenalty: number         // default: 2.0
  /** Минимальное расстояние между junction'ами (px) */
  minJunctionSpacing: number            // default: 40
  /** Штраф за junction слишком близко */
  junctionProximityPenalty: number      // default: 5.0
}
```

### 3.2 Формула расчёта стоимости ребра

```
edgeCost = lengthCost * distance
         + bendPenalty * (isBend ? 1 : 0)
         + obstaclePenalty * (intersectsRoom ? 1 : 0)
         + nearMissPenalty * nearMissFactor
         + crossingPenalty * crossingCount
         + reuseBonus * reuseFactor * reuseBonusStrength
         + junctionDegreePenalty * (junctionDegree > 4 ? junctionDegree - 4 : 0)
         + junctionProximityPenalty * proximityViolationCount
```

### 3.3 Reuse Factor (магистрали)

```typescript
function calculateReuseFactor(
  segment: Segment,
  existingCorridors: Corridor[],
  config: RoutingCostConfig
): number {
  const overlappingCount = countOverlappingCorridors(segment, existingCorridors)
  
  if (overlappingCount === 0) return 0
  
  // Уменьшаем бонус если сегмент перегружен
  const capacityFactor = Math.max(0, 1 - (overlappingCount / config.reuseCapacity))
  
  return capacityFactor
}
```

---

## 4. Junction Normalization

### 4.1 Типы junction по желательности

| Тип | Arms | Желательность | Действие |
|-----|------|---------------|----------|
| T-junction | 3 | ✅ Оптимально | — |
| X-junction | 4 | ⚠️ Допустимо | — |
| 5-junction | 5 | ❌ Нежелательно | Split на 2 junction |
| 6+ junction | 6+ | ❌ Запрещено | Создать hub room |

### 4.2 Junction Normalization Config

```typescript
interface JunctionNormConfig {
  /** Максимум arms без штрафа */
  maxArmsOptimal: number                // default: 4
  /** Абсолютный максимум arms */
  maxArmsAbsolute: number               // default: 6
  /** Минимальное расстояние между junction (px) */
  minSpacing: number                    // default: 40
  /** Допустимые углы (градусы) */
  allowedAngles: number[]               // default: [90] или [45, 90]
  /** Привязка к сетке */
  snapToGrid: boolean                   // default: true
}
```

### 4.3 Junction Split Algorithm

```
IF junction.arms > maxArmsAbsolute:
  1. Найти оптимальное разбиение на группы по 3-4 arms
  2. Создать цепочку junction с короткими связками (minSpacing)
  3. ИЛИ создать hub room если arms > 8

IF distance(junction1, junction2) < minSpacing:
  1. Попробовать merge если совместимо
  2. ИЛИ "разнести" (relax) junction'ы
  3. ИЛИ оставить один, перенаправив arms
```

---

## 5. TTRPG-специфичные метрики

### 5.1 Целевые ограничения

```typescript
interface TTRPGRoutingConstraints {
  /** Минимум петель в графе (по размеру карты) */
  minCycles: number                     // XS:1, S:2, M:3, L:4, XL:5
  
  /** Коэффициент альтернативных путей (0-1) */
  altPathRatio: number                  // default: 0.3
  
  /** Бюджет "узких мест" (chokepoints) */
  chokepointBudget: number              // default: 3
  
  /** Процент гейтов на маршрутах */
  gatingMix: {
    doors: number                       // default: 0.6
    airlocks: number                    // default: 0.1
    grilles: number                     // default: 0.15
    lockedSections: number              // default: 0.15
  }
  
  /** Генерировать "крючки" для энкаунтеров */
  encounterHooks: boolean               // default: true
}
```

### 5.2 Метрики нелинейности

```typescript
interface NonlinearityMetrics {
  /** Циклический коэффициент графа */
  cyclomaticComplexity: number
  
  /** Среднее количество альтернативных путей между ключевыми узлами */
  avgAlternativePaths: number
  
  /** Количество chokepoints */
  chokepointCount: number
  
  /** Распределение степеней junction */
  junctionDegreeDistribution: Map<number, number>
}

function validateNonlinearity(
  corridors: Corridor[],
  junctions: Junction[],
  constraints: TTRPGRoutingConstraints
): ValidationResult {
  const metrics = calculateMetrics(corridors, junctions)
  
  const issues: ValidationIssue[] = []
  
  if (metrics.cyclomaticComplexity < constraints.minCycles) {
    issues.push({ type: 'warning', message: 'Недостаточно петель' })
  }
  
  if (metrics.chokepointCount > constraints.chokepointBudget) {
    issues.push({ type: 'warning', message: 'Слишком много узких мест' })
  }
  
  return { valid: issues.length === 0, issues, metrics }
}
```

---

## 6. Стилевые профили

### 6.1 Realism (NASApunk / Mothership)

```typescript
const REALISM_PROFILE: RoutingProfile = {
  name: 'realism',
  costs: {
    bendPenalty: 8.0,           // Строже к красоте трасс
    reuseBonusStrength: 0.3,    // Меньше "идеальных магистралей"
    crossingPenalty: 15.0,      // Пересечения нежелательны
  },
  constraints: {
    minCycles: 1,               // Меньше петель
    altPathRatio: 0.2,          // Меньше альтернатив
  },
  junction: {
    maxArmsOptimal: 3,          // Предпочитать T-junction
    allowedAngles: [90],        // Только ортогональные
  },
  layers: {
    separateServiceLayer: true, // Отдельный слой для сервисных ходов
    strictZoning: true,         // Коридоры реже пересекают зоны
  },
}
```

### 6.2 Futurism (Star Trek / B5)

```typescript
const FUTURISM_PROFILE: RoutingProfile = {
  name: 'futurism',
  costs: {
    bendPenalty: 3.0,           // Мягче к изгибам
    reuseBonusStrength: 0.7,    // Больше магистралей
    crossingPenalty: 5.0,       // Пересечения допустимы
  },
  constraints: {
    minCycles: 3,               // Больше петель
    altPathRatio: 0.5,          // Больше альтернатив
  },
  junction: {
    maxArmsOptimal: 4,          // X-junction нормально
    allowedAngles: [45, 90],    // 45° разрешены
  },
  layers: {
    allowLargeHubs: true,       // Большие хабы/атриумы
    multiDeckConnectors: true,  // Вертикальные коннекторы
  },
}
```

---

## 7. UI/QOL в генераторе

### 7.1 Панель генерации — секция Routing

```
┌─────────────────────────────────────────────────────────┐
│ 🔀 CORRIDOR ROUTING                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [✓] Prefer reuse (build trunks)                        │
│     Reuse strength: [====●=====] 0.5                   │
│                                                         │
│ Bend penalty:       [==●=======] 5.0                   │
│ Min cycles:         [===●======] 3                     │
│ Junction max arms:  [===●======] 4                     │
│                                                         │
│ Crossings: [Same type only ▼]                          │
│   ○ Forbidden                                           │
│   ● Allow with bridge/jump                             │
│   ○ Allow freely                                        │
│                                                         │
│ [✓] Separate layers (main / vents / secrets)           │
│     Layer policy: [Never share types ▼]                │
│                                                         │
│ ─────────────────────────────────────────────────────  │
│ 🐛 Debug overlay                                        │
│   [✓] Show trunk corridors                             │
│   [ ] Junction degree heatmap                          │
│   [ ] Cost heatmap                                     │
│   [ ] Show chokepoints                                 │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Контролы

| Контрол | Тип | Default | Описание |
|---------|-----|---------|----------|
| Prefer reuse | Toggle | ON | Строить магистрали |
| Reuse strength | Slider 0-1 | 0.5 | Сила бонуса |
| Bend penalty | Slider 0-15 | 5.0 | Штраф за повороты |
| Min cycles | Slider 0-10 | 3 | Минимум петель |
| Junction max arms | Slider 3-6 | 4 | Макс. рукавов |
| Crossings | Select | bridge/jump | Политика пересечений |
| Separate layers | Toggle | ON | Раздельные слои |
| Layer policy | Select | neverShare | Политика слоёв |

### 7.3 Debug Overlay

```typescript
interface DebugOverlayOptions {
  /** Подсветить магистральные коридоры */
  showTrunkCorridors: boolean
  /** Heatmap степени junction */
  junctionDegreeHeatmap: boolean
  /** Heatmap стоимости прохождения */
  costHeatmap: boolean
  /** Показать chokepoints */
  showChokepoints: boolean
  /** Показать альтернативные пути */
  showAlternativePaths: boolean
}
```

---

## 8. Интеграция с существующими системами

### 8.1 Связь с CoalesceSettings

```typescript
// Coalesce запускается ПОСЛЕ routing pass
// и ПЕРЕД junction normalization

pipeline = [
  routePass,           // A* с cost function
  coalescePass,        // Слияние сегментов (см. COALESCE_SPEC.md)
  simplifyPass,        // Удаление лишних точек
  beautifyPass,        // Ортогонализация
  junctionNormalize,   // Split/merge junction
  validatePass,        // Проверка TTRPG-метрик
]
```

### 8.2 Связь с CorridorRouterSettings

```typescript
// Расширение существующего интерфейса
interface CorridorRouterSettings {
  // ... существующие поля ...
  
  /** Настройки cost function */
  costs: RoutingCostConfig
  
  /** Конфиг нормализации junction */
  junctionNormConfig: JunctionNormConfig
  
  /** TTRPG ограничения */
  ttrpgConstraints: TTRPGRoutingConstraints
  
  /** Профиль стиля */
  styleProfile: 'realism' | 'futurism' | 'custom'
  
  /** Debug overlay */
  debugOverlay: DebugOverlayOptions
}
```

---

## 9. Acceptance Tests

1. **Магистрали**: При preferReuse=ON должны образовываться "стволы" с ветками
2. **Junction split**: 6+ arms автоматически разбиваются на цепочку
3. **Петли**: minCycles=3 → граф содержит минимум 3 цикла
4. **Chokepoints**: Не превышен chokepointBudget
5. **Clearance**: Все коридоры соблюдают отступ от комнат
6. **No micro-segments**: Нет сегментов короче gridSize/2
7. **Bridge/jump**: Пересечения правильно маркированы
8. **Style profiles**: Realism и Futurism дают визуально разные результаты

---

## 10. Файлы реализации

| Файл | Назначение |
|------|------------|
| `src/core/corridorTypes.ts` | Типы RoutingCostConfig, JunctionRules |
| `src/core/corridorRouter.ts` | A* с cost function |
| `src/core/corridorCoalesce.ts` | Слияние сегментов |
| `src/core/corridorPostProcess.ts` | Simplify, beautify, junction normalize |
| `src/core/ttrpgMetrics.ts` | Расчёт и валидация TTRPG-метрик |
| `src/generators/generator.ts` | Интеграция pipeline |
| `src/ui/panels/GenerationPanel.tsx` | UI контролы |

---

## 11. Статус реализации

- [x] Базовые типы коридоров
- [x] Типы CoalesceSettings
- [x] RoutingCostConfig типы
- [x] CrossingPolicy типы
- [x] JunctionNormConfig типы
- [x] TTRPGRoutingConstraints типы
- [x] DebugOverlayOptions типы
- [x] StyleProfileId / RoutingStyleProfile
- [x] REALISM_PROFILE / FUTURISM_PROFILE
- [ ] Cost function в A*
- [ ] Junction normalization
- [ ] TTRPG metrics
- [ ] Style profiles применение
- [ ] UI контролы
- [ ] Debug overlay

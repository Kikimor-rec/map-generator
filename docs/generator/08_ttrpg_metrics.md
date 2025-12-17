# 08 — Метрики качества (TTRPG) и пороги

Модуль обязан считать метрики и возвращать их в `meta.metrics`.

## 8.1 Must‑метрики (всегда)
- `ConnectivityOK`: boolean
- `AltPathsCriticalMin`: minimum count независимых путей между critical‑парами
- `LoopinessAchieved`: число 0..1 (факт)
- `DeadEndRatio`: 0..1
- `ReadabilityScore`: 0..1 (составной)
- `ChokepointCount`: int
- `AvgCorridorTurns`: float
- `AvgPathLengthToCritical`: float

## 8.2 Рекомендуемые (если включены соответствующие фичи)
- `StealthCoverage`: 0..1 (доля комнат, достижимых через vents/service)
- `SetpieceCount`: int
- `SetpieceApproachCountMin`: min подходов к setpieces
- `SecurityBypassOptions`: int (сколько путей обхода secure checkpoint)

## 8.3 Пороговые значения (примерные рекомендации)
Тут пороги задаются конфигом по sizeTier:

### xs
- AltPathsCriticalMin ≥ 1 (иногда физически невозможно 2)
- DeadEndRatio ≤ 0.35
- LoopinessAchieved ≥ 0.15 (если запрошено >0)

### s/m
- AltPathsCriticalMin ≥ 2 (если loopiness≥0.35)
- DeadEndRatio ≤ 0.30
- SetpieceCount ≥ 1 (если setpieceBias≥0.5)

### l/xl
- AltPathsCriticalMin ≥ 2..3
- DeadEndRatio ≤ 0.25
- 1–3 крупных setpieces
- ReadabilityScore не ниже заданного

## 8.4 Как считать ReadabilityScore (составной)
Рекомендация (нормализовать в 0..1):
- штраф за пересечения коридоров,
- штраф за количество поворотов,
- штраф за слишком длинные коридоры,
- штраф за “слишком плотные параллели”,
- бонус за магистраль + понятные рукава.

## 8.5 Метрики для хоррора (Mothership‑режим)
Если archetype/subtype предполагает хоррор:
- допускаем чуть больше тупиков,
- но компенсируем:
  - секретными обходами,
  - “опасными” зонами,
  - сценическими узлами (реактор, ангар, медблок с карантином).

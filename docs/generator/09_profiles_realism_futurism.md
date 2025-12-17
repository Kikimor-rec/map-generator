# 09 — Профили: realism vs futurism

Профиль задаёт коэффициенты вероятностей и запретов (не только визуальный стиль).

## 9.1 Realism (NASA‑punk / Mothership)
Поведение:
- больше bulkhead/гермо‑изоляции
- больше утилит‑помещений (waste/water/scrubbers)
- больше service/vent маршрутов
- меньше “роскошных” social зон
- меньше экзотических комнат (teleport/holodeck и т.п.)

Рекомендованные коэффициенты:
- `bulkheadDensity` ↑
- `serviceNetworkWeight` ↑
- `socialRoomWeight` ↓
- `redundancyWeight` ↑ (backup power, emergency control)
- `pressurizationStrictness` ↑

## 9.2 Futurism (космоопера)
Поведение:
- больше просторных зон, выше setpieceBias
- допускаются teleport/AI core/shields/holodeck (если subtype)
- меньше обязательных “грязных утилит” (можно объединять)
- чаще симметрия “по фасаду”
- безопасность часто “мягче”, если danger низкое

Коэффициенты:
- `socialRoomWeight` ↑
- `setpieceWeight` ↑
- `bulkheadDensity` ↓ (если danger низкое)
- `exoticRoomWeight` ↑

## 9.3 Переключатели профиля в конфиге
Профиль — это “набор модификаторов” к:
- шансам появления комнат,
- count rules,
- adjacency preferences,
- топологическим стратегиям (ring vs spine),
- порогам метрик.

# 06 — Коридоры, шлюзы, двери, контрольные точки

## 6.1 Типы связей
- `corridor` — основной проход
- `airlock` — граница pressurized ↔ vacuum/surface
- `bulkheadDoor` — гермодверь/переборка (изоляция)
- `serviceHatch` — люк в служебные сети (vents/service)
- `verticalLink` — лифт/лестница/шахта

## 6.2 Правила pressurization
Если соединяются:
- pressurized ↔ vacuum/unpressurized:
  - обязателен `airlock` (или цепочка bulkhead+airlock по профилю)
- pressurized ↔ pressurized:
  - corridor допустим
- secure ↔ public при accessPolicy=strict:
  - checkpoint/bulkhead обязателен

## 6.3 Ширина и класс коридоров
`widthClass` выбирается по:
- archetype и sizeTier,
- зонам (industrial wider, service narrow),
- setpiece (anгарные проходы wide).

## 6.4 Двери и замки
Дверь — атрибут порта/коннектора:
- `doorType`: none/standard/bulkhead/secure
- `lockLevel`: 0..3 (пример)
- `failsafe`: boolean (аварийное открытие)

Генератор обязан:
- минимум 1 путь “crew access” от входа к ops,
- если есть secure‑зоны — минимум 1 “легальный” путь через checkpoint.

## 6.5 Контрольные точки (chokepoints)
Создавать сознательно:
- на переходах зон (hab→engineering),
- перед armory/brig/blacksite,
- перед reactor/AI core (если danger↑),
Но:
- не делать chokepoint’ом каждую дверь (иначе карта станет “линейной” и раздражающей).

## 6.6 Вторичные сети (vents/service)
Vents:
- обычно узкие, часто односторонние/с ограничениями доступа,
- имеют “выходы” люками в ключевых точках,
- не должны полностью ломать security, кроме случаев subtype=blacksite/derelict.

Service tunnels:
- соединяют utility/maintenance и дают обходы вокруг main spine,
- могут быть частично завалены/закрыты (если derelict/danger).

## 6.7 Рекомендация по “красивым коридорам”
Генератор выдаёт чистые полилинии.
Рендерер применяет “skin”:
- скругления углов (fillet),
- расширение на junction,
- опциональные “тамбуры” перед bulkhead.

# 10 — Валидация и Auto‑Repair

## 10.1 Must‑валидаторы
- Нет пересечений комнат (геометрия)
- Все rooms имеют хотя бы 1 связь (кроме допустимых isolated, если явно помечены)
- Граф связен
- Все critical комнаты достижимы от entry (dock/airlock)
- Pressurization границы корректны (airlock/bulkhead)
- Все connectors подключены к валидным ports
- Нет “люков в никуда” для vents/service

## 10.2 Диагностика
Каждый issue:
- `code` (например `GEOM_OVERLAP`, `NO_ALT_PATHS`, `BAD_PRESSURIZATION`)
- `severity` (error/warn)
- `entities` (roomIds/connectorIds)
- `hint` (что ремонтировать)

## 10.3 Repair strategies (детерминированно)
### Геометрия
- локально сдвинуть кластер зоны
- уменьшить minor комнаты (в пределах sizeRange)
- перестроить packing вокруг anchor

### Связность/альт‑пути
- добавить ребро (коридор) между узлами с большой дистанцией
- добавить service‑обход (секретный)
- “прорезать” bulkhead или добавить обходной шлюз (если security не строгий)

### Читабельность
- спрямить коридор (re‑route с большим штрафом за повороты)
- заменить пересечение на junction‑камера
- объединить 2 маленькие комнаты в одну (если разрешено)

### Pressurization
- вставить airlock между vacuum↔pressurized
- поднять bulkhead у границы зон

## 10.4 Stop conditions
Repair делает максимум N итераций (например 12).
Если не удалось:
- вернуть “лучший” вариант + issues (чтобы редактор мог показать предупреждения),
- или fallback‑генерация с более простым layout grammar (readability↑).

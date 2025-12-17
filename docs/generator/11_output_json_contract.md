# 11 — Выходной MapJSON контракт

## 11.1 Верхний уровень
- `version`: string (например `"mapjson-1.0"`)
- `meta`:
  - `seed`, `archetype`, `subtype`, `styleProfile`, `sizeTier`
  - `metrics` (из 08)
  - `issues` (из 10)
  - `generatedAt`
- `grid`:
  - `unit`, `bounds`, `origin`
- `zones`: список зон
- `decks`: массив палуб

## 11.2 Deck
- `deckId`: string
- `label`: string (например "Deck A")
- `rooms`: Room[]
- `connectors`: Connector[]
- `junctions`: Junction[]
- `layers`: Layer[]

## 11.3 Room
- `id`, `type`, `importance`, `zoneId`, `deckId`
- `access`, `pressurized`, `tags`
- `geometry`:
  - `kind`: "rect"|"poly"
  - `rect`: {x,y,w,h} или `poly`: [{x,y},...]
- `ports`: Port[]
- `props` (опционально): для схематического наполнения
- `annotations` (опционально)

## 11.4 Port
- `id`
- `side`: "N"|"E"|"S"|"W"|"custom"
- `pos`: {x,y}
- `door`: {doorType, lockLevel, isBulkhead}

## 11.5 Connector
- `id`
- `kind`
- `from`: {roomId, portId}
- `to`: {roomId, portId}
- `path`: [{x,y}, ...] (polyline)
- `widthClass`
- `access`
- `pressurizationBoundary`
- `isSecret`
- `layer`: "main"|"ventilation"|"service"|"cables"|"security"

## 11.6 Junction
- `id`
- `pos`: {x,y}
- `kind`: "T"|"X"|"hub"|"airlockChamber"
- `decor`: (опционально) подсказка рендеру
- `checkpoint`: boolean

## 11.7 Layer
- `id`: "main"|"ventilation"|...
- `elements`: ссылки на connectorIds/roomIds или собственные примитивы

## 11.8 Требование стабильности ID
ID должны быть стабильными для `seed`:
- формат: `{shortType}-{hash(seed + localIndex + type)}`

## 11.9 Debug/Trace (опционально)
- `debug.graph`: adjacency list
- `debug.steps`: список этапов с промежуточными метриками

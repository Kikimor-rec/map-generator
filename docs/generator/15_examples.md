# 15 — Примеры запросов и результата (укороченно)

## 15.1 Ship, realism, M, 3 decks
```json
{
  "seed": "LM-0123",
  "archetype": "ship",
  "subtype": "salvage",
  "styleProfile": "realism",
  "sizeTier": "m",
  "decks": 3,
  "symmetry": 0.6,
  "modularity": 0.4,
  "loopiness": 0.45,
  "secretness": 0.55,
  "danger": 0.65,
  "readability": 0.6,
  "minAltPathsBetweenCritical": 2,
  "maxDeadEndRatio": 0.30,
  "debug": true
}
```

Ожидаемые особенности:
- backbone bridge → hab → engineering → cargo/dock
- хотя бы 1 обходной путь к engineering (service tunnel)
- bulkhead на границах опасных/вакуумных зон
- 1–2 setpiece (reactor hall, hangar bay)

## 15.2 Station, realism, L, rotating ring
```json
{
  "seed": 987654,
  "archetype": "station",
  "subtype": "port",
  "styleProfile": "realism",
  "sizeTier": "l",
  "decks": "auto",
  "allowRotatingRing": true,
  "loopiness": 0.7,
  "secretness": 0.35,
  "danger": 0.25,
  "readability": 0.65
}
```

Ожидаемое:
- hub + ring corridor (вращаемое кольцо)
- docking ≥2
- promenade/market в social секторе
- power в отдельном плечe, изолировано bulkhead

## 15.3 Outpost, realism, S, blacksite
```json
{
  "seed": "BLACK-7",
  "archetype": "outpost",
  "subtype": "blacksite",
  "styleProfile": "realism",
  "sizeTier": "s",
  "decks": 2,
  "loopiness": 0.35,
  "secretness": 0.8,
  "danger": 0.75,
  "accessPolicy": "strict"
}
```

Ожидаемое:
- secure сектор с checkpoint и 2 путями (1 легальный, 1 секретный)
- вентиляция/служебные обходы
- карантин/лаборатория (если включено профилем)

> Полные примеры “реального” MapJSON лучше хранить в `/examples/*.json`.

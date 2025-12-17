# 14 — Шаблоны конфигов (YAML/JSON)

## 14.1 Структура `room_types.yaml` (пример)
```yaml
roomTypes:
  bridge:
    category: command
    importance: critical
    minTier: xs
    maxTier: xl
    countRule: { exact: 1 }
    sizeByTier:
      xs: { min: 6, max: 10 }
      s:  { min: 10, max: 16 }
      m:  { min: 14, max: 22 }
      l:  { min: 18, max: 28 }
      xl: { min: 22, max: 40 }
    accessDefault: crew
    pressurizedDefault: true
    tags: [setpiece, socialSpace]
    adjacency:
      prefer: [ops, comms, officerQuarters]
      avoid:  [wasteProcessing, hazmatStorage]
    connectors:
      mustHave:
        - { kind: corridor, toZone: habitation }
      mayHave:
        - { kind: bulkheadDoor, toZone: security, weight: 0.4 }
```

## 14.2 Структура `profiles.yaml` (пример)
```yaml
profiles:
  realism:
    weights:
      bulkheadDensity: 0.75
      serviceNetwork: 0.70
      socialRooms: 0.25
      exoticRooms: 0.05
      redundancy: 0.55
    forbids:
      - teleportRoom
      - holodeck
  futurism:
    weights:
      bulkheadDensity: 0.35
      serviceNetwork: 0.40
      socialRooms: 0.60
      exoticRooms: 0.40
      redundancy: 0.35
    allows:
      - teleportRoom
      - holodeck
```

## 14.3 `layout_grammars.yaml` (пример наброска)
```yaml
grammars:
  ship_spine:
    anchors: [bridge, habitation, engineering, docking]
    axis: longitudinal
    symmetryHint: mirrorHull
  station_hub_ring:
    anchors: [ops, dockingRing, powerCore]
    topology: hubAndSpoke
    ring: { enabledIf: { allowRotatingRing: true } }
```

## 14.4 Примечание
Файлы конфигов должны лежать рядом с кодом генератора и быть версионированы.

# 13 — Archetypes/Subtypes и их “обязательные ядра”

## 13.1 Ship subtypes
- `courier` (малый, быстрый)
- `cargo`
- `research`
- `military`
- `salvage`
- `smuggler`
- `medical`
- `prison`
- `colony` (колониальный транспорт)

Обязательное ядро для ship: bridge/helm, engineering/power, habitation, airlock/dock.

Специфические обязательные:
- medical → medbay (major)
- prison → brig/secure checkpoint (major)
- cargo → cargoBay (major) + loading access
- research → labGeneral (major)
- military → armory/securityOffice (major)

## 13.2 Station subtypes
- `port`
- `research`
- `military`
- `refinery`
- `habitat`
- `listeningPost`
- `religious`

Обязательное ядро: ops, power, docking>=1 (port: >=2), habitation, lifeSupport.

Специфические:
- port → promenade/market weight↑, hangar weight↑
- refinery → refinery/machineHall обязательны
- listeningPost → comms/sensor array обязательны
- habitat → hydroponics/garden weight↑

## 13.3 Outpost subtypes
- `science`
- `mining`
- `military`
- `frontier`
- `ruins` (derelict‑style)
- `blacksite`

Обязательное ядро: airlock, power/utility, habitation/common, storage, comms nook.

Специфические:
- mining → processingPlant/storage/vehicle bay weight↑
- military → checkpoint/armory/turret control weight↑
- blacksite → secure zones + secret routes weight↑

## 13.4 Extra archetypes (расширяемые)
- `asteroidMine`: backbone = airlock/dock → processingPlant → storage → maintenance
- `beaconRelay`: backbone = airlock → beaconCore → power → comms (может быть необитаемым)
- `factoryModule`: backbone = power → machineHall → storage → loading
- `derelict`: любой archetype, но с модификаторами: danger↑, blocked paths, отсутствующие комнаты, хаос.

Каждый archetype может иметь свой `layout grammar` и `room program preset`.

# 12 — Каталог типов помещений (Room Type Catalog)

Этот файл задаёт **список рекомендуемых типов комнат** (не “единственно верный”), которые затем переводятся в конфиг.

## 12.1 Command / Ops
- `bridge` — мостик
- `ops` — операционный центр (станции)
- `trafficControl` — диспетчер/стыковка

## 12.2 Power / Engineering
- `engineRoom`
- `reactorCore` (или `powerCore`)
- `powerDistro` (распределение энергии)
- `maintenanceShop` (мастерская)
- `coolantPlant` (realism чаще)

## 12.3 Life Support
- `lifeSupport` (ядро систем)
- `scrubbers`
- `waterRecycling`
- `wasteProcessing`
- `hydroponics` (часто станции/колонии)
- `oxygenReserve`

## 12.4 Habitation
- `crewQuarters`
- `officerQuarters` (futurism/large)
- `messHall`
- `galley`
- `hygiene` (санузел/душ)
- `laundry` (optional)
- `commonRoom` / `lounge`

## 12.5 Medical
- `medbay`
- `quarantine`
- `morgue` (horror)
- `autodocRoom` (futurism)

## 12.6 Science
- `labGeneral`
- `labBio`
- `labChem`
- `labXeno` (horror)
- `specimenStorage`
- `cleanRoom`

## 12.7 Cargo / Logistics
- `cargoBay`
- `storage`
- `armoredStorage` (secure)
- `loadingDock` (stations)
- `containerYard` (surface outposts)

## 12.8 Docking / Access / EVA
- `airlock`
- `dockingRing`
- `hangar`
- `evaPrep`
- `deconChamber` (realism/horror)

## 12.9 Security / Military
- `securityOffice`
- `armory`
- `brig`
- `checkpoint`
- `turretControl` (optional)
- `sensorControl` (часто и тут, и в ops)

## 12.10 IT / AI / Comms
- `comms`
- `serverCore`
- `aiCore` (futurism)
- `sensorArrayRoom`

## 12.11 Industrial
- `refinery`
- `fabrication` (3D print / workshop)
- `machineHall`
- `hazmatStorage`

## 12.12 Social / Commercial
- `bar`
- `market`
- `chapel`
- `promenade` (станция‑город)
- `theater` (optional)
- `garden` (futurism, habitat)

## 12.13 Utility / Navigation spaces
- `corridor` (как сущность‑связь, не room)
- `junction` (как сущность)
- `maintenanceCloset`
- `serviceTunnelNode`
- `ventNode`
- `elevatorShaftNode`

## 12.14 “Другие популярные archetype‑специфичные”
- `mineshaft` (asteroidMine)
- `processingPlant` (asteroidMine/refinery)
- `beaconCore` (beaconRelay)
- `cryobay` (colony/prison)
- `briefingRoom` (military)
- `wardroom` (naval)
- `observationDeck` (station/ship)
- `shieldGenerator` (futurism)
- `teleportRoom` (futurism)
- `holodeck` (futurism)

Дальше эти типы получают правила count/size/adjacency в конфиге.

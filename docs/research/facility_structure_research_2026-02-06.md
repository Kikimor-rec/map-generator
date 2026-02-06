# Facility Internal Structure Research -- 2026-02-06

## Context (constraints from our docs)
- Project is a sci-fi TTRPG map generator (2D editor + procedural generation)
- Existing room types defined in `src/core/types.ts` (RoomType enum, ~30 types)
- Generation supports ship types: fighter, freighter, cruiser, station, base
- Corridor spine architecture already researched (see `corridor_spine_architecture.md`)
- Maps must be TTRPG-friendly: multiple routes, chokepoints, tactical options
- Ships must look like ships; stations can be ring/hub/modular; outposts are compact

## Research question
How are real-world and fictional spaceships, space stations, military bases, outposts, and settlements structured internally? What rooms are essential per facility type, what adjacency rules apply, and how can this feed the procedural generator?

## Sources
- [NASA ISS Assembly Elements](https://www.nasa.gov/international-space-station/international-space-station-assembly-elements/)
- [ISS Wikipedia](https://en.wikipedia.org/wiki/International_Space_Station)
- [Space Shuttle Crew Compartment (NASA)](https://spaceflight.nasa.gov/shuttle/reference/shutref/structure/crew.html)
- [Starship Interior Concepts (humanmars.net)](https://www.humanmars.net/search/label/Starship%20interior)
- [Atomic Rockets - Habitat Module](https://www.projectrho.com/public_html/rocket/habmod.php)
- [Atomic Rockets - Life Support](https://www.projectrho.com/public_html/rocket/lifesupport.php)
- [Atomic Rockets - Warship Design](https://www.projectrho.com/public_html/rocket/spacewarship.php)
- [Atomic Rockets - Spacecraft Sizing](https://www.projectrho.com/public_html/rocket/sizing.php)
- [O'Neill Cylinder (Wikipedia)](https://en.wikipedia.org/wiki/O%27Neill_cylinder)
- [Stanford Torus (Wikipedia)](https://en.wikipedia.org/wiki/Stanford_torus)
- [Standard Sci-Fi Fleet (TV Tropes)](https://tvtropes.org/pmwiki/pmwiki.php/Main/StandardSciFiFleet)
- [Ship Classifications (milsf.com)](https://milsf.com/ship-classifications/)
- [On the Taxonomy of Spaceships (Arcane Athenaeum)](https://thearcaneathenaeum.org/2015/05/15/on-the-taxonomy-of-spaceships/)
- [StarMade Ultimate Interior Room List](https://starmadedock.net/threads/the-ultimate-interior-room-list.1056/)
- [Space Engineers Interior Design Guide (Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=321774466)
- [Submarine Design (MarineInsight)](https://www.marineinsight.com/naval-architecture/introduction-to-submarine-design/)
- [Naval Compartmentation (Wikipedia)](https://en.wikipedia.org/wiki/Compartment_(ship))
- [Watertight Bulkheads (MarineInsight)](https://www.marineinsight.com/naval-architecture/water-tight-bulkheads-on-ships-construction-and-arrangement/)
- [Military Base Infrastructure (FasterCapital)](https://fastercapital.com/content/Behind-the-Scenes--The-Infrastructure-of-Military-Bases.html)
- [Forward Operating Base (Wikipedia)](https://en.wikipedia.org/wiki/Forward_operating_base)
- [US Army Standard FOB Designs (DTIC)](https://apps.dtic.mil/sti/tr/pdf/ADA532176.pdf)
- [USAF Entry Control Design Guide](https://thewgsg.com/wp-content/uploads/2019/07/Entry-Control-Facilities-Design-GUide.pdf)
- [Space Colony Organization (Sufficient Velocity)](https://forums.sufficientvelocity.com/threads/organization-for-a-space-colony.86362/)
- [Alien RPG Colony Layouts (Starships and Steel)](https://www.starshipsandsteel.com/2019/12/alien-rpg-colony-station-layouts.html)
- [R/V Roger Revelle Layout (Scripps)](https://scripps.ucsd.edu/ships/revelle/handbook/section-3-vessel-layout-description)
- [HMS Challenger Research Ship Design (RMG)](https://rmg.co.uk/stories/topics/how-design-research-ship-building-hms-challenger)
- [NASA Space Architecture (Section 8.0)](https://www.nasa.gov/reference/8-0-architecture-vol-2/)
- [Designing Safer Access Control Points (Breaking AC)](https://breakingac.com/news/2026/jan/05/designing-safer-access-control-points-for-military-and-government-sites/)
- [Space Settlement (Wikipedia)](https://en.wikipedia.org/wiki/Space_habitat)
- [Life Support (Marspedia)](https://marspedia.org/Life_support)

---

## Findings

---

# 1. SPACESHIPS

## 1.1 Real Spacecraft Layouts

### ISS (International Space Station)
- **Modular construction**: pressurized modules connected end-to-end and via node modules
- **Node modules** serve as junctions (Unity, Harmony, Tranquility) -- each has 6 docking ports
- **Four-standoff interior design**: square cross-section corridor running the length of each module, with 4 rows of standardized racks on all sides. Between racks, 4 wedge-shaped utility tunnels carry cabling, ventilation, fluid/gas lines
- **Consistent up-down orientation**: crew learned from Skylab that a consistent "down = toward Earth" reduces disorientation
- **Functional specialization by module**: Zvezda (habitation/control), Destiny (US lab), Columbus (ESA lab), Kibo (JAXA lab), Tranquility (life support/hygiene/exercise), Cupola (observation)
- **Total pressurized volume**: ~1,000 m^3 for crew of 6-7

### Space Shuttle
- **Three-level crew compartment** in 65.8 m^3:
  - **Upper: Flight deck** -- commander, pilot, 2 mission specialists; 2,020+ displays/controls; 6 windshields, 2 overhead windows, 2 rear windows
  - **Middle: Mid-deck** -- up to 3 additional crew seats; crew equipment storage, sleeping area, galley, medical equipment, hygiene station, waste management, work/dining table, LiOH canister stowage
  - **Lower: Equipment bay** -- CO2 scrubbers, heat exchangers, environmental systems
- **Airlock**: originally internal (mid-deck), later external in payload bay for station docking
- Key lesson: even in tiny craft, you need distinct zones for command, habitation, and support systems

### Proposed Mars Ships (SpaceX Starship concepts)
- **~1,100 m^3 pressurized volume** divided into 6-8 decks
- **Multi-deck layout** with central stairway/shaft connecting all levels
- **Common configuration** (20-100 passengers):
  - Top decks: bridge/navigation, common areas, dining
  - Middle decks: crew pods/cabins (capsule-hotel style), recreation, medical
  - Lower decks: hydroponics, storage, life support machinery
  - Bottom: cargo bay (above engines)
- **Hot-bunk systems** for high passenger counts
- **Essential for long-duration**: exercise equipment, hydroponic garden, radiation shelter

### Submarines (key analog for spaceship design)
- **Forward-to-aft compartment arrangement**:
  1. Weapons/sensors (forward)
  2. Control room / conn (all operations can run from here)
  3. Accommodation (midship -- easy access fore and aft)
  4. Battery banks (redundant, in separate watertight compartments)
  5. Machinery (aft -- ~1/3 of vessel weight)
- **Watertight bulkheads** divide the hull into damage-control zones
- **Interior psychology**: different colors per compartment for variety, indirect lighting, familiar materials to reduce claustrophobia
- **Relevance**: sealed environment, hostile exterior, same design pressures as spacecraft

## 1.2 Sci-Fi Ship Archetypes

### Military Vessels

**Battleship / Dreadnought**
- Largest warships; gun-heavy, heavily armored, slow
- Bridge placed deep inside the hull (not at top/front) protected by multiple armor layers; may have secondary "combat bridge" (armored citadel) plus ceremonial bridge with windows
- Reactor(s) placed near center of mass, surrounded by buffer structure
- Extensive damage control: watertight/pressure-tight bulkheads, redundant systems
- Large crew -> multiple crew quarter blocks, multiple mess halls
- Dedicated: CIC (Combat Information Center), weapons control rooms, point defense stations, marine barracks, brig, armories (multiple)
- Spinal mount weapons may define the entire ship geometry

**Carrier**
- Among largest capital ships due to hangar requirements
- Dominated by hangar bay(s) -- must have hull access (external walls)
- Light hull-mounted weapons; relies on fighters for offense
- Flight control / CIC oversees launch/recovery operations
- Dedicated: flight deck control, pilot ready rooms, maintenance/repair bays, fuel storage, munitions magazines (separated from hangars), pilot quarters
- Internal traffic flow critical: crew corridors separate from vehicle/ordnance movement paths

**Cruiser**
- Best independent operators: long range, good speed, well-rounded
- The "Enterprise model" -- good for exploration, patrol, diplomacy
- Bridge typically forward or elevated; engineering aft
- Balanced room set: bridge, engineering, crew quarters, medbay, labs (if exploration), cargo, small hangar/shuttle bay
- Medium crew, single mess hall usually sufficient

**Battlecruiser**
- Emphasizes speed + firepower over armor
- Similar to cruiser but with bigger guns and less crew comfort
- Often the capital ship of smaller/budget fleets

**Assault Ship**
- Cruiser-sized; dedicated to placing troops on targets
- Heavy armor, limited weapons (self-defense + bombardment)
- Dominated by: troop barracks, armories, vehicle bays, drop pod bays, shuttle/dropship hangars
- Medical facilities scaled up for combat casualties

### Cargo Hauler / Freighter
- Dominated by cargo bay(s) -- often 60-80% of internal volume
- Minimal crew (4-12 typically)
- Small bridge/cockpit, shared crew quarters, single galley/mess
- Engineering section sized for endurance, not speed
- May carry smaller transport shuttles for cargo transfer
- Loading/unloading infrastructure: cargo cranes, cargo consoles, external-access bays
- Maintenance shafts (Jefferies tubes) for access to systems in cargo-adjacent areas
- Often have hidden/smuggling compartments in fiction

### Research / Exploration Ship
- Based on real research vessel design (R/V Atlantis, OceanXplorer, HMS Challenger):
  - Multiple specialized laboratories (wet lab, dry lab, analysis lab, specimen storage)
  - Chief scientist's quarters/office
  - Conference room / library
  - Machine shop for instrument fabrication/repair
  - Specialized sensor arrays and observation stations
  - Sample/specimen storage (climate-controlled)
  - Submersible/probe hangar with deployment equipment
- Science areas consume significant volume -- often 30-40% of habitable space
- Bridge needs advanced sensor/navigation displays
- Crew split between science party and ship operations crew

### Courier / Scout Ship
- Very small (2-4 crew)
- Emphasizes speed and sensors over everything else
- Combined bridge/cockpit (single room)
- Shared bunk space, minimal galley (food prep area, not a proper mess)
- Compact engineering
- Large communications/sensor suite relative to ship size
- May have a single small cargo hold or passenger cabin
- Often no dedicated medbay -- just a medical kit/closet

### Medical Ship
- Hospital-equivalent in space
- Dominated by medical facilities: triage, surgery suites, recovery wards, intensive care, pharmacy, medical labs, quarantine/isolation rooms, morgue
- Dedicated shuttle bays for patient evacuation/transfer
- Large crew quarters for medical staff
- Decontamination airlocks
- Patient ward rooms replace standard crew quarters in much of the ship

### Salvage Vessel
- Large cargo bays / open work areas for storing salvage
- External manipulator arms / drone bays
- Machine shop and fabrication facilities prominent
- Cutting/welding equipment storage
- EVA prep and suit storage areas prominent
- Environmental systems rated for unknown contaminants (extra filtration, quarantine space)
- Small crew, informal layout -- often looks "lived-in" and jury-rigged

## 1.3 Essential vs Optional Rooms by Ship Role

### Universal (every ship needs these)
- **Bridge/Cockpit**: command and navigation
- **Engineering**: propulsion and power systems
- **Life Support**: atmospheric, water, temperature
- **Crew Quarters**: sleeping, even if just bunks-in-a-closet
- **Food Prep**: at minimum a galley nook
- **Head/Lavatory**: sanitation
- **Storage**: consumables, spare parts
- **Airlock**: at least one ingress/egress point

### Scale-dependent rooms
| Room | Shuttle (2-4) | Corvette (5-15) | Frigate/Cruiser (15-100) | Capital (100+) |
|---|---|---|---|---|
| Bridge | Combined cockpit | Small bridge | Full bridge | Bridge + CIC |
| Engineering | Integrated | Separate room | Multi-room section | Engineering deck |
| Medbay | First-aid kit | Medical closet | Full medbay | Hospital wing |
| Crew quarters | Shared bunks | Cabins | Quarters + rec room | Quarters + mess + rec + gym |
| Cargo | Under-floor | Bay | Multiple bays | Dedicated cargo deck |
| Hangar | None | None | Shuttle bay | Full hangar deck |
| Armory | Weapons locker | Small armory | Armory | Multiple armories |
| Labs | None | None | 1-2 labs | Lab complex |
| Brig | None | None | Brig | Brig + security section |

## 1.4 Corridor and Access Route Principles

### Real spacecraft
- ISS: single corridor per module (square cross-section, racks on all sides)
- Shuttle: vertical ladder/hatch between decks, no corridors per se
- Submarines: single main passageway per deck, watertight doors between compartments

### Design principles for believability
1. **Main spine**: bow-to-stern primary corridor; all major rooms connect to it or to a secondary branch
2. **Military ships**: dual-path routing (main corridor + maintenance/Jefferies tube network) for redundancy and damage control
3. **Larger ships**: ring corridors on wider decks to enable circulation without dead-ends
4. **Vertical access**: turbolifts and/or ladders connecting decks; placed at intersections
5. **Watertight/pressure-tight bulkheads**: break the ship into sections that can be sealed; these create natural chokepoints
6. **Traffic separation on carriers**: crew passages separate from vehicle/ordnance movement routes
7. **Emergency routes**: escape pod access should be reachable from any point via at least 2 paths

### What makes layouts feel "real"
- Rooms cluster by function (engineering near reactor, medbay near crew quarters)
- Corridors have a reason to exist (not every room connects to every other room)
- Asymmetry and irregularity where hull shape constrains layout
- Service/maintenance access parallel to main corridors but smaller/less accessible
- Hull-contact rooms on the exterior (hangars, airlocks, observation), internal rooms protected (reactor, CIC, server room)

---

# 2. SPACE STATIONS

## 2.1 Real and Proposed Station Designs

### ISS (Modular Node-and-Module)
- Pressurized modules connected via node modules with 4-6 docking ports each
- Linear backbone with branches at nodes
- Module specialization: lab, habitation, storage, utilities, airlock
- Traffic flow is linear within modules, branching at nodes
- External truss carries solar arrays and radiators (unpressurized)

### Stanford Torus
- 1.8 km diameter torus rotating at 1 RPM for ~0.9g
- Circumference divided into 6 alternating sections: 3 residential, 3 agricultural
- **Hub** at center: zero-g, docking port for arriving spacecraft, zero-g industry
- **Spokes** (6, each 15m diameter): elevators, power cables, heat exchange pipes connecting hub to torus ring
- Structures terraced up curved walls; commercial/industrial facilities below the central plain floor
- Population: 10,000

### O'Neill Cylinder
- Two counter-rotating cylinders, each 6.4-8.0 km diameter x 32 km long
- 6 longitudinal stripes: 3 windows, 3 habitable land surfaces
- Outer agricultural ring at different rotation speed
- Large enough for internal weather systems
- Mirrors control day/night cycle

### Common patterns across designs
- **Hub-spoke**: central hub (often zero-g / docking) with spokes radiating to habitable ring. Hub handles arrivals; ring handles living/working
- **Modular**: ISS-style, modules added as needed, connected by nodes
- **Ring/Torus**: continuous loop for artificial gravity via rotation

## 2.2 Station Types and Their Emphasis

### Commercial Port / Trade Station
- **Dominant features**: docking bays (many, large), cargo warehousing, customs/processing areas, marketplace/trading floor
- Commercial district, traveler accommodations, food/entertainment
- Station operations: traffic control, security, administration
- Fuel depot / refueling infrastructure
- Resident crew quarters + transient quarters (hotels)
- Medical facility, security offices

### Research Station
- **Dominant features**: multiple specialized laboratories, sensor arrays, observatory
- Clean rooms, containment facilities, specimen storage
- Small crew (20-50), emphasis on lab space over living space
- Conference rooms, data center/server room
- Often located in remote/extreme environments
- Minimal weapons/defenses

### Military Station
- **Dominant features**: weapons emplacements, CIC, sensor arrays
- Barracks, armories, training facilities (shooting range, simulators)
- Secure communications center
- Brig, interrogation rooms
- Hangar bays for fighters/patrol craft
- Layered security zones with increasing access restrictions
- Redundant life support and power

### Refinery / Industrial Station
- **Dominant features**: processing facilities, smelting/refining modules, raw material storage, finished goods storage
- Large docking areas for ore haulers/tankers
- Worker quarters (potentially harsh/minimal)
- Environmental hazard containment
- Heavy power generation
- Maintenance workshops

### Habitat Station (O'Neill / Torus type)
- **Dominant features**: residential areas, agricultural zones, parks/green spaces
- Simulated weather/daylight
- Government/administration buildings, schools, hospitals
- Commercial/retail districts
- Industrial section (separated from residential)
- Multiple redundant life support systems

## 2.3 Traffic Flow Patterns

**Hub-Spoke Station**:
- All external traffic enters via hub
- Hub is the crossroads: customs, security screening, cargo sorting
- Spoke transit carries people/goods to ring sections
- Ring sections handle local circulation
- Advantages: single point of entry control, clear traffic hierarchy

**Ring Station**:
- Continuous circumferential movement
- Cross-ring shortcuts via spokes or through hub
- Sections can be sealed independently
- Traffic distributes naturally (no single bottleneck)

**Modular Station (ISS-style)**:
- Linear flow through modules
- Nodes are bottlenecks and decision points
- Dead-end modules possible (and problematic for evacuation)
- Easy to expand by adding modules

---

# 3. MILITARY BASES / OUTPOSTS

## 3.1 Layout Principles

### Functional Zoning
Military bases divide into distinct zones:
1. **Operational zone**: hangars, runways, weapons storage, vehicle yards, command center
2. **Administrative zone**: headquarters, offices, communications, intelligence
3. **Residential zone**: barracks, officer housing, dining facilities, recreation
4. **Support zone**: motor pool, maintenance shops, supply warehouses, medical, utilities (power, water, sewage)
5. **Training zone**: ranges, obstacle courses, simulators

Buildings positioned to create logical flow and mutual support. Example: hangars near runways, armory near barracks, medical between operational and residential.

### Layered Security (Defense in Depth)
1. **Outer perimeter**: fencing, barbed wire, sensors, cameras, guard towers at intervals
2. **Entry control points (ECPs)**: curved approach roads (reduce speed naturally), ID verification zones, vehicle inspection areas, blast-mitigated barriers (bollards, rising beams, Hesco bastions)
3. **Internal security zones**: progressively restricted areas with additional access controls
4. **Secured facilities**: weapons storage, comms centers, intelligence hubs, command bunkers -- additional armor/barriers, biometric access

### Key design details from real bases
- ECPs use offset lane alignments and curves rather than straight approaches to naturally reduce vehicle speed
- Guard booths positioned with clear sightlines but protected from direct vehicle approach
- Queue zones prevent line backup onto public roads
- Rising beams, retractable bollards, and wedge barriers respond to guard commands or automated systems
- XRAY/YOKE/ZEBRA closure classifications (from naval tradition) define when watertight/blast doors must be sealed

## 3.2 Forward Operating Base (FOB) vs Permanent Installation

### FOB Characteristics
- **Temporary/semi-permanent**, closer to operations than main bases
- **Austere**: basic ring of barriers (Hesco bastions, concertina wire) with fortified ECP
- **Scale**: 120-1,000 personnel (company to battalion)
- **Facilities**: essential only -- command post, communications, medical station, supply depot, motor pool, berthing (tents/containerized housing), mess, ammunition storage
- **Guard towers** at perimeter intervals, elevated vantage
- **Quick reaction force** on standby
- Monthly resupply from parent base
- **Early warning systems** and sometimes anti-rocket/mortar defenses

### Permanent Installation Characteristics
- **Full infrastructure**: hardened buildings, redundant utilities (power, water, sewage), paved roads
- **Complete facilities**: hospital, schools, family housing, recreation centers, chapels, PX/stores
- **Multiple ECPs** handling different traffic types
- **Extensive training facilities**
- **Deep defense**: bunkers, hardened command centers, underground passages

### Sci-fi translation
- **FOB** = frontier outpost, mining camp, forward research station. Prefab structures, perimeter fence, single entry, minimal facilities, stressed crew
- **Permanent base** = established colony, major station. Full infrastructure, multiple zones, extensive facilities, diverse population

## 3.3 Fortification Effects on Layout

- Bunkers and hardened structures force specific placement patterns (underground or earth-bermed)
- Fields of fire create cleared zones around perimeters (no obstructions)
- Redundant access routes between critical facilities (so damage to one path does not isolate an area)
- Command/control centrally located and hardened
- Ammunition and fuel storage separated from personnel areas (blast radius consideration)
- Communication arrays need clear sky/horizon access (elevated or peripheral)

---

# 4. SETTLEMENTS / COLONIES

## 4.1 Real Frontier Settlement Patterns

### Historical principles
- **Grid planning was the norm**: rectangular blocks and lots, not organic sprawl, dominated frontier American towns. Grid "has been the plan-form used in all great periods of mass town founding"
- **Town planners preceded settlers**: contrary to myth, towns were plotted before settlers arrived. Railroads, churches, governments, and corporations laid out town plans first
- **Variety of settlement types**: Spanish pueblos, mining camps, railroad communities, Mormon settlements, speculative towns, agricultural centers
- **Mining boom towns**: grew explosively around strikes, often chaotic initial layout that later regularized. Multiple nationalities, high population density

### Organic vs Planned Growth
- **Planned**: grid layout, central square/plaza, designated zones for different functions, consistent lot sizes. Works when a single authority controls development
- **Organic**: grows outward from a nucleus (mine head, water source, landing pad). Roads follow terrain and traffic patterns. Irregularly shaped lots. More "character" but less efficient
- **Hybrid** (most realistic): initial planned core with organic growth at edges as population expands beyond the original plan

## 4.2 Sci-Fi Colony Types

### Mining Colony
- Nucleus: the mine/extraction site
- Essential: ore processing/refinery, worker housing (dormitories), mess hall, commissary/general store, medical clinic, communications, power plant, environmental systems
- Secondary: machine shop, vehicle garage, administrative office, security post, recreation area
- Often corporate-run with spartan facilities
- Layout follows geology: tunnels and surface structures linked to mine access
- Environmental hazards shape layout (toxic zones, unstable ground)

### Research Outpost
- Nucleus: the thing being studied (geological feature, alien ruin, atmospheric phenomenon)
- Small crew (10-30)
- Lab space is primary, living space is secondary
- Usually planned layout (scientific organizations plan before building)
- Essential: labs, quarters, power, life support, comms, landing pad, storage
- Clean/sterile zones separated from "dirty" zones (EVA prep, vehicle bay)

### Frontier Town
- Mixed economy: trade, services, some industry
- Central "main street" or plaza with commercial buildings
- Residential areas radiate outward
- Essential services: water, power, food supply, medical, law enforcement, communications
- Starport/landing pad is the main link to outside
- Entertainment district (bar/cantina is a TTRPG staple)
- May have defensive wall/perimeter or may be open

### Established Colony / City
- Full urban services: government, education, healthcare, emergency services, utilities, transportation
- Industrial district separated from residential
- Agricultural areas (domes, hydroponics facilities, or open fields depending on environment)
- Multiple neighborhoods/districts with distinct character
- Infrastructure: roads/transit, water treatment, power grid, waste management
- Parks and public spaces for mental health

## 4.3 Essential Services and Infrastructure

Every settlement requires, at minimum:
1. **Power generation**: solar, nuclear, fusion, geothermal -- plus redundant backup
2. **Atmosphere**: oxygen generation, CO2 scrubbing, pressure containment (if hostile environment)
3. **Water**: recycling (target >98% recovery), purification, storage, distribution
4. **Food**: hydroponics/agriculture for self-sufficiency, imported supplies for early stages
5. **Waste management**: recycling, processing, storage
6. **Communications**: internal network + external link to wider civilization
7. **Medical**: scales from first-aid kit to full hospital depending on size
8. **Shelter**: radiation protection, temperature control, structural integrity
9. **Transportation**: internal (corridors, vehicles) + external (landing pads, docking)
10. **Security**: ranges from a locked door to full military presence

---

# 5. ROOM IMPORTANCE HIERARCHY

## 5.1 Spaceships

### Military Ship
| Priority | Rooms |
|---|---|
| **CRITICAL** | Bridge/CIC, Engineering, Reactor, Life Support, Crew Quarters |
| **IMPORTANT** | Weapons Control, Armory, Medbay, Communications, Power Distribution, Mess Hall |
| **STANDARD** | Security Post, Brig, Barracks, Officer Quarters, Captain's Quarters, Storage, Maintenance, Server Room |
| **OPTIONAL** | Recreation Room, Observatory, Laboratory, Cryogenics, Hydroponics |

### Cargo Freighter
| Priority | Rooms |
|---|---|
| **CRITICAL** | Bridge/Cockpit, Engineering, Cargo Bay, Life Support, Crew Quarters |
| **IMPORTANT** | Airlock, Storage, Maintenance, Power Distribution |
| **STANDARD** | Medbay (medical closet), Mess/Galley, Communications |
| **OPTIONAL** | Recreation Room, Armory, Passenger Cabin, Hidden Compartment |

### Research / Exploration Ship
| Priority | Rooms |
|---|---|
| **CRITICAL** | Bridge, Engineering, Life Support, Laboratory, Crew Quarters |
| **IMPORTANT** | Science Bay, Sensor Array, Communications, Medbay, Mess Hall, Storage |
| **STANDARD** | Conference Room, Server Room, Specimen Storage, Observation Deck, Shuttle Bay |
| **OPTIONAL** | Recreation Room, Hydroponics, Cryogenics, Armory |

### Courier / Scout
| Priority | Rooms |
|---|---|
| **CRITICAL** | Cockpit (bridge), Engineering, Life Support, Crew Bunks (combined) |
| **IMPORTANT** | Communications/Sensors, Storage |
| **STANDARD** | Galley nook, Head |
| **OPTIONAL** | Passenger seat, Cargo hold, Medical kit closet |

### Medical Ship
| Priority | Rooms |
|---|---|
| **CRITICAL** | Bridge, Engineering, Life Support, Surgery Suite, Recovery Ward, Triage |
| **IMPORTANT** | Medbay/ICU, Pharmacy, Medical Lab, Decontamination, Crew Quarters, Communications |
| **STANDARD** | Patient Wards, Quarantine, Morgue, Mess Hall, Shuttle Bay, Storage |
| **OPTIONAL** | Recreation Room, Counseling Office, Chapel, Research Lab |

### Salvage Vessel
| Priority | Rooms |
|---|---|
| **CRITICAL** | Bridge, Engineering, Life Support, Cargo Bay (salvage hold), Crew Quarters |
| **IMPORTANT** | Machine Shop, EVA Prep/Suit Storage, Airlock, Maintenance |
| **STANDARD** | Drone Bay, Cutting/Welding Storage, Quarantine Area, Medbay, Mess |
| **OPTIONAL** | Armory, Lab (for analyzing salvage), Recreation Room |

## 5.2 Space Stations

### Commercial Port
| Priority | Rooms |
|---|---|
| **CRITICAL** | Station Operations/Control, Docking Bays, Life Support, Power Generation |
| **IMPORTANT** | Cargo Warehousing, Customs, Traffic Control, Security, Communications, Crew Quarters |
| **STANDARD** | Marketplace, Traveler Quarters, Medical Facility, Mess/Restaurant, Fuel Depot, Maintenance |
| **OPTIONAL** | Entertainment, Recreation, Observatory, Chapel, Gardens |

### Research Station
| Priority | Rooms |
|---|---|
| **CRITICAL** | Station Control, Laboratories, Life Support, Power, Crew Quarters |
| **IMPORTANT** | Sensor Array, Server Room, Communications, Storage, Medbay |
| **STANDARD** | Conference Room, Machine Shop, Specimen Storage, Observatory, Mess Hall |
| **OPTIONAL** | Recreation, Hydroponics, Guest Quarters |

### Military Station
| Priority | Rooms |
|---|---|
| **CRITICAL** | Command Center/CIC, Life Support, Power, Communications, Barracks |
| **IMPORTANT** | Weapons Control, Armory, Hangar Bay, Medbay, Security, Mess Hall |
| **STANDARD** | Brig, Training Facilities, Officer Quarters, Server Room, Storage, Maintenance |
| **OPTIONAL** | Recreation, Observatory, Chapel, Research Lab |

### Refinery Station
| Priority | Rooms |
|---|---|
| **CRITICAL** | Station Control, Processing Facility, Power Generation, Life Support, Docking Bay |
| **IMPORTANT** | Raw Material Storage, Finished Goods Storage, Worker Quarters, Maintenance, Communications |
| **STANDARD** | Mess Hall, Medical, Security, Administration, Machine Shop |
| **OPTIONAL** | Recreation, Hydroponics, Guest Quarters |

## 5.3 Military Bases / Outposts

### FOB / Forward Outpost
| Priority | Rooms |
|---|---|
| **CRITICAL** | Command Post, Communications, Barracks/Berthing, Power Generator, Perimeter Defenses |
| **IMPORTANT** | Armory, Medical Station, Supply Depot, Motor Pool/Vehicle Bay, Mess |
| **STANDARD** | Guard Posts, Watchtower, Ammunition Storage, Maintenance Shop, Water/Sanitation |
| **OPTIONAL** | Recreation tent, Training area, Intelligence office, Holding cell |

### Permanent Military Base
| Priority | Rooms |
|---|---|
| **CRITICAL** | Command Center, Communications, Power Plant, Barracks, Medical, Perimeter/ECP |
| **IMPORTANT** | Armory, Vehicle Bay, Supply Warehouse, Mess/DFAC, Training Facilities, Security HQ |
| **STANDARD** | Officer Housing, Intelligence Center, Brig, Maintenance, Server Room, Administrative Offices |
| **OPTIONAL** | Recreation Center, Gym, Chapel, PX/Store, School, Family Housing, Parade Ground |

## 5.4 Settlements / Colonies

### Mining Colony
| Priority | Rooms |
|---|---|
| **CRITICAL** | Mine Access/Shaft, Power Plant, Life Support, Worker Housing, Water/Air Processing |
| **IMPORTANT** | Ore Processing/Refinery, Mess Hall, Medical Clinic, Communications, Supply Storage |
| **STANDARD** | Machine Shop, Vehicle Garage, Security Post, Administrative Office, Landing Pad |
| **OPTIONAL** | Recreation/Bar, General Store, Hydroponics, Chapel, School (if families present) |

### Research Outpost
| Priority | Rooms |
|---|---|
| **CRITICAL** | Laboratories, Power, Life Support, Crew Quarters, Communications |
| **IMPORTANT** | Sample/Specimen Storage, Landing Pad, Medical, Supply Storage, Data Center |
| **STANDARD** | Mess Hall, EVA Prep, Vehicle Bay, Decontamination, Machine Shop |
| **OPTIONAL** | Recreation, Library, Greenhouse, Guest Quarters |

### Frontier Town
| Priority | Rooms |
|---|---|
| **CRITICAL** | Starport/Landing Pad, Power, Life Support/Water, Residential Buildings |
| **IMPORTANT** | General Store/Market, Medical Clinic, Communications, Security/Sheriff's Office, Mess/Cantina |
| **STANDARD** | Repair Shop, Warehouse, Administration, School, Fuel Depot |
| **OPTIONAL** | Entertainment Hall, Hotel/Inn, Chapel, Park, Bank, Gym |

---

# 6. ADJACENCY RULES

## 6.1 Must Be Near Each Other

### Universal adjacencies (apply to all facility types)
| Room A | Room B | Reason |
|---|---|---|
| Bridge/Command | Communications | Command needs instant comms access |
| Bridge/Command | Server Room | Data access and ship computer proximity |
| Engineering | Reactor | Engineers monitor and maintain the reactor |
| Engineering | Power Distribution | Power routing originates from engineering |
| Medbay | Crew Quarters | Quick access for medical emergencies |
| Mess Hall | Crew Quarters | Daily traffic flow efficiency |
| Mess Hall | Galley/Food Prep | Food preparation adjacent to serving |
| Airlock | EVA Prep/Suit Storage | Suiting up before going outside |
| Hangar | Maintenance/Repair Bay | Vehicles serviced near where they park |
| Armory | Security Post | Armed response readiness |
| Armory | Barracks (military) | Troops arm up quickly |

### Ship-specific adjacencies
| Room A | Room B | Reason |
|---|---|---|
| Bridge | Navigation Room | Helm/navigation integration |
| CIC | Weapons Control | Tactical coordination |
| CIC | Sensor Array | Real-time intelligence |
| Hangar | Cargo Bay | Loading/unloading efficiency |
| Shuttle Bay | Airlock | Alternative ingress/egress |
| Cryogenics | Medbay | Medical monitoring of cryo patients |
| Life Support | Engineering | Shared utilities infrastructure |
| Captain's Quarters | Bridge | Captain needs rapid bridge access |

### Station-specific adjacencies
| Room A | Room B | Reason |
|---|---|---|
| Docking Bay | Customs/Security | Screening arrivals |
| Docking Bay | Cargo Warehouse | Cargo transfer efficiency |
| Hub | All spokes | Central access point |
| Traffic Control | Docking Bays | Coordinating arrivals/departures |
| Marketplace | Docking Bay area | Trader access |

### Base/Settlement-specific adjacencies
| Room A | Room B | Reason |
|---|---|---|
| Gate/ECP | Guard Post | Security staffing |
| Command Post | Communications | C2 integration |
| Motor Pool | Supply Depot | Vehicle loading/maintenance |
| Mine Access | Ore Processing | Minimize ore transport distance |
| Landing Pad | Cargo Storage | Efficient loading/unloading |

## 6.2 Must NOT Be Adjacent

| Room A | Room B | Reason |
|---|---|---|
| Reactor | Crew Quarters | Radiation hazard; buffer rooms needed |
| Reactor | Medbay | Radiation hazard to patients |
| Reactor | Bridge | Critical facility separation (one hit should not disable both) |
| Ammunition Storage | Reactor | Explosion chain risk |
| Ammunition Storage | Fuel Storage | Explosion chain risk |
| Brig | Armory | Prisoners should not be near weapons |
| Brig | Bridge | Security risk if prisoners escape |
| Hangar (external access) | Reactor | Hull breach risk to critical system |
| Mess Hall | Waste Processing | Hygiene and morale |
| Crew Quarters | Noisy Machinery | Noise/vibration affects rest |
| Laboratories (hazmat) | Mess Hall | Contamination risk |
| Fuel Storage | Crew Quarters | Fire/explosion hazard |

## 6.3 Logical Room Groupings / Zones

### Zone: COMMAND
- Bridge, CIC, Communications, Navigation Room, Sensor Array
- Typically forward (ships) or central (stations/bases)
- High security, restricted access

### Zone: ENGINEERING
- Engineering, Reactor, Power Distribution, Maintenance, Life Support, Server Room
- Typically aft (ships) or dedicated section (stations)
- Controlled access, technical personnel only

### Zone: HABITATION
- Crew Quarters, Officer Quarters, Captain's Quarters, Barracks
- Mess Hall, Galley, Recreation Room
- Head/Lavatory facilities
- Central location for easy access to other zones

### Zone: MEDICAL
- Medbay, Surgery, Recovery Ward, Pharmacy, Quarantine
- Cryogenics (adjacent to medical)
- Near habitation zone; away from engineering hazards

### Zone: SCIENCE (research/exploration vessels)
- Laboratory, Science Bay, Specimen Storage, Observatory
- Clean rooms, containment
- Ideally adjacent to sensor arrays and data center

### Zone: CARGO / LOGISTICS
- Cargo Bay, Storage, Docking Bay, Hangar, Shuttle Bay
- Near hull/exterior for loading access
- Separated from habitation by bulkheads (decompression risk)

### Zone: MILITARY / SECURITY
- Armory, Security Post, Brig, Weapons Control, Training Facility
- Controlled access; Armory and Brig in same zone but NOT adjacent
- Brig positioned to be escapable only into security-controlled areas

### Zone: EXTERNAL ACCESS
- Airlocks, Docking Ports, Hangar Bay, Escape Pods
- Must touch hull/exterior boundary
- Airlock chambers serve as buffer between inside and outside
- Escape pods distributed along the hull for access from multiple zones

---

# 7. GENERATOR CONFIGURATION RECOMMENDATIONS

## 7.1 Facility Templates (for GenerationParams.shipType expansion)

The current `shipType` enum supports: `fighter | freighter | cruiser | station | base`. Based on this research, consider expanding to or supporting sub-types:

**Ships:**
- `shuttle` (2-4 crew, 4-8 rooms)
- `courier` (2-4 crew, 5-10 rooms)
- `freighter` (4-12 crew, 8-20 rooms, cargo-dominant)
- `corvette` (10-30 crew, 12-25 rooms)
- `cruiser` (30-100 crew, 20-50 rooms, well-rounded)
- `carrier` (100-500 crew, 40-80 rooms, hangar-dominant)
- `battleship` (200-1000 crew, 50-100 rooms, weapons/armor-dominant)
- `medical_ship` (50-200 crew, 30-60 rooms, medical-dominant)
- `research_ship` (30-80 crew, 25-50 rooms, lab-dominant)
- `salvage_ship` (4-15 crew, 10-25 rooms)

**Stations:**
- `trade_station` (docking/cargo-dominant)
- `research_station` (lab-dominant)
- `military_station` (weapons/hangar-dominant)
- `refinery_station` (processing-dominant)
- `habitat_station` (residential-dominant)

**Bases/Settlements:**
- `fob` (minimal, 8-15 rooms)
- `military_base` (full, 20-50 rooms)
- `mining_colony` (mine + support, 15-30 rooms)
- `research_outpost` (lab + support, 10-20 rooms)
- `frontier_town` (mixed-use, 20-40 rooms)

## 7.2 Room Distribution Weights

For each facility template, define the probability/weight of each room type appearing. Example structure:

```
template: "cruiser"
required_rooms: [bridge, engineering, reactor, life_support, crew_quarters, medbay, mess, airlock]
weighted_rooms:
  crew_quarters: 4    # multiple instances likely
  storage: 3
  officer_quarters: 2
  maintenance: 2
  corridor: weight_by_size
  cargo_bay: 1
  laboratory: 1
  armory: 1
  security_post: 1
  communications: 1
  rec_room: 1
  ...
max_per_ship:
  bridge: 1
  cic: 1
  reactor: 2
  engineering: 1
  medbay: 1
  brig: 1
```

## 7.3 Adjacency Rules for Generator

Encode as weighted adjacency preferences:

```
adjacency_weights:
  # Positive = prefer adjacent. Negative = avoid adjacent.
  # Scale: -10 (must never) to +10 (must always)

  bridge -> communications: +8
  bridge -> navigation_room: +7
  bridge -> captain_quarters: +5
  bridge -> reactor: -8
  bridge -> brig: -6

  engineering -> reactor: +9
  engineering -> power_distribution: +8
  engineering -> life_support: +6
  engineering -> maintenance: +5

  reactor -> crew_quarters: -9
  reactor -> medbay: -8
  reactor -> mess: -7
  reactor -> ammunition/armory: -8

  medbay -> crew_quarters: +7
  medbay -> cryogenics: +6

  mess -> crew_quarters: +6
  mess -> galley: +9  (if separate)
  mess -> waste_processing: -7

  armory -> security_post: +7
  armory -> barracks: +6
  armory -> brig: -7

  hangar -> hull_boundary: +10
  airlock -> hull_boundary: +10
  escape_pods -> hull_boundary: +10
  docking_bay -> hull_boundary: +10

  cargo_bay -> hangar: +5
  cargo_bay -> airlock: +4

  brig -> security_post: +5
  brig -> armory: -7
  brig -> bridge: -6
  brig -> engineering: -5
```

## 7.4 Zone Placement Rules for Generator

For ships (bow-to-stern layout):
```
zone_placement:
  command:     position=bow,  order=1
  habitation:  position=mid-forward, order=2
  medical:     position=mid, order=3
  science:     position=mid, order=3  (if applicable)
  cargo:       position=mid-aft, order=4
  military:    position=mid, order=3  (distributed)
  engineering: position=aft, order=5
  external:    position=hull_boundary (any)
```

For stations (hub-spoke or modular):
```
zone_placement:
  command:     position=hub_or_central_node
  docking:     position=hull_boundary_or_hub
  cargo:       position=near_docking
  habitation:  position=ring_or_spoke_mid
  engineering: position=spoke_ends_or_dedicated_module
  science:     position=dedicated_module
```

For bases (perimeter-inward):
```
zone_placement:
  perimeter:   position=outer_boundary (walls, guard posts, ECP)
  operational: position=near_perimeter (hangars, vehicle bays)
  command:     position=center_or_hardened
  support:     position=mid (supply, maintenance, medical)
  habitation:  position=inner (protected from perimeter threats)
```

## 7.5 Size Scaling Rules

| Crew Size | Typical Total Rooms | Corridor Complexity | Deck Count |
|---|---|---|---|
| 1-4 | 4-8 | Minimal (linear) | 1 |
| 5-15 | 8-20 | Simple branching | 1-2 |
| 15-50 | 15-35 | Branching with loops | 2-3 |
| 50-150 | 30-60 | Ring corridors, multiple paths | 3-5 |
| 150-500 | 50-100 | Complex network, multiple spines | 4-8 |
| 500+ | 80-150+ | District-based, transit systems | 6-15+ |

## 7.6 Believability Checklist (for generator validation)

The generator should verify these post-generation:
1. Every room is reachable from every other room via corridors
2. No crew quarter block is more than 2 rooms away from a head/lavatory
3. Escape pods are reachable from any point via at least 2 different paths
4. Reactor has at least one buffer room between it and any habitation room
5. All hangar/airlock/docking rooms touch the hull boundary
6. Bridge (on military ships) is either at the bow OR deep in the interior (not randomly placed)
7. Engineering is at or near the aft (ships) or in a dedicated section (stations)
8. No dead-end corridors longer than 3 rooms (unrealistic and tactically bad)
9. Medical is closer to habitation than to engineering
10. At least 2 entry/exit points to the facility (redundancy)

---

## Decision
- **What we adopt**: All of the above room hierarchies, adjacency rules, zone groupings, and facility templates as configuration data for the procedural generator. The adjacency weight system and zone placement rules provide a concrete, implementable framework.
- **What we reject**: Hyper-detailed real-world engineering constraints (exact pressure calculations, precise radiation shielding distances). The generator targets TTRPG believability, not engineering simulation.
- **Why**: TTRPG maps need to feel realistic enough to support narrative immersion and tactical gameplay, but do not need to be physically accurate spacecraft designs. The research provides the "gut feel" rules that make layouts look right.

## Proposed changes
- **Docs/specs to update**:
  - `TECHNICAL_SPECIFICATION.md` section 2 (Room Types): expand room type list, add importance tiers per facility type
  - `TECHNICAL_SPECIFICATION.md`: add adjacency rules section referencing this research
  - Generator config files: encode room weights, adjacency matrices, zone placement rules per facility template
- **Code areas affected**:
  - `src/core/types.ts`: consider adding room types if missing (EVA Prep, Waste Processing, Customs, Fuel Depot, Quarantine, Triage, Surgery, Pharmacy, Training Facility, Guard Post, Landing Pad, Mine Access, Ore Processing, Marketplace, Cantina)
  - `src/core/types.ts` `GenerationParams.shipType`: expand enum to cover more archetypes
  - `src/generators/`: new or updated generation logic using adjacency weights and zone placement
- **Tests/acceptance impacts**:
  - Add generation tests verifying adjacency rules are respected
  - Add validation tests for believability checklist items
  - Add template-specific tests (e.g., freighter has cargo_bay, military ship has armory)

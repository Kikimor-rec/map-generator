# TTRPG Map Design for Sci-Fi Procedural Generation — 2026-02-06

## Context (constraints from our docs)
- Ships must look like ships (elongated, bow-to-stern structure)
- Stations can be ring/hub/modular
- Outposts are compact, terrain-dependent
- TTRPG-friendly: multiple routes, chokepoints, tactical options
- Corridors should merge/coalesce, not run parallel
- Spine architecture already implemented (single, dual, loop, branching for ships; hub-spoke/ring for stations; tunnel/cluster/ruins for outposts)
- Generator has `loopiness`, `secretness`, `danger`, `setpieceBias` parameters
- Room types include zones: core, crew, operations, cargo, special
- Connector kinds: corridor, door, airlock, bulkhead, serviceHatch

## Research question
What are the established best practices for TTRPG map design — specifically for sci-fi settings — and how should they inform our procedural generation algorithms to produce maps that are tactically interesting, well-paced, and avoid common pitfalls of procedural generation?

## Sources
- [2-Minute Tabletop: How to Design & Draw Battle Maps](https://2minutetabletop.com/how-to-design-draw-battle-maps/)
- [Roleplaying Tips: 9 Tips for Awesome Action Scenes](https://www.roleplayingtips.com/rptn/drawing-battle-maps-9-tips-for-awesome-action-scenes/)
- [The Angry GM: Mapsturbation and the Size of Encounters](https://theangrygm.com/mapsturbation-and-the-size-of-encounters/)
- [The Angry GM: Let's Make a Room](https://theangrygm.com/megadungeon-monday-room-design-1/)
- [The Angry GM: And Then You Make a Map](https://theangrygm.com/megadungeon-monday-and-then-you-make-a-map/)
- [Sly Flourish: Simpler Checklist for Engaging Dungeon Maps](https://slyflourish.com/simpler_jaquay_style_maps.html)
- [The Alexandrian: Xandering the Dungeon](https://thealexandrian.net/wordpress/13085/roleplaying-games/xandering-the-dungeon)
- [Bumbling Through Dungeons: Jaquaysing a Dungeon](https://bumblingthroughdungeons.com/jaquaying-a-dungeon/)
- [Pathika: How Jennell Jaquays Evolved Dungeon Design](https://pathikablog.com/2025/05/05/how-jennell-jaquays-evolved-dungeon-design-part-2-the-caverns-of-thracia/)
- [UCSC RPG Design Patterns Wiki](https://rpgpatterns.soe.ucsc.edu/doku.php?id=patterns:levelindex)
- [The Level Design Book: Typology](https://book.leveldesignbook.com/process/layout/typology)
- [Roleplaying Tips: The Ultimate Guide to 5 Room Dungeons](https://www.roleplayingtips.com/5-room-dungeons/)
- [Gnome Stew: Nine Forms of the Five Room Dungeon](https://gnomestew.com/the-nine-forms-of-the-five-room-dungeon/)
- [Bob Nystrom: Rooms and Mazes — A Procedural Dungeon Generator](https://journal.stuffwithstuff.com/2014/12/21/rooms-and-mazes/)
- [Game Developer: Procedural Dungeon Generation Algorithm](https://www.gamedeveloper.com/programming/procedural-dungeon-generation-algorithm)
- [Tiendil: Dungeon Generation — From Simple to Complex](https://tiendil.org/en/posts/dungeon-generation-from-simple-to-complex)
- [Game Developer: Level Design — Room Shapes](https://www.gamedeveloper.com/design/level-design---room-shapes)
- [TTRPG Factory: Pacing your RPG](https://ttrpgfactory.com/2023/03/15/pacing-your-rpg/)
- [TTRPG Games: Ultimate Guide to RPG Pacing and Tension](https://www.ttrpg-games.com/blog/ultimate-guide-to-rpg-pacing-and-tension/)
- [Starships & Steel: Alien RPG Colony & Station Layouts](https://www.starshipsandsteel.com/2019/12/alien-rpg-colony-station-layouts.html)
- [RPGnet: Hard Sci-Fi Freighter Deck Plan](https://forum.rpg.net/threads/hard-sci-fi-freighter-deck-plan.774771/)
- [Justin Achilli: Maps as Flowcharts](https://justinachilli.com/2017/10/02/maps-as-flowcharts/)
- [Qyubey's Substack: Adding Dimensions to TTRPG Combat](https://questqyubey.substack.com/p/adding-dimensions-to-ttrpg-combat)
- [Dice Dungeons: Cover, Line of Sight, and Ranged Attacks](https://dicedungeons.com/blogs/inside/cover-ranged-dnd-2024)
- [Springer: Situating Quests — Design Patterns for Quest and Level Design in RPGs](https://link.springer.com/chapter/10.1007/978-3-642-25289-1_40)
- [D&D Beyond: Designing the Dungeon — Gauntlet vs. Labyrinth](https://www.dndbeyond.com/posts/221-designing-the-dungeon-gauntlet-vs-labyrinth)

---

## Findings

### 1. TTRPG BATTLE MAP DESIGN FUNDAMENTALS

#### What makes a good TTRPG battle map

A good battle map creates **meaningful decisions** for players every turn. The map should answer "where do I go?" in a way that has no single obvious answer. The layout acts upon encounters in "subtle, silent, and significant ways" — change the structure and you change the outcome.

**Core qualities of a good map:**
- **Multiple valid positions** — No single "best square" to stand on; trade-offs between cover, range, and objectives
- **Asymmetric advantages** — Different positions favor different character builds (ranged vs melee, stealth vs tank)
- **Dynamic flow** — The optimal position changes as combat progresses (reinforcements, hazards activating, objectives shifting)
- **Readability** — Players can assess their options within a few seconds of looking at the map
- **Theming** — The map tells a story about the place (a medbay looks different from a cargo bay)

#### Key principles of encounter design through layout

1. **Cover is king.** Without cover, combat devolves into "stand in a clump and attack." Cover creates positioning decisions, rewards flanking, and makes ranged combat meaningful. Half cover (+2 AC), three-quarters cover (+5 AC), and total cover (untargetable) should all appear.

2. **Variable engagement distance.** Do NOT always start enemies within one move of melee range. Spacing out creates pressure to use ranged attacks, take cover, and close distance tactically.

3. **Terrain subdivides the space.** Obstacles, elevation changes, and terrain features break a room into "zones" — smaller battlefields connected by chokepoints. This turns a single fight into a multi-front tactical puzzle.

4. **Enemy escape routes.** Smart NPCs build escape routes. Maps should include at least one way for enemies to flee, retreat, or get reinforcements — this makes the world feel alive and prevents every fight from being a static slugfest.

5. **Map to PC powers.** Design maps that let different characters shine in different rooms — swimming, climbing, hacking, etc.

#### Chokepoints, cover, elevation, flanking routes

| Element | Tactical Role | Sci-Fi Implementation |
|---------|--------------|----------------------|
| **Chokepoint** | Limits attackers to 1-2 at a time; defenders can hold against superior numbers | Airlocks, bulkheads, blast doors, narrow corridors |
| **Half cover** | +2 AC; encourages positional play | Consoles, cargo crates, machinery, railings |
| **Three-quarter cover** | +5 AC; strong defensive positions | Blast shields, barricades, window slits |
| **Total cover** | Blocks line of sight entirely | Walls, closed doors, sealed bulkheads |
| **Elevation** | Height advantage for ranged; complicates melee | Multi-level rooms, catwalks, observation decks, maintenance pits |
| **Flanking route** | Bypass chokepoints; reward mobile characters | Ventilation ducts, maintenance crawlways, alternative corridors |

#### Open vs confined spaces — when to use each

**Confined spaces (corridors, small rooms):**
- Favor melee and close-range weapons
- Make area-of-effect abilities devastating
- Create natural chokepoints
- Build tension and claustrophobia (horror scenarios)
- Limit mobility — high-speed characters lose advantage
- Best for: ambushes, horror, bottleneck defense, resource-scarce scenarios

**Open spaces (hangars, cargo bays, arenas):**
- Favor ranged combat and mobility
- Allow flanking, encirclement, hit-and-run tactics
- Require cover objects to prevent "empty field" syndrome
- Support larger enemy groups
- Best for: boss fights, vehicle encounters, multi-squad engagements

**Mixed spaces (the ideal):**
- L-shaped rooms, T-intersections, rooms with internal walls
- Transition zones between open and confined
- Let different party members use different strengths simultaneously

---

### 2. PROCEDURAL MAP GENERATION FOR TTRPG

#### What existing tools do well

| Tool | Strength | Weakness |
|------|----------|----------|
| **Watabou One Page Dungeon** | Artistic, "human-designed" feel; semi-symmetrical layouts; lore generation; free | Not sci-fi; limited tactical detail |
| **DonJon** | Fast, tweakable parameters; good for quick layouts | Bare-bones; boring corridors; fantasy-only |
| **Dungeon Scrawl** | Clean old-school aesthetic; Roll20 integration; fast | Manual drawing, not truly procedural |
| **Dungeon Alchemist** | AI-assisted room furnishing; high visual quality | Fantasy theme; no sci-fi assets out of box |
| **Dungeondraft** | Smart tiling; large asset ecosystem; cave/dungeon generators | Semi-manual; one-time purchase; fantasy focus |
| **Illwinter's Floorplan Generator** | Cheap, fast, moddable tile-based generation | Schematic; limited variety |

#### What works well in procedural generation for TTRPG

1. **Constraint-based room placement** — Rooms placed according to rules about adjacency, zone, and importance produce more believable layouts than pure random placement
2. **Spine-first architecture** — Generating the main corridor structure first and then attaching rooms produces cleaner, more navigable maps
3. **Rule-of-three connectivity** — Ensuring 2-3 paths to important locations creates tactical interest without overwhelming complexity
4. **Themed room pools** — Different room types with different frequencies per archetype prevent monotony
5. **Post-processing passes** — Adding loops, trimming dead ends, and placing objects after the basic structure is set allows quality improvement

#### Common complaints about procedurally generated maps

1. **"Boring corridors"** — Straight, identical corridors connecting boxy rooms; the most universal complaint
2. **"Same-looking rooms"** — Every room is a rectangle of similar size
3. **"Spaghetti layout"** — Too many corridors crossing and overlapping with no clear structure
4. **"Disconnected feel"** — Rooms feel randomly placed with no logical relationship (why is the medbay next to the reactor?)
5. **"No tactical interest"** — Open rooms with nothing in them, no cover, no elevation, no features
6. **"Too linear OR too random"** — Either a boring straight line or a confusing mess with no sense of direction
7. **"Empty space"** — Large areas of nothing between rooms

#### How to avoid "boring corridor + room" syndrome

**Structural techniques:**
- **Vary corridor width** — Main spines are wider (2-3 tiles), branches are standard (1-2 tiles), maintenance ways are narrow (1 tile)
- **Add corridor features** — Junctions, alcoves, windows, pipe runs, junction boxes break visual monotony
- **Merge corridors** — Where multiple routes converge, coalesce into shared paths rather than running parallel
- **Bend corridors** — L-bends and S-curves instead of perfectly straight lines
- **Vary room shapes** — L-shaped, T-shaped, irregular rooms; not just rectangles
- **Multi-room encounter areas** — Groups of 2-3 connected small rooms form one "encounter space"

**Content techniques:**
- **Room furnishing** — Objects, consoles, cover items within rooms
- **Purpose-driven rooms** — Each room has a clear function that suggests its contents
- **Transition spaces** — Airlocks, checkpoints, vestibules between zones create rhythm
- **Environmental storytelling** — Damage, debris, modifications suggest history

---

### 3. SCI-FI SPECIFIC MAP CONSIDERATIONS

#### How sci-fi maps differ from fantasy dungeon maps

| Aspect | Fantasy Dungeon | Sci-Fi Ship/Station |
|--------|----------------|---------------------|
| **Construction logic** | Natural caves + carved stone; can be irregular | Engineered structure; should look purposeful and designed |
| **Corridors** | Winding, variable width, natural | Straight or gently curved; consistent width; grid-aligned |
| **Doors** | Wood/stone; manual | Metal; automated; hackable; can be sealed |
| **Lighting** | Torches, darkness | Panels, emergency lighting, darkness when power fails |
| **Verticality** | Stairs, pits, cliffs | Decks, ladders, elevators, zero-G shafts |
| **Exterior boundary** | Walls end arbitrarily | Hull is life-or-death boundary; shape matters |
| **Environmental hazards** | Traps, water, lava | Vacuum, radiation, fire, depressurization, toxic atmosphere |
| **Locked areas** | Keys, puzzles | Keycards, hacking, override codes, biometrics |
| **Secret passages** | Hidden doors, illusions | Maintenance ducts, ventilation, crawl spaces |

**Key implication for generation:** Sci-fi maps need to look *designed by engineers*, not carved by monsters. Rooms should have logical purposes and relationships. A reactor room should be near engineering, not next to crew quarters. The hull silhouette should feel like a ship/station, not a random blob.

#### Airlocks, hull breaches, zero-G sections as gameplay elements

**Airlocks:**
- Function as high-stakes chokepoints (sealed doors that can be cycled)
- Tactical use: vent a section to space, trap enemies in cycling airlock
- Pacing: transitioning through an airlock creates tension
- Placement: at hull boundary, between pressurized and unpressurized sections, at docking ports
- Our generator: use airlock ConnectorKind between exterior-facing rooms and at section boundaries

**Hull breaches:**
- Create urgency (atmosphere leaking, time pressure)
- Open new routes (breach a wall to bypass a locked door)
- Environmental hazard (vacuum, radiation)
- Our generator: the `danger` parameter should influence breach probability; damaged/derelict subtypes should have breaches as alternate routes

**Zero-G sections:**
- Movement rules change (3D movement, no "floor")
- Cover works differently (enemies can approach from any direction)
- Specialized gear required (mag-boots, thrusters)
- Should be clearly demarcated on the map (section boundaries)
- Hard sci-fi ships without artificial gravity: the entire ship except spin habitat

#### Vertical layouts (multi-deck ships)

- **Inter-deck connections** should be limited and intentional: elevators, ladders, maintenance shafts, emergency access
- **Deck alignment**: critical systems (bridge, engineering) should be vertically aligned with their support systems
- **Tactical implication**: controlling the inter-deck access points controls the entire ship
- **Alien RPG guidance**: vent networks large enough for a human to enter in crouched position; critical for horror scenarios
- Our generator already supports `decks`, `verticality` parameters, and `isVertical` on connectors

#### Security systems, blast doors, sealed sections

- **Alien RPG color coding**: Red = high security, Orange = special security, Green = general access
- **Blast doors**: emergency bulkheads that seal sections during hull breach or fire; tactical barriers
- **Security zones**: concentric rings of increasing security (public docking -> crew areas -> command -> engineering)
- **Hackable doors**: doors as puzzle elements, not just transit points
- Our generator has `accessLevel` on rooms (0-3) — this should map to door security types

#### Environmental hazards (radiation, vacuum, fire)

| Hazard | Gameplay Effect | Where It Appears |
|--------|----------------|-----------------|
| **Vacuum/decompression** | Time limit; suit damage; movement penalty | Breached sections, exterior, damaged areas |
| **Radiation** | Cumulative damage; timer; avoid or shield | Near reactors, damaged shielding, solar exposure |
| **Fire** | Spreading hazard; blocks paths; consumes oxygen | Engine rooms, damaged systems, combat damage |
| **Toxic atmosphere** | Suit/filter required; visibility reduced | Mining outposts, alien environments, chemical labs |
| **Electrical** | Stun/damage on contact; affects electronics | Damaged wiring, water + electricity, EMP zones |
| **Gravity anomaly** | Movement changes; thrown objects; disorientation | Damaged gravity generators, zero-G transitions |

---

### 4. SPATIAL GAMEPLAY PATTERNS

These patterns describe the macro-level structure of a map or section. Our generator's spine architecture already implements several of these at the structural level, but we should be intentional about which patterns appear and when.

#### Pattern Catalog

**The Gauntlet (Linear Level)**
- Linear progression through a sequence of increasingly difficult encounters
- Each room/encounter must be passed before the next
- High authorial control over pacing and difficulty curve
- Risk: monotony if too long; backtracking is painful
- Sci-fi use: ship's main corridor from docking to bridge; evacuation route; boarding action
- When to generate: small ships (XS-SM), emergency scenarios, boarding actions

**The Hub (Hub-and-Spoke)**
- Central gathering area with multiple branches radiating outward
- Players choose which branch to explore; return to hub between excursions
- Hub must be interesting enough to revisit (upgrade station, NPC, safe zone)
- Risk: hub becomes tedious if it requires too many return trips without changes
- Sci-fi use: station central hub, ship's common area, outpost command center
- When to generate: stations (natural fit), medium ships with central commons

**The Loop (Loopback/Ring)**
- Circular route that returns to a starting area or connects forward to a previously visited area
- Enables flanking: enemies in one position can be approached from two directions
- Creates shortcuts: explore the long way, return the short way
- Prevents backtracking frustration
- Sci-fi use: ring stations, ship dual-spine loops, security patrol routes
- When to generate: controlled by `loopiness` parameter; more loops = more tactical options

**The Maze (Labyrinth)**
- Complex navigation challenge with many dead ends and confusing paths
- Player must map or memorize the space
- Risk: frustrating without good reason; most players dislike pure mazes
- Sci-fi use: maintenance deck, damaged/collapsed sections, alien architecture
- When to generate: sparingly; works for alien ruins or damaged derelict sections; keep small

**The Arena (Combat Bowl)**
- Large open space with central cover and multiple approach lanes
- Built for climactic combat encounters
- Central cover element allows circle-strafing/dancing around obstacles
- Multiple entrances enable tactical positioning before combat
- Sci-fi use: cargo bay, hangar deck, atrium, reactor chamber
- When to generate: when `setpieceBias` is high; for rooms tagged as combat encounters

**The Ambush (Trap Room)**
- Room designed for surprise encounters; limited escape routes visible at first
- May have hidden exits that become apparent under pressure
- Asymmetric information: enemies know the layout, players don't
- Sci-fi use: cargo holds with hidden compartments, dark engineering sections, airlocks
- When to generate: when `danger` is high; for rooms tagged as hostile territory

**The Nucleus**
- A protected critical area surrounded by multiple layers of defense
- Getting IN is the challenge; the center is the objective
- Concentric security rings, each requiring different methods to bypass
- Sci-fi use: bridge, vault, brig, reactor core
- When to generate: for `secure` access-level rooms; military subtypes

#### Mixing patterns in a single map

Real maps should combine multiple patterns. A good medium-to-large map might use:
1. **Hub** — central common area connecting major sections
2. **Gauntlet** — the path from docking to bridge (main spine)
3. **Loop** — engineering section has a loop for flanking
4. **Arena** — cargo bay serves as a large combat space
5. **Nucleus** — bridge/command is behind security layers

Our spine architecture naturally creates the backbone for these patterns:
- Single spine = Gauntlet
- Dual spine = Loop
- Hub-spoke = Hub
- Branching = Hub + Gauntlet branches

**Actionable rule**: After generating the spine, tag sections of the map with their dominant pattern. Use this to inform room shape selection and object placement.

---

### 5. ROOM DESIGN FOR GAMEPLAY

#### How room shape affects combat

| Shape | Tactical Properties | Best For |
|-------|-------------------|----------|
| **Rectangle (open)** | Simple; no natural cover; favors ranged | Basic rooms, corridors, docking bays |
| **Rectangle (with objects)** | Cover from furniture; positional play | Crew quarters, labs, medbays, mess halls |
| **L-shaped** | Breaks line of sight around the corner; two distinct zones | Security stations, storage with loading area, engineering |
| **T-shaped** | Three-way sightlines; defenders can retreat to the stem | Junction rooms, command with side alcoves |
| **U-shaped / Horseshoe** | Natural flanking; defenders in the center are exposed | Medical bays with beds along walls, barracks |
| **Irregular/multi-alcove** | Complex cover; many positions; rewards exploration | Alien spaces, damaged sections, cave-like outposts |
| **Circular/oval** | No corners for cover; 360-degree sightlines; open feel | Reactors, atriums, observation domes |

**Key insight for generation**: Rooms should not all be rectangles. Our generator should support at least: rectangles, L-shapes, T-shapes, and rectangles with internal wall stubs. Even simple modifications (adding a pillar column, an internal wall segment, or an alcove) dramatically improve tactical interest.

#### Multi-level rooms within a single deck

- Catwalks and mezzanines create elevation within a room
- Maintenance pits (below floor level) provide cover and alternate movement
- Observation galleries overlooking main spaces
- Split-level engineering with upper control room and lower machinery
- These should be room-level features, not requiring separate decks

#### Furniture and objects as cover/obstacles

**Sci-fi cover objects by room type:**
| Room Type | Cover Objects |
|-----------|--------------|
| Bridge/Command | Command console (half), captain's chair, holotable |
| Engineering | Reactor housing (total), pipe runs (half), tool cabinets |
| Medbay | Med beds (half), surgical equipment, privacy screens |
| Cargo bay | Cargo containers (total/half), loading equipment, cargo nets |
| Crew quarters | Bunks (half), lockers, tables |
| Lab/Science | Lab benches (half), specimen tanks, equipment racks |
| Armory | Weapon racks (half), armor stands, blast-proof cabinets |
| Corridor | Junction boxes (half), pipe runs, support pillars |

**Actionable rule**: Every combat-viable room should have at least 2-3 cover objects providing half cover and at least 1 providing three-quarter or total cover. Cover should not all be on one side of the room.

#### Doors as tactical elements

- **Standard door**: Opens normally; 1 tile wide; mild chokepoint
- **Double door / Wide door**: 2 tiles wide; allows two characters abreast; less of a chokepoint
- **Blast door / Bulkhead**: Thick; can be sealed; blocks an entire corridor; requires override to open
- **Airlock**: Double-door system; can be cycled; lethal if misused
- **Hackable door**: Requires skill check; creates puzzle element; time pressure if enemies approach
- **Breakable door**: Can be destroyed; allows brute-force entry; creates noise
- **One-way door**: Security doors that lock behind; commit to entry

Our `ConnectorKind` types (corridor, door, airlock, bulkhead, serviceHatch) map well to these. Consider adding metadata for door behavior (hackable, breakable, sealable).

#### Line-of-sight considerations

- In a grid system, line of sight is drawn from corner to corner of attacking/defending squares
- Walls, closed doors, and large objects block line of sight
- L-shaped rooms naturally break LOS around corners
- Long straight corridors provide extreme LOS (sniper lanes)
- T-intersections create "peek" opportunities
- **Actionable rule**: Avoid rooms that are both large AND completely open. Any room bigger than 6x6 squares should have internal elements that break LOS.

---

### 6. PACING AND FLOW

#### How to create tension through map design

1. **Narrowing spaces**: Moving from open areas into increasingly confined spaces builds claustrophobia and tension
2. **Decreasing light/safety**: Moving away from safe/lit areas into darkness or hazard zones
3. **Point of no return**: Airlocks, collapsed passages, or one-way doors that commit the party
4. **Resource depletion**: Maps where oxygen, power, or ammunition are limited by distance from safe zones
5. **Sound design through layout**: Rooms where you can hear enemies but not see them (around corners, through vents, on other decks)
6. **The Alien RPG principle**: If the map has only 12 zones, a creature that moves twice as fast as characters won't create a long chase. Larger maps = longer tension.

#### Exploration vs combat vs puzzle areas

The **5 Room Dungeon** framework provides an ideal pacing template:

| Room # | Purpose | Map Character | Sci-Fi Example |
|--------|---------|--------------|----------------|
| 1 | Entrance / Guardian | Chokepoint + first encounter space | Docking bay with security checkpoint |
| 2 | Puzzle / Roleplay | Non-combat challenge area | Locked blast door requiring hack; damaged console to repair |
| 3 | Setback / Red Herring | Surprising reversal | Power failure plunging section into darkness; hull breach |
| 4 | Climax / Boss | Large encounter space with tactical features | Bridge takeover; engine room showdown; cargo bay battle |
| 5 | Reward / Twist | Discovery/resolution area | Escape pod bay; hidden vault; revelation in captain's quarters |

**Pacing ratio**: Horror games use 3:1 tension-to-rest. Action games use roughly 1:1. Comedy/exploration uses more rest. Our `danger` parameter should influence this ratio.

**Session timing**: A 4-hour session typically fits 6-8 encounters of ~30 minutes each. A map with 15-25 rooms will take 2-3 sessions to fully explore. A 5-8 room map is one session.

#### Dead ends — when they're good vs bad

**Good dead ends:**
- Lead to rewards (loot, information, escape pods)
- Provide defensible positions (barricade and hold)
- Create tension (cornered, must fight back out)
- Have secondary escape (vent, maintenance hatch, breakable wall)

**Bad dead ends:**
- Lead to nothing (empty room, no content)
- Force long backtracking through empty corridors
- More than ~30% of rooms being dead ends feels frustrating

**Actionable rule**: Dead ends should always contain something of value OR have a hidden secondary exit (controlled by `secretness` parameter). Our `maxDeadEndRatio` parameter should default to ~0.25.

#### Secret passages and alternative routes

- **Ventilation ducts**: The classic sci-fi secret route; connects non-adjacent rooms; tight space (single-file)
- **Maintenance crawlways**: Behind wall panels; connect utility rooms
- **Damaged walls**: Breaches create unintended connections between rooms
- **Override hatches**: Emergency access between sealed sections
- **Sub-floor/ceiling space**: Maintenance access between decks

These correspond to our `serviceHatch` connector kind and `secretness` parameter.

#### How map size relates to session length

| Map Size | Room Count | Typical Session Length | Best For |
|----------|-----------|----------------------|----------|
| **Tiny** (XS) | 3-5 rooms | 1-2 hours | One-shot encounter, boarding action |
| **Small** (SM) | 6-10 rooms | 2-3 hours | Single session adventure |
| **Medium** (MD) | 11-20 rooms | 3-5 hours (1 session) | Standard session map |
| **Large** (LG) | 21-35 rooms | 6-10 hours (2-3 sessions) | Multi-session exploration |
| **Huge** (XL) | 35+ rooms | 10+ hours (3+ sessions) | Campaign-scale location |

---

### 7. GRID CONSIDERATIONS

#### Standard grid sizes

- **D&D/Pathfinder standard**: 1 square = 5 feet (1.5m); this is the universal TTRPG standard
- **Medium creature**: Occupies 1 square (5ft x 5ft); "controls" that space in combat
- **Large creature**: Occupies 2x2 squares (10ft x 10ft)
- **Huge creature**: Occupies 3x3 squares (15ft x 15ft)
- **Standard movement**: 30 feet/round = 6 squares
- Our `gridUnit` is already configurable; default to 5ft equivalent

#### Room size guidelines

Based on The Angry GM's analysis, encounter areas need specific minimum sizes:

| Encounter Size | Grid Squares | Real Dimensions | When To Use |
|----------------|-------------|----------------|-------------|
| **Small** | 64 (8x8) | 40ft x 40ft | 1-3 enemies, tight quarters |
| **Medium** | 100 (10x10) | 50ft x 50ft | 4-6 enemies, standard combat |
| **Large** | 144 (12x12) | 60ft x 60ft | 7-12 enemies, complex encounters |
| **Huge** | 196 (14x14) | 70ft x 70ft | Boss + minions, set pieces |
| **Practical maximum** | 225 (15x15) | 75ft x 75ft | Darkvision range limit (60ft) |

**Key insight**: NOT every room needs to be an encounter room. Non-combat rooms can be much smaller. But rooms tagged for potential combat should meet the minimum sizes above.

**Multi-room encounter areas**: 2-3 small connected rooms can form one encounter space equivalent to a large room. This is often MORE tactically interesting than one big room.

**Actionable room sizing for our generator:**

| Room Type | Min Grid Size | Typical Grid Size | Max Grid Size |
|-----------|-------------|-------------------|---------------|
| Closet/utility | 2x2 | 2x3 | 3x3 |
| Small room (quarters, head) | 3x3 | 3x4 | 4x5 |
| Medium room (lab, medbay) | 4x4 | 5x6 | 7x7 |
| Large room (mess, commons) | 5x5 | 6x8 | 8x10 |
| Huge room (cargo, hangar) | 8x8 | 10x12 | 14x14+ |

#### Corridor width for tactical movement

| Width | Grid Squares | Tactical Implication | Sci-Fi Context |
|-------|-------------|---------------------|----------------|
| **Narrow** | 1 square (5ft) | Single-file only; extreme chokepoint; frustrating for parties | Maintenance crawlway, vent, emergency passage |
| **Standard** | 2 squares (10ft) | Two abreast; the default; good balance | Standard ship/station corridor |
| **Wide** | 3 squares (10-15ft) | Three abreast; room to maneuver; less restrictive | Main spine, cargo corridor, promenade |
| **Extra wide** | 4+ squares (20ft+) | Essentially a room; can fight in the corridor itself | Docking bay approach, main concourse |

**The "10ft standard" rule**: The default corridor should be 2 squares (10ft) wide — enough for two characters side-by-side, creating natural "tank + support" positioning.

**Actionable rule**: Main spines should be 2-3 squares wide. Branch corridors should be 2 squares. Service corridors and vents should be 1 square. Our `widthClass` property on connectors (narrow/standard/wide) already supports this.

#### Scaling maps for different party sizes

| Party Size | Room Size Adjustment | Corridor Width | Notes |
|-----------|---------------------|---------------|-------|
| 2-3 players | Standard sizes work | 2 squares fine | Small party; tight spaces add tension |
| 4-5 players | Standard or +1 square each dimension | 2 squares | The "default" party; balanced |
| 6-8 players | +2 squares each dimension | 2-3 squares | Need more room to avoid bunching |
| 9+ players | +3-4 squares; use multi-room encounters | 3 squares minimum | Consider splitting the party |

**Monte Cook's Giant Rule**: "Pretend everything was built by giants, and rooms are all twice as big as they would be in reality." When in doubt, bigger is usually better for TTRPG maps.

---

## Decision

### What we adopt:

1. **Room shape variety** — Extend room generation beyond pure rectangles:
   - L-shapes for larger rooms (20-30% of medium+ rooms)
   - Internal wall stubs / partitions for large rooms
   - Alcoves on corridors and rooms
   - This breaks LOS and creates natural cover

2. **Cover object placement** — Every room flagged for potential combat should have:
   - 2-3 half-cover objects
   - 1 three-quarter or total-cover object
   - Cover distributed across the room (not clustered)
   - Object types selected from room-type-appropriate pools

3. **Encounter area sizing** — Enforce minimum sizes for combat-viable rooms:
   - Small encounter: minimum 8x8 grid
   - Standard encounter: minimum 10x10 grid
   - Set piece: minimum 12x12 grid
   - Non-combat rooms can be smaller (3x3 to 5x5)

4. **Dead end policy** — Dead ends must have purpose:
   - Always contain a point of interest (loot, terminal, escape pod)
   - Consider hidden secondary exit based on `secretness`
   - Enforce `maxDeadEndRatio` default of 0.25

5. **Pattern tagging** — Tag map sections with their dominant spatial pattern:
   - Main spine segments → Gauntlet
   - Hub rooms → Hub
   - Loop sections → Loop
   - Large open rooms → Arena
   - Secure areas → Nucleus
   - Use pattern tags to inform furnishing and encounter placement

6. **Door type variety** — Expand door generation based on context:
   - Zone boundaries → bulkhead
   - Hull-adjacent → airlock
   - High security rooms → reinforced/hackable
   - Standard rooms → standard door
   - Service routes → serviceHatch

7. **Environmental hazard zones** — Use `danger` parameter to place hazards:
   - Mark sections as hazardous post-generation
   - Hazard types determined by room type and location
   - Hazards should create alternate route incentives

8. **Pacing structure** — Apply 5-Room-Dungeon pacing to the main path:
   - First significant room: entry challenge
   - Mid-path: puzzle/non-combat challenge
   - Deep rooms: escalating difficulty
   - Final objective room: climactic encounter space (largest room, most cover)

9. **Corridor width variation** — Already supported by `widthClass`:
   - Spines: wide (3 tiles)
   - Standard branches: standard (2 tiles)
   - Service/secret routes: narrow (1 tile)

10. **Jaquays-style nonlinearity** — Ensure maps have:
    - Multiple paths between key locations (already via `loopiness`)
    - At least one secret/alternative route (via `secretness`)
    - No more than 3-4 rooms in a purely linear sequence
    - Asymmetric layouts (avoid pure symmetry unless station ring)

### What we reject:

1. **Pure maze generation** — Mazes frustrate TTRPG players and waste session time. We use structured patterns, not random maze algorithms.

2. **Room-first random placement** — Placing rooms randomly then connecting with corridors produces "spaghetti." Our spine-first approach is correct.

3. **Every room as combat room** — Most rooms should be smaller, non-combat spaces that create pacing rhythm. Only tagged encounter rooms need the 8x8+ minimum.

4. **Identical corridor widths** — All-same-width corridors lose spatial hierarchy. Width should communicate importance.

5. **Literal real-world scale** — TTRPG rooms should be 1.5-2x real-world size for gameplay. A real ship corridor is 3-4 feet; TTRPG needs 10 feet minimum.

### Why:
- The research consistently shows that **meaningful spatial decisions** are what make TTRPG maps interesting, not complexity for its own sake
- Cover, chokepoints, and room shape are the three most impactful factors
- Sci-fi maps must feel **engineered and purposeful**, unlike the organic randomness acceptable in fantasy dungeons
- Nonlinearity (Jaquaysing) is the single most important structural quality for exploration-based play
- Pacing through map design (alternating tension and relief) is more effective than pacing through encounter difficulty alone

## Proposed changes

### Docs/specs to update:
- `docs/generator/` room sizing specs — add minimum encounter sizes
- Room type catalog — add cover object pools per room type
- Layout geometry specs — add room shape variants (L, T, alcoves)
- Corridor specs — confirm width hierarchy (narrow/standard/wide)
- Output JSON contract — consider adding `spatialPattern` tag to rooms/sections

### Code areas affected:
- `roomConfigs.ts` — Add cover object templates, room shape variants, min combat sizes
- `objectPlacer.ts` — Implement cover placement rules (2-3 half, 1 full per combat room)
- `layout.ts` — Support L-shaped and non-rectangular room placement
- `topology.ts` — Tag backbone sections with spatial pattern labels
- `features.ts` — Expand hazard system with location-aware hazard types
- `generator.ts` — Post-generation pass for dead-end validation and pacing check
- `quality/` — Add validation rules for encounter sizing and cover density

### Tests/acceptance impacts:
- Validate that combat-tagged rooms meet minimum size thresholds
- Validate that dead ends contain points of interest
- Validate that maps have minimum path alternatives between key rooms
- Visual regression tests for new room shapes
- Cover density checks on generated maps

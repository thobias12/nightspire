# Nightspire feature roadmap

This roadmap is the working product-direction document for the current Nightspire prototype. It complements the milestone log: milestones describe what has shipped; this document describes what the game is growing toward.

![Nightspire UI and feature direction](images/nightspire-ui-concept-v1.jpg)

## North star

Nightspire should feel like a grounded medieval settlement that grows organically around roads, households, workplaces and services. The player should be able to read most of the settlement by looking at the world, then open illustrated contextual UI only when they need detail.

The current UI concept establishes the target hierarchy:

- thin top strip for settlement identity, essential resources, population, approval and time
- contextual left-side panel for the selected building, citizen, field or other world object
- lightweight right-side tasks/messages/event panel
- centered illustrated construction catalog with clear categories
- compact bottom command row for major modes
- minimap / regional readability without covering the world
- original medieval illustrated art, parchment/card materials and restrained ornament rather than dense generic game panels

The concept is a direction reference. Final Nightspire artwork should be original and use its own heraldry, buildings, characters and icon language.

## Playable foundation — already implemented

### Settlement planning
- point-drawn curved roads with independent grid, angle and road-join snapping
- road-fronted conventional building placement
- road-fronted residential plots
- irregular point-drawn crop fields
- Farmhouse service radius and field ownership
- persistent planning/blueprint overlays
- construction, cancellation and demolition

### Population and households
- settlers, professions and workplace assignment
- houses, beds and household assignment
- Food / Housing / Safety / Recreation needs
- Happiness and productivity consequences
- household Market/recreation coverage
- prosperity levels
- immigration/attraction from settlement conditions

### Economy and logistics
- physical resource gathering and hauling
- Stockpile filters, priorities and reservations
- Market food distribution
- Brewery: Food → Ale
- Tavern Ale service
- Blacksmith: Ore → Tools
- durable Tool productivity bonus
- Trading Post, merchants, import/export policies and Gold
- agriculture sow/grow/harvest/hauling loop

### Defense and survival
- Guard Posts and guard assignment
- wooden Walls and Gates
- nightly raids
- structure damage and repair
- player combat
- day / dusk / night / dawn phases

### Technical foundation
- deterministic fixed-step simulation
- save/load, backup and JSON import/export
- benchmark harness and scale instrumentation
- shared navigation queue and reservation optimizations
- procedural/instanced rendering foundation
- current organic terrain-integrated road visuals

## Phase A — complete the UI / presentation language

This is the immediate direction of PR #41.

- preserve the current compact top bar + contextual panel + bottom construction layout
- create original medieval illustrated resource icons
- create original illustrated construction cards for every current building/tool
- create settlement crest / heraldry
- create worker portraits and empty-worker silhouettes
- create contextual building header art
- add clean production/storage/workforce/logistics tabs where relevant
- add Tasks & Messages / notification feed
- add readable warning states without permanent clutter
- add minimap / map-mode foundation
- polish tooltips, hover cost previews and unavailable/locked cards
- keep DEV/QA controls hidden from normal play
- retain hotkeys and all existing placement functions

The reserved implementation hooks are documented in [UI_ART_SLOTS.md](UI_ART_SLOTS.md).

## Phase B — deepen the medieval economy

Candidate additions, ordered by how naturally they extend current systems:

### Food and storage
- Granary as dedicated Food storage/logistics
- Bakery as a processed-food production chain
- more crop types and field choices after the wheat/food loop is stable
- orchard / pasture-style rural land uses
- seasonal yield/storage pressure when seasons are introduced

### Raw materials
- Quarry / stone deposits
- Mine / deeper Ore extraction
- Firewood / fuel as a future logistics pressure if it improves gameplay rather than bookkeeping
- construction-resource differentiation for later building tiers

### Trade
- more merchant goods and regional price pressure
- trade-route presentation and caravan readability
- settlement specialization / surplus identity
- richer Gold sinks tied to progression rather than passive accumulation

## Phase C — civic, faith and settlement progression

- Well / water-service coverage
- Chapel / faith-service coverage
- Manor / administrative center
- policies, taxes or settlement edicts only after their consequences are readable in-world
- prestige / settlement level progression
- building upgrades and stronger household tiers
- civic plazas, monuments and decoration systems where they support desirability/prestige

## Phase D — services and mature-city identity

- Bathhouse / Hygiene / Recreation / Luxury service chain
- deeper Tavern/nightlife upgrades
- adult pleasure/courtesan-house service economy with clearly adult staff and patrons
- prestige/luxury district identity
- richer evening activity and service scheduling
- romance / companionship hooks where they reinforce households and city simulation

The mature layer should stay integrated into the economy and settlement simulation rather than becoming a disconnected side mode.

## Phase E — defense and dark-fantasy escalation

- Watchtower
- Barracks
- stronger/stone fortification tiers
- gate control and more readable defensive coverage
- more raider/enemy archetypes
- siege pressure only after normal combat/navigation scales cleanly
- stronger nighttime atmosphere and warning systems
- more reasons to shape roads, districts and walls defensively

## Phase F — population scale and character depth

- reduce navigation queue latency under synchronized crowds
- spatial indexing / AI update tiers / LOD only where profiling proves they are needed
- larger normal population cap in measured steps
- longer combat/construction/topology soak tests
- richer citizen visual variation
- improved player/featured-character models and animation
- equipment and visual progression when the core settlement loop is stable

## Feature-category target for the construction UI

The final build catalog should be able to grow into these broad categories without needing another structural redesign:

| Category | Current | Planned examples |
| --- | --- | --- |
| Planning / Residential | Road, Residential Plot | district/zone tools, decorations |
| Food & Farming | Farmhouse, Field | Granary, Bakery, Orchard, Pasture |
| Industry / Resources | Brewery, Blacksmith, Stockpile | Quarry, Mine, fuel/resource chains |
| Trade / Services | Market, Trading Post, Tavern, Campfire | Bathhouse, luxury/nightlife services |
| Defense | Guard Post, Wood Wall, Wood Gate | Watchtower, Barracks, stronger walls |
| Civic / Faith | — | Well, Chapel, Manor, policies/prestige |

## Art direction contract

Astra/art generation should use the concept composition as a **layout and density reference**, not copy another game's artwork. Nightspire's final art should be:

- medieval manuscript / illustrated codex influenced
- warm parchment, ink-line and painted-gouache card art
- readable silhouettes at small UI sizes
- grounded European medieval architecture with dark-fantasy accents
- restrained heraldic ornament around important frames
- visually quieter than the world, so the UI frames information instead of covering the settlement
- consistent across building cards, resource icons, portraits, notifications and contextual panels

No labels, numbers or gameplay text should be baked into generated art assets.

## Implementation order

1. Finish visual acceptance of the new UI shell.
2. Generate the complete icon/card/portrait asset set against the documented slots.
3. Wire Tasks & Messages plus minimap without increasing persistent clutter.
4. Finish contextual building-panel patterns for housing, workplaces, storage, trade, agriculture and defense.
5. Resume economy/civic expansion one chain at a time, keeping each new system physically simulated and readable in the world.
6. Re-profile population/navigation before raising normal gameplay population limits.
7. Expand defense and mature-city systems after the daytime economy remains stable at the new scale.

# Nightspire direction pivot — grounded medieval dark fantasy

## Product thesis

Nightspire should no longer aim to read as a generic low-poly colony sandbox.

The target is a **grounded medieval settlement simulator with dark-fantasy danger and an adult sensual identity**:

- believable medieval town growth by day
- rich local production and household life
- cinematic dusk/night atmosphere
- direct defense of the settlement after dark
- clearly adult sensual social spaces, characters and nightlife
- enough simulation depth that layout, roads, storage, services and production visibly shape the town

The benchmark is not to copy Manor Lords' assets, UI, maps or exact mechanics. The useful reference qualities are its human scale, organic settlement shape, material believability, terrain-led planning, production readability and lived-in presentation. Nightspire must remain recognizably its own game through the night-defense loop, dark-fantasy threat, stronger character presence and mature city layer.

## Design pillars

### 1. Grounded medieval material culture

Every settlement object should look built, used, repaired and weathered rather than spawned as a clean game token.

Visual vocabulary:

- timber frames with uneven spacing
- wattle/plaster/rough stone instead of flat single-color walls
- steep shingles, thatch and patched roofing
- visible foundations, braces, lintels, shutters and doors
- smoke-blackened chimneys and forge walls
- mud, wheel ruts, trampled grass and chopped vegetation
- sacks, baskets, barrels, carts, firewood, tools, drying racks, benches and fences
- yards that explain what a building does before the player opens the inspector

Avoid perfect symmetry except for deliberate civic or military architecture.

### 2. Organic settlement growth

The long-term town should grow from movement and land shape rather than look like a board game.

Direction:

- roads are first-class settlement structure
- plots/buildings align to roads and terrain instead of a visible global grid
- housing grows into irregular frontage and rear-yard space
- production clusters emerge around access to resources, storage and transport
- civic/social buildings create recognizable centers
- paths become more worn as traffic increases
- expansion follows geography, safety and access rather than empty rectangular space

The existing grid remains acceptable as an implementation substrate until the post-M4 settlement-layout work. It should progressively disappear from the player's visual experience.

### 3. Human-scale economy

Production should increasingly be understandable by watching the town.

The player should be able to see:

- a worker leave a household
- walk a road
- collect or deliver physical goods
- operate a visible work area
- create output
- move that output into local or central storage
- return to food, recreation or home

Future systems should prefer household, workplace and local-storage relationships over abstract global bonuses.

### 4. Dark-fantasy night identity

Day should feel desirable enough that the player cares when night threatens it.

**Day**
- warm sun
- green/brown natural palette
- busy roads and yards
- smoke and production
- market/social activity
- readable clothing and occupations

**Dusk**
- lanterns and fires become visible
- civilians transition toward social/safe spaces
- silhouettes and fog deepen
- settlement warmth becomes visually concentrated

**Night**
- cold blue moon/fog outside town
- warm windows, fires and occupied venues inside town
- hostile silhouettes emerge from darkness
- defensive lines remain readable
- magic/occult color should be rare and therefore striking

### 5. Adult sensual identity

Nightspire's mature theme should be integrated into the city rather than bolted on as explicit content.

All sexualized or romance-oriented characters are **clearly adults**.

The tone is sensual dark fantasy:

- attractive adult silhouettes and faces
- fitted, elegant or revealing fantasy clothing where appropriate to role and venue
- tavern entertainers, dancers and musicians
- bathhouse attendants and patrons
- courtesans / pleasure-house staff as adult social professions
- nobles, occult figures and elite characters with decadent costume design
- warm nightlife, fabrics, candles, perfume/incense, music and social animation
- romance, attraction, luxury, vice and reputation as possible simulation hooks

Ordinary laborers do not need to be sexualized constantly. Contrast makes the mature venues more distinctive.

The initial mature layer should be suggestive rather than explicit. The important design goal is that an adult player can immediately tell this is a more sensual and decadent fantasy society than a conventional historical city builder.

## Art direction

### Architecture

Core buildings should be redesigned around recognizable medieval functions.

**House**
- timber/plaster body
- irregular roof
- chimney
- shutters
- small fenced rear yard
- firewood / laundry / domestic props
- optional rear extensions later

**Stockpile / storehouse**
- open-sided timber shelter
- visible stacks by resource type
- carts and loading area
- covered high-value goods

**Tavern**
- broad frontage toward road
- hanging sign
- multiple warm windows
- benches/tables
- barrels and delivery yard
- stronger evening activity

**Brewery**
- vats/barrels
- chimney/steam
- loading space
- visible input/output storage

**Blacksmith**
- dark timber/stone
- open forge frontage
- chimney
- anvil/workbench
- ore pile
- tool rack
- sparks, smoke and orange forge light while active

**Guard Post**
- raised observation structure
- weapon racks
- brazier
- practical defensive silhouette

**Walls / gates**
- rough palisade construction
- stakes, braces and walkable-looking structure
- gates should read as mechanically functional rather than as thicker wall blocks

### Terrain

Terrain is a major visual priority.

Target layers:

- base grass with hue/height variation
- bare soil around active buildings
- procedural dirt paths
- muddy road sections after heavy use
- trampled edges around markets/services
- forest floor under dense trees
- small rocks, stumps and dead branches
- shallow drainage/ditch language later
- elevation and slope awareness after the current flat-map prototype

The grid helper should eventually be hidden outside explicit construction/debug mode.

### Foliage

Move away from evenly spaced repeated cones.

Use:

- clustered tree groups with gaps
- varied trunk/crown scale
- undergrowth near forest edges
- bushes/flowers in clearings
- dead trees/stumps
- denser forest interior
- visible transition from settlement-cleared ground to wilderness

### Characters

Near-term characters can remain cheap, but the target is much less abstract.

Required silhouette classes:

- laborer
- guard
- brewer/smith/artisan
- tavern staff/entertainer
- noble/elite
- adult bathhouse/pleasure-house roles later

Character quality should scale with camera distance:

- cheap distant population representation
- stronger clothing/body silhouettes at settlement camera distance
- higher-quality player/hero/featured adults in close camera

Do not require every background citizen to use hero-quality rigs or materials.

## Camera and presentation

The settlement camera should sell scale and material detail rather than expose the map as a board.

Direction:

- lower default pitch
- closer useful zoom range
- slower, weightier camera movement
- cinematic low-angle inspection option
- depth through fog, shadow, foreground foliage and roof silhouettes
- build mode may pull higher for clarity
- follow/player mode remains appropriate for direct combat

The visual vertical slice should be judged from screenshots at:
- settlement overview
- medium street-level oblique angle
- close building inspection
- dusk
- night

## UI direction

The current HUD is functional developer UI and should gradually separate into player UI and QA/debug UI.

Player-facing style:

- dark wood / iron / aged parchment influence without skeuomorphic clutter
- restrained brass/gold accents
- clear resource iconography
- compact building/status cards
- contextual alerts instead of constant raw metrics
- production chains readable visually

QA/performance counters stay available behind the existing debug panel.

## Audio direction

Audio should reinforce the lived-in settlement:

- wind/forest bed outside town
- footsteps and cart/road texture
- chopping/sawing/construction
- Blacksmith hammer/forge
- Brewery bubbling/wooden handling
- Tavern voices/music
- Campfire
- distant animals/birds by day
- reduced civilian bed plus wind/fog/threat cues at night
- adult venues get tasteful music, chatter and ambience rather than explicit audio as the first implementation

## Gameplay evolution

### Roads before perfect gridless placement

The first gameplay step toward organic towns should be **roads that matter**:

- draw roads freely or in smooth segments
- buildings prefer road frontage
- movement is faster / visually concentrated on roads
- dirt wear appears from traffic
- logistics buildings value road access

A fully gridless simulation does not need to be the first implementation.

### Housing plots and households

After scale architecture is stable:

- housing is placed as a plot/lot rather than only a fixed house mesh
- frontage follows roads
- lot depth creates rear-yard space
- households own residents
- rear extensions support gardens/chickens/goats/crafts later
- needs are increasingly household-aware

This should create the organic visual rhythm that isolated fixed-footprint houses cannot.

### Local logistics

After Astra's M4 work is integrated:

- nearest suitable storage matters
- workplace input/output buffers matter
- hauling distance becomes legible
- road access matters
- reservations avoid duplicate long-distance hauling
- markets/services draw from local supply rather than magical global access

### Social centers

The settlement should develop recognizable social geography:

- Tavern as early social hub
- market square later
- Bathhouse as comfort/luxury social hub
- pleasure/courtesan venue as adult nightlife hub
- manor/noble district as prestige hub
- defensive center around gate/guard infrastructure

## Mature-city gameplay roadmap

### Tavern nightlife expansion

Near-term, low simulation risk:

- adult entertainers/musicians as ambient roles
- fuller evening occupancy
- exterior tables/benches
- richer warm lighting and signage
- Recreation and settlement-attraction benefits remain systemic

### Bathhouse

First new mature service building after the core visual pivot:

- clearly adult patrons/staff
- Recreation + future Hygiene
- water/fuel operating inputs later
- attractive warm interior/exterior presentation
- luxury/prestige upgrade path
- visual privacy choices: screens, steam, robes/towels, fantasy styling

### Courtesan / pleasure house

Later, after service-economy architecture is mature:

- clearly adult staff/patrons
- Recreation / Luxury / Attraction / Prestige interactions
- operating cost and staffing
- evening/night opening hours
- district desirability and reputation
- tasteful sensual presentation first; explicit scene systems are not required for the city-builder loop

### Character attraction layer

Potential later system, not immediate scope:

- adult characters can have appearance/style/charisma traits
- venue staffing can affect attractiveness/prestige
- clothing quality and luxury economy become visible
- romance/companionship can interact with household happiness

This must remain additive to the settlement simulation rather than replacing it.

## Milestone sequence

### M3.8 — Grounded World Vertical Slice — safe while M4 is in progress

**Goal:** prove the new visual identity on the current simulation without touching M4 hot paths.

Scope:
- remove visible prototype/grid feel from normal play
- redesign House, Tavern, Blacksmith, Stockpile and Guard Post silhouettes
- denser material layers: plaster/timber/stone/thatch/shingles
- building yards and function-specific clutter
- improved terrain variation and settlement wear
- more natural forest-edge composition
- road/path visual prototype that is presentation-only
- lower/cinematic camera presets
- player HUD visual hierarchy cleanup
- first attractive adult civilian/entertainer silhouette variants
- Tavern nightlife ambience
- maintain batched/instanced performance principles

**Do not touch:** job scheduling, navigation behavior, population scaling, reservation policy.

**Exit screenshots:** one small settlement must look intentionally authored from overview, street-oblique, dusk and night views.

### M3.8A — Core building art kit

Build a reusable procedural/modular kit:

- timber beams
- plaster wall panels
- stone bases
- roof pieces
- doors/shutters/windows
- chimneys
- awnings
- fences
- barrels/crates/sacks
- carts/tool racks/firewood
- signs/banners

The renderer should compose these rather than hand-authoring every building from unrelated primitive boxes.

### M3.8B — Terrain, roads and clutter

Presentation-first:

- hide global grid outside build/debug mode
- render dirt paths/roads with soft edges
- deterministic building-yard wear
- forest floor and clearing transitions
- denser prop clusters near workplaces
- road-side fences and drainage language

### M3.8C — Adult character/tavern identity prototype

No explicit scenes required.

- clearly adult male/female body silhouettes
- role-aware clothing silhouettes
- attractive tavern staff/entertainer variants
- evening occupancy/activity around Tavern
- tasteful dance/music/social idle presentation
- maintain cheap background rendering path

### M3.9 — Organic Settlement Structure — after M4 integration

M3.8.1 has already pulled forward persisted road drawing, road-front plot drawing and the modular plot/House visual foundation. M3.9 makes that planning data simulation-bearing.

Gameplay-bearing changes:

- road-influenced movement/cost
- road frontage requirements/preferences for non-residential buildings
- household ownership for existing residential plots
- household grouping
- rear-yard extensions
- organic building alignment
- traffic-generated path wear
- first local logistics/storage rules

This is expected to touch Navigation/Jobs and should wait for the M4 architecture to land.

### M3.10 — Medieval Economy Depth

- expanded workplace chains
- local input/output storage
- markets/trade
- additional raw materials
- household-side production
- meaningful transport distance
- specialization/upgrades
- richer seasonal/land-use hooks only if they fit performance targets

### M5 — Mature Nightspire City

The mature city layer becomes a first-class identity rather than a footnote:

- Bathhouse
- Tavern nightlife upgrades
- pleasure/courtesan house
- luxury and prestige
- richer adult characters and clothing
- romance/companionship hooks
- noble/decadent district identity
- occult/dark-fantasy social content
- higher-quality player/hero characters

## Immediate execution slice

The initial Town Center visual target established the material/camera direction. **M3.8.1 — Roads & Residential Plot Foundation** now replaces automatic presentation roads and fixed House placement with player-authored persisted roads plus road-front modular lots, while deferring movement/logistics semantics until M4 integration.

Use the current simulation and build one screenshot-quality settlement cluster containing:

- 2–3 Houses
- Tavern
- Blacksmith
- Stockpile
- Campfire
- Guard Post
- one wall/gate edge
- forest edge
- dirt-road visual linking the cluster
- yards/clutter around every functional building
- 6–10 visible adults with at least two stronger character silhouettes
- active Blacksmith
- occupied Tavern at dusk

Deliver the same cluster at:
1. late afternoon
2. dusk
3. night
4. lower street-oblique camera

Acceptance criteria:
- no building reads as a colored primitive from the normal settlement camera
- road/path and yards visually organize the settlement
- player can identify House/Tavern/Blacksmith/Stockpile/Guard Post without HUD labels
- settlement and wilderness have clearly different surface treatment
- Tavern reads as social/nightlife space
- Blacksmith reads as heavy craft/forge space
- adult character silhouettes are recognizably human and attractive at medium distance without requiring hero-level geometry
- existing gameplay behavior and M4-sensitive systems remain unchanged

## Anti-goals

- do not clone Manor Lords buildings, UI, maps, icons or exact layouts
- do not chase photorealism at the cost of population/render scalability
- do not add hundreds of unique scene objects when instancing/composition can provide the same read
- do not turn every civilian into a hero character
- do not make mature content the only source of progression
- do not make ordinary town life constantly sexualized; mature venues should have contrast
- do not start the gridless/road-navigation rewrite until the M4 branch is understood and integrated
- do not add broad new simulation systems until the visual target is proven in screenshots

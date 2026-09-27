# Milestones

## M0 — Foundation (complete)

- [x] Vite + TypeScript + Three.js boots
- [x] Strict typecheck/build
- [x] Minimal renderer ownership
- [x] Renderer-independent world-state placeholder
- [x] Basic day/night lighting visualization
- [x] Example instanced world content
- [x] Agent/project documentation

## M1 — Settlement loop (implemented; ready for review)

- [x] player controller and camera modes
- [x] resource inventory/stockpile model
- [x] harvestable trees/food nodes
- [x] settler entity store
- [x] task/job queue
- [x] wood gathering end-to-end
- [x] food gathering end-to-end
- [x] building placement ghost
- [x] construction work delivered by settlers
- [x] houses provide housing
- [x] save/load foundation
- [x] QA panel with time/resource/spawn controls

**Exit verified for this pass:** Ten-settler automated and browser playthroughs gathered both resources, physically delivered 70 wood, completed three houses and a stockpile, housed all ten settlers, and resumed after save/load. See [QA.md](QA.md) for evidence and limitations.

## M1.1 — Review hardening (complete)

- [x] safe blueprint cancellation with reservation/in-transit/delivered material conservation
- [x] cancellation refusal when storage cannot accept refunds
- [x] player-controlled wood/food stock targets
- [x] blocked-route retry cooldown and topology-change recovery
- [x] friendly settler display numbers independent from internal IDs
- [x] rotating backup save slot
- [x] validated JSON save export/import
- [x] migration of earlier M1 version-1 saves to default stock targets
- [x] long-run conservation regression test
- [x] GitHub CI for install, typecheck, tests and production build

**Exit:** 15 regression tests pass; GitHub CI passes typecheck, tests and production build. M2 remains untouched.

## M2 — First night

- [x] dusk behavior transition
- [x] guard role/post
- [x] simple enemy entity store
- [x] raid spawn/director
- [x] basic enemy navigation toward settlement
- [x] basic NPC combat
- [x] player melee combat
- [x] wooden walls and gate
- [x] structure health/damage
- [x] morning cleanup and repairs

**M2.0 verified:** deterministic Dawn/Day/Dusk/Night phases, daylight-only job assignment, cargo-safe dusk shutdown, civilian sheltering, guard roles and buildable Guard Posts. 20 tests pass and CI builds successfully.

**M2.1 verified:** persisted Raider entities, one deterministic 12-raider wave per day, shared bounded navigation toward the settlement, dawn retreat, active-raid save/load, old-save migration, inspection/debug rendering. 26 tests pass and CI builds successfully.

**M2.2 verified:** player melee, guard interception, raider counterattacks, persisted combat health/cooldowns, defender downing/recovery, raider death and raid-clear tracking. 32 tests pass and CI builds successfully.

**M2.3 verified:** Wooden Walls/Gates, asymmetric gate navigation, structure HP/hit state, raider structure targeting, destructible fortification breaches, critical core-building damage, and timber-consuming daylight repair jobs. 39 tests pass and CI builds successfully.

**M2.4 verified:** deterministic raid pressure now starts at 20 attackers, grows by four per wave, and caps at 40. A dedicated 40-raider regression keeps all hostile routing inside the shared two-paths-per-tick budget.

**Full M2 technical exit:** implemented at the intended 20–40 attacker scale. Live user balance feedback can still tune HP/damage/pacing, but the next major systems milestone is M3.

## M3 — Needs and production

- [x] food/housing/safety/recreation foundation
- [x] blacksmith production
- [x] tavern service
- [x] Brewery → Ale → Tavern production chain
- [x] population attraction/immigration
- [x] happiness consequences
- [ ] better logistics/resource reservations
- [x] building/construction UX pass
- [x] settlement visual/atmosphere readability pass

**M3.0 verified:** food consumption, bed-backed Housing, defense-backed Safety, capacity-limited Campfire Recreation, persisted per-settler needs and derived Happiness.

**M3.1 verified:** reusable service-provider definitions, stable slot assignment, supplied Tavern operation, physical daytime pantry hauling, stronger Tavern recreation, dry-Tavern fallback to Campfires, save migration and conservation accounting.

**M3.2 verified:** Ale as a third resource, generic production progress, Brewery Food input/Ale output, stockpile-staged Ale logistics, Tavern Ale consumption and conservation accounting.

**M3.3 verified:** deterministic attraction from spare housing, stored Food, Happiness, Safety and raid outcomes; two-Day qualification; physical edge-entry immigrants; arriving-settler job exclusion; QA visibility; and current-state save/load coverage.

**M3.4 verified:** categorized build mode, 1–8 hotkeys, persisted R rotation, Shift-repeat placement, atomic straight wall dragging, direct wall→gate conversion, footprint-aware selection, safe 50% demolition refunds, and clearer placement feedback.

**M3.5 verified:** building silhouettes, construction-stage readability, damage/ruin presentation, terrain variation, occupied settlement glow, moonlight/fog, Campfire activity and Brewery production smoke remain renderer-owned and batched.

**M3.6 verified:** the four existing needs affect actual labor without new persisted state. Happiness bands provide +15% / baseline / -10% / -25% / -40% hands-on work rates, while Happiness below 20% or Food below 15% restricts settlers to Food gathering and emergency repairs. Walking speed, combat, production buildings, pathfinding and the population cap remain unchanged.

**M3.7 verified:** finite Iron Ore deposits, a 45-wood Blacksmith, physical Ore → Blacksmith → Tools → Stockpile logistics, and durable Tool coverage are live-tested. The Blacksmith converts 3 Ore into 1 Tool every 18 Day seconds, holds 18 Ore/6 Tools locally, and one stockpiled Tool covers two settlers. Full coverage adds +10% to hands-on work without consuming Tools.

**Exit:** settlement layout and production meaningfully affect growth and survival.

## M3.8 — Grounded world vertical slice

Safe to execute while M4 is in progress because it is presentation-first and must avoid Navigation/Jobs/simulation-scale changes.

- [x] reusable grounded medieval building art kit
- [x] House / Tavern / Blacksmith / Stockpile / Guard Post redesign
- [x] terrain/yard wear and forest-edge composition
- [x] presentation-only dirt road/path prototype
- [x] lower cinematic settlement camera preset
- [x] player-facing HUD hierarchy/style cleanup
- [x] first clearly adult attractive civilian / Tavern entertainer silhouettes
- [x] Tavern nightlife ambience/activity pass
- [ ] screenshot-quality Town Center target at afternoon, dusk, night and street-oblique camera (implementation staged; awaiting live visual acceptance)

**Exit:** the current simulation produces a settlement that reads as an authored, lived-in medieval dark-fantasy town rather than a primitive graybox, without changing M4-sensitive behavior.

## M3.8.1 — Roads & residential plot foundation

Pulled forward from M3.9 because the placement/data layer can remain isolated from M4-sensitive navigation and scheduling.

- [x] player-drawn persisted road strokes
- [x] remove automatic building-to-building road generation
- [x] road-front Residential Plot drag tool
- [x] persisted plot frontage, depth, side, road ownership and backyard identity
- [x] normal House blueprint remains the simulation/construction owner underneath each plot
- [x] modular house width/details align visually to arbitrary road angle
- [x] fenced backyard with deterministic Garden / Chickens / Workyard / Firewood variants
- [x] plot overlap, building overlap, resource overlap and boundary validation
- [x] plot cleanup when its House blueprint is cancelled or completed House is demolished
- [x] current save/load migration and round-trip coverage
- [ ] road movement/path-cost effect — deferred until M4 integration
- [ ] household ownership/backyard production — deferred until M3.9+

**Exit:** players determine the visible settlement skeleton by drawing roads and sizing residential lots; housing continues to use the proven House simulation while the new planning data is ready for later road/logistics/household semantics.

## M3.8.2 — Placement & snapping

Usability layer on top of the M3.8.1 town-planning foundation.

- [x] Grid Snap defaults ON
- [x] Grid Snap constrains road drags to clean 0°/45°/90° segments
- [x] road starts/ends magnetically join nearby persisted roads
- [x] Grid Snap rounds Residential Plot width/depth to 1m increments
- [x] Grid Snap toggle exposes the existing freeform road/plot behavior
- [x] Road Snap defaults ON for conventional non-fortification buildings
- [x] nearby-road magnetic building center placement
- [x] road-facing visual angle persists for snapped buildings, including diagonal roads
- [x] Road Snap toggle restores manual grid + R rotation placement
- [x] Walls/Gates/Campfire remain explicit manual/grid placement
- [x] placement grid is visible while Grid Snap is active for roads/plots
- [ ] live alignment/snap feel acceptance

**Exit:** straight neighborhoods are quick to lay out without sacrificing freeform village roads, and service/production buildings can be placed cleanly against streets without pixel-perfect manual rotation.

## M3.8.3 — Road junctions & plot rows

Polish pass on the player-authored street/lot workflow.

- [x] road endpoints prefer exact existing endpoints before centerline joins
- [x] branch attachment inserts a persisted junction control point into the host road
- [x] remove the large circular road-cap treatment that produced dark blobs
- [x] use lighter rectangular junction blending only where multiple persisted roads share a node
- [x] extend road strips through bends so aligned corners remain visually continuous
- [x] Residential Plot ghost shows metre frontage tick marks
- [x] Grid Snap magnetically shares neighboring Residential Plot frontage endpoints
- [x] adjacent lot placement remains non-overlapping at shared boundaries
- [x] shorter/incomplete side fences keep road frontage visually open
- [x] tighter Road Snap setback for conventional service/production buildings
- [x] stronger façade/front-edge marker during building placement
- [ ] live junction/row visual acceptance

**Exit:** intersections no longer read as dark circles, road branches are topologically explicit in persisted planning data, and repeated residential lots can be laid out as clean aligned rows without pixel-perfect frontage placement.

## M3.8.4 — Grounded roads & plot edges

Renderer-only cleanup after live M3.8.3 screenshots exposed remaining decal/fence artifacts.

- [x] opaque dirt-road core so overlapping/crossing roads do not accumulate darkness
- [x] low-opacity wider road shoulders for softer grass-to-dirt transition
- [x] narrow deterministic wheel ruts instead of full-width translucent overlays
- [x] remove explicit road-junction patch geometry; identical opaque road strips blend by overlap
- [x] sparse deterministic grass intrusion along road shoulders
- [x] reduce the full rectangular Residential Plot ground tint
- [x] neighboring plots render a shared side boundary fence once
- [x] deeper of two neighboring lots owns the continued shared boundary
- [x] rear fences keep a small practical opening
- [x] exposed lot edges get minor post-height/jitter variation and optional hedge dressing
- [ ] live visual acceptance from straight roads, crossings and 3–5 adjacent plots

**Exit:** roads read as worn earth rather than transparent strips, intersections no longer form darker rectangles, and residential rows retain clear ownership without duplicated modern-looking parcel fences.

## M3.8.5 — Medieval art density & building identity

Presentation-first art-density pass after the road/plot interaction foundation stabilized.

- [x] larger visual ground footprint beyond the 47×47 navigation square
- [x] decorative outer woodland to hide the board-like playable edge from lower cameras
- [x] denser layered resource trees with trunks, offset crowns, undergrowth and occasional fallen timber
- [x] roof-course, ridge and heavy-eave detail on the reusable timber/plaster building kit
- [x] denser horizontal timber framing plus front/back diagonal braces
- [x] modular House variation with stoops, frontage clutter, lean-to/porch variants, wide-lot dormers and deep-lot rear extensions
- [x] residential footpaths from road frontage to the House
- [x] backyard storytelling upgrades: baskets, chicken coop, chopping block, water barrel, laundry and denser garden/firewood treatment
- [x] Stockpile cart/loading clutter
- [x] Tavern canopy, cart, additional frontage clutter and richer social staging
- [x] Brewery sacks/baskets/frontage activity dressing
- [x] Blacksmith canopy, coal/ore clutter and cart
- [x] Guard Post ladder, rack/bench and stronger platform silhouette
- [x] palisade rebuilt as vertical sharpened stakes instead of horizontal construction-kit logs
- [x] adult civilian silhouettes gain arms/legs/long-hair variation
- [x] Tavern entertainers gain intentionally more polished adult fantasy styling with fitted garments, exposed-arm silhouettes, long hair and metallic accents
- [x] long road ruts broken into deterministic worn patches rather than continuous dark lines
- [ ] live overview / Street-view / Dusk / Night visual acceptance
- [ ] confirm draw/triangle/renderer CPU remains comfortably within current prototype budget

**Exit:** the settlement reads as a lived-in medieval place from normal play distance, individual building roles remain visually legible without HUD labels, lower cameras no longer expose an obvious square-board edge, and the adult Tavern identity is visible without changing any simulation semantics.

## M3.9 — Organic settlement structure

The renderer-only residential-composition work can proceed before M4. Movement, household simulation and logistics semantics remain deferred until the M4 architecture is integrated.

### M3.9.0 — Modular residential compounds

- [x] deterministic cottage / homestead / burgage visual class derived from existing plot frontage/depth/area
- [x] House width/depth/wall/roof proportions respond much more strongly to plot dimensions
- [x] larger plots use richer plaster/roof palettes, wider frontage and more windows
- [x] homestead/burgage properties can add rear architectural wings
- [x] deep/wide properties compose extra rear sheds/outbuildings without creating new simulation entities
- [x] burgage compounds can add a second rear structure and denser utility clutter
- [x] optional narrow service lane through deeper homestead/burgage yards
- [x] front side fences start farther behind the road, producing a more open threshold rather than a surveyed rectangle
- [x] cottage thresholds use vegetation while larger compounds use gate-post/hedge cues
- [x] existing shared-boundary ownership remains intact
- [x] House inspector reports visual compound class and plot dimensions
- [ ] live visual acceptance across 4m/6m/8m/10m frontages and shallow/deep lots
- [ ] confirm renderer metrics remain inside current prototype budget

- [x] road placement foundation (persisted strokes; movement semantics deferred)
- [ ] road-influenced movement/logistics
- [x] visual road frontage/alignment foundation (M3.8.2; simulation meaning still deferred)
- [x] plot-based housing foundation (persistent lot + existing House simulation)
- [ ] household grouping
- [x] visual rear-yard/compound extension foundation (M3.9.0; simulation semantics deferred)

### M3.9.1 — Residential street rhythm

- [x] shared renderer/HUD residential presentation classifier
- [x] narrow/deep plots classify as **Long burgage cottage** instead of upgrading from depth alone
- [x] ~6×8 balanced medium plots classify as Homestead compounds
- [x] wide/shallow plots classify as **Broad-front homestead**
- [x] wide/deep plots classify as **Burgage courtyard compound**
- [x] largest lots cap the main façade width and add a perpendicular side wing instead of becoming one huge rectangular house
- [x] deterministic lateral offsets create small left/right frontage variation inside wider plots
- [x] deterministic frontage offsets break the perfectly even setback line without changing persisted House coordinates
- [x] plot form drives 1/2/3-window façade rhythms and door bias
- [x] long/deep and wide/deep properties preserve a visible side passage
- [x] side passages receive worn service-lane treatment toward the rear compound
- [x] cottage/homestead/burgage threshold treatment remains compatible with shared fences
- [x] inspector uses the same shared profile and reports the exact street form
- [x] regression coverage for 4×11, 6×8, 9×6 and 10×12 shape cases
- [ ] live Street-view acceptance across mixed plot shapes
- [ ] renderer metric sanity check

### M3.9.2 — Burgage frontage & street character

- [x] residential presentation profile now carries gable/eave roof-front orientation
- [x] long burgage cottages keep gable-front roof identity
- [x] wide-shallow and wide-deep homes use eave-front roofs for stronger street silhouette contrast
- [x] balanced/compact plots deterministically mix roof-front orientation
- [x] frontage treatment varies between open, posts, hedge, short fence and gate
- [x] side passages receive visible gateway posts/lintel plus service clutter
- [x] rear service structures vary between shed, lean-to, coop, workshop and covered storage
- [x] rear structure identity reuses existing backyard/plot seed without new persisted state
- [x] gable-front houses can add a small loft window for stronger vertical frontage identity
- [x] wide/deep burgage side wing enlarged to become a substantial secondary range
- [x] wide/deep properties deterministically choose L- or U-courtyard composition
- [x] U-courtyard variants add an opposite return wing
- [x] deterministic setback/lateral variation strengthened modestly without changing collision coordinates
- [x] HUD inspector reports roof/frontage/service-yard/courtyard presentation state
- [x] existing 4×11 / 6×8 / 9×6 / 10×12 regression profiles extended to lock new presentation fields
- [ ] live acceptance: roof orientation, frontage variety, side-passage readability and L/U compound silhouette
- [ ] renderer metric sanity check

- [ ] traffic-generated path wear
- [ ] first local-storage/logistics rules

**Exit:** settlement shape emerges from roads, plots, terrain and household/workplace relationships rather than isolated grid footprints.

## M3.10 — Terrain & road integration

### M3.10.0 — Worn roads and less regular ground

- [x] road surface subdivides into short overlapping visual pieces instead of one long uniform rectangle
- [x] deterministic width and lateral variation soften ruler-straight road silhouettes
- [x] circular soil-edge patches dissolve hard rectangular road boundaries into grass
- [x] wheel ruts remain intermittent and vary per visual piece
- [x] deterministic mud patches add darker compressed soil variation
- [x] small roadside stones and grass intrusion add edge clutter without affecting collision
- [x] meadow color patches use non-lattice deterministic scatter
- [x] food-bush resource visuals gain small jitter, scale variation and secondary underbrush clusters
- [x] all new terrain/road dressing remains instanced and renderer-only
- [ ] live Overview / Street-view acceptance on straight, diagonal and junction roads
- [ ] renderer metric sanity check

**Exit:** player roads read as worn earth embedded in the landscape rather than flat UI-like strips, and foreground resource/terrain repetition is less obvious.

### M3.10.1 — Curved road planning

- [x] replace one-gesture road drag with multi-point road control placement
- [x] double-click / Enter finishes the current road
- [x] RMB removes the last control point without leaving the road tool
- [x] Grid Snap retains clean 0°/45°/90° polyline placement
- [x] freeform mode samples a smooth curve through clicked control points
- [x] C cycles Straight / Smooth / Curved freeform behavior
- [x] Path / Lane / Main-road widths (1.2m / 1.7m / 2.4m)
- [x] road preview reflects actual width and marks start/end points
- [x] existing road endpoint/centerline snapping retained
- [x] final endpoints still split host centerlines into real junction nodes
- [x] no RoadPath save-schema change; final sampled points persist in the existing array
- [x] existing Residential Plot and building Road Snap systems consume curved local tangents automatically
- [x] long sampled curves bound point density under the existing 120-point save limit
- [x] rounded opaque road joins remove visible rectangular tile seams
- [x] regression coverage for curve sampling, endpoint preservation, straight mode and curved-road save/load
- [ ] live QA: curved S-road, aligned street, branch junction, plot frontage and road-snapped buildings
- [ ] renderer metric sanity check with several long curved roads

**Exit:** road planning feels like drawing a medieval street network rather than placing strip pieces, while old saves and all downstream frontage systems remain compatible.

### M3.10.2 — Road planner UX refinement

- [x] Grid Snap only rounds road control points to the 1m grid
- [x] Shift independently constrains the next segment to 0°/45°/90°
- [x] Road Snap independently controls endpoint/centerline joins
- [x] live mouse preview uses the selected curve even with Grid Snap enabled
- [x] RMB cancels the active stroke; Backspace removes the last committed point; Esc leaves the tool
- [x] every snapped control point can insert a persisted junction into an existing road
- [x] existing `RoadPath.points`, Residential Plot frontage and conventional building road-facing behavior remain compatible
- [x] regression coverage for independent grid/angle/road snapping
- [ ] live visual acceptance on S-curves, Shift segments, branch junctions and curved-road frontage

**Exit:** precise roads no longer require sacrificing curvature, and the three snapping concepts are independently controllable.

## M3.11 — Medieval economy depth

### M3.11.0 — Professions & workplace economy

- [x] persistent settler workplace assignment
- [x] Brewery exposes two Brewer slots
- [x] Blacksmith exposes two Blacksmith slots
- [x] assigned staff finish current jobs before leaving the general labor pool
- [x] dedicated staff physically report to their workplace during Day
- [x] production pauses with zero staff physically present
- [x] production runs at 50% with one of two slots present and 100% with both
- [x] dynamic general-work profession labels: Laborer / Woodcutter / Forager / Miner / Hauler / Builder
- [x] building inspector assign/unassign controls
- [x] settler inspector shows profession and workplace
- [x] compact settlement workforce overview
- [x] workplace save/load migration and capacity validation
- [x] demolition releases workplace staff back to the labor pool
- [x] M4 benchmark presets explicitly staff a bounded subset of production workers
- [x] normal gameplay population cap remains ten
- [ ] live pacing/UX acceptance with Brewery + Blacksmith competing for a six-to-ten-settler workforce

### M3.11.1 — Local workplace logistics & hauling priorities

- [x] production workplaces maintain explicit local input reserves
- [x] unstaffed production workplaces do not request raw inputs
- [x] manufactured output accumulates locally until a pickup threshold is reached
- [x] Low / Normal / High hauling priority persists per building
- [x] Low priority keeps one input batch and delays output pickup
- [x] Normal priority keeps a tuned working reserve
- [x] High priority fills local input capacity and clears finished goods quickly
- [x] workplace hauling priority participates in job selection relative to construction
- [x] triggered output collection drains the current local batch instead of stranding the remainder below threshold
- [x] inspector shows local input target, maximum capacity, inbound cargo, output threshold and outbound cargo
- [x] old saves migrate buildings to Normal priority
- [x] no renderer/road changes
- [ ] live pacing acceptance with competing Brewery / Blacksmith / construction demand

### M3.11.2 — Stockpile specialization & receiving priority

- [x] every Stockpile persists Wood / Food / Ale / Ore / Tools acceptance filters
- [x] starter Stockpile defaults to accepting all resources
- [x] every Stockpile persists Low / Normal / High receiving priority
- [x] new gather jobs only target stockpiles accepting that resource
- [x] manufactured Brewery / Blacksmith output only targets accepting stockpiles
- [x] priority is chosen before travel distance; distance breaks ties within the same tier
- [x] disabled filters affect new inbound storage without trapping existing inventory
- [x] already-carried/in-flight deliveries may finish safely after a filter is disabled
- [x] construction, services and workplaces can still withdraw existing resources from a now-disabled Stockpile
- [x] demolition/cancel refunds respect stockpile filters and priority
- [x] Stockpile inspector exposes all filters and receiving priority
- [x] old saves migrate to all resources accepted + Normal priority
- [x] no renderer/road changes
- [ ] live town-layout/logistics acceptance with multiple specialized Stockpiles

### M3.11.3 — Market & food distribution

- [x] Market building with 20 Food local capacity
- [x] two Vendor workplace slots
- [x] each active Vendor distributes five meals per Day
- [x] pre-Market settlements retain direct Stockpile camp rations
- [x] completing the first Market transitions daily meals to Market-only distribution
- [x] assigned Vendors create a two-Day Food reserve target, capped at 20
- [x] Market Food is hauled from Stockpiles through the existing reservation system
- [x] essential Food supply is prioritized above ordinary construction hauling
- [x] nearest operational Market serves each household/settler
- [x] Market Food counts toward population-attraction Food reserves
- [x] daily distribution counters persist through save/load and migrate old saves
- [x] HUD exposes Market Food, active Markets and daily meal throughput
- [x] no renderer/road changes; Market uses generic building presentation in this systems slice
- [ ] live acceptance for one- and two-Vendor meal throughput

### M3.11.4 — Households & local service coverage

- [x] completed Houses expose their assigned residents as a household
- [x] Market Food access uses an 18m household catchment
- [x] empty Markets do not count as household Food access
- [x] unstaffed Markets do not count as household Food access
- [x] daily Market meals cannot serve a House outside catchment
- [x] recreation services use an 18m home/current-position catchment
- [x] House inspector shows residents, Market, distance, recreation, Safety and satisfaction
- [x] HUD shows occupied-household Market and recreation coverage
- [x] immigration requires full occupied-household Market coverage once formal Markets exist
- [x] pre-Market settlements retain camp-ration coverage
- [x] household state is derived; no new save payload required
- [x] no renderer/road changes
- [ ] live neighborhood-layout acceptance with intentionally covered/uncovered Houses

### Later M3.11 slices

- [ ] house upgrades/progression
- [ ] broader market/trade foundation
- [ ] household-side production
- [ ] transport-distance pressure
- [ ] specialization/upgrades
- [ ] land-use/seasonal hooks only if compatible with proven scale targets

**Exit:** the player can read and optimize a believable local medieval economy by watching and staffing the settlement.

## M4 — Scale proof

- [x] deterministic isolated browser benchmark scene
- [x] 10 / 100 / 250 / 500-settler benchmark ladder
- [x] pass-local job reservation index removes repeated reservation scans
- [x] shared per-tick service scheduling with same-tick invalidation
- [x] benchmark-aware renderer capacities and explicit instance-overflow reporting
- [x] QA roster pagination keeps DOM work bounded
- [x] basic path request budget remains two solves per fixed tick
- [x] regression coverage preserves deterministic outcomes and the normal 10-settler cap
- [ ] reduce navigation queue latency for synchronized large crowds
- [ ] long combat/construction/topology soak at larger populations
- [ ] GPU profiling / lower-end hardware measurements
- [ ] AI update tiers, spatial indexing or LOD only where measurement justifies them

**Current conclusion:** the scheduling bottlenecks measured in PR #29 were substantially reduced, and that architecture is now ported onto the M3.10.2 road stack. Historical 500-settler measurements are evidence for the original M3.8.1 benchmark build, not a new claim for this integration. Navigation throughput remains the next demonstrated scale blocker, and normal gameplay stays capped at ten settlers.

## M5 — Mature Nightspire city

The mature layer becomes a first-class part of Nightspire's identity after the core settlement/scale architecture is healthy.

- [ ] Bathhouse / Hygiene / Recreation / Luxury service chain
- [ ] Tavern nightlife upgrades with clearly adult entertainers and richer evening activity
- [ ] adult pleasure/courtesan-house service economy with clearly adult staff/patrons
- [ ] prestige / luxury / district desirability hooks
- [ ] richer adult citizen classes, clothing and social roles
- [ ] romance / companionship hooks where they reinforce household/city simulation
- [ ] noble / decadent / occult district identity
- [ ] modular equipment and higher-quality player/featured-adult characters
- [ ] more enemy archetypes and dark-fantasy threats

**Tone:** sensual adult fantasy integrated into a functioning settlement economy; suggestive presentation is sufficient for the city-builder layer and explicit scenes are not required for progression.

# Decisions — M1 settlement loop

## Construction-ready model assembly — 2026-10-03

The final building-family assembly is the construction model. A renderer-only projection reveals foundation, framing, infill, roofing and details from existing work progress, without parallel phase meshes, duplicated building definitions or saved presentation state. This retains residential widths/frontage/courtyard layouts. Zero-health unfinished blueprints are distinguished from ruins. Operational effects remain completion-gated. Shared rafters make the roof structure visible before covering it.

Grounded surfaces and compact CC0 source models are shared across capped instance batches. No per-agent model/controller/mixer is introduced. Models/surface maps are loaded locally and disposed with scene ownership; old shapes provide a bounded loading/detail fallback. This trades visible LOD transitions for bounded initial cost. M4 samples containing incomplete asset loading are invalid, avoiding misleading fallback-only performance reports. Final authored buildings, characters and far vegetation remain future asset work; no new scale claim is made. See [sources and exact budgets](GROUNDED_MODELS.md).

## Catalog output and service seals — 2026-10-03

Replace wood-cost badges with one readable output/category pictograph in each construction card's circle. Derive live producer emblems from the existing production/resource-operation definitions; show storage, housing, trade or service functions for buildings that do not produce resources. Fishing uses a fish pictograph while retaining Food as its actual output. Planned-only symbols are UI presentation data and remain explicitly planned. Costs still appear in hover previews. Build the static seals once with the catalog; no simulation fields or per-frame processing are added. Reuse the same original wood/tool/grain icons in resource and service readouts so their meanings stay consistent. See [art budgets and browser checks](MANUSCRIPT_ART.md).

## Dedicated portrait and wide manuscript artwork — 2026-10-03

Use two checked-in WebP paintings per catalog entry: a tall construction card and a wide scene shared by hover and building windows. The user explicitly changed the earlier shared-image requirement. Independent composition keeps the building, worker and activity readable in both aspect ratios, without stitching two crops or cutting a roof off a landscape scene. Each painting is generated independently, eliminating atlas-row bleed. A manifest owns dimensions, title crops and House aliases; a source map records the selected generation and exact prompt recipe.

Cards use proportion-preserving cover scaling; wide views retain their 8:3 aspect even in short windows. Tiny title images crop the upper building area of the portrait card. A development-only gallery uses the real catalog and production styles without simulation or save mutations. No runtime generation, dependencies, Three.js objects or per-agent work are introduced. Almendra is locally hosted with its OFL license; body copy remains Georgia. Artwork payload has an explicit test budget; see [measurements and regeneration](MANUSCRIPT_ART.md).

Keep art rules in a focused ManuscriptHud stylesheet layered over the existing layout. Asset tests enforce logical-slot coverage, identical sources across sizes, deterministic generation and payload bounds. Browser QA revealed that resizing skipped automatically anchored inspectors and that the town fixture could exhaust active harvest claims. Clamp both positioning modes; use the existing finishJob helper only for unfinished gather claims invalidated by QA staging. Preserve jobs already carrying resources. See [art direction and verification](MANUSCRIPT_ART.md).

## Medieval HUD reference correction — 2026-10-01

Keep this correction in the existing UI domain on current main, preserving the architecture/forestry patches. Original simple inline SVG command symbols and existing illustrated assets provide the reference composition without new dependencies or changes to gameplay. Static cost seals read building definitions once. HUD HTML comparisons cache the previous source string instead of browser-serialized HTML: expanded boolean attributes otherwise caused unchanged inspectors to rebuild and lose focus. A regression verifies stable controls and changed-content updates. See [comparison, checks and art limitations](MEDIEVAL_UI.md).

## Preserve the foundation and isolate ownership

Keep the original Vite / strict TypeScript / Three.js stack and pinned versions. Game owns lifecycle and coordinates simulation, input, renderer and HUD. Renderer owns every Three.js object; simulation imports no Three.js, DOM, or renderer modules. Content definitions contain only current M1 content. The broader future catalog remains in design documents.

No Forge/Skillbound code or architecture was consulted or copied. No framework, physics engine, React, speculative ECS, or worker layer was added. Plain arrays of TypeScript entity records are sufficient for ten settlers and keep saves/debugging understandable.

## Stable IDs and fixed system updates

WorldState contains plain records for settlers, buildings, resource nodes and active jobs. Entity/job IDs share a monotonic namespace. The simulation runs at 20 Hz; global work assignment and housing run every ten ticks (2 Hz). Movement and task work share these fixed ticks rather than per-NPC runtime objects.

The runtime caps catch-up at eight steps/frame and reports discarded time. Hidden tabs do not advance simulation. Player controls use real frame time rather than settlement speed. Simulation pause also stops player movement but allows camera inspection and placement.

## One job lifecycle for gathering and delivery

Jobs own one settler, a source, destination, amount, resource and explicit phase. Gather jobs travel to the node, work, acquire cargo, travel to storage, and deposit. Delivery jobs travel to storage, pick up reserved stock, carry it to the site, and deposit. Construction jobs travel to a fully supplied site and add work.

Only active claims exist in the job list; completed jobs are removed. Available opportunities are recomputed at the decision cadence. Data-defined priorities favor material delivery, then construction, then gathering. A simple inventory balance favors wood when construction needs it and otherwise collects both resources. It is not a full economy/needs policy.

One worker claims each resource node and one worker constructs each site. Multiple material deliveries may serve a site. Idle actors have explicit reasons when resources are depleted or storage is full.

## Reservations follow jobs; resources move physically

Delivery jobs reserve source inventory until pickup. The job continues to reserve the site's remaining material demand while in transit. Gather jobs reserve both their node yield and destination storage space. Deriving reservations from active jobs avoids maintaining a second mutable ledger.

Inventory changes only at pickup/deposit; node yield changes only when gathering work completes. Construction starts only after all required materials arrive. Completed stockpiles add storage; completed houses assign beds immediately. QA resource grants respect inventory and incoming storage reservations.

Rejected immediate cost subtraction at placement: it would skip the requested physical delivery loop. Rejected maintaining both global inventory and per-stockpile inventory: two sources of truth would add drift risk. The HUD aggregates stockpiles; it does not own inventory.

## Small grid navigation with a shared budget

Use a handcrafted 47×47 ground grid and four-neighbor breadth-first routing around building footprints. Navigation owns a shared pending-request map and solves at most two requests per fixed tick (not two per rendered frame). Each settler retains its route between updates. A building placement changes the topology revision and triggers queued replanning.

Placement rejects overlap with buildings, live resource nodes or actors, checks bounds and a designated south entrance, and flood-checks that existing/new entrances, workers, player and live resources remain connected to the starter camp. This intentionally prevents trapping a worker or stranding cargo in M1. Blueprint footprints block from placement onward.

Trees/bushes are traversable work locations. NPC local avoidance, arbitrary building orientation, navmeshes, flow fields, route caches shared across destinations, and incremental searches are deferred. BFS and linear entity scans are easy to inspect at this scope, but must be profiled before increasing population/map limits.

## Instanced graybox presentation

Shared batches draw settlers, carried goods, trees/bushes, buildings, roofs, entrances and progress bars. The renderer reconstructs presentation from state each frame. Selection and path overlays are purely visual. No AnimationMixer or heavyweight NPC update object exists.

The existing removed PCFSoftShadowMap setting was replaced by PCFShadowMap. Shadows use one directional light. All render resources and event listeners have explicit disposal paths. No final-art pipeline was introduced.

## Validated single-slot persistence

Version 1 stores the implemented world and task phases, including carried materials. Validation checks basic shape, bounded entities, IDs/references, capacities, claim ownership, cargo consistency, delivered material limits, construction prerequisites, housing and connectivity before replacing state.

Derived routes and the pending route queue are rebuilt on load; saved source/target/cargo ownership persists. The current world survives malformed, incompatible or unavailable saves. Camera and QA options are not part of the save.

Rejected serializing scene objects or maintaining a parallel save model. Migration, export/import, multiple slots and autosave remain follow-up work.

## Verification and scope stop

Node's built-in test runner and existing TypeScript compiler provide regression coverage without extra dependencies. Tests prove conservation across gathering/construction and mid-job reloads, not just individual implementation helpers.

M1 is implemented for review. Day/night remains a lighting clock; work scheduling at dusk, enemies, player combat, repairs and every other M2 feature remain unimplemented.


## M1.1 stock targets and work pressure

Routine gathering now works toward player-controlled wood and food stock targets rather than gathering forever until storage fills. Construction demand is additive to those targets, so a zero stock target still permits workers to gather enough material for an active blueprint. Gather reservations are counted as inbound supply and delivery reservations are removed from available stock, keeping the policy compatible with physical hauling.

Targets live in WorldState so save/load and deterministic simulation preserve them. Earlier M1 version-1 saves are migrated in memory by adding the default targets before validation; the save version remains 1 because no existing field changed meaning.

## M1.1 blocked-route backoff

A failed grid path no longer gets recomputed every simulation tick. Navigation gives that settler a 40-tick (two simulated second) retry cooldown. Any topology change clears retry cooldowns immediately, allowing workers to recover as soon as the world becomes reachable again. Jobs and cargo remain owned during a temporary failure; no resources are discarded to solve a navigation problem.

## M1.1 persistence recovery

Manual Save keeps a primary browser-local slot and rotates the previous primary into a backup slot. Loading validates the entire candidate before replacing the live world. Export produces the same validated JSON representation; import validates first, then rotates the prior primary to backup and replaces the world.

This remains intentionally small: there is no autosave cadence, cloud synchronization, arbitrary save-slot manager or broad schema-migration framework yet.


## M2.0 day phases and schedule handoff

Time-of-day is converted into deterministic integer-minute phases: Dawn 05:00–06:00, Day 06:00–18:00, Dusk 18:00–20:00, and Night 20:00–05:00. Normal job assignment only occurs during Day.

Crossing into a non-Day phase does not discard physical resources. Jobs that have not picked up cargo are safely released; partially completed construction keeps its accumulated work and delivered materials. Jobs already carrying wood/food remain active until the cargo reaches its destination. After that, civilians route to their assigned homes (or the starter camp if unhoused) while guards route to completed Guard Post slots.

Guard duty is a lightweight persisted settler role rather than a separate entity type. Guards work normally during Day. Completed Guard Posts provide deterministic slots; excess guards become reserve guards and seek shelter. The shared navigation queue handles both work paths and schedule paths, preserving the existing route budget.

M2.0 deliberately adds no enemy, raid, health, damage or combat state. Those remain separate slices so schedule/resource conservation can be validated independently.


## M2.1 deterministic raid movement

The first raid is intentionally deterministic: one 12-raider wave per settlement day, spawning from a map edge selected by wave index. This keeps playtests and regression tests reproducible while the combat rules are still changing.

Raiders are plain serializable simulation entities with stable IDs, a target building, route state and readable status. They do not own Three.js objects, animation mixers, per-agent controllers or independent pathfinding loops.

Settlers and raiders share the existing navigation queue and the same global limit of two solved routes per fixed simulation tick. M2.1 therefore proves that hostile actors can enter the world without bypassing the path budget. Placement connectivity also considers active raiders so a new blueprint cannot silently trap an in-flight wave.

The starter completed stockpile is the first raid target. Raiders move to its accessible entrance and stop with combat explicitly pending. When Night ends, remaining raiders retreat and are removed. Health, attacks, aggro selection, deaths, structure damage and loot are deliberately absent until M2.2.

Raid state records the last day that spawned a wave, wave count and lifetime spawned count. Active enemies are saved. Older version-1 saves migrate an empty raid state without changing the save version.


## M2.2 minimal combat

Combat remains simulation-owned and renderer-independent. Player, settlers and raiders store only compact health/max-health/attack-cooldown fields. The fixed 20 Hz simulation decrements cooldowns, so 2×/4× simulation speeds accelerate the whole world consistently rather than introducing frame-dependent attack rates.

Player melee is an explicit input action: Space damages the nearest raider within a short radius. Guards retain their M2.0 post role, but during an active night raid they may intercept a raider within an 8-unit defense radius; they then use short-range melee. Raiders continue advancing toward the settlement and only strike a living guard or player already inside melee range, avoiding a larger aggro/chase system in this slice.

Defender health reaching zero means downed, not permanent deletion. Downed defenders cannot move or fight and recover when Night ends, including direct QA jumps from Night to Day. This avoids committing to population death/injury rules before the wider survival systems exist.

Raider death removes that enemy from active simulation, increments lifetime defeat count, and records the current wave as cleared when the final active raider dies before dawn. Combat state and cooldowns are persisted; older v1 saves migrate default player/settler/raider combat fields and expanded raid counters.

Deliberately deferred: structure damage, walls/gates, loot, equipment-derived stats, hit reactions, formation tactics, permanent injuries/death and sophisticated target selection.


## M2.3 fortification topology and repairs

Navigation now maintains separate friendly and hostile blocker sets while keeping one global request queue and two-path-per-tick solve budget. Completed Wooden Gates are passable to settlers/player but block raiders. Wooden Walls block both. Unfinished blueprints never block raiders, preventing an unbuilt-wall exploit; construction sites still affect friendly routing. Destroyed structures become non-blocking, and a topology revision forces route invalidation when a fortification is breached or rebuilt.

Placement overlap is separated from navigation blocking. Ruins still occupy their footprint even though agents can move through them, so destroyed walls cannot be silently replaced by overlapping new blueprints. Friendly connectivity validation permits closed fortification lines only when a passable gate preserves access.

Raiders dynamically choose the nearest meaningful intact structure rather than owning a permanent camp-only target. Fortifications can reach 0 HP and become destroyed breaches. In this slice, non-fortification economy buildings stop at a critical 1 HP floor rather than disappearing; once critical they are removed from raid target selection so attackers move on. This avoids creating unsolved inventory/housing destruction semantics before they are designed.

Repairs are ordinary simulation jobs, not instant healing. A damaged completed structure requests one repair worker at a time. The worker reserves up to five wood, physically picks it up from a storage building, carries it to the target, works for 1.5 seconds, then restores 10 HP per wood. A ruined fortification becomes blocking again as soon as a repair restores positive HP, which increments topology and invalidates stale routes.

Repair timber consumption is tracked explicitly so long-run material conservation remains auditable: physical wood still in nodes/inventories/cargo plus lifetime repair wood consumed equals the pre-repair total. Structure damage, repaired HP and repair wood are persisted counters.

Presentation remains cheap and reconstructable: instanced graybox fortifications, world-space health bars and short tick-based hit flashes derive from serializable state. No per-structure render controller or physics object was introduced.


## M3.0 needs are simulation state, not UI state

Each settler persists four bounded 0–100 need values: Food, Housing, Safety and Recreation. Happiness is derived as their simple mean instead of being stored separately, avoiding a second value that could drift from its inputs. Older version-1 saves migrate default need values, the current day as the last-meal day, and a zero lifetime food-consumed counter.

Food is a physical economy sink. From the Day transition (06:00) onward, each settler who has not eaten that settlement day consumes one available food unit from a real stockpile as soon as food is available. Successful meals restore Food to 100; a shortage leaves the settler due so later deliveries can still feed them. Lifetime food consumption is tracked so conservation tests can account for eaten resources instead of treating them as lost.

Housing follows the actual bed assignment and trends toward 100 when housed or 20 when unhoused. Safety trends toward a settlement-wide target derived from active raids, living guards, intact fortifications, damaged structures and whether the latest raid was cleared. These values move gradually on the fixed simulation step; they are not recomputed display-only scores.

Recreation decays over time and is restored only by an actual service slot. M3.0 introduces a 10-wood Campfire with six recreation slots. Non-guard settlers deterministically receive available Campfire slots and route there at Dusk/Dawn; recreation only rises when the settler physically reaches the assigned service point. This provides a small service-capacity proof that M3.1 Tavern behavior can extend rather than replace.

No immigration, production bonus/penalty, starvation damage, Tavern, alcohol, or long-term happiness consequence is introduced in M3.0. The purpose is to prove persistence, resource consumption, service capacity and readable feedback first.


## M3.1 services are data-driven providers with physical supplies

Campfire recreation is no longer a one-off special case. Building definitions may expose a service record containing the need served, slot count, gain rate, priority, active phases, optional supply resource/capacity and operating drain interval. The first two providers both serve Recreation at Dusk/Dawn: Campfire offers six free slots at +4 Recreation/second, while Tavern offers twelve higher-priority slots at +8/second.

Slot assignment is deterministic and stable by settler ID. Providers are ordered by service priority and building ID; reachable perimeter points are used as physical visitor positions. The initial implementation intentionally does not reshuffle visitors based on changing need values because that would cause route churn as Recreation rises. Smarter queue/fairness policy can be layered on later.

A supplied service is available only while its local pantry contains the configured resource. Tavern has a 12-food pantry. Supply is a normal Day job: workers reserve food in a real stockpile, physically pick it up, carry it to the Tavern and deposit it without creating a parallel inventory system. Service demand is included in gathering pressure, so a pantry can refill even when the ordinary stock target is low.

Tavern operating food is consumed only while at least one assigned visitor is physically at a Tavern service point. One food is consumed per 15 simulated seconds of active operation, independent of visitor count in this first tuning pass. When the pantry reaches zero the Tavern immediately becomes unavailable; stable assignment then falls back to lower-priority Campfire slots. Lifetime Tavern food consumption is tracked separately from daily meals so material conservation remains auditable.

Building inventory remains the single physical location for both stockpile resources and service pantry stock. Validation applies normal shared-storage capacity to stockpiles and service-specific supply capacity to non-storage service buildings. Service operating progress is persisted and older version-1 saves migrate it to zero.

M3.1 deliberately does not add Ale, Brewery production, money, staffing, opening-hour wages, immigration or happiness effects. Tavern uses Food as a temporary operating input solely to prove the generic supplied-service/logistics architecture. M3.2 should replace that placeholder input with a real Brewery → Ale → Tavern production chain.


## M3.2 production uses physical input/output inventories

Ale is promoted to a first-class ResourceId alongside Wood and Food. Every Inventory carries Wood/Food/Ale fields, and version-1 save migration backfills zero Ale into old targets, building inventories/deliveries, settler cargo and lifetime inventory counters before validation.

Building definitions may expose a generic production recipe: input resource/amount/capacity, output resource/amount/capacity, cycle duration and active phases. Brewery is the first producer: a 35-wood, 3×3 building with a 20-Food input capacity and 24-Ale output capacity. During Day, each completed 12-second batch consumes 2 Food and produces 4 Ale. Production pauses rather than discarding progress when the phase is inactive, input is short or output is full.

Supply jobs are generalized beyond stockpile → service movement, but stockpiles remain the authoritative staging layer for manufactured goods. Production output is hauled from producer → stockpile first. Production inputs and service supplies are then hauled stockpile → consumer. This makes the first complete chain Food Stockpile → Brewery → Ale Stockpile → Tavern while reusing the same reservation/cargo/pathing system throughout.

Production consumption and output are tracked as Inventory-shaped lifetime ledgers. Service consumption is also generalized from a Food-only counter to an Inventory ledger. Food conservation is physical Food + meals + service use + production input consumed; Ale conservation is physical Ale + service Ale consumed = lifetime Ale produced. Repair Wood remains separately accounted as before.

Tavern's M3.1 placeholder Food pantry is replaced by a 12-Ale pantry. Older M3.1 saves convert valid Tavern pantry Food 1:1 into Ale so existing playtests remain loadable. Historical M3.1 Tavern Food usage migrates into serviceConsumed.food rather than being rewritten as Ale usage. Old in-flight Food → Tavern supply jobs are either normalized to Ale cargo when already carried or safely released before validation.

M3.2 deliberately keeps production automatic rather than adding dedicated Brewery workers, shift staffing, recipes UI, grain crops, money or quality tiers. The goal is to prove the reusable manufactured-resource and physical inter-building logistics loop before adding more economy breadth.


## Development save compatibility policy

During active milestone development, backward compatibility with saves from earlier milestones is not a requirement unless explicitly requested. Fresh-run testing is the default. New systems may change the save schema directly instead of accumulating migration code solely to preserve temporary development saves.


## M3.3 population growth is earned and physically represented

Population attraction is derived from systems that already exist instead of a separate abstract immigration currency. A settlement must have at least one spare bed, at least two units of unreserved stored Food per current settler, average Happiness of 65% or more, average Safety of 55% or more, no active raiders, and either no raid history or a cleared latest wave. Population remains capped at ten for this milestone.

Attraction also exposes a 0–100 diagnostic score for the HUD. Hard requirements remain authoritative; the score is a readable summary rather than a substitute for them. Housing contributes 25, Food up to 20, Happiness up to 30, Safety up to 20 and a safe raid state 5.

Immigration is evaluated once per settlement Day. Requirements must hold for two distinct qualifying Days. The streak resets after any failed check and after each successful arrival, producing gradual growth instead of a sudden flood of settlers as soon as several houses are built.

Immigrants are real Settler entities immediately, but spawn at deterministic map-edge entry points and receive an arrival target at the starter camp. Housing may reserve a bed for them immediately, but the job scheduler explicitly excludes settlers with an active arrival target. They use the existing bounded navigation queue to walk into town and become ordinary workers only after physically reaching the camp.

The QA **Test immigration now** action bypasses only the two-Day wait; it still requires all real attraction conditions. The direct **Spawn settler** control remains a QA-only escape hatch and is labeled as such.

The ten-settler cap is intentionally unchanged. M3.3 proves that needs, economy and defense drive population growth without silently expanding the simulation/performance promise before M4 profiling.


## M3.4 construction UX stays above the simulation hot paths

The construction UX pass deliberately avoids changing the fixed-step simulation, navigation queue and job scheduler while M4 scale work is being profiled separately. Build interactions live in Game/Hud/Renderer plus small placement/demolition helpers in Buildings.

Wooden Wall drag placement is atomic. The mouse drag snaps to the dominant grid axis, previews the complete straight line, and validates a staged copy of the building list one segment at a time. If any segment overlaps, leaves the map or would disconnect friendly routes, the whole drag is rejected rather than leaving a surprising partial wall.

Wooden Gates may be placed directly on an existing non-destroyed Wooden Wall with no active job. The wall entity is converted into an unfinished gate blueprint, retaining up to its existing five delivered wood. Construction work resets and settlers deliver the remaining gate cost normally.

Completed non-starter buildings may be demolished only when no active job references them and their local inventory is empty. Intact structures return 50% of build materials, rounded down, into other stockpiles only when reserved free capacity can safely accept the full refund. The starter Stockpile cannot be demolished. Ruins may be cleared without a material refund.

Building rotation is persisted as a 0–3 quarter-turn value. Existing square footprints do not rotate their occupied cells; rotation controls the presented façade/orientation and fortification visual direction. This gives build mode a stable orientation contract without pulling navigation/footprint geometry into this parallel UX branch.


## M3.5 visual detail stays batched and state-derived

The first atmosphere pass remains a renderer concern. It does not alter Simulation, Navigation or Jobs and adds no runtime dependency or asset pipeline. Building presentation is reconstructed from existing state each frame and uses shared InstancedMesh batches for trim, props, windows, scaffolds, debris, smoke, ground wear and terrain accents.

Construction no longer appears as a single solid box growing vertically. A deterministic visual-stage helper maps work progress to foundation, timber frame and partial shell stages before the completed building silhouette appears. Damage similarly maps health into intact/worn/damaged/critical/ruin presentation bands; destroyed structures render low debris rather than a healthy shell.

Night contrast is implemented with one directional moon light, colder ambient/fog/ground tones, emissive-style instanced window/fire batches and one shared warm PointLight centered across currently active settlement light sources. There is deliberately no PointLight or Three.js controller per building. Occupied Houses contribute strong warm windows, Taverns dim when out of Ale, Campfires flicker, and Brewery smoke appears only during its actual Day production window when its recipe can run.

The building models remain procedural stylized graybox geometry. They are intended to improve readability and atmosphere before a final asset pipeline, not to lock final architecture or art direction.


## M3.6 happiness consequences are derived, not persisted

Happiness consequences are computed directly from the existing four settler needs rather than adding a morale meter or persisted modifier. The deterministic bands are Thriving (85–100, 1.15× hands-on work), Content (65–84, 1.0×), Strained (45–64, 0.9×), Unhappy (25–44, 0.75×) and Miserable (0–24, 0.6×). Food below 15% caps the work rate at 0.6× regardless of the average.

Severe conditions have one explicit behavioral consequence: settlers below 20% Happiness or below 15% Food will not accept nonessential work. In this slice, Food gathering and structure repair are essential; Wood gathering, construction, material delivery and production/service supply are nonessential. If a settler crosses the severe threshold while already holding a nonessential job, a non-carrying assignment is released safely. A settler already carrying physical cargo still completes that delivery before stopping, preserving conservation.

Only hands-on work timers are modified. Walking speed, path solving, guard/player combat, Brewery automatic production, Tavern/Campfire service rates and raid behavior are unchanged. This makes needs strategically meaningful without multiplying unrelated simulation systems.

The consequence rules live in `Happiness.ts`. M3.6 requires narrow integration hooks in `Jobs.ts` and `Simulation.ts`, but deliberately does not change `Navigation.ts`, world/save schema or reservation representation. Keeping the policy in one helper is intended to make later integration with the parallel M4 profiling work straightforward.


## M3.7 Tools are durable stockpile infrastructure

M3.7 extends the existing generic ResourceId/Inventory model with **Ore** and **Tools** instead of adding a Blacksmith-specific ledger. Twelve finite Iron Ore deposits spawn around the map perimeter. Ore gathering uses the normal gather job, stockpile reservations and carry capacity. Blacksmith input supply and finished Tool output hauling reuse the same generic production/supply path already proven by Brewery → Ale.

The first Blacksmith recipe is intentionally compact: 3 Ore → 1 Tool every 18 simulated Day seconds, with 18 Ore input capacity and six Tools output capacity. Finished Tools must reach a completed stockpile before they provide a workforce benefit; Tools sitting in Blacksmith output or settler cargo do not count.

Tools are durable in this slice rather than consumed per job. One stockpiled Tool covers two settlers. Coverage interpolates from no bonus to a maximum +10% hands-on work multiplier, applied multiplicatively after the existing Happiness rate. Walking, pathfinding, combat, automated building production and service rates remain unchanged. This creates a visible economic payoff without introducing per-settler equipment ownership or extra reservation traffic before M4 scale work is integrated.

The tool multiplier is derived once per fixed simulation step from stockpile state, not scanned separately per settler. No new job kind or navigation behavior is introduced.


## M3.10.3: resolve road wear on the terrain, not overlapping decals

Repeated segment strips/caps/ruts made the curved planner look tiled. The new presentation resolves the whole road network into one opaque albedo texture on the existing lit ground, with max-union coverage at junctions. This removes overlap-darkening and segment boundaries without changing road geometry or the save schema. World-space meadow/edge noise and road-ID/arc-distance wear regenerate deterministically. Sparse physical dressing remains instanced and capped.

A cached meadow field and exact road-data snapshot avoid per-frame texture generation. Fixed texture memory replaces thousands of road decal slots; synchronous edit/load rebuild time is the tradeoff. The five-road fixture measured about 72–76 ms for a cached-meadow CPU bake on the road-only branch, so dense-network editing is explicitly not declared hitch-free. See [road visual report](M3103_ROAD_VISUALS.md).


## Seeded regions: bounded land expansion, shared regional routing

WorldState optionally carries a versioned numeric seed, size and landscape preset. Actual resource nodes remain authoritative saved entities. Old fixed-map fixtures stay intact for M4 reproducibility. Large regions use a shared typed-array A* workspace, retaining the global solve budget; construction/save connectivity uses packed flood arrays. The playable floor stays flat so current placement, fields and roads remain physically consistent. Hills outside the boundary are presentation only. Static minimap woodland and landscape scenery are cached per map; nearby/distant tree detail shares capped instanced batches. Raid entry uses the occupied settlement edge rather than distant region boundaries to retain a playable nighttime threat. See [scope, measurements and limits](REGIONAL_MAPS.md).

## Village activity: reconstruct presentation from current state

The village pass retains procedural shared batches. A single 26-triangle weathered roof geometry serves Houses, Forester's Lodges and Stockpiles; other building families retain their existing roof batch. Inventory quantities map to capped visual bands, so neither a full store nor a large carried amount creates unbounded props. Home smoke indicates occupancy, and lodge tools indicate assigned workers; neither adds a gameplay effect.

`VillageRenderIndex` rebuilds reusable job/node/building/plot maps, occupied-home membership and staff counts once per frame. This replaces repeated per-settler job/node searches and per-House plot searches while feeding the new activity presentation. It is renderer-owned, contains references only, clears after removal/load, and never participates in simulation or persistence. `WorkerActivityRenderer` emits cargo, hammers and delivered timber into existing batches. There is no individual controller, animation mixer, material, scene object or navigation request per NPC.

The M4 browser presets provide before/after evidence on this branch. Their synthetic node-heavy worlds are a rendering regression check, not a larger playable-population promise; the normal cap remains ten. See [measurements and remaining limits](VILLAGE_VISUALS.md).

## V2 landscapes: one terrain definition, one previewed world

The generator, navigation, placement, save validation, parchment map and water renderer consume shared deterministic primitives in world/MapTerrain.ts. Water is real blocked terrain rather than decorative blue paint. Three dry river fords keep both banks reachable; no bridge-building system was introduced. Static water cells cache per immutable MapDefinition and are copied into existing topology blockers. The existing global two-solves-per-tick navigation budget remains.

GameSession owns menu/game lifetime. Setup generates a WorldState only when options change, and Begin passes that exact object to Game; the preview cannot silently reroll at launch. Returning to the menu disposes gameplay input, observers and the frame loop, preserving the suspended world in memory. Save remains explicit. Normal population and entity caps stay unchanged.

Map metadata version 2 separates new geography from V1 layouts without rewriting entity schemas. Existing V1 layouts remain readable at low implementation cost; migration work was not prioritized. The requested forests/meadows/water scope retains a level playable floor, with hills deferred. Original SVG cartography and one opaque bounded water mesh avoid new art dependencies or per-feature meshes. See [verification and tradeoffs](MAP_SETUP.md).

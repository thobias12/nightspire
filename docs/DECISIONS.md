# Decisions — M1 settlement loop

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

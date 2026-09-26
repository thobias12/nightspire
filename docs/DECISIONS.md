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

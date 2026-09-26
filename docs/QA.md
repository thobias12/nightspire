# M1 verification and handoff

## Automated checks

Verified on 2026-09-26 with Node 24.19.0 and npm 11.17.0 on Windows.

- Baseline: npm install, npm run typecheck and npm run build passed; browser rendered the original foundation.
- Final: npm run typecheck, npm run build and npm test pass.
- Install audit: zero reported vulnerabilities at installation.
- No runtime or development dependency was added; package-lock.json now records the pinned installation.
- Browser testing used the connected Codex browser because agent-browser was not installed.

Fifteen renderer-independent regression tests pass. The original eight cover:

1. Ten settlers, zero starting inventory, three houses and one additional stockpile; both resources gathered/deposited; 70 wood delivered; ten housed; every task phase observed; conservation and route budget checked.
2. Save/load during gathering work, gathering with cargo, delivery before pickup, delivery with cargo, and construction; resumed jobs complete without resource loss/duplication.
3. Two competing sites wait for resources and never double-reserve wood.
4. Full storage stops new gathering; constructing another stockpile restores throughput.
5. Invalid footprint/actor/resource/bounds/entrance placement and a route-closing enclosure are rejected.
6. Placement invalidates in-flight routes and workers continue around the new obstacle.
7. Exhausted resources produce idle workers without invalid jobs.
8. Malformed/incompatible saves are rejected without changing the original state.

M1.1 adds seven review-hardening checks covering blueprint cancellation/refunds, refusal to lose refunds when storage is full, a 12,000-tick conservation run, bounded stock-target gathering plus construction demand, migration of earlier version-1 saves, and blocked-route retry cooldown/recovery.

## Browser playthrough

The following were actually exercised through the UI:

- Started with six settlers and empty storage; observed gathering, visible cargo, hauling and rising wood/food counts.
- Spawned to ten settlers; spawn became disabled at the cap.
- Used 4× speed and the navigation-path overlay; inspected construction progress.
- Placed three houses and an additional stockpile by clicking the world.
- Saved while carrying resources and with three unbuilt sites, then reloaded the page and loaded that save.
- Resumed construction: completed/sites counter reached 4/0, delivered materials reached 70 wood, housing reached 10/10 with 12 beds.
- Paused at tick 1953; QA resource grant changed stock from 185 wood / 90 food to 235 / 115, respecting incoming capacity reservations. Load restored 185 / 90 and the same saved jobs/cargo/tick.
- Used set-hour at pause to set exactly 12:00.
- Switched camera modes, moved the player from z=5 toward the camp, and verified movement stopped at the stockpile boundary near z=1.5.
- Integrity audit reported PASS; path failure counter remained zero.
- Full storage later left ten workers idle with a visible storage-full reason.

Short keyboard taps initially could fall between render frames. Input now buffers releases until one frame consumes the key; the browser recheck confirmed movement.

The final production preview repeated the ten-settler, three-house and stockpile scenario, reaching 4 completed structures, 70 delivered wood and 10/10 housed. Overlapping placement showed a red preview and a rejection message. A fresh production browser session reported no console warnings or errors.

![Verified M1 settlement](images/m1-settlement.png)

## Observed performance

These are live HUD samples from this development browser, not a cross-hardware benchmark or a guarantee:

- Ten settlers, 60 initial resource nodes, starter camp plus four constructed structures.
- Around 5.7–5.9 ms frame interval (~169–175 FPS in the connected browser).
- Smoothed simulation CPU samples ~0.00–0.04 ms per rendered frame.
- Smoothed render submission/sync CPU samples ~0.16–0.26 ms.
- About 18–20 draw calls and 3,874–4,370 triangles, varying with cargo, depleted nodes, selected object, paths and construction state.
- Zero path failures; sampled queue depth zero; no catch-up time dropped during the sampled playthrough.
- No skeletal animation or enemies.

Simulation CPU includes many frames without a fixed step; it is not a worst-tick measurement. Render CPU does not measure GPU execution. A long-run percentile benchmark remains follow-up work. The HUD now separately exposes path requests and path solves per frame plus queue depth.

## Known limitations and review targets

- One primary browser-local save plus one rotating backup slot; validated JSON export/import is available. There is no autosave, cloud sync, slot manager, or general future-version migration.
- Six initial / ten maximum settlers; 80 building cap; fixed 47×47 grid.
- Finite resources and shared storage capacity. Food consumption, four settler needs and deterministic immigration from six up to the ten-settler cap are active; starvation damage, completed-building demolition and regrowth are not.
- One constructor per site and one gatherer per node; job-class priorities are fixed, while wood/food gathering is bounded by player-controlled stock targets plus outstanding construction demand.
- Resource vegetation is traversable, NPCs can overlap, and player collision uses occupied grid cells rather than a character physics capsule.
- Elevation/follow camera foundation only; no camera-obstacle collision, combat or character animation.
- Global BFS and linear searches are deliberately bounded M1 choices. Do not claim support for hundreds of workers without profiling.
- Instance transforms rebuild per frame; HUD/path overlays update at 5 Hz. Profile before introducing incremental rendering or spatial indexes.
- Vite's >500 kB minified chunk warning remains (about 578 kB / 148 kB gzip in this pass). It also occurred in the baseline and is mostly the Three.js runtime.
- M2.3 fortification/damage/repair is implemented. Wall drag placement, direct gate insertion and safe demolition are now available; gate open/close controls, towers/siege systems, permanent defender death and final combat presentation remain deferred.

## M1.1 verification

Post-handoff M1.1 verification on 2026-09-26:

- Local renderer-independent suite: 15/15 tests passed, including the 12,000-tick run.
- GitHub Actions CI run #8 passed dependency install, strict typecheck, all tests, and production build.
- Browser-facing Game/Hud changes also passed a strict local contract typecheck against the unchanged renderer API.
- The live Pages build still needs the final M1.1 user playtest after deployment; do not treat that as already visually verified.

## Highest-value follow-ups before M2

1. User-playtest the M1.1 Pages revision: stock targets, blueprint cancellation, backup/export/import and normal camera/placement behavior.
2. Tune camera/placement/task pacing from that feedback rather than adding more simulation breadth.
3. Add a repeatable percentile-style performance capture if needed before population limits increase.
4. Then begin a deliberately small M2 dusk → first raid → morning repair slice.


## M2.0 verification

GitHub Actions CI run #15 verified the M2.0 code on 2026-09-26:

- dependency install passed
- strict TypeScript check passed
- 20/20 renderer-independent simulation tests passed
- production Vite build passed

The five M2.0 tests cover exact phase boundaries, cargo-safe dusk shutdown, civilian sheltering, guard-post reporting, daylight work resumption, and legacy M1.1 role migration.

The live Pages deployment is intended for user-facing verification of phase controls, Guard Post placement, role assignment, and visible dusk/night movement. Enemies and combat are deliberately absent from this slice.


## M2.1 verification

GitHub Actions CI run #18 verified the implementation on 2026-09-26:

- dependency install passed
- strict TypeScript check passed
- 26/26 renderer-independent simulation tests passed
- production Vite build passed

The six M2.1 tests cover one-wave-per-day spawning, shared bounded navigation to the settlement, daylight retreat and next-day respawn, active-raid save/load without duplication, migration of M2.0 saves, and placement rejection on an active raider cell.

The Pages playtest should verify the visible behavior: jump to Night, observe 12 dark-red raiders enter from outside the settlement and converge on the camp, inspect their statuses/routes, then jump to Dawn/Day and confirm they retreat. **Next raid** advances the QA scenario to another wave. Combat is intentionally not part of this slice.


## M2.2 verification

GitHub Actions CI run #23 verified the implementation on 2026-09-26:

- dependency install passed
- strict TypeScript check passed
- 32/32 renderer-independent simulation tests passed
- production Vite build passed

The six M2.2 additions cover player melee damage/kill, guard-raider damage exchange, player downing and recovery on night exit, final-raider wave clearing, combat-state save/load, and migration of M2.1 saves to default combat fields. The older guard-post schedule test is explicitly isolated from raid spawning so schedule and combat behavior remain independently tested.

Pages playtest focus: assign guards, jump to Night, observe guards intercept nearby raiders, switch to Follow player, approach a raider and press Space, inspect health/status changes, clear or survive the wave, then jump to Dawn/Day and verify downed defenders recover.


## M2.3 verification

GitHub Actions CI run #38 verified the implementation on 2026-09-26:

- dependency install passed
- strict TypeScript check passed
- 39/39 renderer-independent simulation tests passed
- production Vite build passed

The seven M2.3 additions cover friendly-vs-hostile gate blocking (including the unfinished-blueprint exploit), full-health wall construction, raider destruction of a wall and opening of the hostile route, timber-consuming daylight repair that closes the breach again, critical-floor behavior for core economy structures, retargeting after a core structure reaches 1 HP, and migration of older saves to structure/repair state.

Existing long-run conservation now explicitly includes lifetime repair timber consumption instead of hiding that resource sink. The older raid-movement regression accepts the terminal no-target state after all available core structures have reached their critical floor.

The Pages build still needs user-facing verification after deployment. Recommended playtest: build several walls plus a gate, enable paths, trigger Night, watch raiders hit/breach the perimeter, inspect structure HP/hit flashes, then go to Day and observe workers carry wood to damaged structures. The QA **Damage selected structure** button provides a deterministic repair test.


## M2.4 verification

This closeout raises the raid from the original 12-enemy validation wave to the intended M2 pressure range without changing the combat or navigation architecture.

- Wave 1: 20 raiders
- Each later wave: +4 raiders
- Cap: 40 raiders
- Spawn side remains deterministic by wave
- All raiders still share the same global two-paths-per-fixed-tick navigation budget
- A dedicated 40-raider regression runs 800 fixed steps, periodically validates the full world, requires zero path failures, and asserts the solve budget is never exceeded

Two new regressions bring the suite to 41 tests: deterministic 20→40 wave sizing/cap behavior and the capped 40-raider navigation-pressure run.

Pages playtest focus after deployment: build a meaningful wall/gate perimeter, trigger the 20-raider first wave, inspect path queue/failures and structure damage, then use **Next raid** to feel the 24/28+ pressure increase. Automated verification proves bounded execution, not whether the combat numbers are fun; HP/damage/repair pacing should be tuned from the live playtest.


## M3.0 verification target

The M3.0 needs foundation adds eight renderer-independent regressions on top of the 41-test M2.4 suite:

- one food consumed per due settler and no double-feeding on the same day
- food shortages do not invent food and visibly reduce Food satisfaction
- one Campfire exposes six deterministic recreation slots and physically restores Recreation during off-hours
- Housing responds to real bed assignment and Safety falls under an active raid
- Happiness/settlement summaries are derived from the four need values
- entering Day processes the new-day meal before normal work resumes
- M2.4 saves migrate needs, last-meal day and food-consumption accounting
- Dusk/Dawn recreation routes are invalidated when the phase target changes, preventing stale Campfire movement at Night

Conservation assertions now include lifetime food consumed, matching the existing repair-timber accounting. Browser playtest after deployment should verify that need percentages visibly move, Campfire capacity is limited, food stock falls at 06:00, and the settlement HUD correctly identifies the weakest average need.


### M3.0 meal-service correction

Live playtesting exposed that new Day-1 settlers were initialized as already fed, leaving **Food consumed = 0** until Day 2 even when storage held food. The correction makes the starting population due for its first meal and keeps any unfed settler due throughout Day until food actually reaches storage. Meal retries run at the existing decision cadence and never consume more than one food per settler per day.

The HUD now shows **Fed today X/Y**. Existing M3.0 saves with zero lifetime food consumption are migrated so settlers incorrectly marked as fed become due again. Two regressions cover Day-1 delayed food availability and the M3.0 zero-meal save correction; the suite target is now 51 tests.


## M3.1 verification target

M3.1 converts Recreation from a Campfire-specific rule into a generic service-provider and supply-logistics framework. Eight new regressions bring the target suite from 51 to 59 tests:

- a supplied Tavern outranks Campfire and provides the stronger service to the current ten-settler population
- a dry Tavern stops serving and exactly Campfire capacity remains available
- Day workers physically fill the Tavern's 12-food pantry without exceeding capacity
- in-flight service-supply cargo survives save/load and resumes without duplication
- Tavern operating food drains only while a visitor is physically using the service
- Tavern Recreation recovery is stronger and automatically falls back to Campfire when the pantry empties
- M3.0 saves migrate per-building service progress and lifetime service-food accounting
- malformed saves cannot overfill a service pantry

The existing Campfire regression now uses the same generic service assignment/update path as Tavern. Resource-conservation assertions count both daily meal food and Tavern operating food.

Browser playtest after deployment should build one Campfire and one Tavern, add food to the stockpile, let workers fill the Tavern pantry during Day, then jump to Dusk. Settlers should prefer Tavern slots and show **Visiting Tavern**. Use the QA pantry helper or wait for operation to exhaust Tavern food; when it reaches zero, up to six civilians should fall back to Campfire while excess civilians have no recreation slot. Inspection and QA metrics should show provider supply, active visitors and lifetime Tavern food used.


## M3.2 verification target

M3.2 replaces the temporary raw-Food Tavern input with the first real production chain and adds five new regressions on top of the 59-test M3.1 suite, for a target of 64 tests.

Updated M3.1 service tests now use Ale as Tavern supply and verify Ale cargo save/load/conservation. New production coverage verifies:

- Brewery completes **2 Food → 4 Ale** batches only during Day
- Brewery stops cleanly at its 24-Ale output capacity and resumes after output is removed
- mid-batch Brewery progress survives save/load and resumes without duplication
- Ale produced, physically moved and consumed by Tavern balances exactly against the production/service ledgers
- Tavern no longer operates from raw Food after the M3.2 migration

The end-to-end logistics regression starts with Food in the stockpile and requires workers to supply Brewery input, wait for actual Ale production, haul Ale from Brewery output into stockpile storage, then haul that stored Ale from stockpile to Tavern. The regression explicitly fails if Brewery → Tavern direct hauling occurs.

Save migration coverage removes Ale from an M3.1-shaped save, restores all third-resource fields, converts existing Tavern pantry Food into Ale, initializes production progress/counters, and preserves historical Food-based Tavern consumption.

Browser playtest after deployment: build Brewery + Tavern, keep Food available during Day, watch Food enter Brewery, watch Ale output rise, inspect the Stockpile and confirm Ale is deposited there, then watch workers carry stored Ale from Stockpile into Tavern. At Dusk settlers should use the Tavern while its Ale pantry drains; when it reaches zero they should fall back to Campfire. The top HUD should expose total physical Ale and the QA metrics should show Food consumed by production plus Ale produced/used.


## M3.3 verification target

M3.3 adds seven population regressions on top of the 64-test M3.2 suite, for a target of 71 tests:

- attraction is blocked without real spare housing and becomes eligible with sufficient beds, unreserved Food, Happiness and Safety
- one Day cannot be counted twice; two distinct qualifying Days are required before arrival
- the actual Simulation Dawn → Day transition invokes the immigration evaluation
- an active raid or uncleared latest raid blocks immigration despite otherwise perfect needs
- an immigrant spawns near a deterministic map edge, cannot receive jobs while arriving, then joins normal work after physically reaching town
- the ten-settler population cap blocks both organic and forced QA immigration
- current save/load preserves a partially arrived immigrant plus immigration cadence/state and resumes its route without duplication

The QA **Test immigration now** button is intended to shorten browser testing: establish all real requirements, press it, and one immigrant should appear near a map edge and walk toward the starter camp. It does not override missing beds, Food, low Happiness/Safety, raids or the population cap.

Browser playtest after deployment: start fresh, construct enough housing for spare beds, keep Food above twice the current population, use normal services/defenses or QA need controls to satisfy Happiness/Safety, then either hold the state across two Days or use **Test immigration now**. Confirm the population counter increases, the newcomer is visibly walking in, their inspector says Immigrant, and they take no work until arrival finishes.


## M3.4 verification target

M3.4 adds five construction-UX regressions on top of the 71-test M3.3 suite, for a target of 76 tests:

- wall dragging snaps to the dominant axis and atomically creates the full valid straight line
- a wall drag crossing an occupied footprint rejects the entire batch with no partial blueprints
- placing a Wooden Gate on a completed Wooden Wall converts the same entity into a gate blueprint, retains five delivered wood and applies the chosen orientation
- demolishing an idle completed House removes it and refunds exactly 50% of its build wood into safe stockpile capacity
- building orientation survives save/load, while demolition refuses a building that still contains physical resources

Browser playtest after deployment should verify the non-simulation-facing controls directly: use 1–8 to switch build choices, press R and watch the amber façade marker rotate, Shift-click several Houses/Campfires without reselecting, drag a multi-cell wall line, put a Gate on one finished wall segment, select a 3×3 building and verify the larger selection ring, then demolish an empty completed non-starter structure and observe the refund in storage.


## M3.5 verification target

M3.5 adds three deterministic renderer-state regressions on top of the 76-test M3.4 suite, for a target of 79 tests:

- atmosphere state is bright/open by Day, colder/denser by Night, and exposes a strong twilight signal around dusk
- construction presentation advances deterministically through foundation → frame → shell → complete
- building damage maps deterministically through intact/worn/damaged/critical/ruin states

Browser playtest after deployment should compare Day, Dusk and Night with several completed Houses, a stocked Tavern, Brewery and Campfire. Confirm occupied Houses/Tavern windows glow warmly against the colder night; Campfire flickers; Brewery smoke appears only during a viable Day production window; Houses/Tavern/Brewery/Guard Post/Stockpile have distinct silhouettes; an unfinished 3×3 building visibly progresses through scaffold stages; and the QA structure-damage control darkens a building before a destroyed ruin becomes visible debris.

The visual pass intentionally keeps simulation scale and behavior unchanged and should be evaluated alongside the HUD draw-call/render-submission metrics before later art density increases.


## M3.6 verification target

M3.6 adds five deterministic morale regressions on top of the 79-test M3.5 suite, for a target of 84 tests:

- Happiness bands map to deterministic worker rates: Thriving 115%, Content 100%, Strained 90%, Unhappy 75%, Miserable 60%
- severe hunger below 15% Food activates the emergency-work restriction even when the four-need average is still otherwise healthy
- essentials-only settlers reject Wood gathering/construction while still accepting Food gathering and repair
- the fixed-step simulation applies the productivity multiplier to real work progress
- an already-active nonessential job is safely released when misery becomes severe, preventing a stale reservation/work lock

The consequence layer is derived from existing per-settler needs and adds no save fields. Normal walking speed, navigation budgets, combat rates, Brewery automation and service gain rates are deliberately unchanged.

Browser playtest after deployment: use **Needs → 100%** and inspect a settler to confirm **Thriving / Work +15%**. Drop needs and observe Strained/Unhappy/Miserable work modifiers. Create construction work and compare progress. Force Food below 15% while leaving other needs high: the inspector should show severe hunger / essentials-only; workers should stop accepting Wood/construction but still gather Food or perform repairs. Restore needs or feed the settlement and confirm normal job assignment resumes.


## M3.7 verification target

M3.7 adds six production/workforce regressions on top of the 84-test M3.6 suite, for a target of 90 tests:

- fresh settlements contain twelve finite Iron Ore deposits and no gatherable Tools nodes
- Blacksmith production converts exactly 3 Ore → 1 Tool per 18-second Day batch and stops at its six-Tool local output cap
- workers physically route stockpiled Ore into the Blacksmith and haul finished Tools back into stockpile storage while Ore/Tools conservation remains exact
- Tool coverage counts stockpiled Tools only, uses one Tool per two settlers, and caps at a +10% work multiplier
- the fixed-step hands-on work rate stacks Tool coverage multiplicatively with the existing M3.6 Happiness modifier
- current save/load preserves Blacksmith Ore, Tools and mid-batch production progress

Browser playtest after deployment: build a Blacksmith with **9**, leave its local input empty, then watch workers mine the new gray Iron Ore deposits and stage Ore through the Stockpile before supplying the forge. During Day the Blacksmith should show **3 ore → 1 tools every 18s** and visible forge/smoke activity. Finished Tools must be hauled back to stockpile before the HUD Tool coverage rises. With six settlers, three stored Tools should show 100% coverage and +10% Tools productivity. Remove/relocate Tools from stockpile and confirm the bonus falls immediately without consuming Tools.


## M3.8.0 verification target

M3.8.0 is presentation-first and deliberately leaves `Simulation.ts`, `Jobs.ts`, `Navigation.ts`, save schema, reservations and population behavior unchanged.

Two deterministic presentation regressions extend the 90-test M3.7 suite to **92 tests**:

- the visual road graph connects only completed non-fortification town buildings and remains deterministic
- visual road strip geometry has stable midpoint/length/heading output without mutating building data

Renderer acceptance is primarily visual rather than simulation-based. A fresh-run QA button, **Stage M3.8 Town Center visual target**, creates the repeatable review cluster without changing normal new-game behavior:

- three Houses
- starter Stockpile
- supplied Tavern
- supplied/active-capable Blacksmith
- Campfire
- Guard Post
- wall/gate edge
- cleared central yard/road space
- six existing clearly adult settlers
- Tavern ambient adult entertainers/patrons at dusk when Ale is stocked

The target presentation includes:

- gabled roofs rather than pyramid-box silhouettes
- stone foundations plus plaster/timber wall language
- building-specific yards, fences, firewood, barrels, sacks, ore/tool racks and work props
- a roofed/open Stockpile whose visible contents reflect stored resource types
- an identifiable forge/anvil/chimney Blacksmith
- Tavern frontage, sign, awning, tables/barrels and dusk social figures
- procedural dirt-road wear linking completed town buildings; it is renderer-only and does not affect pathfinding
- less regular tree placement, visible trunks, layered crowns and undergrowth
- the global build grid hidden except while a blueprint is active
- a lower **V / Street view** settlement camera
- grounded medieval HUD material treatment

Live acceptance after Pages deployment:

1. start a fresh settlement and press **Stage M3.8 Town Center visual target**
2. inspect the default late-afternoon street-oblique view
3. jump to **Dusk** and confirm Tavern nightlife/social silhouettes plus warm windows
4. jump to **Night** and confirm the existing cold-wilderness/warm-town contrast remains readable
5. press **V** between Overview and Street view and rotate with Q/E
6. enter any build mode and verify the placement grid appears; press Esc and verify it disappears
7. confirm roads are purely visual by enabling path debug and observing that agent navigation remains on the existing grid/path system
8. verify House, Tavern, Blacksmith, Stockpile and Guard Post are distinguishable without reading their HUD labels

M3.8.0 is not complete until these views are visually accepted. Performance should also be checked in the existing Draws / triangles / Render submission CPU metrics because the extra detail is intentionally kept in shared instanced batches.


## M3.8.1 verification target

M3.8.1 replaces the temporary automatic presentation-road graph with real player-authored town-planning data while preserving all M4-sensitive runtime behavior.

The suite target is **96 tests**. New/updated regressions cover:

- freehand road-point normalization, minimum length and deterministic length
- Residential Plot frontage snapping against a persisted road segment
- derived road-facing plot side/orientation and House rotation
- plot-vs-plot overlap rejection
- plot-vs-building and plot-vs-resource rejection
- persisted road/plot save-load round trip including deterministic backyard identity
- cancelling a plotted House removes its attached persistent plot
- existing visual road strip math remains deterministic

### Browser workflow

Start a fresh run rather than loading the M3.8.0 QA settlement.

1. Press **0** or choose **Road**.
2. Click-drag a curving road through open land. Release; the road should remain exactly where you drew it.
3. Draw a second road connecting to or branching from the first.
4. Press **1** or choose **Residential Plot**.
5. Start close to a road and drag diagonally along the road and backward into open land.
6. A valid lot requires 4–10m frontage and 5–13m depth. The green preview represents the whole lot rather than only the House footprint.
7. Release a valid plot. A normal 20-wood House blueprint appears near its road frontage while the full fenced backyard persists.
8. Create several plots with different width/depth. Completed homes should share the same medieval kit but vary in width, plaster/roof treatment, door placement, porch/lean-to details and backyard type.
9. Backyards deterministically show Garden, Chickens, Workyard or Firewood dressing.
10. Try overlapping another plot, an existing building or a live resource node; placement must refuse it.
11. Save, reload, and confirm roads, arbitrary road curves, plot shapes and backyard variants are unchanged.
12. Cancel an unfinished plotted House; its plot/fence/backyard must disappear with it.
13. Enable navigation paths: paths should remain the original grid paths and should **not** prefer roads in M3.8.1.
14. Check state integrity.

### Architectural boundary

This milestone intentionally does not modify `Navigation.ts`, `Jobs.ts`, `Simulation.ts`, path budgets, resource reservations or settler decision logic. Persisted roads are prepared for post-M4 movement/logistics integration, but right now they organize player-authored settlement shape and residential frontage only.


## M3.8.2 verification target

M3.8.2 adds placement assistance without changing movement, jobs or simulation scheduling. The regression target rises from 96 to **100 tests**.

New coverage verifies:

- Grid Snap converts road drags to deterministic horizontal/vertical/45° endpoints
- disabling Grid Snap preserves freeform road pointer geometry
- snapped Residential Plots use whole-metre frontage/depth while remaining offset to the road edge
- Road Snap magnetically selects a roadside grid center and computes the road-facing visual angle
- disabling Road Snap preserves manual grid placement/rotation
- Walls, Gates and Campfire are never overridden by magnetic Road Snap
- a persisted road-facing building angle survives current save/load

### Browser workflow

1. Start fresh. Grid Snap and Road Snap should both read **ON**.
2. Press **0**. Drag mostly horizontally: the preview must lock perfectly horizontal. Try mostly diagonal: it must lock to 45°. Draw a crossing/branch endpoint near an existing road and confirm it magnetically joins.
3. Press **G**. Draw again and confirm the road follows the freeform pointer stroke. Press **G** again.
4. Press **1** and make several lots. With Grid Snap on, HUD preview dimensions should be whole metres and neighboring lots should be easy to align.
5. Toggle Grid Snap OFF and verify freeform lot dimensions return.
6. Select Tavern, Brewery, Blacksmith, Stockpile or Guard Post and move the ghost near a road. With Road Snap ON, the center should magnetically settle beside the road and the façade marker/building ghost should face the street, including on a 45° road.
7. Move far enough from the road and confirm the ghost falls back to normal grid placement.
8. Press **F**. Confirm the same building no longer magnetically moves/rotates and **R** controls its manual grid facing.
9. Walls, Gates and Campfire must remain manual/grid-oriented even when Road Snap is ON.
10. Place a road-snapped building, Save, Load, and confirm its road-facing visual angle is unchanged.
11. Enable navigation debug and confirm workers still ignore roads for path cost/preference.
12. Check state integrity.

Grid Snap and Road Snap are session/UI preferences, not settlement save data. Persisted roads, plots and snapped-building facing angles remain settlement data.

### Architectural boundary

M3.8.2 does not change `Navigation.ts`, `Jobs.ts`, `Simulation.ts`, path budgets, reservations, AI decisions or movement cost. All assistance is resolved before the existing placement API receives the final grid cell/rotation.


## M3.8.3 verification target

M3.8.3 is a placement/presentation hardening pass on M3.8.2. The regression target rises from 100 to **103 tests**.

New coverage verifies:

- a road drag near an existing endpoint prefers that exact endpoint, while a centerline join returns the exact projected point
- inserting that joined point splits the existing persisted RoadPath once, creating an explicit shared junction node without duplicate insertion
- a second Residential Plot started near the first plot's frontage edge snaps flush to the neighbor while remaining a valid non-overlapping lot
- the tighter conventional-building Road Snap still resolves to a valid integer grid center and road-facing angle

### Browser workflow

1. Start fresh with Grid Snap ON.
2. Draw one long horizontal road.
3. Draw a branch whose endpoint ends near the middle of that road. The branch should lock exactly onto the centerline. Visually the junction must read as continuous dirt with **no large dark round blob**.
4. Draw another road toward an existing road endpoint. Endpoint snap should win over a nearby centerline projection.
5. Create one Residential Plot, then start a second plot near the first plot's road-front corner. The preview should visibly jump flush to the existing edge and the HUD message should say the edge is snapped.
6. Confirm the frontage preview has small metre tick marks so equal-width rows are easy to judge.
7. Place 3–5 adjacent plots. Shared boundaries should line up without overlaps or tiny gaps.
8. Confirm side fences stop short of the road frontage and no longer make every lot read as a fully enclosed modern rectangle.
9. Select Tavern / Blacksmith / Brewery and move near the road. The ghost should sit slightly closer to the road than M3.8.2 and the brighter/wider frontage marker should make its street-facing edge obvious.
10. Save / Load and confirm road junction control points, plots and road-facing building angles remain unchanged.
11. Enable path debug and verify workers still ignore roads for movement cost/preference.
12. Check state integrity.

### Architectural boundary

M3.8.3 still does not change `Navigation.ts`, `Jobs.ts`, `Simulation.ts`, path budgets, reservations, AI decisions or movement cost. Junction nodes are persisted now specifically so post-M4 road/path integration can consume a cleaner road graph later.


## M3.8.4 verification target

M3.8.4 deliberately freezes M3.8.3 placement/topology behavior and changes renderer presentation only. The automated suite remains **103 tests**; strict TypeScript and production build are the code gates, while the new behavior is primarily live visual acceptance.

### Browser workflow

1. Start fresh with Grid Snap ON and draw one horizontal road plus a perpendicular/45° branch.
2. Inspect the crossing from overview and Street view. The intersection must **not become darker** than the incoming road surfaces merely because two meshes overlap.
3. Confirm the road core is visibly warmer/browner than the grass, with subtle darker wheel ruts rather than broad translucent dark strips.
4. Inspect long straight roads: the faint wider shoulder and sparse grass intrusion should soften the rectangular edges without creating circular blobs.
5. Draw several adjacent Residential Plots on one road and complete the Houses.
6. Shared side boundaries between neighboring plots must render **once**, with no doubled rails/posts.
7. Compare a shallow and deeper adjacent lot: the shared fence should continue to cover the deeper property's boundary without duplicating the shallower section.
8. Rear fences should have a small usable opening rather than forming a fully sealed rectangle.
9. Exposed outer lot boundaries should have mild post/hedge variation; lot ownership remains readable but should look less like modern surveyed parcels.
10. Confirm frontage snapping, Grid Snap, Road Snap, junction-node behavior and save/load are unchanged from M3.8.3.
11. Enable navigation debug and confirm workers still ignore roads for movement cost/preference.
12. Check state integrity and review Draws / triangles / Render submission CPU metrics.

### Architectural boundary

M3.8.4 does not modify `TownPlanning.ts`, `WorldState.ts`, `SaveLoad.ts`, `Buildings.ts`, `Simulation.ts`, `Jobs.ts` or `Navigation.ts`. No planning rules, persistence rules, path budgets, reservations, AI decisions or movement costs change in this pass.


## M3.8.5 verification target

M3.8.5 freezes road/plot/snapping/persistence rules and changes the render/UI/docs surface only. The automated suite remains **103 tests**; strict TypeScript + production build remain mandatory, while acceptance is primarily visual/performance-oriented.

### Browser workflow

1. Start fresh, draw a road, and create at least three Residential Plots with different widths/depths.
2. Complete the Houses and compare them from Overview and **V / Street view**. They should share one construction language without looking like identical boxes: compare roof courses/eaves, plaster/timber framing, porch/lean-to/dormer/rear-extension combinations and door/window placement.
3. Inspect deep lots: backyard space should show a stronger lived-in read through laundry, garden/basket, chicken coop, workyard/chopping or firewood/water-barrel dressing.
4. Confirm a narrow worn footpath visually links each completed plotted House to its road frontage.
5. Build or stage Stockpile, Tavern, Brewery, Blacksmith and Guard Post. Without HUD labels, each should read through its yard/prop silhouette: loading cart/storage, Tavern canopy/social furniture, brewing barrels/sacks, forge/anvil/coal/cart and raised Guard Post equipment.
6. At Dusk, stock the Tavern with Ale. Clearly adult decorative social figures should remain stylized/non-explicit but visibly more polished/differentiated than ordinary workers through fitted garments, exposed-arm silhouettes, long hair and metallic accents.
7. Build a Wooden Wall/Gate line. The wall should read as a sharpened vertical palisade rather than horizontal stacked logs.
8. Inspect long roads: wheel ruts should appear in intermittent worn patches rather than continuous dark rails.
9. Rotate to a low Street view near the map edge. Extended ground + decorative outer woodland should hide the previous obvious square-board horizon in normal camera ranges.
10. Jump Day → Dusk → Night and confirm added roof/yard/forest detail remains readable without undoing the established cold-wilderness / warm-settlement contrast.
11. Enable navigation paths and confirm presentation additions do not alter movement/pathfinding.
12. Run state integrity and compare Draws / triangles / Render submission CPU against M3.8.4. Extra art density must remain instanced and should not introduce a material/light-per-prop explosion.

### Architectural boundary

M3.8.5 does not modify `TownPlanning.ts`, `WorldState.ts`, `SaveLoad.ts`, `Buildings.ts`, `Simulation.ts`, `Jobs.ts` or `Navigation.ts`. No snapping, placement, persistence, reservations, AI scheduling, movement cost or path budget semantics change.


## M3.9.0 verification target

M3.9.0 begins the organic-settlement roadmap without changing road placement, Residential Plot persistence, House simulation, jobs or navigation. The automated suite remains **103 tests** because this slice is renderer/UI/docs only; strict TypeScript + production build remain mandatory.

### Browser workflow

1. Start fresh and draw one straight road long enough for at least four plots.
2. Build four Residential Plots with deliberately different dimensions, for example:
   - ~4m × 6m compact lot
   - ~6m × 8m medium lot
   - ~8m × 10m large lot
   - ~10m × 12m deep/wide lot
3. Complete all four Houses. Inspect each House: the inspector should identify **Cottage compound**, **Homestead compound** or **Burgage compound** and report frontage/depth.
4. Compare the row from Overview and Street view. Main House width, depth, wall height and roof mass should visibly scale with the lot instead of every property reading as the same box.
5. The largest/deepest property should read as a true compound: more substantial House frontage plus rear wing/outbuilding composition and denser utility clutter.
6. Medium/deep lots should be able to show one additional shed/outbuilding; tiny plots should stay restrained instead of being overfilled.
7. Confirm front side fences begin behind the road threshold, leaving the frontage visually more open. Cottage thresholds should feel softer/vegetated; larger compounds should use stronger posts/hedge cues.
8. Adjacent plots must still share a boundary once; no duplicate rails/posts should return.
9. Deep homestead/burgage variants with the deterministic lane condition should show a narrow worn service path from the frontage toward rear structures.
10. Verify existing backyard identity (garden/chickens/workyard/firewood) remains readable and does not collide obviously with the new compound outbuildings.
11. Save → reload → Load. The same plot IDs/dimensions should regenerate exactly the same compound visuals without any new persisted compound data.
12. Enable navigation paths and confirm workers still ignore roads/outbuildings for movement semantics exactly as before.
13. Run state integrity and compare Draws / triangles / Render submission CPU with M3.8.5.

### Architectural boundary

M3.9.0 does not modify `Game.ts`, `TownPlanning.ts`, `WorldState.ts`, `SaveLoad.ts`, `Buildings.ts`, `Simulation.ts`, `Jobs.ts` or `Navigation.ts`. Cottage/homestead/burgage are deterministic **visual classes**, not new simulation entities, wealth systems, households or save fields.


## M3.9.1 verification target

M3.9.1 keeps M3.9.0 mechanics/persistence frozen and changes the visual composition rule from size-only to **shape-aware**. Automated coverage rises from 103 to **107 tests**.

New regression cases verify:

- 4×11 remains a cottage-tier **Long burgage cottage**, gains a side passage, and does not become Homestead from depth alone
- 6×8 resolves to a balanced **Homestead compound**
- 9×6 resolves to **Broad-front homestead**, with a three-window façade profile and no forced side passage
- 10×12 resolves to **Burgage courtyard compound**, keeps the main House under 5m wide, uses a side passage and requests three façade windows

### Browser workflow

1. Start fresh and draw one straight road.
2. Create four plots close to **4×11, 6×8, 9×6 and 10×12**.
3. Complete all Houses and inspect them. Their labels should respectively read approximately:
   - Long burgage cottage
   - Homestead compound
   - Broad-front homestead
   - Burgage courtyard compound
4. Compare the street from Overview. The row should no longer have one perfectly straight façade/setback line: Houses should shift subtly left/right and slightly forward/back while staying clearly inside their plots.
5. The 4×11 House should remain narrow and visually deep, with a visible side passage toward the rear instead of a medium-width Homestead façade.
6. The 9×6 House should spread its frontage but avoid deep rear-compound clutter that would not fit the shallow lot.
7. The 10×12 property should **not** be one huge stretched rectangle. The main House should stay under ~5m visual width and a perpendicular side wing/rear structures should create an L/courtyard read.
8. Check façades from Street view: compact/long forms should use fewer windows; broad/wide forms should use a wider 2–3-window rhythm with more off-center doors.
9. Confirm side-passage plots visibly preserve one threshold opening and carry a narrow worn path toward the rear.
10. Confirm adjacent shared fences still render once and no house/outbuilding obviously crosses a property boundary.
11. Save → reload and confirm the same plot IDs regenerate the exact same form, offsets, façade rhythm and outbuildings.
12. Enable navigation paths and confirm no renderer-created wing/shed/service lane changes movement semantics.
13. Check state integrity and compare Draws / triangles / Render submission CPU with M3.9.0.

### Architectural boundary

M3.9.1 adds `render/ResidentialPresentation.ts` and changes renderer/HUD/tests/docs only. It does **not** modify `Game.ts`, `TownPlanning.ts`, `WorldState.ts`, `SaveLoad.ts`, `Buildings.ts`, `Simulation.ts`, `Jobs.ts` or `Navigation.ts`. Visual House offsets do not alter persisted building positions or collision/pathfinding.


## M3.9.2 verification target

M3.9.2 keeps the M3.9.1 shared presentation classifier and adds stronger street-character fields without touching planning, persistence or simulation. The automated suite remains **107 tests**; the existing four mixed-shape profile tests now also lock roof orientation, frontage treatment, rear-service identity and courtyard mode.

### Browser workflow

1. Start fresh and build a mixed residential row close to **4×11, 6×8, 9×6 and 10×12**.
2. Complete all Houses and inspect each property. The inspector now reports roof-front orientation, frontage style, rear-service structure and L/U courtyard mode when relevant.
3. The 4×11 Long burgage cottage should keep a **gable-front** roof and a visible working side passage rather than looking like the broader Homestead forms.
4. The 6×8 balanced Homestead should be able to turn the roof **eave-front**, creating a different silhouette from the long burgage cottage.
5. The 9×6 Broad-front Homestead should read as an eave-front house with a strong horizontal frontage but restrained rear depth.
6. The 10×12 Burgage courtyard compound should use an eave-front main roof and a visibly stronger secondary side range. Depending on deterministic seed it should read as L or U shaped rather than one large block.
7. Compare several fresh plots/IDs: front boundaries should vary between open frontage, post pair, hedge, short fence and stronger gate treatment. The street should no longer repeat one fence vocabulary.
8. For plots with a side passage, verify the road-facing entrance has gateway posts/lintel plus small barrel/log service clutter and the worn lane remains visible toward the rear.
9. Inspect rear yards from Overview and Street view. Service structures should visibly vary between shed, lean-to, coop, workshop and covered storage instead of repeating the same gabled box.
10. Gable-front cottage variants should sometimes show a small loft window above the main façade.
11. Check that the strongest U-courtyard variant does not visibly cross the plot boundary or collapse the central yard.
12. Save → reload → Load. The same plot IDs must regenerate the exact same roof orientation, frontage style, rear structure and courtyard mode without new save fields.
13. Enable navigation paths and confirm all M3.9.2 additions remain visual-only.
14. Run state integrity and compare Draws / triangles / Render submission CPU with M3.9.1.

### Architectural boundary

M3.9.2 changes `render/ResidentialPresentation.ts`, `SceneRenderer.ts`, `Hud.ts`, tests and docs only. It does **not** modify `Game.ts`, `TownPlanning.ts`, `WorldState.ts`, `SaveLoad.ts`, `Buildings.ts`, `Simulation.ts`, `Jobs.ts` or `Navigation.ts`. Roof orientation, frontage boundaries, service structures and courtyard wings are renderer-derived and do not change persisted building positions, collision, housing or movement.

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

# M1 verification and handoff

## Automated checks

Verified on 2026-09-26 with Node 24.19.0 and npm 11.17.0 on Windows.

- Baseline: npm install, npm run typecheck and npm run build passed; browser rendered the original foundation.
- Final: npm run typecheck, npm run build and npm test pass.
- Install audit: zero reported vulnerabilities at installation.
- No runtime or development dependency was added; package-lock.json now records the pinned installation.
- Browser testing used the connected Codex browser because agent-browser was not installed.

Eight renderer-independent regression tests cover:

1. Ten settlers, zero starting inventory, three houses and one additional stockpile; both resources gathered/deposited; 70 wood delivered; ten housed; every task phase observed; conservation and route budget checked.
2. Save/load during gathering work, gathering with cargo, delivery before pickup, delivery with cargo, and construction; resumed jobs complete without resource loss/duplication.
3. Two competing sites wait for resources and never double-reserve wood.
4. Full storage stops new gathering; constructing another stockpile restores throughput.
5. Invalid footprint/actor/resource/bounds/entrance placement and a route-closing enclosure are rejected.
6. Placement invalidates in-flight routes and workers continue around the new obstacle.
7. Exhausted resources produce idle workers without invalid jobs.
8. Malformed/incompatible saves are rejected without changing the original state.

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

- One manual browser-local save slot; no migration, automatic backup, autosave or file export.
- Six initial / ten maximum settlers; 80 building cap; fixed 47×47 grid.
- Finite resources and shared storage capacity. No regrowth, consumption, hunger, immigration, dismantling or blueprint cancellation.
- One constructor per site, one gatherer per node; fixed job priorities and simple stock balance.
- Resource vegetation is traversable, NPCs can overlap, and player collision uses occupied grid cells rather than a character physics capsule.
- Elevation/follow camera foundation only; no camera-obstacle collision, combat or character animation.
- Global BFS and linear searches are deliberately bounded M1 choices. Do not claim support for hundreds of workers without profiling.
- Instance transforms rebuild per frame; HUD/path overlays update at 5 Hz. Profile before introducing incremental rendering or spatial indexes.
- Vite's >500 kB minified chunk warning remains (about 578 kB / 148 kB gzip in this pass). It also occurred in the baseline and is mostly the Three.js runtime.
- No M2 work has started.

## Highest-value follow-ups before M2

1. Playtest placement, selection and camera ergonomics on normal desktop and smaller displays; tune movement/task pacing from feedback.
2. Add blueprint cancellation with tested release/refund rules for reserved, carried and delivered materials.
3. Add gathering priorities or stock targets so the player can control storage pressure.
4. Add save export/import and a backup slot with corruption/recovery tests.
5. Add a repeatable M1 performance capture with frame/tick percentiles and long-run logistics checks.

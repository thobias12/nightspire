# Nightspire

A grounded medieval dark-fantasy settlement builder. The long-term direction is to grow an organic, lived-in city by day, personally defend it at night, and develop a distinctly adult sensual fantasy society as the settlement matures.

**Current playable milestone: M3.8.1 — Roads & Residential Plot Foundation.** The full M3.7 economy and M3.8.0 visual work remain intact, but town shape is now player-authored: draw persistent dirt roads, then drag road-front Residential Plots whose normal House blueprint supplies the existing construction/housing simulation while the persistent plot controls road-facing modular architecture, fences and backyard identity. Roads do not affect pathfinding/logistics yet; those hooks remain deferred until the M4 architecture is integrated. See [the direction pivot](docs/DIRECTION_PIVOT.md).

**M4 scale work on this branch:** repeatable browser benchmarks and measured scheduling improvements, based on the M3.8.1 head. Gameplay and its ten-settler cap are unchanged. See [the scale report](docs/M4_SCALE_PROOF.md).

**Browser playtest:** https://thobias12.github.io/nightspire/ (published playtest; this M4 branch has not been deployed).

**Direction pivot:** [Grounded medieval world, organic settlement and mature-city roadmap](docs/DIRECTION_PIVOT.md)

## Play locally

Use Node.js 22.12+ (verified here with Node 24.19.0) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. A camp begins with six settlers, an empty completed stockpile, 40 trees, and 20 food bushes. Workers automatically gather, carry, and deposit wood and food. No starting materials are needed.

1. Watch stockpile counts rise. Click a settler or resource to inspect its task or remaining yield.
2. Press **0 / Road** and click-drag your own dirt road. Road strokes are persisted and rendered as the settlement skeleton, but deliberately do not change movement/path cost yet.
3. Press **1 / Residential Plot**, start the drag close to a road, then drag diagonally along the desired frontage and backward into the lot. Current limits are 4–10m frontage and 5–13m depth. The resulting House blueprint still costs 20 wood and provides four beds, while the plot determines road-facing visual orientation, modular frontage and backyard.
4. Settlers reserve available wood, collect it from a stockpile, carry it to the plotted House site, then perform normal construction work. Cancelling or demolishing that House removes its attached plot.
5. Use hotkeys **2–9** for the remaining buildings. Press **R** to rotate conventional blueprints, hold **Shift** after a click to keep placing the same building, and **drag Wooden Wall** from one grid cell to another for an atomic straight wall line. Place a Wooden Gate directly on an existing wall segment to convert it while retaining the wall's delivered timber.
6. Inspect settlers to see **Food / Housing / Safety / Recreation**, derived Happiness, morale band and current work-rate modifier. Thriving settlers receive a modest productivity bonus; low Happiness slows gathering/repairs/construction, while severe misery or hunger limits settlers to Food gathering and emergency repairs. During Dusk/Dawn, Tavern/Campfire recreation therefore feeds back into next-day productivity instead of being only an attraction score.
7. Build a **Blacksmith** with hotkey **9**. Workers gather Iron Ore from the perimeter deposits, stage it through stockpile storage, supply the Blacksmith, forge **3 Ore → 1 Tool every 18 seconds** during Day, then haul Tools back to stockpiles. One stored Tool covers two settlers; full coverage adds +10% to hands-on work.
8. Build enough Houses to leave at least one spare bed, keep at least **2 stored Food per settler**, maintain **65% Happiness** and **55% Safety**, and keep the latest raid cleared. Hold those conditions across two Day checks to attract one immigrant. The newcomer enters from the map edge and cannot work until reaching the camp.
9. Open **QA & performance** and jump to **Night**. Wave 1 contains 20 raiders. Each later wave adds four attackers until the 40-raider cap. Raiders batter walls/gates open, then retarget exposed settlement buildings. Guards intercept nearby raiders; the player can still fight with **Space**.
10. After Night, jump/wait to **Day**. Damaged structures generate high-priority repair jobs: settlers physically carry timber from storage and restore 10 HP per wood. The QA **Damage selected structure** button can test this without waiting for a raid.
11. Select an unfinished blueprint to cancel it. Reserved, delivered, and in-transit materials are conserved; cancellation refuses if storage cannot safely accept the refund.
12. **Save**, reload the page, then **Load**. Active jobs, cargo, stock targets, resource depletion, unfinished construction, housing, player position, and time resume.
13. Save tools also provide a rotating backup slot plus validated JSON export/import.

Save/load uses one primary localStorage slot plus one backup slot in this browser/origin. Each successful Save rotates the previous primary into backup, and JSON export/import supports manual transfer and recovery. During active development, **fresh runs are the expected workflow after milestone changes**; backward compatibility with older milestone saves is not a requirement unless explicitly requested. There is still no autosave. Camera/debug preferences are session-only.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Pan in settlement mode; move the cyan player in follow mode |
| Q / E | Rotate camera |
| Space | Player melee attack against the nearest raider in range |
| Mouse wheel | Zoom settlement camera |
| Follow player / Settlement camera | Switch between elevated and close following views |
| V / Street view | Toggle the lower cinematic settlement camera |
| Center camp | Restore the initial settlement camera |
| Click | Inspect, or place the selected conventional blueprint; hold Shift to remain in build mode |
| 0 / Road | Click-drag a persistent player road |
| 1 / Residential Plot | Start near a road and drag frontage + backyard depth in one gesture |
| 2–9 | Select Stockpile, Campfire, Brewery, Tavern, Guard Post, Wall, Gate, Blacksmith |
| R | Rotate the active conventional blueprint / façade orientation |
| Drag with Wooden Wall selected | Plan a straight wall line; release to place the whole valid line |
| Esc / Inspect | Leave build mode |
| QA controls | Pause/resume, 1×/2×/4×, jump Day/Dusk/Night/Dawn, Next raid, test immigration now, force needs to 25%/100%, add selected building input, damage selected structure, set hour, stock targets, add resources, direct QA spawn, paths, integrity audit, backup/export/import |

Time drives work, needs, production and population growth. Normal jobs and Brewery production run during Day (06:00–18:00). Individual Happiness now applies a deterministic work-rate modifier to hands-on gathering, repair and construction work; severe misery or Food below 15% refuses nonessential new work while allowing Food gathering and emergency repairs. At each new Day the population system evaluates spare beds, unreserved stored Food, Happiness, Safety, raid state and the current 10-settler cap. Two consecutive qualifying Days admit one immigrant, then the streak resets. At Night the existing M2 combat/fortification loop remains unchanged.

## Verification

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

The tests compile the existing TypeScript with the existing compiler and use Node's built-in test runner; no test dependency was added. The 110 tests cover the settlement/economy/combat foundation, M3.8 presentation and town planning, plus deterministic scale scenarios, reservation accounting for all five resources, same-tick service changes and preserved Happiness restrictions.

Browser verification covered gathering and visible cargo, placing three houses and a stockpile, 70 wood delivered, ten settlers housed, pause/speed/time/resource/spawn controls, navigation overlays, inspection, player movement/collision, and page-reload save recovery. See [QA and performance notes](docs/QA.md) for details and limitations.

## Run the scale benchmark

Build and start the production preview, then open `/?benchmark=1` on its local URL, or use **Open M4 scale benchmark** in QA & performance. **Run 10–500 ladder** runs Day Logistics and Dusk Services for 10, 100, 250 and 500 settlers. Each case runs two simulated seconds of warmup and eighteen of measurement at 1×. Keep the tab active and viewport unchanged; hidden runs abort. Export the JSON after completion. Idle and 1000 presets are available individually.

The isolated QA world cannot write gameplay saves. Reports include build identity, preset version, state hashes, simulation stages, render submission CPU, HUD CPU, frame intervals/FPS, jobs/entities, draw calls/triangles, route requests/solves/queue delay, instance overflow and dropped simulation time. Current M3.8.1 visuals, roads/plots, Happiness and both production chains run in these scenarios. See [method, evidence and limitations](docs/M4_SCALE_PROOF.md).

## Implementation

- TypeScript, Three.js, Vite; original pinned versions retained.
- Plain serializable entity records with stable IDs, independent of Three.js.
- One fixed 20 Hz simulation; shared job decisions at 2 Hz.
- A shared navigation queue solves at most two grid paths per simulation tick across both settlers and raiders. Friendly and hostile blocker sets differ: completed gates are friendly-passable but hostile-blocking; destroyed fortifications reopen topology.
- Data definitions own current resources, building costs/capacities/work, and job priorities.
- Rendering uses shared instanced batches for workers, cargo, resource nodes, building shells, roofs, trim, props, scaffolds, debris, glow, smoke and terrain accents. Night lighting uses one moon light and one shared settlement glow rather than per-building lights.
- No React, external physics, ECS framework, or new runtime dependencies.

```text
src/game/
  core/         lifecycle, fixed-step orchestration, keyboard/camera input
  benchmark/    isolated seeded scale scenarios, measurements and browser runner
  data/         M1 building/resource/job definitions
  simulation/   entities, job assignment/execution, placement, navigation, save validation
  render/       Three.js ownership and state presentation
  ui/           controls, inspector and QA readouts
tests/          renderer-independent simulation regression tests
docs/           design, architecture, milestones, decisions and QA
```

## Scope and limitations

This is a small playable procedural art-direction prototype: six starting / ten maximum settlers, a fixed 47×47 grid, houses/stockpiles/guard posts/Campfires/Breweries/Taverns/wooden fortifications, deterministic raids scaling from 20 to 40 attackers, four settler needs, generic services, physical Food → Ale → Tavern and Ore → Tools production chains, deterministic population attraction from 6 → 10, Happiness-driven productivity, dedicated build-mode UX, and a first settlement atmosphere/readability pass. Gate open/close control is still deferred. Core buildings cannot be fully destroyed in M2.3, permanent settler death is deferred, and there are no equipment stats, loot, towers, siege weapons, or final combat animations/VFX. Workers may overlap one another and resource vegetation does not block movement.

See [DIRECTION PIVOT](docs/DIRECTION_PIVOT.md), [DECISIONS](docs/DECISIONS.md), [MILESTONES](docs/MILESTONES.md), and [PERFORMANCE_BUDGETS](docs/PERFORMANCE_BUDGETS.md). No claim is made about hundreds of NPCs; larger populations still require profiling. The production bundle retains Vite's >500 kB chunk warning, primarily from Three.js.

M3.5 is intentionally presentation-only. M3.6 adds a small derived morale layer with no new persisted state. M3.7 reuses generic production and supply jobs for Ore → Tools. M3.8.1 adds persisted roads and residential plots; roads remain visual-only for movement. M4 adds temporary reservation indexes and shared service scheduling without changing simulation outcomes or the shared two-paths-per-tick budget. Larger-population gameplay support is not established by these short synthetic benchmarks.

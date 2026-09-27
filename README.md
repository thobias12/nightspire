# Nightspire

A grounded medieval dark-fantasy settlement builder. The long-term direction is to grow an organic, lived-in city by day, personally defend it at night, and develop a distinctly adult sensual fantasy society as the settlement matures.

**Current playable milestone: M3.11.0 — Professions & Workplace Economy.** The M3.10.2 curved-road planner and M4 scale integration remain intact, while Brewery and Blacksmith production now depend on an explicit workforce. Each has two worker slots; assigned settlers finish any current task, leave the general labor pool, physically report to the workplace during Day, and production scales from 0% with nobody present to 100% with both slots staffed. General workers visibly read as Laborers, Woodcutters, Foragers, Miners, Haulers or Builders based on their current work, while Guards remain separate. Workplace assignments persist through save/load and can be managed directly from the building or settler inspector. Normal gameplay remains capped at 10 settlers, and roads still do not change navigation cost or movement speed. See [the workforce note](docs/M311_WORKFORCE.md), [the M4 integration note](docs/M4_INTEGRATION.md) and [the direction pivot](docs/DIRECTION_PIVOT.md).

**Browser playtest:** https://thobias12.github.io/nightspire/

**Direction pivot:** [Grounded medieval world, organic settlement and mature-city roadmap](docs/DIRECTION_PIVOT.md)

## Play locally

Use Node.js 22.12+ (verified here with Node 24.19.0) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. A camp begins with six settlers, an empty completed stockpile, 40 trees, and 20 food bushes. Workers automatically gather, carry, and deposit wood and food. No starting materials are needed.

1. Watch stockpile counts rise. Click a settler or resource to inspect its task or remaining yield.
2. Press **0 / Road** and click to place the first road point. Keep clicking to shape the route while the mouse shows a live curved preview; **double-click or Enter** finishes it. **RMB** cancels the active stroke, **Backspace** removes the last committed point, **G** toggles 1m Grid Snap, and holding **Shift** temporarily constrains the next segment to 0°/45°/90°. **F / Road Snap** independently controls magnetic endpoint/centerline joins. **C** cycles Straight/Smooth/Curved and **[ / ]** changes Path/Lane/Main-road width. Snapped intermediate control points also insert persisted junction nodes into the host road.
3. Press **1 / Residential Plot**, start close to a road, then drag diagonally along the desired frontage and backward into the lot. With Grid Snap on, width/depth round to whole metres, the frontage preview shows metre divisions, and starting/ending near an existing lot edge snaps flush to that neighbor. Current limits are 4–10m frontage and 5–13m depth. The resulting House blueprint still costs 20 wood and provides four beds, while the **shape and frontage character** of the lot now matter visually: narrow/deep plots become gable-front long burgage cottages, broad plots can turn their eaves toward the street, front boundaries vary between open/hedged/fenced/gated treatments, and wide/deep plots build stronger L/U-shaped courtyard compositions.
4. Settlers reserve available wood, collect it from a stockpile, carry it to the plotted House site, then perform normal construction work. Cancelling or demolishing that House removes its attached plot.
5. Use hotkeys **2–9** for the remaining buildings. **Road Snap is ON by default**: move a conventional building near a road and its ghost magnetically locks to a tighter roadside grid cell while a larger frontage marker clearly shows which edge will face the street, including diagonal streets. Press **F** to disable Road Snap and use normal grid placement plus **R** rotation. Walls/Gates/Campfire remain manual/grid-oriented.
6. Inspect settlers to see **Food / Housing / Safety / Recreation**, derived Happiness, morale band and current work-rate modifier. Thriving settlers receive a modest productivity bonus; low Happiness slows gathering/repairs/construction, while severe misery or hunger limits settlers to Food gathering and emergency repairs. During Dusk/Dawn, Tavern/Campfire recreation therefore feeds back into next-day productivity instead of being only an attraction score.
7. Build a **Brewery** or **Blacksmith**, then inspect it and use **Assign laborer** to staff its workplace slots. Brewery and Blacksmith each have two dedicated slots. One present worker runs the workplace at 50%; two present workers run it at full speed. Assigned workers finish any current hauling/building task before reporting to work, and they return to normal off-hours recreation/shelter behavior after Day.
8. The **Blacksmith** still forges **3 Ore → 1 Tool every 18 seconds at full staffing**. General laborers gather Iron Ore, stage it through stockpile storage and haul inputs/outputs; one stored Tool covers two settlers and full coverage adds +10% to hands-on work.
9. Build enough Houses to leave at least one spare bed, keep at least **2 stored Food per settler**, maintain **65% Happiness** and **55% Safety**, and keep the latest raid cleared. Hold those conditions across two Day checks to attract one immigrant. The newcomer enters from the map edge and cannot work until reaching the camp.
10. Open **QA & performance** and jump to **Night**. Wave 1 contains 20 raiders. Each later wave adds four attackers until the 40-raider cap. Raiders batter walls/gates open, then retarget exposed settlement buildings. Guards intercept nearby raiders; the player can still fight with **Space**.
11. After Night, jump/wait to **Day**. Damaged structures generate high-priority repair jobs: settlers physically carry timber from storage and restore 10 HP per wood. The QA **Damage selected structure** button can test this without waiting for a raid.
12. Select an unfinished blueprint to cancel it. Reserved, delivered, and in-transit materials are conserved; cancellation refuses if storage cannot safely accept the refund.
13. **Save**, reload the page, then **Load**. Active jobs, cargo, stock targets, resource depletion, unfinished construction, housing, player position, and time resume.
14. Save tools also provide a rotating backup slot plus validated JSON export/import.

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
| 0 / Road | Start point-based road placement; click control points, double-click/Enter to finish |
| 1 / Residential Plot | Start near a road and drag frontage + backyard depth in one gesture |
| G / Grid Snap | Toggle 1m road control-point snapping + whole-metre plot dimensions |
| Shift while drawing road | Temporarily constrain the next segment to 0°/45°/90° |
| C while drawing road | Cycle Straight / Smooth / Curved sampling |
| [ / ] while drawing road | Change Path / Lane / Main-road width |
| Backspace while drawing road | Remove the last committed road control point |
| RMB while drawing road | Cancel the active road stroke; press again / Esc to leave the tool |
| F / Road Snap | Toggle road endpoint/centerline joins and conventional-building road alignment |
| 2–9 | Select Stockpile, Campfire, Brewery, Tavern, Guard Post, Wall, Gate, Blacksmith |
| R | Rotate the active conventional blueprint when Road Snap is not controlling its frontage |
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

The tests compile the existing TypeScript with the existing compiler and use Node's built-in test runner; no test dependency was added. The integrated suite now contains **130 passing tests**, covering the settlement/economy/combat foundation, current road/residential planning, deterministic scale presets, reservation accounting, same-tick service invalidation and the unchanged 10-settler gameplay cap.

Browser verification covered gathering and visible cargo, placing three houses and a stockpile, 70 wood delivered, ten settlers housed, pause/speed/time/resource/spawn controls, navigation overlays, inspection, player movement/collision, and page-reload save recovery. See [QA and performance notes](docs/QA.md) for details and limitations.

## Implementation

- TypeScript, Three.js, Vite; original pinned versions retained.
- Plain serializable entity records with stable IDs, independent of Three.js.
- One fixed 20 Hz simulation; shared job decisions at 2 Hz.
- A shared navigation queue solves at most two grid paths per simulation tick across both settlers and raiders. Friendly and hostile blocker sets differ: completed gates are friendly-passable but hostile-blocking; destroyed fortifications reopen topology.
- Data definitions own current resources, building costs/capacities/work, and job priorities.
- Rendering uses shared instanced batches for workers, adult silhouettes, cargo, resource nodes, timber/plaster/stone modules, gable roofs/eaves/braces, carts/yard props, residential compound outbuildings, fortifications, scaffolds, debris, glow, smoke, road-edge/mud/stone dressing and terrain/forest accents. Night lighting uses one moon light and one shared settlement glow rather than per-building lights.
- No React, external physics, ECS framework, or new runtime dependencies.

```text
src/game/
  core/         lifecycle, fixed-step orchestration, keyboard/camera input
  benchmark/    isolated seeded scale scenarios, measurements and browser runner
  data/         building/resource/job definitions
  simulation/   entities, job assignment/execution, placement, navigation, save validation
  render/       Three.js ownership and state presentation
  ui/           controls, inspector and QA readouts
tests/          renderer-independent simulation regression tests
docs/           design, architecture, milestones, decisions and QA
```

## Scope and limitations

This is a small playable procedural art-direction prototype: six starting / ten maximum settlers, a fixed 47×47 grid, houses/stockpiles/guard posts/Campfires/Breweries/Taverns/wooden fortifications, deterministic raids scaling from 20 to 40 attackers, four settler needs, generic services, physical Food → Ale → Tavern and Ore → Tools production chains, deterministic population attraction from 6 → 10, Happiness-driven productivity, dedicated build-mode UX, and a first settlement atmosphere/readability pass. Gate open/close control is still deferred. Core buildings cannot be fully destroyed in M2.3, permanent settler death is deferred, and there are no equipment stats, loot, towers, siege weapons, or final combat animations/VFX. Workers may overlap one another and resource vegetation does not block movement.

See [DIRECTION PIVOT](docs/DIRECTION_PIVOT.md), [DECISIONS](docs/DECISIONS.md), [MILESTONES](docs/MILESTONES.md), and [PERFORMANCE_BUDGETS](docs/PERFORMANCE_BUDGETS.md). No claim is made about hundreds of NPCs; larger populations still require profiling. The production bundle retains Vite's >500 kB chunk warning, primarily from Three.js.

M3.5 is intentionally presentation-only. M3.6 adds a small derived morale layer with no new persisted state. M3.7 reuses the existing generic resource, production, stockpile and supply-job architecture for Ore → Tools. M3.8.1–M3.9.2.1 establish persisted roads/plots and the organic residential presentation layer. M3.10.0 improves terrain/road dressing; M3.10.1 introduces sampled multi-point curved roads; M3.10.2 separates 1m Grid Snap, temporary Shift angle constraint and Road Snap while improving cancel/undo/junction behavior. The M4 integration on this branch adds measured reservation/service-scheduling optimizations and a deterministic browser benchmark harness while preserving the 10-settler gameplay cap. Navigation still uses the shared two-solves-per-tick queue, and roads remain visual-only for movement; large synchronized crowds can therefore still wait on route throughput.

# Nightspire

A grounded medieval dark-fantasy settlement builder. The long-term direction is to grow an organic, lived-in city by day, personally defend it at night, and develop a distinctly adult sensual fantasy society as the settlement matures.

**Current playable milestone: M3.7 — Blacksmith & Tools.** The M3.6 morale loop remains intact while Iron Ore and Tools extend the physical production economy: workers mine finite Ore deposits, haul Ore to a Blacksmith, forge Tools during Day, and return finished Tools to stockpile storage. Stockpiled Tools provide up to a +10% hands-on work bonus on top of Happiness. See [the design](docs/GAME_DESIGN.md) for future direction.

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
2. Select **House**, then click clear ground. The preview is green on a valid site and red on a blocked one. A blueprint can wait for materials.
3. Settlers reserve available wood, collect it from a stockpile, carry it to the site, then perform construction work. One house costs 20 wood and provides four beds.
4. Use the categorized build bar or hotkeys **1–8**. Press **R** to rotate the current blueprint, hold **Shift** after a click to keep placing the same building, and **drag Wooden Wall** from one grid cell to another for an atomic straight wall line. Place a Wooden Gate directly on an existing wall segment to convert it while retaining the wall's delivered timber.
5. Inspect settlers to see **Food / Housing / Safety / Recreation**, derived Happiness, morale band and current work-rate modifier. Thriving settlers receive a modest productivity bonus; low Happiness slows gathering/repairs/construction, while severe misery or hunger limits settlers to Food gathering and emergency repairs. During Dusk/Dawn, Tavern/Campfire recreation therefore feeds back into next-day productivity instead of being only an attraction score.
6. Build a **Blacksmith** with hotkey **9**. Workers gather Iron Ore from the perimeter deposits, stage it through stockpile storage, supply the Blacksmith, forge **3 Ore → 1 Tool every 18 seconds** during Day, then haul Tools back to stockpiles. One stored Tool covers two settlers; full coverage adds +10% to hands-on work.
7. Build enough Houses to leave at least one spare bed, keep at least **2 stored Food per settler**, maintain **65% Happiness** and **55% Safety**, and keep the latest raid cleared. Hold those conditions across two Day checks to attract one immigrant. The newcomer enters from the map edge and cannot work until reaching the camp.
8. Open **QA & performance** and jump to **Night**. Wave 1 contains 20 raiders. Each later wave adds four attackers until the 40-raider cap. Raiders batter walls/gates open, then retarget exposed settlement buildings. Guards intercept nearby raiders; the player can still fight with **Space**.
9. After Night, jump/wait to **Day**. Damaged structures generate high-priority repair jobs: settlers physically carry timber from storage and restore 10 HP per wood. The QA **Damage selected structure** button can test this without waiting for a raid.
10. Select an unfinished blueprint to cancel it. Reserved, delivered, and in-transit materials are conserved; cancellation refuses if storage cannot safely accept the refund.
11. **Save**, reload the page, then **Load**. Active jobs, cargo, stock targets, resource depletion, unfinished construction, housing, player position, and time resume.
12. Save tools also provide a rotating backup slot plus validated JSON export/import.

Save/load uses one primary localStorage slot plus one backup slot in this browser/origin. Each successful Save rotates the previous primary into backup, and JSON export/import supports manual transfer and recovery. During active development, **fresh runs are the expected workflow after milestone changes**; backward compatibility with older milestone saves is not a requirement unless explicitly requested. There is still no autosave. Camera/debug preferences are session-only.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Pan in settlement mode; move the cyan player in follow mode |
| Q / E | Rotate camera |
| Space | Player melee attack against the nearest raider in range |
| Mouse wheel | Zoom settlement camera |
| Follow player / Settlement camera | Switch between elevated and close following views |
| Center camp | Restore the initial settlement camera |
| Click | Inspect, or place the selected blueprint; hold Shift to remain in build mode |
| 1–8 | Select House, Stockpile, Campfire, Brewery, Tavern, Guard Post, Wall, Gate |
| R | Rotate the active blueprint / façade orientation |
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

The tests compile the existing TypeScript with the existing compiler and use Node's built-in test runner; no test dependency was added. Eighty-four regression tests now cover ten-settler construction, physical resource conservation, competing reservations, storage pressure, blueprint cancellation/refunds, stock targets, blocked-route backoff/recovery, needs/services/production/population behavior, M3.5 presentation-state derivation, and M3.6 happiness productivity/refusal behavior.

Browser verification covered gathering and visible cargo, placing three houses and a stockpile, 70 wood delivered, ten settlers housed, pause/speed/time/resource/spawn controls, navigation overlays, inspection, player movement/collision, and page-reload save recovery. See [QA and performance notes](docs/QA.md) for details and limitations.

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
  data/         M1 building/resource/job definitions
  simulation/   entities, job assignment/execution, placement, navigation, save validation
  render/       Three.js ownership and state presentation
  ui/           controls, inspector and QA readouts
tests/          renderer-independent simulation regression tests
docs/           design, architecture, milestones, decisions and QA
```

## Scope and limitations

This is a small playable stylized-graybox foundation: six starting / ten maximum settlers, a fixed 47×47 grid, houses/stockpiles/guard posts/Campfires/Breweries/Taverns/wooden fortifications, deterministic raids scaling from 20 to 40 attackers, four settler needs, generic services, physical Food → Ale → Tavern and Ore → Tools production chains, deterministic population attraction from 6 → 10, Happiness-driven productivity, dedicated build-mode UX, and a first settlement atmosphere/readability pass. Gate open/close control is still deferred. Core buildings cannot be fully destroyed in M2.3, permanent settler death is deferred, and there are no equipment stats, loot, towers, siege weapons, or final combat animations/VFX. Workers may overlap one another and resource vegetation does not block movement.

See [DIRECTION PIVOT](docs/DIRECTION_PIVOT.md), [DECISIONS](docs/DECISIONS.md), [MILESTONES](docs/MILESTONES.md), and [PERFORMANCE_BUDGETS](docs/PERFORMANCE_BUDGETS.md). No claim is made about hundreds of NPCs; larger populations still require profiling. The production bundle retains Vite's >500 kB chunk warning, primarily from Three.js.

M3.5 is intentionally presentation-only. M3.6 adds a small derived morale layer with no new persisted state. M3.7 reuses the existing generic resource, production, stockpile and supply-job architecture for Ore → Tools; the only additional fixed-step hook is a cached per-step Tool coverage multiplier applied to hands-on work. Navigation.ts and the path budget remain untouched.

# Nightspire

A medieval dark-fantasy settlement builder. The long-term direction is to build a living city by day and personally defend it at night.

**Current playable milestone: M3.0 — Settler Needs foundation.** The complete M2 day/night defense loop remains intact. Settlers now track food, housing, safety, recreation and derived happiness; food is consumed from real stockpiles and a buildable Campfire provides the first capacity-limited recreation service. See [the design](docs/GAME_DESIGN.md) for future direction.

**Browser playtest:** https://thobias12.github.io/nightspire/

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
4. Build more houses and a **Stockpile** (10 wood, 400 shared wood/food capacity), then add a **Guard Post** (25 wood, two guard slots), a **Campfire** (10 wood, six recreation slots), **Wooden Walls** (5 wood, 120 HP), and at least one **Wooden Gate** (15 wood, 220 HP).
5. Inspect settlers to see **Food / Housing / Safety / Recreation** plus derived Happiness. At 06:00 each due settler consumes one real food from stockpiles; shortages reduce Food satisfaction. Workers assigned a Campfire slot use it at Dusk/Dawn to recover Recreation.
6. Open **QA & performance** and jump to **Night**. Wave 1 contains 20 raiders. Each later wave adds four attackers until the 40-raider cap. Raiders batter walls/gates open, then retarget exposed settlement buildings. Guards intercept nearby raiders; the player can still fight with **Space**.
7. After Night, jump/wait to **Day**. Damaged structures generate high-priority repair jobs: settlers physically carry timber from storage and restore 10 HP per wood. The QA **Damage selected structure** button can test this without waiting for a raid.
8. Select an unfinished blueprint to cancel it. Reserved, delivered, and in-transit materials are conserved; cancellation refuses if storage cannot safely accept the refund.
9. **Save**, reload the page, then **Load**. Active jobs, cargo, stock targets, resource depletion, unfinished construction, housing, player position, and time resume.
10. Save tools also provide a rotating backup slot plus validated JSON export/import.

Save/load uses one versioned primary localStorage slot plus one backup slot in this browser/origin. Each successful Save rotates the previous primary into backup. JSON export/import supports manual transfer and recovery. Existing pre-M1.1 version-1 saves migrate default stock targets automatically. There is still no autosave or general future-version migration. Camera/debug preferences are session-only.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Pan in settlement mode; move the cyan player in follow mode |
| Q / E | Rotate camera |
| Space | Player melee attack against the nearest raider in range |
| Mouse wheel | Zoom settlement camera |
| Follow player / Settlement camera | Switch between elevated and close following views |
| Center camp | Restore the initial settlement camera |
| Click | Inspect a settler/raider/resource/building, or place the selected blueprint |
| Esc / Inspect | Cancel placement |
| QA controls | Pause/resume, 1×/2×/4×, jump Day/Dusk/Night/Dawn, Next raid, force needs to 25%/100%, damage selected structure, set hour, stock targets, add resources, spawn settler, paths, integrity audit, backup/export/import |

Time drives both work and needs. Normal jobs run during Day (06:00–18:00); at 06:00 a daily meal consumes one food per due settler. Housing trends toward the real bed assignment, Safety responds to raids/guards/fortifications/damage, and Recreation decays unless off-hours Campfire capacity is available. At Night the existing M2 combat/fortification loop remains unchanged.

## Verification

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

The tests compile the existing TypeScript with the existing compiler and use Node's built-in test runner; no test dependency was added. Forty-nine regression tests now cover ten-settler construction, physical resource conservation, competing reservations, storage pressure, blueprint cancellation/refunds, stock targets, blocked-route backoff/recovery, old-save migration, invalid saves, and save/load during every task phase.

Browser verification covered gathering and visible cargo, placing three houses and a stockpile, 70 wood delivered, ten settlers housed, pause/speed/time/resource/spawn controls, navigation overlays, inspection, player movement/collision, and page-reload save recovery. See [QA and performance notes](docs/QA.md) for details and limitations.

## Implementation

- TypeScript, Three.js, Vite; original pinned versions retained.
- Plain serializable entity records with stable IDs, independent of Three.js.
- One fixed 20 Hz simulation; shared job decisions at 2 Hz.
- A shared navigation queue solves at most two grid paths per simulation tick across both settlers and raiders. Friendly and hostile blocker sets differ: completed gates are friendly-passable but hostile-blocking; destroyed fortifications reopen topology.
- Data definitions own current resources, building costs/capacities/work, and job priorities.
- Rendering uses instanced graybox workers, cargo, resource nodes, and building parts with shared geometry/materials.
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

This is a small playable graybox foundation: ten settlers maximum, a fixed 47×47 grid, houses/stockpiles/guard posts/Campfires/wooden fortifications, deterministic raids scaling from 20 to 40 attackers, and four persisted settler needs. Walls are placed one segment per click; there is no drag placement or gate open/close control yet. Core buildings cannot be fully destroyed in M2.3, permanent settler death is deferred, and there are no equipment stats, loot, towers, siege weapons, or final combat animations/VFX. Workers may overlap one another and resource vegetation does not block movement.

See [DECISIONS](docs/DECISIONS.md), [MILESTONES](docs/MILESTONES.md), and [PERFORMANCE_BUDGETS](docs/PERFORMANCE_BUDGETS.md). No claim is made about hundreds of NPCs; larger populations still require profiling. The production bundle retains Vite's >500 kB chunk warning, primarily from Three.js.

M3.0 establishes the needs model only. Immigration, Tavern service, production chains and happiness consequences remain intentionally deferred until the four-needs loop is playtested.

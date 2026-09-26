# Nightspire

A medieval dark-fantasy settlement builder. The long-term direction is to build a living city by day and personally defend it at night.

**Current playable milestone: M2.0 — First Night foundation.** M1/M1.1 remain intact; dusk/night schedules and guard posts are implemented, while enemies, raids and combat are still intentionally untouched. See [the design](docs/GAME_DESIGN.md) for future direction.

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
4. Build more houses and a **Stockpile** (10 wood, 400 shared wood/food capacity), then add a **Guard Post** (25 wood, two guard slots). Completed buildings immediately provide housing, storage, or guard capacity.
5. Select a settler and assign **Guard** duty. Guards still work by day, but report to available Guard Posts at dusk/night while civilians seek shelter.
6. Open **QA & performance** to jump directly to Day, Dusk, Night, or Dawn and test the schedule transitions.
7. Select an unfinished blueprint to cancel it. Reserved, delivered, and in-transit materials are conserved; cancellation refuses if storage cannot safely accept the refund.
8. **Save**, reload the page, then **Load**. Active jobs, cargo, stock targets, resource depletion, unfinished construction, housing, player position, and time resume.
9. Save tools also provide a rotating backup slot plus validated JSON export/import.

Save/load uses one versioned primary localStorage slot plus one backup slot in this browser/origin. Each successful Save rotates the previous primary into backup. JSON export/import supports manual transfer and recovery. Existing pre-M1.1 version-1 saves migrate default stock targets automatically. There is still no autosave or general future-version migration. Camera/debug preferences are session-only.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Pan in settlement mode; move the cyan player in follow mode |
| Q / E | Rotate camera |
| Mouse wheel | Zoom settlement camera |
| Follow player / Settlement camera | Switch between elevated and close following views |
| Center camp | Restore the initial settlement camera |
| Click | Inspect a worker/resource/building, or place the selected blueprint |
| Esc / Inspect | Cancel placement |
| QA controls | Pause/resume, 1×/2×/4×, jump Day/Dusk/Night/Dawn, set hour, stock targets, add resources, spawn settler, paths, integrity audit, backup/export/import |

Time now drives settlement behavior: normal work is assigned only during Day (06:00–18:00); Dusk, Night and Dawn use shelter/guard schedules. Food is still gathered and stored but is not consumed yet. Enemies and combat begin in later M2 slices.

## Verification

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

The tests compile the existing TypeScript with the existing compiler and use Node's built-in test runner; no test dependency was added. Twenty regression tests now cover ten-settler construction, physical resource conservation, competing reservations, storage pressure, blueprint cancellation/refunds, stock targets, blocked-route backoff/recovery, old-save migration, invalid saves, and save/load during every task phase.

Browser verification covered gathering and visible cargo, placing three houses and a stockpile, 70 wood delivered, ten settlers housed, pause/speed/time/resource/spawn controls, navigation overlays, inspection, player movement/collision, and page-reload save recovery. See [QA and performance notes](docs/QA.md) for details and limitations.

## Implementation

- TypeScript, Three.js, Vite; original pinned versions retained.
- Plain serializable entity records with stable IDs, independent of Three.js.
- One fixed 20 Hz simulation; shared job decisions at 2 Hz.
- A shared navigation queue solves at most two grid paths per simulation tick. Workers retain routes until their destination or building topology changes.
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

This is a small playable graybox foundation: ten settlers maximum, a fixed 47×47 grid, and houses, stockpiles, and guard posts. Resources are finite; full storage, met stock targets, or exhaustion produce visible idle reasons. There is no demolition of completed buildings, per-building/job priority UI, NPC local avoidance, food consumption, immigration, combat, or raids. Workers may overlap one another and resource vegetation does not block movement.

See [DECISIONS](docs/DECISIONS.md), [MILESTONES](docs/MILESTONES.md), and [PERFORMANCE_BUDGETS](docs/PERFORMANCE_BUDGETS.md). No claim is made about hundreds of NPCs; larger populations still require profiling. The production bundle retains Vite's >500 kB chunk warning, primarily from Three.js.

Next work is M2.1: one simple enemy type, a tiny raid director, and enemy navigation toward the settlement — still without full combat.

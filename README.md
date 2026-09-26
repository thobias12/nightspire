# Nightspire

A medieval dark-fantasy settlement builder. The long-term direction is to build a living city by day and personally defend it at night.

**Current playable milestone: M1 — Settlement Loop.** This pass stops before night raids, combat, needs consumption, and production chains. See [the design](docs/GAME_DESIGN.md) for future direction.

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
4. Build more houses and a **Stockpile** (10 wood, 400 shared wood/food capacity). Completed buildings immediately provide housing or storage.
5. Open **QA & performance** to spawn up to ten settlers, pause, change speed/time, show paths, inspect workers/counters, or check state integrity.
6. **Save**, reload the page, then **Load**. Active jobs, cargo, resource depletion, unfinished construction, housing, player position, and time resume.

Save/load uses one versioned localStorage slot in this browser/origin. Saving replaces that slot; loading replaces the current world only after validation. No autosave, file export, cross-device synchronization, or old-version migration yet. Camera/debug preferences are session-only. Storage errors are displayed in the status bar.

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
| QA controls | Pause/resume, 1×/2×/4×, set hour, add resources within capacity, spawn settler, paths, integrity audit |

Time changes lighting only. Settlers keep working at night in M1. Food is gathered and stored but is not consumed yet.

## Verification

```sh
npm run typecheck
npm run build
npm test
npm run preview
```

The tests compile the existing TypeScript with the existing compiler and use Node's built-in test runner; no test dependency was added. They cover ten-settler construction, physical resource conservation, competing reservations, storage pressure, depletion, placement/connectivity, rerouting, invalid saves, and save/load during every task phase.

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

This is a small playable graybox foundation: ten settlers maximum, a fixed 47×47 grid, and only houses/stockpiles. Resources are finite; full storage or exhaustion produces visible idle reasons. There is no demolition/cancellation, job-priority UI, NPC local avoidance, food consumption, immigration, combat, or raids. Workers may overlap one another and resource vegetation does not block movement.

See [DECISIONS](docs/DECISIONS.md), [MILESTONES](docs/MILESTONES.md), and [PERFORMANCE_BUDGETS](docs/PERFORMANCE_BUDGETS.md). No claim is made about hundreds of NPCs; larger populations still require profiling. The production bundle retains Vite's >500 kB chunk warning, primarily from Three.js.

Next work should refine and review M1 before authorizing M2.

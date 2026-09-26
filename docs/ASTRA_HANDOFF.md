# Astra handoff — first implementation pass

You are taking over a new Three.js/TypeScript project called **Nightspire**.

Read these first:

1. `README.md`
2. `AGENTS.md`
3. `docs/GAME_DESIGN.md`
4. `docs/ARCHITECTURE.md`
5. `docs/MILESTONES.md`

## Mission

Build the first real vertical-slice foundation without implementing the entire game.

The game is a medieval dark-fantasy settlement builder where the player grows a living city during the day and personally defends it from escalating attacks at night. Long-term, the game should support large populations and large enemy raids, but the first milestone intentionally uses about 10 settlers and later 20–40 enemies.

## First pass goals

Focus on **M1 — Settlement loop**.

Implement, in an order you judge technically sound:

1. A player controller and hybrid camera foundation suitable for elevated settlement play and later closer combat.
2. Harvestable wood and food resource nodes.
3. A renderer-independent settler/entity store. Do not attach game truth to `Object3D` instances.
4. A reusable job/task system.
5. End-to-end woodcutting: choose task → move → work → obtain wood → haul/deliver to stockpile.
6. End-to-end food gathering using the same task architecture.
7. Data-driven building placement for a Stockpile and House first.
8. Construction jobs where settlers physically deliver/work rather than buildings appearing instantly.
9. Housing capacity and a minimal settler housing assignment.
10. A small QA/debug panel: pause, speed, set time, add resources, spawn settler, AI/navigation visualization, performance counters.
11. Save/load foundation sufficient for the implemented state.

## Important constraints

- Do not implement the full future building list.
- Do not implement brothel/bathhouse adult content yet beyond keeping the generic service-building architecture extensible.
- Do not implement final female character art, jiggle physics or armor generation yet.
- Do not build procedural continents/world generation.
- Do not build quests.
- Do not build 500-NPC systems speculatively before profiling the 10-NPC loop.
- Do not add React unless you can justify why it materially improves the game UI; never use React components as NPCs/entities.
- Keep simulation separate from rendering.
- Keep repeated content friendly to instancing/shared geometry.
- Do not run pathfinding every frame for every settler.
- Keep code modular and testable; avoid god classes.
- Maintain `npm run build` throughout.

## Architecture expectation

Do not blindly create a class for every box in `ARCHITECTURE.md`. Build only the abstractions needed by the current loop, but ensure ownership boundaries make future scaling plausible.

Prefer data definitions for resources/buildings/jobs.

If you choose an ECS-like/data-oriented approach, keep it understandable and pragmatic rather than importing a large framework without strong reason.

## Visual expectations

Graybox is correct for this phase.

Simple primitives and reusable placeholder meshes are preferred. Spend effort on readable feedback:

- selected resource/job
- carrying resources
- construction progress
- destination/path debug
- day/night state
- stockpile counts

Do not spend the pass producing final art.

## Deliverables

At the end of the pass:

1. `npm run build` passes.
2. The implemented loop can be played in browser.
3. Update `README.md` current-state section.
4. Update `docs/MILESTONES.md` checkboxes truthfully.
5. Add `docs/DECISIONS.md` documenting important architectural decisions and rejected alternatives.
6. Report current performance counters and obvious bottlenecks.
7. List the next 3–5 concrete tasks for reaching the M1 exit criterion.

## Definition of success

A user can boot the game, control the camera/player, watch a small group of settlers perform real gathering/hauling work, place a stockpile/house, see settlers construct them, and save/reload the resulting settlement.

Do not continue into M2 night raids until M1 is stable enough to build on.

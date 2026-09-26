# Agent instructions

This repository is a greenfield Three.js game. Read `README.md` and `docs/` before making architectural changes.

## Non-negotiables

1. Build the vertical slice before expanding the feature list.
2. Do not port code or architecture from Forge/Skillbound unless explicitly requested.
3. Do not create one React component, AnimationMixer, pathfinder, or heavyweight update loop per NPC.
4. Keep simulation state independent from Three.js scene objects.
5. Prefer data-oriented collections, spatial partitioning, batched/tiered updates, pooling, shared geometry/materials, and instancing where appropriate.
6. Keep buildings/resources/jobs/items/enemies data-driven.
7. Avoid giant god classes and giant files. Give systems clear ownership.
8. Placeholder geometry is preferred until gameplay works.
9. Keep `npm run build` passing.
10. Keep README/docs current when architecture or milestone scope changes.
11. During active development, backward compatibility with saves from earlier milestones is not required unless the user explicitly asks for it. Prefer a clean current schema and fresh-run testing over migration complexity.

## Current milestone

A playable day/night loop with ~10 settlers and 20–40 enemies:

- gather wood and food
- stockpile resources
- place and construct several buildings
- satisfy food/housing/safety/recreation at a basic level
- sunset changes settlement behavior
- a raid attacks defenses
- player can fight
- damage persists into morning and can be repaired
- save/load works
- debug controls expose simulation state

Do not implement hundreds of NPCs, final character art, explicit adult scenes, procedural continents, elaborate quests, or end-game systems before this loop is solid.

## Adult-content boundary

The game may contain clearly adult sexualized fantasy characters and adult-service venues as part of its mature city economy. For the initial milestones these are ordinary service/economy systems. Do not prioritize explicit sexual scenes over gameplay, simulation, performance, or art foundations.

# Nightspire architecture

> Current source ownership is authoritative in [AI_NAVIGATION.md](AI_NAVIGATION.md). Historical milestone notes below are retained as design context.

## Current module boundaries

- `model/` and `data/` are dependency roots.
- `world/` owns map/grid/navigation/planning.
- feature logic lives under `systems/` by domain.
- `runtime/` orchestrates systems; it should not absorb detailed feature rules.
- `app/` coordinates browser input, UI, rendering and runtime.
- `render/` and `ui/` present state; they do not own gameplay rules.
- direct imports are preferred over barrels because the live Pages loader is sensitive to circular module graphs.
- the live branch additionally owns `systems/population/Family.ts`, `systems/construction/Construction.ts`, and `systems/progression/TownProgression.ts`.

# Architecture principles

## Core rule: simulation is not the scene graph

Three.js objects are presentation. They must not become the source of truth for population, economy, jobs, combat or buildings.

A future save should be reconstructable from renderer-independent game state.

## Suggested domains

```text
GameRuntime
├── Clock / DayNight
├── WorldState
├── Settlement
│   ├── Population
│   ├── Resources
│   ├── Jobs
│   ├── Needs
│   └── Services/Economy
├── Buildings
├── Navigation
├── Combat
├── Raids
├── Player
├── SaveLoad
├── Rendering
│   ├── World
│   ├── Characters
│   ├── Buildings
│   └── Effects
└── Debug/QA
```

This is guidance, not a requirement to create empty classes for every box.

## Entity data

Avoid a large class instance per citizen where behavior methods and Three.js references are mixed together.

As scale increases, prefer stable entity IDs and compact data stores/typed arrays or grouped component stores for hot-path data such as:

- position
- velocity
- destination
- health
- current job
- combat target
- LOD/simulation tier

Rich metadata can live outside hot loops.

## Update tiers

Not every NPC deserves identical update frequency.

Example direction:

- Tier A: player-adjacent/combat-critical — frequent movement/combat decisions
- Tier B: active settlement workers — moderate task/path updates
- Tier C: distant/occluded citizens — low-frequency simulation
- Tier D: abstractable units — group/aggregate updates when safe

Do not prematurely hard-code these exact tiers; validate them through profiling.

## Navigation

Do not run full pathfinding for every NPC every frame.

Design for:

- cached paths
- path request queue/budget
- local avoidance separate from global routing
- coarse routing for distant agents
- shared destinations/flow concepts for mass movement when beneficial

Choose the concrete navigation implementation after the vertical slice establishes movement requirements.

## Rendering

Use shared geometry/materials aggressively for repeated content.

Candidates:

- vegetation
- debris
- fences/walls
- simple crowd units at distance
- repeated props

Named hero characters can use higher-quality rigs/materials/secondary motion while distant population uses cheaper representations.

## Animation

Do not create hundreds of expensive independent animation stacks without profiling.

The long-term design may use:

- normal skeletal animation for nearby hero/important characters
- lower update rates for mid-distance characters
- baked/GPU animation or simplified representations for large distant crowds

Validate a crowd benchmark before committing to a final mass-animation architecture.

## Buildings

Building content should be mostly data-driven:

- id/category
- footprint
- costs
- hit points
- worker slots
- storage
- production inputs/outputs
- provided services
- construction work
- upgrades

Placement, construction, production and damage are systems operating on building data—not bespoke code duplicated per building.

## Job/task system

Reusable tasks should power citizens:

- gather
- haul
- construct
- produce
- eat
- rest
- satisfy service need
- repair
- guard
- attack
- flee

Buildings create/consume job opportunities; they should not own bespoke citizen brains.

## Performance budgets

The project should gain budgets as measurements become available. Track at least:

- frame time
- simulation time
- render time
- draw calls
- triangles
- active AI count
- path requests/frame
- animated character count by tier
- population/enemy counts

Any claim of supporting hundreds of NPCs should be demonstrated by a repeatable benchmark scene.

## WebGPU

Three.js WebGPU is worth evaluating for long-term rendering/compute opportunities, but the first milestone should prioritize a stable playable loop. Renderer abstraction should avoid making gameplay systems depend on a WebGL-only implementation.

## Implemented M1 ownership

Game coordinates a fixed-step Simulation, InputController, SceneRenderer and Hud. WorldState owns plain records. Buildings owns placement/storage/housing rules; Jobs assigns claims; Simulation executes task phases; Navigation owns blocked cells and its bounded queue; SaveLoad validates and serializes state. See [DECISIONS.md](DECISIONS.md) for the concrete choices and [QA.md](QA.md) for verified behavior. The broader domains above remain future guidance.

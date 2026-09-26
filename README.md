# Nightspire

> Working title. A medieval dark-fantasy settlement builder where you grow a living city by day and personally defend it from escalating attacks by night.

## The pitch

Start with a camp, a few settlers and almost nothing.

Gather resources, build houses and production chains, attract new inhabitants, satisfy their needs, establish taverns and other services, forge equipment, construct walls and train defenders. When night falls, normal work stops and the settlement becomes a battlefield. The player fights alongside guards to protect the city they physically built.

Long-term progression should feel visible at every scale:

**camp → village → fortified town → fantasy city**

while the player progresses from poorly equipped survivor to powerful fantasy combatant.

## Design pillars

### Build something worth protecting
Every raid matters because enemies attack real houses, workshops, stockpiles and citizens rather than an abstract health bar.

### A living settlement
Settlers have jobs, homes, workplaces, needs and current tasks. Production should happen visibly through workers moving resources rather than through invisible timers wherever practical.

### Day and night play differently
Day is primarily building, logistics, production, exploration and preparation. Night is defense, combat, crisis response and damage control.

### Scale without wasting performance
The long-term target is hundreds of settlers and attackers, but the architecture must earn that scale. Simulation and rendering are separate, NPC updates are tiered/batched, and repeated content uses instancing/LOD/shared resources.

### Mature stylized fantasy
The setting may include clearly adult sexy fantasy characters, provocative outfits and mature establishments such as taverns, bathhouses, pleasure houses and brothels. These should function as actual settlement/economy systems, not replace the core city-building game.

## First playable vertical slice

The first milestone intentionally stays small:

- 1 handcrafted graybox map
- 10 settlers maximum
- 20–40 attackers
- Wood, Stone, Food, Iron, Coin
- House
- Woodcutter
- Forager/Farm
- Stockpile
- Blacksmith
- Tavern
- Guard Post
- Wooden Wall
- Wooden Gate
- Basic needs: Food, Housing, Safety, Recreation
- Building placement and settler construction jobs
- Basic player movement and melee combat
- Day/night state changes
- One simple nighttime raid
- Persistent building damage and morning repairs
- Save/load
- QA/debug controls

The success criterion is simple:

> Start with a handful of settlers, gather wood/food, build a small defended settlement, survive a night attack, repair the damage and begin the next day.

If that loop is not fun and reliable, do not add more systems.

## Long-term direction

Potential later systems include larger production chains, breweries, ale, markets, mines, sawmills, bathhouses, brothels, temples, luxury needs, trade, class/wealth differences, immigration, crime, disease, large raids, siege monsters, fantasy races, magic, modular equipment and hero-quality adult character rendering.

These are direction, not current scope.

## Technical foundation

- TypeScript
- Three.js
- Vite
- Framework-light runtime
- Data-oriented simulation
- Rendering kept separate from simulation
- Data-driven definitions for buildings/resources/jobs/items/enemies
- Instancing/shared geometry for repeated world content
- Spatial partitioning and tiered AI as population grows
- Web Workers only when profiling proves useful
- WebGPU should be evaluated deliberately rather than adopted just because it is newer

Three.js and Vite should be upgraded intentionally, not casually during unrelated feature work.

## Repository layout

```text
src/
  game/
    core/         lifecycle/orchestration
    data/         data-driven definitions
    render/       Three.js scene/render ownership
    simulation/   renderer-independent game state

docs/
  ARCHITECTURE.md
  GAME_DESIGN.md
  MILESTONES.md
  ASTRA_HANDOFF.md
AGENTS.md          coding-agent constraints
```

## Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
```

## Current state

The repository intentionally starts as a graybox foundation, not a half-implemented game. The current scene proves project boot, rendering, resizing, a basic day/night lighting transition and an instanced repeated-world element.

The next substantial implementation pass should follow `docs/ASTRA_HANDOFF.md`.

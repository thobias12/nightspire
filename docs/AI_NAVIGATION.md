# AI / ChatGPT navigation guide

Read this first when changing Nightspire. It describes the **current live code ownership**.

## Fast path

| Change | Start here | Usually also touches |
| --- | --- | --- |
| boot, input, placement UX | `src/game/app/` | `ui/`, `world/`, relevant system |
| entity/save shape | `src/game/model/WorldState.ts` | `persistence/SaveLoad.ts`, tests |
| fixed-step order | `src/game/runtime/Simulation.ts` | relevant `systems/*` module |
| roads, maps, pathing | `src/game/world/` | renderer, placement tests |
| build/cancel/demolish | `src/game/systems/construction/` | data/buildings, HUD |
| construction lifecycle | `src/game/systems/construction/Construction.ts` | jobs/runtime |
| jobs/reservations | `src/game/systems/jobs/` | economy/construction |
| resources/production/trade | `src/game/systems/economy/` | data/resources, HUD |
| settlers/families/services | `src/game/systems/population/` | runtime, HUD |
| settlement/town progression | `src/game/systems/progression/` | population/HUD |
| raids/combat | `src/game/systems/combat/` | runtime, renderer |
| Three.js visuals | `src/game/render/` | do not add simulation rules |
| HUD/catalog/inspector/menu-facing state | `src/game/ui/` | data + relevant system |
| scale benchmark | `src/game/benchmark/` | runtime/world |
| save/import validation | `src/game/persistence/` | model + tests |

## Dependency direction

```text
data + model
    ↓
world
    ↓
systems/*
    ↓
runtime
    ↓
app
```

Render/UI may read state and system projections, but gameplay rules must stay outside Three.js and DOM code.

Do **not** create barrel `index.ts` files just for convenience. Direct imports make dependencies visible and are safer for the custom GitHub Pages TypeScript module loader.

## Important live-branch rule

`gh-pages` contains work that does not necessarily exist on `main`. Never “deploy” by copying `main/src` over this branch. Compare and transplant deliberately.

## Hotspots

- `app/Game.ts` is still a large interaction coordinator. Put domain rules in systems/world modules.
- `ui/Hud.ts` is still oversized. Search for the panel/update method rather than reading it end-to-end.
- `render/SceneRenderer.ts` is still oversized. Extract cohesive rendering helpers when a visual family grows.
- `runtime/Simulation.ts` owns ordering only.

`npm run check:architecture` rejects a recreated generic `simulation/` folder and forbidden upward dependencies, while reporting oversized modules for incremental cleanup.

## Safe change workflow

1. Read this guide and the target domain only.
2. Search usages before changing shared model fields/helpers.
3. Keep state serializable and renderer-independent.
4. Update save validation whenever persisted state changes.
5. Run `npm run verify`.
6. On Pages, also verify the live deployment because the site resolves raw TypeScript imports at runtime.

## Navigation primitives

`world/Grid.ts` owns packed grid keys and dependency-free point math. Do not duplicate `cellKey` to escape a cycle; move low-level shared primitives downward instead.

## Fast change recipes

Use the narrowest path that owns the behavior:

| Goal | Read first | Avoid unless required |
| --- | --- | --- |
| add a building | `data/buildings.ts` + owning `systems/*` module | bespoke rules in `Game.ts` / renderer |
| add persisted state | `model/WorldState.ts` → `persistence/SaveMigrations.ts` + `SaveLoad.ts` | silent defaults in UI/runtime |
| change save compatibility | `persistence/SaveMigrations.ts` | mixing migration mutations into validation |
| add QA/debug controls | `qa/QaActions.ts` | expanding the production Game action switch |
| add reusable Three.js geometry | `render/RenderPrimitives.ts` | another top-level helper inside `SceneRenderer.ts` |
| change simulation ordering | `runtime/Simulation.ts` | implementing the rule itself in runtime |
| add economy/population/combat behavior | matching `systems/<domain>/` module | a new generic utility or simulation folder |
| change placement/path geometry | `world/` | renderer-owned collision/game rules |
| change HUD presentation | `ui/` | changing gameplay state from DOM code |

## Concurrent work protocol

Multiple ChatGPT sessions regularly work on Nightspire. Before changing a hotspot:

1. inspect current branch heads and open PR filenames;
2. avoid overlapping files with an active PR when an isolated domain change is possible;
3. use a dedicated branch with one purpose;
4. keep refactors behavior-preserving unless the PR explicitly states otherwise;
5. run `npm run verify` on the exact head;
6. re-check branch divergence before merge and before any Pages transplant.

Do not “solve” an overlap by copying a second implementation into another folder. Either integrate the owning branch, or move the shared primitive to the correct lower layer.

## Current decomposition ledger

Already extracted:

- `qa/QaActions.ts`: dev/QA state mutation and staging actions formerly embedded in `Game.ts`.
- `persistence/SaveMigrations.ts`: backward-compatibility mutations separated from strict validation.
- `render/RenderPrimitives.ts`: reusable geometry/texture constructors separated from scene orchestration.
- `world/Grid.ts`: low-level packed-grid helpers shared without navigation cycles.
- `data/map.ts`: persisted region schema separated from procedural generation.

Tracked legacy hotspots:

- `render/SceneRenderer.ts`: world sync + building/agent/field visuals still share one class.
- `ui/Hud.ts`: markup, projection and panel updating still share one class.
- `tests/simulation.test.mjs`: broad regression suite still shares one fixture/preamble.
- `app/Game.ts`: much smaller after QA extraction, but pointer/planning orchestration is still the next cohesive split.

The architecture check treats new >80 KiB TypeScript modules as a failure and reports the known legacy oversized modules explicitly.


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

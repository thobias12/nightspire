# AI / ChatGPT navigation guide

Read this first when changing Nightspire. It describes the **current code ownership**, not historical milestone layout.

## Fast path

| Change | Start here | Usually also touches |
| --- | --- | --- |
| boot, input, placement UX | `src/game/app/` | `ui/`, `world/`, relevant system |
| entity/save shape | `src/game/model/WorldState.ts` | `persistence/SaveLoad.ts`, tests |
| fixed-step order | `src/game/runtime/Simulation.ts` | relevant `systems/*` module |
| roads, maps, pathing | `src/game/world/` | renderer, placement tests |
| build/cancel/demolish | `src/game/systems/construction/` | data/buildings, HUD |
| jobs/reservations | `src/game/systems/jobs/` | economy/construction |
| resources/production/trade | `src/game/systems/economy/` | data/resources, HUD |
| settlers/services/workforce | `src/game/systems/population/` | runtime, HUD |
| raids/combat | `src/game/systems/combat/` | runtime, renderer |
| Three.js visuals | `src/game/render/` | do not add simulation rules |
| HUD/catalog/inspector | `src/game/ui/` | data + relevant system |
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

Render/UI may read model, world and system projections, but gameplay rules must stay outside Three.js and DOM code.

Do **not** create barrel `index.ts` files for convenience. Direct imports are intentional: dependencies remain obvious and the GitHub Pages runtime is less likely to encounter circular module graphs.

## Important hotspots

- `app/Game.ts` remains the browser interaction coordinator; V6 moves build/planning keyboard shortcuts to `app/GameHotkeys.ts`, while pointer placement remains the next cohesive split. Put domain rules in systems/world modules instead.
- `ui/Hud.ts` remains the largest UI coordinator, but V5 moved DOM event delegation into `ui/HudEvents.ts`; add new event wiring there instead of growing the constructor.
- `render/SceneRenderer.ts` is now a focused scene/camera/light and sync coordinator; visual-family growth belongs in the specialized renderer modules.
- `runtime/Simulation.ts` owns ordering only; detailed rules belong to domain systems.

`npm run check:architecture` hard-fails any TypeScript module above 80 KiB, runtime import cycles, the old generic `simulation/` folder, barrel `index.ts` files and forbidden dependency directions. There are no size exceptions.

## Safe change workflow

1. Read this guide and the target domain only.
2. Search usages before changing a shared model field/helper.
3. Keep state serializable and renderer-independent.
4. Update validation whenever persisted state changes.
5. Run `npm run verify`.
6. For Pages deployment, remember `gh-pages` contains live-only work and must not be blindly replaced by `main`.

## Navigation primitives

`world/Grid.ts` owns packed grid keys and dependency-free point math used by navigation. Do not duplicate `cellKey` again to break a cycle; move low-level shared primitives downward instead.

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
| change HUD presentation | `ui/Hud.ts` + `ui/MedievalHud.css` | changing gameplay state from DOM/CSS |
| change build/planning hotkeys | `app/GameHotkeys.ts` | `InputController.ts` unless movement/camera input also changes |

## Concurrent work protocol

Multiple ChatGPT sessions regularly work on Nightspire. Before changing a hotspot:

1. inspect current branch heads and open PR filenames;
2. avoid overlapping files with an active PR when an isolated domain change is possible;
3. use a dedicated branch with one purpose;
4. keep refactors behavior-preserving unless the PR explicitly states otherwise;
5. run `npm run verify` on the exact head;
6. re-check branch divergence before merge and before any Pages transplant.

Do not “solve” an overlap by copying a second implementation into another folder. Either wait for/integrate the owning branch, or move the shared primitive to the correct lower layer.

## Current decomposition ledger

Already extracted:

- `qa/QaActions.ts`: dev/QA state mutation and staging actions formerly embedded in `Game.ts`.
- `persistence/SaveMigrations.ts`: backward-compatibility mutations separated from strict validation.
- `render/RenderPrimitives.ts`: reusable geometry/texture constructors separated from scene orchestration.
- `world/Grid.ts`: low-level packed-grid helpers shared without navigation cycles.

Current ownership ledger:

- `render/SceneRenderer.ts`: world/camera/lighting orchestration and render-batch ownership.
- `render/PlacementGhostRenderer.ts`: transient building/road/field/plot placement ghosts.
- `render/PlanningOverlayRenderer.ts`: persistent construction/plot blueprint overlays.
- `render/FieldRenderer.ts`: field ground meshes, crop/soil decoration and field selection.
- `render/TownBuildingRenderer.ts`: procedural buildings, props, nightlife and fortifications.
- `render/ResidentialRenderer.ts`: residential plots, boundaries, street thresholds and backyard compounds.
- `ui/Hud.ts`: live HUD state/update orchestration and panel state.
- `ui/HudEvents.ts`: delegated DOM/window event wiring and transient drag gesture state.
- `ui/HudTemplate.ts`: static DOM shell only.
- `ui/HudContent.ts`: labels, descriptions and reusable HTML fragments.
- `ui/HudCatalog.ts`: build-card/catalog projection.
- `ui/HudTypes.ts`: public HUD state/metrics contracts.
- `ui/MedievalHud.css`: scoped presentation override; keep gameplay out of it.
- `tests/simulation.test.mjs`: broad regression suite still shares one fixture/preamble.
- `app/GameHotkeys.ts`: delegated build/planning keyboard shortcuts; movement/camera keys stay in `InputController.ts`.
- `app/PlanningState.ts`: transient build/road/field planning state.
- `app/PlanningOperations.ts`: road and field mutation/finalization, including shared undo operations.
- `app/PlanningPresentation.ts`: placement ghosts, preview validation and planning messages.
- `app/Game.ts`: browser orchestration remains; pointer placement/controller extraction is the next cohesive split.

The architecture check rejects every TypeScript module above 80 KiB. HUD and SceneRenderer no longer have exceptions.


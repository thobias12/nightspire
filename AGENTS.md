# Nightspire agent instructions

Read `docs/AI_NAVIGATION.md` before editing code, then read only the relevant domain and its tests.

1. Preserve deterministic fixed-step gameplay and serializable, renderer-independent state.
2. Keep gameplay rules out of Three.js and DOM/UI modules.
3. Use direct imports. Do not add barrel `index.ts` files or duplicate low-level helpers to escape cycles.
4. Put new code in the owning domain under `src/game/`; never recreate a generic `simulation/` junk drawer.
5. Keep buildings, resources and jobs data-driven.
6. Search usages before changing shared model fields. Persisted fields require save validation and tests.
7. Preserve current gameplay/UI behavior unless the task explicitly changes it.
8. Run `npm run verify` before merge.
9. `gh-pages` contains live-only work. Never overwrite it wholesale from `main`; transplant or merge deliberately.
10. Avoid new runtime dependencies unless they materially simplify the game.

Known large legacy hotspots are `app/Game.ts`, `ui/Hud.ts`, and `render/SceneRenderer.ts`. Extract cohesive helpers when touching them instead of adding unrelated responsibilities.

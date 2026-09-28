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
9. `gh-pages` contains live-only systems and UI. Never replace it wholesale from `main`; transplant or merge deliberately.
10. Avoid new runtime dependencies unless they materially simplify the game.

Known large legacy hotspots are `app/Game.ts`, `ui/Hud.ts`, and `render/SceneRenderer.ts`. Extract cohesive helpers when touching them instead of adding unrelated responsibilities.

## Concurrent ChatGPT / agent workflow

Before editing:

1. Read `docs/AI_NAVIGATION.md`.
2. Inspect open PRs and avoid editing the same hotspot as another active branch unless the task explicitly requires integration.
3. Branch from the current target head, not from remembered SHAs.
4. Keep a change inside one owning domain when possible. If a shared model changes, enumerate every consumer before writing.
5. Prefer adding a small cohesive module over extending `Game.ts`, `Hud.ts`, `SceneRenderer.ts`, or `tests/simulation.test.mjs`.
6. Never copy a helper into a second module to avoid an import cycle. Move the primitive downward and let `npm run check:architecture` verify the runtime graph.
7. Do not mix behavior refactors with visual redesigns in the same PR unless they are inseparable.
8. Re-check the target branch immediately before merge/deploy; other chats may have moved it.

A future chat should be able to answer “where does this change belong?” from `docs/AI_NAVIGATION.md` without scanning the whole repository.


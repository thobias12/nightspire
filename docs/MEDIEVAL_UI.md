# Medieval HUD integration — 2026-09-28

The Manor Lords-inspired HUD from the Astra/Codex UI pass is integrated on top of the V2/V3 project architecture rather than replacing it.

## Ownership

- `src/game/ui/Hud.ts` owns DOM structure, UI-local state, event delegation and projection from game state.
- `src/game/ui/MedievalHud.css` owns the medieval presentation layer. It is scoped under `.medieval-hud` and must not contain gameplay rules.
- `src/main.ts` loads the medieval stylesheet after the base stylesheet so the reference pass remains an override layer.
- Gameplay behavior remains in `systems/`, placement behavior in `app/Planning*` + `world/`, and persistence in `persistence/`.

## Integration cleanup

The original UI branch still advertised Mine and Pleasure House as planned features while also exposing their real implemented building cards. Those obsolete planned definitions were removed during integration.

The visual pass intentionally does not merge old-base versions of Game, persistence, renderer, or planning code. It sits on the latest architecture so future UI work does not undo V2/V3.

## Future HUD decomposition

`Hud.ts` is still a tracked legacy hotspot. Split it only after this visual design has stabilized, in this order:

1. catalog definitions / preview metadata;
2. building inspector projection;
3. settlement/tasks/minimap projection;
4. DOM construction and binding helpers.

Do not duplicate gameplay calculations inside those UI modules; consume system projections instead.

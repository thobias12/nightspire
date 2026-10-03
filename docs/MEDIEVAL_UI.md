# Medieval HUD integration — 2026-09-28

The Manor Lords-inspired HUD from the Astra/Codex UI pass is integrated on top of the V2/V3 project architecture rather than replacing it.

## Ownership

- `src/game/ui/Hud.ts` owns UI-local state and projection from game state. `HudTemplate.ts` owns the static shell and `HudEvents.ts` owns delegated events.
- `src/game/ui/MedievalHud.css` owns the medieval presentation layer. It is scoped under `.medieval-hud` and must not contain gameplay rules.
- `src/main.ts` loads the medieval stylesheet after the base stylesheet so the reference pass remains an override layer.
- Gameplay behavior remains in `systems/`, placement behavior in `app/Planning*` + `world/`, and persistence in `persistence/`.

## Integration cleanup

The original UI branch still advertised Mine and Pleasure House as planned features while also exposing their real implemented building cards. Those obsolete planned definitions were removed during integration.

The visual pass intentionally does not merge old-base versions of Game, persistence, renderer, or planning code. It sits on the latest architecture so future UI work does not undo V2/V3.

## Reference correction — 2026-10-01

Based on current main `d7df250ad9739125783d70d9c90f76bfffeb9f44`, including architecture and forestry patches. Compared against the three user-supplied Manor Lords references:

| Reference composition | Correction |
| --- | --- |
| Compact parchment ribbons and a central town badge | Status icons/counts replace wrapping prose; town badge stays visible in narrow windows. |
| Tall illustrated cards, circular seals, category rail underneath | Artwork fills the portrait, names remain in tooltips/accessibility labels, costs come from building definitions. Cards center when they fit and scroll when they do not. |
| Six restrained enamel command buttons | Original inline SVG symbols replace illustrated medallions. Save/Load remain separate small utilities. |
| Parchment card above the hovered building | Costs precede the description; short-window copy scrolls, and resize dismisses stale positions. |
| Wide building illustration, three equal tabs, worker silhouettes | Wider compact window, equal tab columns, no forced empty content height. Description moves into Operation & storage. Existing staffing/policies remain available. |

Fixed sprite sizing: landscape atlas cells retain their aspect instead of rendering as narrow bands. Portraits crop the center of a cell; landscape headers/previews show one cell. World rendering and gameplay/save rules are unchanged.

Unchanged HUD projections now compare against the previous source string. Browser serialization of boolean attributes previously made unchanged inspectors rebuild and discard focused controls. One regression test covers preserved focus and updates when content changes.

Ownership follows the current [navigation guide](AI_NAVIGATION.md): HudTemplate (shell), HudCatalog (static seals/metadata), HudIcons (original command symbols), HudEvents (delegation), Hud (projections), MedievalHud.css (presentation). No runtime dependencies were added.

### Verification and remaining limits

Install, architecture check, strict typecheck, full **197-test** suite and production build passed. Production browser checks covered category changes, focused card previews, worker assignment/removal, all three building tabs, expandable operations, Save → reload → Load, and smaller-window layout. Screenshots: [construction](qa/ui-reference-construction.png), [building window](qa/ui-reference-building.png).

At the end of the layout correction, artwork still reused the previous set and placeholders. The subsequent [manuscript art pass](MANUSCRIPT_ART.md) replaces those active bindings with original activity scenes and matching emblems. It adds a scoped ManuscriptHud stylesheet, asset manifest and preparation scripts. Every entry has a portrait card plus a separate wide scene shared by hover and building windows. The existing large production-chunk warning remains.

The combined pass has **210 passing tests**. Production browser checks cover the five construction categories, keyboard previews, full titles in short windows, dedicated art bindings, worker assignment/removal, General/People/Advanced and save → reload → load. A world-anchored inspector stays within the available space on resize or content growth. Card circles now show output or service categories; construction costs remain in hover previews. New screenshots: [construction artwork](qa/ui-manuscript-construction.png), [building artwork and portraits](qa/ui-manuscript-building.png).

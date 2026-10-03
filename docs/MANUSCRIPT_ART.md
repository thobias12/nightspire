# Nightspire manuscript UI art — 2026-10-03

## Reference comparison

The supplied Manor Lords screenshots use flat ink-outlined activity scenes, quiet parchment, desaturated gouache, cream emblems and slate enamel frames. The previous Nightspire set mixed scenic paintings, geometric building placeholders, detailed icon medallions and simple vectors.

This pass supplies original manuscript activity scenes for all **28 existing and planned catalog entries**, ten villager/empty/hostile portraits, and **38 reusable SVG emblems**. Forester, Mine, Fishing Hut, Ore Yard and Pleasure House now have dedicated scenes. Planned entries remain planned; artwork does not unlock gameplay.

## One illustration per building

The selected wide sheet is cut into `assets/ui/manuscript/building/*.webp`. That canonical file supplies the building window, preview, title image and construction card. Most cards use overlapping building/activity crops that **fill the entire portrait frame**, with a soft transition. Market, Tavern, Trading Post and Watchtower use one full-height crop to avoid duplicated figures. Crops keep the image's proportions; previews and headers show the full wide scene. House aliases residential-plot. Title thumbnails crop the building, and portraits frame the head consistently at 24px and 40px. No separately painted size variants are loaded.

The generated sheet's illustrated rows are not exactly equally spaced. `sceneRowBounds` records their actual boundaries and small safety insets remove neighboring-row remnants once from each canonical file. Do not replace those boundaries with an equal seven-row split. Source dimensions and generated CSS geometry are checked together.

Generation used the **built-in imagegen tool**, with the user's screenshots as style references and the first generated sheet as a palette reference. The earlier portrait-scene sheet was a discarded direction study after the user clarified the shared-image requirement. It is not part of the game. Local Pillow preparation only crops and encodes WebP, as requested; it does not redraw subjects.

Sources: selected scenes `exec-d6c77f54-686d-4292-819f-632fe3119ae2.png`, people `exec-d5259934-6041-4ca4-ae6b-16f38839bb3d.png`, generated in the conversation's Codex generated-images directory. All runtime assets are saved in the repository.

## Ownership and regeneration

- `ManuscriptHud.css`: presentation, crop windows, palette, framing and heading type.
- `ManuscriptAssets.css`: checked-in generated bindings. Imported by the presentation stylesheet.
- `assets/ui/manuscript/manifest.json`: subject order, explicit source boundaries, aliases and normalized crop rectangles.
- `scripts/prepare-manuscript-art.py`: optional developer-only crop/encode utility, requires Pillow.
- `scripts/manuscript-icons.mjs`: original ink/paper vector recipes.
- `scripts/prepare-manuscript-ui.mjs`: regenerate vector files and CSS bindings with Node; no runtime dependency.
- Existing HUD action delegation, gameplay projections, placement and renderer remain authoritative.

Preparation:
```sh
python scripts/prepare-manuscript-art.py --scenes selected-scenes.png --portraits selected-people.png
node scripts/prepare-manuscript-ui.mjs
npm run verify
```

The heading font is locally hosted Almendra, with its OFL license alongside it, from [Google Fonts' official source](https://github.com/google/fonts/tree/main/ofl/almendra). Body copy retains Georgia for readability. There are no font/CDN requests at runtime.

## Budget and limits

Canonical WebP images plus emblems total **978,762 bytes (0.93 MiB)** before the font/decorative trim. Each raster is below 64 KiB. Tests cap that set at 1.25 MiB and verify slot coverage, source sharing, crop coverage, source dimensions, deterministic bindings and generated SVG consistency. Images are cached and reused; this pass adds no Three.js objects or per-agent render/update work.

The scenes are cut from 1536×1024 generated sheets, so large inspector images are modestly upscaled and intentionally soft. A portrait crop necessarily shows less of the wide scene; it must fill the card rather than letterbox it. Crop rectangles remain available for art-direction refinements. CSS uses container units to scale within the existing fixed card dimensions, verified in the Chromium in-app browser. Existing legacy art remains in the repository/base stylesheet; it is overridden in the active HUD. The pre-existing large JavaScript chunk warning and world-rendering performance concerns remain. No new performance envelope is claimed.

## Verified views

Install, architecture check, strict typecheck, **206 tests** and production build pass. Production browser checks covered every category, shared source URLs, full preview titles, worker assignment/removal, General/People/Advanced, expanded operations and Save → reload → Load. Desktop and short-window checks included actual 1440×900 and 727×545 CSS viewports; previews scroll when short and automatically anchored inspectors clamp within resized bounds. No browser console errors were observed.

Screenshots: [all 28 filled cards](qa/ui-manuscript-all-cards.png), [construction cards and preview](qa/ui-manuscript-construction.png), [building window and portraits](qa/ui-manuscript-building.png). For visual review, compare Blacksmith across these views; then inspect Forester, Fishing Hut, Mine, Ore Yard, planned cards, a House's People tab and the resource bar at both camera heights. Source reuse is verified across all catalog entries, not only the pictured Blacksmith.

For repeatable fit QA, run `npm run dev` and open `/ui-art-fit.html`. The development-only gallery reuses the actual catalog template, costs, labels and production styles, with all 28 cards, preview/header/title sizes, ten portraits and every resource/category/service/task/command emblem. Choose **All cards** for a contact sheet or **Compare sizes** for side-by-side views. Resize to test normal, wide and short windows. This page does not start the simulation, modify saves or ship in the production entry point.

Visual QA also found two pre-existing issues: resize clamping skipped automatically world-anchored inspectors, and staging the town could invalidate an in-progress gather claim by clearing its source. The first now uses the same clamp as dragged panels. The second releases only unfinished claims on cleared nodes, leaving carried deliveries intact. Production simulation/save rules are unchanged.

## Generation direction

Original flat medieval manuscript vignettes: dark umber hand-drawn ink, matte gouache, sage/rust/ochre/slate colors and aged ivory parchment. Building scenes pair clothed adult workers and the relevant activity with the building. The selected sheet contains 28 landscape scenes, four columns by seven rows. Portraits use the same palette, clothed adult head-and-chest subjects, eight settlers, an empty-worker silhouette and a watchman, arranged five columns by two rows. Full original prompt wording was not retained; this is the direction brief rather than a verbatim prompt transcript.

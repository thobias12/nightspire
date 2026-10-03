# Nightspire manuscript UI art — 2026-10-03

## Art direction and composition

The supplied Manor Lords UI paintings use thin uneven grey-brown outlines, flat desaturated paint, elongated figures, humble buildings and a quiet grey-green/ochre palette. The previous Nightspire paintings were warmer, busier and more like illustrated storybooks. The new set was directed from the isolated Forester painting in the user's reference, with flat roofs/foliage, restrained shading and small faded wear marks. The paintings are original Nightspire scenes. The reference image is not shipped.

Every one of the **28 live and planned catalog entries** now has two independently generated compositions:

- **Portrait card:** whole building above, worker/activity below, one continuous scene that fills the construction card. No overlapping crops or pasted halves.
- **Wide scene:** an 8:3 building/activity painting shared by hover previews and clicked-building windows.

This follows the user's revised instruction to create separate small and large artwork. House aliases Residential Plot. Tiny title thumbnails crop the building area of the portrait card. The ten existing portraits are retained. There are now 46 original SVG emblems, including eight new category symbols and clearer wood, tools and grain drawings. Planned cards remain disabled; paintings do not unlock gameplay.

Construction-card seals are round 34px medallions with a 26px symbol, pale parchment rim and muted green background. They describe output or service: Forester logs, Mine ore, Fisherman fish/Food, Blacksmith tools, Brewery ale, Farmhouse grain, storage crate, trade cart, housing and defense. Producer meanings come from the actual building definitions, rather than wood construction costs. Service cards describe their function without claiming production; Tavern uses a mug for recreation. Planned categories include stone, water, faith, hygiene, civic and military pictographs, with planned labels retained. Card titles and accessible descriptions explain each seal. Construction costs remain in the hover panel.

Each painting has its own source file. There are no shared atlas rows, so Mine/Fisherman's Hut cannot inherit fragments of a neighboring illustration. Cards use proportion-preserving cover scaling; wide scenes display their full authored aspect. Short windows scroll the preview rather than squeezing it into a thin strip. Authored colors are displayed without a second saturation/brightness correction; planned cards retain their existing muted state.

The Pleasure House pair was revised to depict clearly adult female hosts in opaque linen camisoles/drawers and open burgundy/slate-blue robes. The portrait uses one welcoming auburn-haired host; the wide painting uses the same wardrobe and character alongside a seated blonde host. The scene remains non-explicit. The output/service seal, dimensions and existing recreation rules are retained. Exact final prompts and reference filenames are recorded under `pleasureHousePrompts` in the source map.

## Ownership and preparation

- `assets/ui/manuscript/card/*.webp`: 28 portrait paintings, 192×352.
- `assets/ui/manuscript/building/*.webp`: 28 wide paintings, 640×240.
- `assets/ui/manuscript/manifest.json`: inventory, sizes, aliases, title/portrait crops.
- `assets/ui/manuscript/art-sources.json`: all 56 selected imagegen filenames, exact shared style prompt, per-subject briefs, variant instructions and final Forester/Pleasure House prompts.
- `scripts/prepare-painted-art.py`: developer-only Pillow crop/resize/encode utility. Requires one unique source for every card/wide pair and rejects source paths outside the supplied directory.
- `scripts/prepare-manuscript-ui.mjs`: deterministic checked-in CSS bindings and vector generation.
- `scripts/manuscript-icons.mjs`: original ink-and-cream vector recipes.
- `src/game/ui/ManuscriptHud.css`: slot presentation and framing. No gameplay rules.
- `ui-art-fit.html`: development-only comparison gallery using the actual catalog template and production styles.

Generation used the **built-in imagegen tool**, one call per painting. A style-only crop of `Building hud.png`, rectangle (228,262,886,496), was the first reference input; the final Forester card/wide painting was the second input for the other subjects. Exact prompt reconstruction is recorded in the source map: shared style prompt + subject brief + variant instruction. The earlier warm Forester studies were discarded. Original generation PNGs remain in this conversation's Codex generated-images directory; the prepared runtime assets are all checked in. Retained portrait source: `exec-d5259934-6041-4ca4-ae6b-16f38839bb3d.png`.

Preparation, using that original output directory:

```sh
python scripts/prepare-painted-art.py --generated-dir /path/to/generated_images
node scripts/prepare-manuscript-ui.mjs
npm run verify
```

Pillow only crops, resizes and encodes the generated output; it does not repaint. It is not a runtime dependency. Heading font Almendra is locally hosted with its OFL license from [Google Fonts' official source](https://github.com/google/fonts/tree/main/ofl/almendra); body copy remains Georgia.

## Budget and remaining limits

The 56 building paintings, ten portraits and emblems total **1,428,201 bytes (1.36 MiB)**, excluding font/decorative trim. The seal correction added 3,091 bytes; the revised Pleasure House pair adds a further 14,074 bytes. Its card is 17,334 bytes and wide painting 31,588 bytes. The largest file is still 44,180 bytes. Tests cap this inventory at **2 MiB total and 64 KiB per file**. The larger inventory replaces the previous 0.93 MiB single-scene set. Browser caching reuses the wide file across previews and inspectors. There are no runtime image-generation calls, new Three.js objects, per-agent artwork controllers or world-rendering changes.

Runtime wide paintings are 640×240; high-DPI displays can expose their modest resolution. Cover cropping in the shortest cards removes some peripheral scene area, bounded below 25% by the fit tests. Important subjects were composed away from the edges, but visual quality remains subject to user review. The retained portraits have not been repainted in this building-art redo. Legacy fallback art remains in the base stylesheet/repository and is still emitted by Vite, adding unused asset weight. The pre-existing large JavaScript chunk warning and world-rendering limits remain; no new settlement performance envelope is claimed.

## Verification and visual review

Install, architecture check, strict typecheck, **210 tests** and production build pass. Tests verify live/planned coverage, 56 distinct sources, exact image dimensions, responsive card coverage, title/portrait crop proportions, dedicated CSS bindings, vector consistency and payload bounds. Three seal regressions verify actual producer outputs (including a changed recipe), coverage/bindings across all 28 real catalog cards, planned semantics, service/storage meanings and retained construction costs. Existing resize-clamp and QA-town harvest-claim regressions remain. One HUD ResizeObserver re-clamps a growing inspector between the status ribbons and bottom dock; its subscription disconnects on disposal. A regression covers growth and cleanup. No observer exists per building or settler.

Production browser checks covered all five construction categories, live/planned card bindings, Forester/Mine/Fisherman previews, Blacksmith staffing add/remove, General/People/Advanced, expanded operations and Save → reload → Load with the assignment retained. Responsive views were 800×600, 1280×720, 1440×900 and 1920×1080 CSS pixels. The gallery covered all 28 card/preview/header/title combinations. No production console errors were captured.

The output-seal correction was additionally checked in the rebuilt production game across all five categories, at 1280×720 and 800×600. All eight Industry seals remained circular with their symbols contained inside the cards; Forester hover still reported its 35 Wood construction cost. All 28 gallery seals had loaded symbol bindings and equal width/height. No production console errors were captured during these checks.

The revised Pleasure House pair passes the existing dimension, source-inventory, fit and payload tests. Browser checks cover its card, title thumbnail, hover painting and building-header painting in the comparison gallery, plus the Services card and hover panel in the rebuilt production game at 1280×720. The card uses cover; both wide slots retain the complete 8:3 painting. No production console errors were captured. See [the fitted artwork](qa/ui-pleasure-house-art.png).

For repeatable visual QA, run the development server and open `/ui-art-fit.html`. **All cards** shows the complete inventory. **Compare sizes** shows portrait card, hover artwork, title thumbnail and wide building header side by side; category filters make the set manageable. Portraits & icons shows existing 40px/24px faces and resource/category/service/task/command emblems. The gallery does not start simulation, mutate saves or ship in the production entry.

Review [all 28 cards](qa/ui-manuscript-all-cards.png), [construction and hover preview](qa/ui-manuscript-construction.png), and [clicked-building window](qa/ui-manuscript-building.png). Compare Forester, Mine and Fisherman's Hut against the supplied reference first, then inspect Road, Market, Stockpile, Brewery, planned cards and all resource seals. Test normal, wide and short windows. Final art-direction approval remains pending.

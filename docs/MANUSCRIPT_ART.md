# Nightspire manuscript UI art — 2026-10-03

## Art direction and composition

The supplied Manor Lords UI paintings use thin uneven grey-brown outlines, flat desaturated paint, elongated figures, humble buildings and a quiet grey-green/ochre palette. The previous Nightspire paintings were warmer, busier and more like illustrated storybooks. The new set was directed from the isolated Forester painting in the user's reference, with flat roofs/foliage, restrained shading and small faded wear marks. The paintings are original Nightspire scenes. The reference image is not shipped.

Every one of the **28 live and planned catalog entries** now has two independently generated compositions:

- **Portrait card:** whole building above, worker/activity below, one continuous scene that fills the construction card. No overlapping crops or pasted halves.
- **Wide scene:** an 8:3 building/activity painting shared by hover previews and clicked-building windows.

This follows the user's revised instruction to create separate small and large artwork. House aliases Residential Plot. Tiny title thumbnails crop the building area of the portrait card. The ten existing portraits and 38 original SVG emblems are retained. Planned cards remain disabled; paintings do not unlock gameplay.

Each painting has its own source file. There are no shared atlas rows, so Mine/Fisherman's Hut cannot inherit fragments of a neighboring illustration. Cards use proportion-preserving cover scaling; wide scenes display their full authored aspect. Short windows scroll the preview rather than squeezing it into a thin strip. Authored colors are displayed without a second saturation/brightness correction; planned cards retain their existing muted state.

## Ownership and preparation

- `assets/ui/manuscript/card/*.webp`: 28 portrait paintings, 192×352.
- `assets/ui/manuscript/building/*.webp`: 28 wide paintings, 640×240.
- `assets/ui/manuscript/manifest.json`: inventory, sizes, aliases, title/portrait crops.
- `assets/ui/manuscript/art-sources.json`: all 56 selected imagegen filenames, exact shared style prompt, per-subject briefs, variant instructions and final Forester prompts.
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

The 56 building paintings, ten portraits and emblems total **1,411,036 bytes (1.35 MiB)**, excluding font/decorative trim. The largest file is 44,180 bytes. Tests cap this inventory at **2 MiB total and 64 KiB per file**. The larger inventory replaces the previous 0.93 MiB single-scene set. Browser caching reuses the wide file across previews and inspectors. There are no runtime image-generation calls, new Three.js objects, per-agent artwork controllers or world-rendering changes.

Runtime wide paintings are 640×240; high-DPI displays can expose their modest resolution. Cover cropping in the shortest cards removes some peripheral scene area, bounded below 25% by the fit tests. Important subjects were composed away from the edges, but visual quality remains subject to user review. The retained portraits/emblems have not been repainted in this building-art redo. Legacy fallback art remains in the base stylesheet/repository and is still emitted by Vite, adding unused asset weight. The pre-existing large JavaScript chunk warning and world-rendering limits remain; no new settlement performance envelope is claimed.

## Verification and visual review

Install, architecture check, strict typecheck, **207 tests** and production build pass. Tests verify live/planned coverage, 56 distinct sources, exact image dimensions, responsive card coverage, title/portrait crop proportions, dedicated CSS bindings, vector consistency and payload bounds. Existing resize-clamp and QA-town harvest-claim regressions remain. One HUD ResizeObserver re-clamps a growing inspector between the status ribbons and bottom dock; its subscription disconnects on disposal. A regression covers growth and cleanup. No observer exists per building or settler.

Production browser checks covered all five construction categories, live/planned card bindings, Forester/Mine/Fisherman previews, Blacksmith staffing add/remove, General/People/Advanced, expanded operations and Save → reload → Load with the assignment retained. Responsive views were 800×600, 1280×720, 1440×900 and 1920×1080 CSS pixels. The gallery covered all 28 card/preview/header/title combinations. No production console errors were captured.

For repeatable visual QA, run the development server and open `/ui-art-fit.html`. **All cards** shows the complete inventory. **Compare sizes** shows portrait card, hover artwork, title thumbnail and wide building header side by side; category filters make the set manageable. Portraits & icons shows existing 40px/24px faces and resource/category/service/task/command emblems. The gallery does not start simulation, mutate saves or ship in the production entry.

Review [all 28 cards](qa/ui-manuscript-all-cards.png), [construction and hover preview](qa/ui-manuscript-construction.png), and [clicked-building window](qa/ui-manuscript-building.png). Compare Forester, Mine and Fisherman's Hut against the supplied reference first, then inspect Road, Market, Stockpile, Brewery, planned cards and all resource seals. Test normal, wide and short windows. Final art-direction approval remains pending.

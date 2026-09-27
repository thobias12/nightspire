# M3.10.3 — Organic medieval road visual pass

Base: draft PR #31, exact fetched head `dddc79caacafc8975bd9e39e5c3e4355211f7caf`. This is a renderer-only successor. Road placement, Grid/Shift/Road Snap, widths, frontage, save schema, navigation, economy and the M4 integration are unchanged.

## Surface layers

- **Continuous earth and meadow:** one opaque albedo texture on the existing lit ground mesh replaces the segment rectangles, circular caps, repeated shoulder discs and mud decals. There is no additional transparent ground overlay. Dirt receives the same lighting, shadows and time-of-day tint as its surroundings.
- **Irregular shoulders:** broad and fine world-space noise modulate distance from the persisted centerline. Soft coverage blends soil into meadow across uneven margins. It does not move saved road points or alter nominal widths.
- **Traffic character:** 1.2m Paths retain more meadow; 1.7m Lanes have intermittent center grass and asymmetrical tracks; 2.4m Main Roads have broader compaction. Tracks wander, fade and merge into the main wear field, with independent gaps on each side. They are albedo variation, not physical grooves.
- **Shared junctions:** each terrain texel resolves maximum coverage/wear across the entire network. Crossings and Y branches cannot accumulate transparency darkness or introduce a separate circular junction patch. Inserting collinear frontage junctions does not restart the pattern.
- **Quiet and occupied shoulders:** a deterministic world-space cluster mask places sparse grass and stones, leaving quiet stretches. The fixture generates 49 grass tufts and seven stones across five roads. Decorative resource undergrowth is suppressed inside road coverage; actual resource trees/bushes remain visible and interactable.
- **Stable saves:** spatial noise, road ID and distance along the saved polyline determine the result. Save/load regenerates it; no texture or dressing records enter the save.

The old narrow residential service/door paths retain their existing batch and are outside this road-network pass. Courtyard/plot presentation is unchanged.

## Ownership and budgets

`RoadSurface.ts` is a pure renderer-independent sampler. `RoadTerrain.ts` owns the cached meadow field, road-data snapshot and one DataTexture. `SceneRenderer.ts` applies it to the existing ground and submits bounded dressing. No per-road mesh, material, texture or controller is introduced.

- Fixed 1024×1024 RGBA texture for the existing 67m ground: approximately 6.5cm per texel, 4 MiB base / about 5.33 MiB including mipmaps on the GPU.
- Roughly 14 MiB retained CPU typed-array data (meadow field, surface pixels and coverage), plus transient rebuild arrays/old surface until garbage collection. Texture is disposed with the renderer.
- Remove five road surface batches (7,520 instance slots total) and the 240-slot meadow-disc batch. Road stones shrink from 720 to **96** slots; add **256** grass slots. Dressing uses at most two draw calls and casts no shadows. The existing ground remains one draw.
- Generated dressing is capped regardless of road density. Surface storage is fixed; generation time still scales with saved centerline length. The existing 200-road/120-point save limits are untouched.
- Road-data equality is checked without allocating on unchanged frames. A 10,000-iteration Node check of the five-road fixture averaged about 0.001 ms per check on the development machine.
- A changed network rebuilds synchronously once, including upload/mipmap generation. With the meadow cached, three Node measurements of the five-road/223-point fixture were **72 / 74 / 76 ms**, excluding GPU upload. This is an edit/load hitch risk, not a per-frame cost. Very dense networks and lower-end hardware remain unqualified; incremental or worker baking is the next performance option if playtesting warrants it.

## Verified in this pass

- Strict typecheck, all **131 tests**, and production build pass. Seven new tests cover deterministic output/input immutability, width profiles, junction union/order/duplicate invariance, collinear subdivision, curve continuity/shoulders, bounded elements and cache invalidation. All 124 integration tests remain passing, including M4 trajectory and road-planner/save tests.
- Production-browser inspection of the existing staged town and the supplied five-road fixture, from Overview and Street View, plus Dusk lighting.
- Imported the fixture through the existing save UI, reloaded the page, loaded it again and ran the integrity audit: PASS. No captured browser console errors or warnings.
- Final fixture HUD sample at 1280×720: **46 draws / 31,328 triangles**, approximately **1.05 ms render submission CPU**, **5.7 ms / 175 FPS**. This is a live sample, not a fresh M4 benchmark or GPU timing result.
- A cumulative **0.05 seconds** of clamped frame time was visible after startup/load while paused; do not describe the run as hitch-free. No sustained frame degradation was observed after the texture upload.
- The original staged-town baseline sample was 77 draws / 53,120 triangles and 1.45 ms render CPU. It is a different scene/camera from the five-road fixture, so those numbers are **not a controlled before/after speedup**.
- Existing Vite large-chunk warning remains. The test-only CommonJS compile also emits Three.js's require-deprecation warning; browser code uses ES modules. No dependency changes.

## Visual QA to capture

Use **QA → Import JSON** with [road-visual-qa.json](road-visual-qa.json), pause, and set noon. This is an ordinary six-settler save with no added gameplay flags: Path to the north, Lane in the middle, Main Road to the south, a crossing route and a Y branch. Import rotates the previous local primary into the normal backup slot.

1. **Overview, noon:** all three widths, S bends and crossings in one view. Pan south to inspect the Main Road. Look for a continuous corridor without rectangular joints or dark intersection blobs.
2. **Street View, noon:** pan along a Lane shoulder, then the Path and Main Road. Capture the transition into grass, broken tracks, restrained stone clusters and quiet patches. Zoom close enough to expose any texture blur.
3. **Y junction and crossing close-ups:** inspect both approaching directions; no circular caps, stacked darkness or hard shoulder seams should appear.
4. **Residential street:** stage the existing town on a fresh run, then inspect road-to-frontage continuity. If the existing staging helper leaves a gather claim on a cleared node, switch Dusk then Day before saving; that pre-existing helper behavior is outside this rendering change.
5. **Same view at Dusk/Night and after save/reload:** compare silhouette/lighting and confirm dressing stays in place. Final aesthetic acceptance, especially extreme close zoom and dense towns, remains a user review gate.

Captured examples: [Overview](images/m3103-overview.png), [Street View](images/m3103-street.png), [original staged-town baseline](images/m3103-before.png).

No merge or deployment was performed.

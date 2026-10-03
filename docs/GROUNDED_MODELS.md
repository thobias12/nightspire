# Grounded model and construction foundation

Base: draft #76, `codex/regional-map-setup`, exact head `4c991ee0517394c4b892be1fd0f5aa0692dd8d85`. This is a rendering foundation toward grounded medieval art, not finished Manor Lords fidelity. No Manor Lords assets are included.

## The actual building assembles

Existing building-family assemblers now render unfinished and finished structures. `BuildingConstructionPresentation.ts` projects their parts from authoritative `work / constructionWork`, without new state/save fields.

| Work | Presentation |
| --- | --- |
| 0–12% | Footings/site outline; delivered supplies retained |
| 12–38% | Actual posts, rails and framing rise from their bases |
| 38–66% | Infill rises; pitched roof rafters assemble |
| 66–90% | Actual roof covers progressively along its ridge |
| 90–completion | Doors, fittings and props finish |
| Complete | Unfiltered final assembly; operational lights, smoke and occupants allowed |

Parts overlap phases slightly. Open shelters, palisades and campfires reveal their own parts, without invented house walls. Houses retain residential widths, courtyard wings, frontage rotations and visual offsets. Scaffolding disappears on completion. No work progress is inferred from delivery alone.

Blueprints start with zero health. Rendering previously classified them as ruins before reaching construction. `buildingDamageVisualStage` distinguishes live unfinished sites from destroyed/completed structures; simulation health/destruction rules are unchanged.

Market/Trading Post previously used generic cubes. They now have bounded stall/warehouse assemblies and actual inventory props. No building is unlocked. Pitched rafters augment existing timber-frame assemblies.

## Shared models and surfaces

Timber/plaster/roof/cloth share 512-square albedo/normal/roughness maps. Instance dimensions control sampling to avoid stretched textures. Instance color supplies the palette once. Garments gain sewn shoulder/neck/hem profiles and fixed folds; movement/work poses remain. Hands, boots and helmets share batches. Existing player/raiders reuse the figure assembly. Figures remain simplified, without per-agent rigs, mixers or controllers.

Derived sources are from [Poly Haven](https://polyhaven.com/), whose [license FAQ](https://docs.polyhaven.com/en/faq) describes CC0:

- [Island tree](https://polyhaven.com/a/island_tree_01), [wooden wine barrel](https://polyhaven.com/a/wine_barrel_01), [Rock 09](https://polyhaven.com/a/rock_09).
- [Medieval wood](https://polyhaven.com/a/medieval_wood), [grey plaster](https://polyhaven.com/a/grey_plaster), [grey roof](https://polyhaven.com/a/grey_roof_01), [fabric pattern](https://polyhaven.com/a/fabric_pattern_07).

Surface albedo is neutralized; existing colors supply dye. Cloth albedo derives from its available roughness map. `assets/world/grounded/manifest.json` records measured exported meshes; `surfaces.json` records surface sources; `model-source-records.json` preserves source URL/hash records. Runtime loads local bundled assets, not third-party URLs.

Preparation uses Blender 5.2.1. Obtain each recorded 1k glTF and included files, preserving paths under ignored `.model-sources/<asset>/`. Name glTF `source.gltf` and the source record `source-files.json`. Obtain the 1k JPG diffuse/OpenGL-normal/roughness maps from each surface's Poly Haven API entry; save as `<source>-color.jpg`, `-normal.jpg`, `-rough.jpg` in `.model-sources/`. Run `scripts/prepare-grounded-models.py` with background Blender and `scripts/prepare-grounded-textures.py` with Python/Pillow. Reduction targets are approximate; tests enforce actual outputs. Committed outputs require no Blender/Python for normal development or CI.

## Budgets and lifecycle

| Model | Triangles | File bytes | Detailed instance cap |
| --- | ---: | ---: | ---: |
| Tree | 24,173 | 2,723,536 | 24 |
| Barrel | 1,252 | 186,864 | 128 |
| Rock | 699 | 118,256 | 256 |

Three GLBs + twelve surface maps total **3,539,148 bytes** before transport compression. Eight shared glTF primitive batches replace individual imported objects. Their capacity ceiling is 919,352 triangles per render pass; shadows add cost. Additional shared batches: rafters (3,120 slots), hands/boots (`2 × agentCapacity + 200` each) and helmets (`agentCapacity + 84`). Each garment/limb geometry stays below 300 triangles. Normal population cap stays ten.

Detailed trees use existing nearby presentation, within 32m of focus and zoom below 80. Far trees, exhausted detail slots and loading models retain procedural fallback geometry. Detail transitions can visibly pop; this is not a full vegetation replacement. Standing/felling models retain existing job progress; debranching/logs remain procedural. Leaf atlases use matching color/shadow-depth cutouts rather than blended rectangles. Shared models, maps and depth materials are disposed on scene replacement, including late loads.

M4 reports now record `assetsReadyDuringSample` and invalidate intervals containing unloaded model/surface assets. This prevents fallback geometry from being reported as final-renderer performance. No new performance/population envelope was measured. Historical renderer timings do not establish performance for this asset revision.

## Verification and review

Install, strict typecheck, architecture check, **234 tests**, production build and final diff review pass. Nine additional cases cover stages/invalid inputs, zero-health sites, anchored posts/rotated roofs, operational-effect suppression, completed assembly, live building families, residential profiles, finite bounded geometry, matching leaf/shadow masks and GLB bounds. Some checks share a case.

Open `/?models=1`: select any live building, scrub work 0–100%, rotate camera, switch Street View. This isolated review screen does not run simulation or write saves. Brief production-browser checks cover House framing/infill/roofing, asset loading and low/elevated views. Screenshots are under `docs/qa/construction-*.png`. Extended gameplay testing is left to the user.

Suggested user checks: build roadside House/Lodge; pause at each phase; save/reload a partial site; cancel it; destroy a completed structure; compare wide courtyard plots; review Market, Trading Post, Mine and Fishery; watch tree felling/debranching and approach/leave a woodland stand.

Remaining: bespoke final building meshes, coherent far vegetation, species diversity, closer character faces/hair, soft LOD transitions, new foreground GPU/large-town measurements. Some architecture and distant scenery remain procedural; this does not finish art for everything. Existing large-bundle build warning remains.

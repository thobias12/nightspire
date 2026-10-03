# Village visual pass — 2026-10-03

Focused on the existing House, Forester's Lodge and Stockpile, starting from UI PR #73 head `83dd6e325631977ed92b1254ade32864599a5c8e`. No new gameplay content, dependencies, economy/navigation rules, save fields, placement changes or population-cap change.

## Presentation

- Houses retain their residential footprint/frontage profiles. Chimney caps, loft vents and a lightly settled roof add detail; two small smoke puffs appear only for occupied homes. Smoke is a visual occupancy cue, not a fuel rule.
- The Forester's Lodge has a lower eave-front cabin and an open front timber shelter with clearance for workers. Stored Wood produces up to six logs; assigned living workers produce up to three rack tools. Empty/unassigned workplaces do not show phantom output or staff tools.
- Stockpiles have a higher open eave-front shelter, braced posts and low rear boards so stock remains visible. Roof offsets rotate with the whole building. Wood, Food, Ale, Ore and Tools retain quantity-dependent, bounded props.
- Moving settlers stride; waiting cargo carriers stay still. Food uses a sack, Ale a barrel, Ore/Tools a basket, and material deliveries small timber bundles. Existing tree felling/debranching and heavy gathered-timber/ox hauling remain intact.
- Builders face the actual job target and raise a hammer. Up to six logs show actual delivered site timber and disappear on completion/destruction. Existing foundation/frame/shell stages remain authoritative.

`VillagePresentation.ts` owns renderer-independent stock/activity projections and one reusable frame lookup index. `WorkerActivityRenderer.ts` emits only shared-batch props. `TownBuildingRenderer.ts` owns the building/figure shapes. `SceneRenderer.ts` coordinates these projections; simulation never reads them.

## Renderer budgets

One new `villageRoofs` batch, capacity 520, shares one 26-triangle geometry/material across the three building families. The prior gable has six triangles; each replaced roof adds 20 triangles per render pass. Other building families keep their roof batch. No texture asset or individual mesh/material/controller/mixer is added.

Cargo reuses existing batches. With `extra = max(0, agentCapacity - 10)`, Metal/Barrels/Sacks/Baskets gain `extra` slots, Logs gain `3 × extra`, and Ore capacity becomes `max(360, 2 × agentCapacity)`. Normal-game capacities for these batches remain unchanged because its capacity is ten. Smoke remains capped at 360. Overflow remains counted and invalidates a benchmark report.

The frame index replaces per-settler job/node searches and per-House plot searches with one linear rebuild and ID lookups. It clears removed and loaded entities rather than retaining stale presentation references.

## Benchmark protocol and baseline

Use the production preview at `/?benchmark=1`, Logistics at 100 and 500, each 40 warmup + 360 measured fixed steps (20 simulated seconds), full detail/shadows, global budget two solves/tick. Keep the benchmark itself in the foreground and preserve its window dimensions throughout sampling. Do not start another case before the completion message/report appears.

Baseline build is the clean exact PR #73 head above. Raw evidence: [baseline JSON](benchmarks/village-visual-baseline.json). The 100-agent baseline used 1280×720 DPR1; the 500-agent baseline used 1888×1117 DPR1.1. They are different viewport cases, not a population-only comparison.

| Logistics baseline | Tick CPU p95 | Render CPU p95 | Frame p95 | Mean FPS | Max calls | Max triangles | Dropped seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 1.3 ms | 6.0 ms | 5.8 ms | 174.0 | 104 | 1,035,424 | 0.1010 |
| 500 | 2.3 ms | 12.7 ms | 17.2 ms | 78.8 | 105 | 5,017,836 | 0.1491 |

Timing is one machine and a short synthetic workload, not GPU timing or a large-settlement guarantee. Baseline navigation ended with queue 0 at 100 and 222 at 500. These are baseline observations, not claims about the changed renderer.

Post-change runs on clean build `fbfe329ccb49bbc6099439f8d0b9ecae48c6db45` were interrupted by browser throttling and window/DPR changes. A completed 100-agent run retained the baseline start/end simulation hashes and had zero instance overflow, but was explicitly marked `valid: false` after its dimensions changed. Other runs accumulated substantial dropped time or remained partial. All were excluded from timing evidence. The harness can also mark a throttled run valid when dimensions/overflow pass; inspect foreground status and dropped-time counters as well.

**No reliable before/after performance comparison was completed.** Extended testing stopped at the user's request; final scale and visual acceptance are handed back for manual testing. No speedup or new safe population envelope is claimed. The normal cap remains ten.

## Verification and limits

`npm install` and `npm run verify` pass: architecture check (71 acyclic modules), strict typecheck, 218 tests and production build. Eight new regressions cover deterministic bounded roof geometry, index refresh/load/removal, job completion, worker work/cargo/travel/death priorities, inventory bands, actual lodge output/staff, occupied-home smoke, rotated compound geometry and bounded cargo/site staging.

Browser checks completed: existing QA town; road-frontage Lodge placement; physical delivery of all 35 Wood; completion; two Forester assignments; forestry output supplied to Stockpile (185 → 235 Wood after construction); partial-site reload; and save/reload/load retaining the completed Lodge, 235 Wood, four remaining laborers and 6/6 housed residents. The visible state integrity check passed. Overview and Street View were inspected and captured. Builder prop emission is covered by the regressions; an in-browser close-up of the hammer swing was not captured.

Captured views: [overview](qa/village-overview.png), [Street View](qa/village-street.png), and [prior presentation](qa/village-before.png). The prior view has a different camera/window and is illustrative, not a matched screenshot comparison. For manual acceptance, inspect the open Stockpile and rotating compound, occupied/empty House smoke, staffed/empty Lodge tool rack and output stacks, all carried resource types, and a construction site during delivery and hammer work.

Procedural graybox geometry remains the art level. Props indicate quantity bands, not exact individual units; tools indicate assignment rather than momentary work rate. No long soak, dense-building budget audit, low-end GPU test or full benchmark ladder was performed in this pass. Navigation queue latency and the large node-heavy forestry triangle load remain outside this visual pass. The existing large JavaScript chunk warning remains.

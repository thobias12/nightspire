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

Use the production preview at `/?benchmark=1`, Logistics at 100 and 500, each 40 warmup + 360 measured fixed steps (20 simulated seconds), 1280×720 DPR1, full detail/shadows, global budget two solves/tick. Keep the benchmark itself in the foreground. Do not start another case before the completion message/report appears.

Baseline build is the clean exact PR #73 head above. Raw evidence: [baseline JSON](benchmarks/village-visual-baseline.json). Updated measurements are pending completion of the foreground comparison.

| Logistics | Render CPU p95 | Frame p95 | Mean FPS | Max calls | Max triangles | Dropped seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 before | 6.0 ms | 5.8 ms | 174.0 | 104 | 1,035,424 | See raw report |
| 500 before | 12.7 ms | See raw report | 78.8 | 105 | 5,017,836 | 0.1491 |

Timing is one machine and a short synthetic workload, not GPU timing or a large-settlement guarantee. A discarded background-tab run throttled to roughly 1 FPS and accumulated dropped time even though the harness marked its dimensions/overflow valid. It is excluded from the evidence; always inspect foreground status and dropped-time counters.

## Verification and limits

`npm install` and `npm run verify` pass: architecture check (71 acyclic modules), strict typecheck, 218 tests and production build. Eight new regressions cover deterministic bounded roof geometry, index refresh/load/removal, job completion, worker work/cargo/travel/death priorities, inventory bands, actual lodge output/staff, occupied-home smoke, rotated compound geometry and bounded cargo/site staging.

Browser verification so far: existing QA town, road-frontage Lodge placement, physical delivery of all 35 Wood, completion, two Forester assignments, and reload of a partially delivered construction site. Final view and output/save checks are in progress.

Procedural graybox geometry remains the art level. Props indicate quantity bands, not exact individual units; tools indicate assignment rather than momentary work rate. No long soak, dense-building budget audit, low-end GPU test or full benchmark ladder was performed in this pass. Navigation queue latency and the large node-heavy forestry triangle load remain outside this visual pass. The existing large JavaScript chunk warning remains.

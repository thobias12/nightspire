# Performance budgets

These are engineering targets, not promises. Measure them on representative hardware and adjust with evidence.

## Development target

Primary target: smooth desktop play at 60 FPS under the current milestone workload.

Frame budget at 60 FPS: ~16.7 ms total.

The project should expose enough counters to identify where that time goes.

## M1 target scene

- 10 settlers
- 50–100 resource/prop objects
- small settlement
- no raid

Expected outcome: performance should be comfortably above target; if M1 is already frame-bound, architecture needs fixing before expansion.

## M2 target scene

- ~10 settlers/civilians
- ~5–10 defenders
- 20–40 enemies
- walls/gates/buildings
- player combat

Expected outcome: stable 60 FPS on the primary dev machine with headroom.

## M4 scale benchmark ladder

Create deterministic benchmark presets, ideally with a fixed seed:

- 100 total agents
- 250 total agents
- 500 total agents
- 1000 total agents

At each level record:

- total frame time
- simulation time
- render time
- draw calls
- triangles
- texture memory estimate if available
- active skeletal animations
- NPCs by simulation tier
- path requests/sec
- average path queue depth
- combat decisions/sec

Do not optimize toward 1000 agents by degrading the actual 50-agent game experience unnecessarily.

## Rules of thumb

- no pathfinding per NPC per frame
- no raycast/perception sweep per NPC per frame
- no unique material per background NPC unless required
- pool frequently spawned effects/projectiles/debris
- reuse geometry/materials
- cap dynamic shadows and shadow casters intentionally
- use distance/screen-size LOD
- decouple AI decision rate from render frame rate
- allow distant jobs/economy to simulate at lower frequencies

## Benchmark requirement

The first M4 measured pass is available at [M4_SCALE_PROOF.md](M4_SCALE_PROOF.md), with raw before/after browser reports. It covers 10/100/250/500 settlers on the M3.8.1 base. The demonstrated responsive synthetic envelope is conservatively 10–100 on the recorded machine and short workloads; navigation latency prevents a larger gameplay-support claim. The normal cap stays ten. GPU timing, lower-end hardware and long mixed-workload runs remain unmeasured.

Any major claim such as “supports 500 settlers” should link to a repeatable benchmark configuration, measured build/commit and captured counters.

## M1 measurements

See [QA.md](QA.md) for the 2026-09-26 ten-settler browser samples, measurement caveats and bottlenecks. The HUD exposes frame interval, smoothed simulation/render submission CPU, draw calls, triangles, active jobs/population, path requests/solves per frame, queue depth, path failures and dropped catch-up time. Navigation is capped at two solves per simulation tick; no larger-population performance claim is made.

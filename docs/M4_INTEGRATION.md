# M4 integration on M3.10.2

This branch ports the useful scale work from draft PR #29 onto the current M3.10.2 road-planner stack instead of merging the older M3.8.1 branch directly.

## What is integrated

- deterministic browser benchmark worlds for 10 / 100 / 250 / 500 settlers
- pass-local job reservation indexes used by assignment/storage checks
- shared per-tick service assignment plans with invalidation after state-changing job updates
- navigation timing / queue instrumentation
- benchmark-aware renderer capacities and explicit instance-overflow counters
- bounded HUD roster pagination
- scale regression tests and baseline deterministic trajectory checks

The newer curved-road renderer, Residential Plot presentation, M3.10.2 HUD and road-planner controls stay in place. Renderer capacity changes were adapted to the newer adult-silhouette batches rather than replacing the renderer with the older M3.8.1 version.

## Preserved limits

Normal gameplay still caps settlers at **10**. The benchmark is an isolated QA world and cannot write gameplay saves. Roads still do not change path cost, travel speed or logistics behavior.

Navigation still solves at most two queued paths per fixed simulation tick. PR #29's measurements showed that reservation/service scheduling was the dominant CPU problem before optimization, while route queue latency remained the limiting factor for synchronized large populations.

## Evidence and provenance

The original measured M4 source is PR #29 at `6b1de8630ac1f00efb7267de09637d78b8266b3b`, based on M3.8.1 `4d9097e08d7384406fe93fc3cf7c15229ddf0fd4`.

This integration starts from M3.10.2 `d662c1f96d6a8bf65632c2c30fed37fff12e8612`. The historical JSON reports under `docs/benchmarks/` are kept as deterministic regression evidence for the original benchmark run; their timing numbers must not be presented as fresh M3.10.2 performance measurements.

Automated integration verification requires strict TypeScript, the full test suite and production Vite build to pass. Browser timing should be rerun on the integrated branch before raising the gameplay population cap or publishing new scale claims.

## Browser benchmark

Run the production preview and open `/?benchmark=1`, or use **Open M4 scale benchmark** in the QA panel. **Run 10–500 ladder** executes Day Logistics and Dusk Services cases across 10, 100, 250 and 500 settlers.

Keep the benchmark tab active and viewport stable. A hidden tab invalidates the run. Read queue depth and route-wait measurements alongside FPS/CPU numbers; high FPS does not mean a large synchronized crowd is responsive if route requests are still waiting.

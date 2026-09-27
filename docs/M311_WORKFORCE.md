# M3.11.0 — Professions & Workplace Economy

M3.11.0 adds the first explicit workforce decision to Nightspire without changing the road renderer, navigation semantics or the ten-settler gameplay cap.

## Player loop

Brewery and Blacksmith each expose two dedicated worker slots. Inspect a completed workplace and choose **Assign laborer**. The oldest available general laborer is assigned deterministically. If that settler is already gathering, hauling, building or repairing, they finish the current job first; new general jobs are no longer assigned once they are free.

During Day the worker physically reports to the building entrance. Production depends on staff who are actually present:

- 0 / 2 present: production paused
- 1 / 2 present: 50% production speed
- 2 / 2 present: 100% production speed

At Dusk, Night and Dawn those workers use the existing recreation/shelter schedule like other civilians. Their workplace assignment remains persistent so they return next Day.

## Professions

Dedicated workplace assignments provide stable professions:

- Brewery → Brewer
- Blacksmith → Blacksmith
- Guard duty → Guard

General laborers keep the flexible job system and receive a contextual profession label from their current work:

- Wood gathering → Woodcutter
- Food gathering → Forager
- Ore gathering → Miner
- Delivery / supply → Hauler
- Construction / repair → Builder
- No active specialist task → Laborer

This is presentation plus workforce ownership; it does not create separate job ledgers.

## Persistence and safety

Each settler stores `workplaceId: number | null`. Older version-1 saves migrate missing values to `null`. Validation requires workplace IDs to reference a completed building with worker slots and prevents assignments above capacity. Demolishing a workplace releases its assigned workers back to the general labor pool.

Assignments do not interrupt active jobs or discard cargo, avoiding reservation/resource-conservation edge cases.

## Benchmark interaction

M4 benchmark preset version 3 staffs a bounded subset of production slots while preserving a large general labor pool. Historical M4 JSON files remain evidence for the earlier M3.8.1 benchmark build and are not treated as fresh M3.11 timing results.

## Deferred

This pass deliberately does not add markets, Woodcutter camps, local household production, skill progression, worker wages, seasonal labor or larger population support. Those should build on the now-explicit workforce model in later M3.11 slices.

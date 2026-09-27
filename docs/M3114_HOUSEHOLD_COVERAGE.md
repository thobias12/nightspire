# M3.11.4 — Households & Local Service Coverage

M3.11.4 turns housing into a neighborhood-planning system. Houses already owned resident assignments; this slice makes those assignments visible and uses them as the origin for local service coverage.

## Household model

Every completed, non-ruined House produces a derived household status. No new household entity or save field is required.

A household reports:

- assigned residents
- Food access
- serving Market and distance
- recreation provider and distance
- average resident Safety
- average resident satisfaction from the four existing needs

Empty Houses remain visible but do not count toward occupied-household coverage totals.

## Market catchment

Formal Market distribution now has an **18m household catchment**.

For a Market to count as Food access for a House it must:

- be complete and not ruined
- have at least one assigned Vendor
- contain Food
- be within 18m of the House

Unhoused settlers use their current position as the distribution origin.

The actual daily meal system also respects this catchment. A Market with spare meal throughput can no longer feed settlers whose household lies outside its neighborhood.

Before any completed Market exists, the early-game camp-ration fallback remains unchanged and occupied Houses count as having basic Food access.

## Recreation catchment

Campfire and Tavern service assignment now uses an 18m catchment from the settler's House, or current position when unhoused. Service priority still prefers the better provider, but a slot outside the household catchment is no longer considered available.

This makes the House inspector's recreation coverage reflect real service behavior rather than being informational only.

## Immigration

Once at least one completed Market exists, population attraction requires every occupied household to have Market Food access. Total stored Food remains necessary but is no longer sufficient by itself.

This creates a direct planning consequence for expansion: adding distant housing without extending Market coverage can stop immigration even when the settlement has abundant Food globally.

## Scope boundary

Safety is still the existing settlement need and is reported as the household residents' average; this pass does not add local patrol zones or guard-post auras. Household shopping animations, Markets as visual stall clusters, building upgrades and trade are also deferred.

No renderer code is changed, keeping this work isolated from Astra's pending road-art branch.

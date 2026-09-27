# M3.11.2 — Stockpile Specialization & Receiving Priority

M3.11.2 makes storage layout part of Nightspire's economy instead of treating every Stockpile as interchangeable global capacity.

## Resource filters

Every Stockpile now stores five independent acceptance flags:

- Wood
- Food
- Ale
- Ore
- Tools

New Stockpiles and migrated saves start with all five enabled.

Disabling a resource changes **new inbound storage only**. Existing inventory is deliberately not deleted, ejected or made unusable. Settlers can still withdraw existing stock for construction, repair, services and workplace supply.

Already-carried or already-assigned deliveries are also allowed to finish. This keeps filter changes safe and avoids deleting cargo or invalidating active jobs.

## Receiving priority

Every Stockpile also stores one receiving priority:

- Low
- Normal
- High

Destination selection is deterministic:

1. discard Stockpiles that reject the resource or have no free capacity
2. choose the highest receiving-priority tier
3. inside that tier, choose the shortest travel distance
4. use building id as the final deterministic tie-break

This means priority is a strong player instruction rather than a small distance modifier.

## What respects specialization

The rules apply to:

- resource gathering deposits
- Brewery output moving to storage
- Blacksmith output moving to storage
- safe material returns from cancelled blueprints
- demolition refunds

Resource **withdrawal** does not use acceptance filters. A Food-disabled Stockpile containing old Food is still a valid Food source until that inventory is consumed or hauled out through future systems.

## Intended town planning

Examples:

- a Wood-only High-priority yard near an expansion/construction district
- a Food + Ale store near Brewery/Tavern
- an Ore + Tools store near the Blacksmith
- a general Normal-priority starter Stockpile as overflow

This begins making physical town layout affect hauling distance without introducing Markets, carts, warehouse workers or road movement bonuses yet.

## Scope boundary

No renderer work is included. This remains isolated from Astra's pending road-art changes and does not alter roads, navigation policy, population caps or combat.

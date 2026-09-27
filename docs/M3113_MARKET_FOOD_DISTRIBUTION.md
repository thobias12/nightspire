# M3.11.3 — Market & Food Distribution

M3.11.3 moves Nightspire's daily Food consumption out of an invisible global Stockpile rule and into the first staffed settlement-distribution service.

## Transition from camp rations

A new settlement still works exactly as before while no completed Market exists: one daily Food ration is taken directly from Stockpile inventory for each settler who still needs today's meal.

An unfinished Market does not change that behavior.

Once the first Market is complete, the settlement is considered to have adopted formal food distribution. Direct Stockpile meals stop. Food must instead be hauled into Market inventory and distributed by active Vendors.

This avoids making the Market mandatory in the opening minutes while still giving it a real systemic role once the player chooses to build it.

## Market building

The Market costs 30 Wood and has:

- 20 Food local capacity
- two Vendor workplace slots
- five meals per active Vendor per Day
- ten meals per Day at full staffing, matching the current gameplay population cap
- a two-Day reserve target based on assigned Vendor capacity

One assigned Vendor therefore creates a 10-Food reserve target. Two assigned Vendors create the full 20-Food target.

Assigned Vendors use the existing M3.11 workplace system: they finish an active job first, leave the general labor pool, physically report to the Market during Day, and only count toward distribution capacity while present.

## Food logistics

Market Food comes from Stockpiles through ordinary `supply` jobs and the existing `JobReservations` index. Food supply to a Market is treated as essential settlement work and scores above ordinary construction delivery.

Stockpile filters remain meaningful:

- a Food-disabled Stockpile will not receive newly gathered Food
- Food already stored there remains withdrawable
- Markets can therefore be fed from specialized Food depots without changing the withdrawal rules introduced in M3.11.2

## Household distribution

When a settler needs today's meal, the simulation chooses the nearest operational Market using the settler's assigned House when available, otherwise the settler's current position. A Market must have:

- Food in local inventory
- at least one Vendor physically present
- unused meal capacity for the current Day

Distribution consumes one Food, restores the settler's Food need to 100%, records `lastMealDay`, increments settlement Food consumption and increments that Market's daily served counter.

The served counter persists for the current Day, so repeated decision ticks cannot bypass Vendor throughput.

## Attraction and UI

Food staged in Markets still counts toward population-attraction Food reserves. The HUD reports how much settlement Food is currently in Markets, how many Markets are active and how many meals have been distributed against current daily capacity.

## Scope boundary

This pass intentionally does not add trade, currency, merchant caravans, household shopping animations, Market stalls as separate entities or a custom Market renderer. It is the distribution foundation those systems can build on later, while keeping Astra's pending road-rendering work isolated.

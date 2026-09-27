# M3.11.1 — Local Workplace Logistics & Hauling Priorities

M3.11.1 turns the workplace assignment layer into a visible local logistics problem. Production buildings no longer behave like invisible extensions of the global stockpile.

## Local buffers

Each production definition now has two logistics values in addition to its hard capacities:

- an **input buffer target**
- a **finished-goods pickup threshold**

At Normal priority:

- Brewery keeps 8 Food locally out of a 20 Food maximum and requests Ale pickup from 8 Ale.
- Blacksmith keeps 9 Ore locally out of an 18 Ore maximum and requests Tools pickup from 2 Tools.

Inputs are still sourced from stockpiles. Finished goods still enter stockpile storage before downstream use. The change is *when* Laborers choose to move those resources.

Unstaffed workplaces request no production input at all. This prevents raw materials from being parked inside buildings that cannot currently operate.

## Player hauling priority

Every building persists `haulPriority: 'low' | 'normal' | 'high'`. Production workplaces expose it in the inspector.

**Low**
- buffers one input batch
- delays output pickup until roughly 75% of output capacity
- workplace hauling yields to construction-material delivery when both compete for a Laborer

**Normal**
- uses the tuned per-building input target and output threshold
- remains slightly above ordinary construction delivery when a staffed workplace needs logistics

**High**
- requests input up to the full local input capacity
- requests finished-goods pickup after one output batch
- wins the next available hauling decision over ordinary construction delivery

Repair work remains above workplace logistics.

## Reservation correctness

Hauling decisions still use the existing pass-local `JobReservations` index. Input needs account for already inbound supply jobs. Output collection is triggered by the building's actual local output level; after the threshold fires, additional Laborers may reserve the remaining output even if earlier reservations bring the unreserved remainder below the threshold. This avoids leaving a partial batch stranded indefinitely.

## Persistence

Older version-1 saves migrate missing hauling priorities to **Normal**. Save validation accepts only Low, Normal or High.

## Scope boundary

This pass does not add markets, carts, dedicated warehouse workers, per-resource stockpile filters, new buildings, new roads, navigation changes, or visual renderer work. It is deliberately isolated from the pending Astra road-art branch.

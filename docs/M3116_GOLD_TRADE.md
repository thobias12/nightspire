# M3.11.6 — Gold Trade & Merchant Economy

M3.11.6 connects Nightspire's internal production economy to an external merchant loop. The currency is **Gold**.

## Trading Post

The Trading Post costs 50 Wood and provides:

- 60 units of dedicated trade-cargo capacity
- 2 Trader workplace slots
- one settlement-wide trade policy panel
- one active merchant-caravan interaction point

This slice intentionally allows one Trading Post per settlement.

Traders use the existing workplace system. They finish current jobs, leave the general labor pool, report physically during Day and must be present before a visiting merchant settles a deal.

## Gold

A new settlement starts with **60 Gold**.

Gold is not a gatherable or stockpile resource. It is settlement currency persisted in `WorldState.trade`.

Current deterministic prices:

| Resource | Buy | Sell |
| --- | ---: | ---: |
| Wood | 2 Gold | 1 Gold |
| Food | 3 Gold | 2 Gold |
| Ale | 6 Gold | 4 Gold |
| Iron Ore | 5 Gold | 3 Gold |
| Tools | 12 Gold | 8 Gold |

Imports are deliberately more expensive than exports to prevent a zero-risk conversion loop.

## Resource policies

Each resource has one policy and one reserve value.

**Keep**
- no merchant import or export

**Export surplus**
- Laborers stage only Stockpile stock above the reserve
- staged cargo waits at the Trading Post for the next merchant
- up to 20 units of that resource are sold per visit

**Import to reserve**
- on a merchant visit, Nightspire buys toward the configured reserve
- purchases are limited by available Gold, the 20-unit visit cap and Trading Post cargo space
- imported cargo appears at the Trading Post, then ordinary Laborers haul it to accepting Stockpiles

Reserve values are adjustable in 5-unit steps from 0 to 500.

## Merchant cadence

The first merchant is scheduled for Day 3 once a Trading Post exists. A caravan remains available for that Day.

A trade settles only when:

- the caravan is visiting
- a completed Trading Post exists
- at least one assigned Trader is physically active
- the visit has not already settled

A visit cannot transact twice.

Base caravan interval is **3 Days**.

## Prosperity and trade reputation

House progression now feeds back into commerce:

- Established Home: +1 reputation
- Prosperous Home: +2 reputation

At 4 or more reputation, the caravan interval becomes **2 Days**. This gives prosperous neighborhoods an economic payoff beyond bed capacity.

## Physical logistics

Exports do not disappear directly from global storage. Laborers use ordinary `supply` jobs to carry them from Stockpiles into Trading Post cargo.

Imports similarly do not appear in Stockpiles. The merchant delivers them to the Trading Post, after which Laborers haul them into Stockpiles that accept that resource under M3.11.2 specialization rules.

This keeps trade connected to actual labor availability and town layout.

## Persistence and scope

Gold, trade policies, reserves, merchant timing, visit count, Gold earned/spent and lifetime imported/exported inventories persist through save/load.

Older saves migrate to:

- 60 Gold
- Keep on every resource
- default reserves
- first merchant Day 3
- zero trade history

This is a systems-first trade slice. Merchant models, caravan movement, dynamic prices, contracts, taxes and rare luxury goods are deferred. No renderer code is changed so Astra's pending road-art work remains isolated.

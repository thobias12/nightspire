# Milestones

## M0 — Foundation (complete)

- [x] Vite + TypeScript + Three.js boots
- [x] Strict typecheck/build
- [x] Minimal renderer ownership
- [x] Renderer-independent world-state placeholder
- [x] Basic day/night lighting visualization
- [x] Example instanced world content
- [x] Agent/project documentation

## M1 — Settlement loop (implemented; ready for review)

- [x] player controller and camera modes
- [x] resource inventory/stockpile model
- [x] harvestable trees/food nodes
- [x] settler entity store
- [x] task/job queue
- [x] wood gathering end-to-end
- [x] food gathering end-to-end
- [x] building placement ghost
- [x] construction work delivered by settlers
- [x] houses provide housing
- [x] save/load foundation
- [x] QA panel with time/resource/spawn controls

**Exit verified for this pass:** Ten-settler automated and browser playthroughs gathered both resources, physically delivered 70 wood, completed three houses and a stockpile, housed all ten settlers, and resumed after save/load. See [QA.md](QA.md) for evidence and limitations.

## M1.1 — Review hardening (complete)

- [x] safe blueprint cancellation with reservation/in-transit/delivered material conservation
- [x] cancellation refusal when storage cannot accept refunds
- [x] player-controlled wood/food stock targets
- [x] blocked-route retry cooldown and topology-change recovery
- [x] friendly settler display numbers independent from internal IDs
- [x] rotating backup save slot
- [x] validated JSON save export/import
- [x] migration of earlier M1 version-1 saves to default stock targets
- [x] long-run conservation regression test
- [x] GitHub CI for install, typecheck, tests and production build

**Exit:** 15 regression tests pass; GitHub CI passes typecheck, tests and production build. M2 remains untouched.

## M2 — First night

- [x] dusk behavior transition
- [x] guard role/post
- [x] simple enemy entity store
- [x] raid spawn/director
- [x] basic enemy navigation toward settlement
- [x] basic NPC combat
- [x] player melee combat
- [x] wooden walls and gate
- [x] structure health/damage
- [x] morning cleanup and repairs

**M2.0 verified:** deterministic Dawn/Day/Dusk/Night phases, daylight-only job assignment, cargo-safe dusk shutdown, civilian sheltering, guard roles and buildable Guard Posts. 20 tests pass and CI builds successfully.

**M2.1 verified:** persisted Raider entities, one deterministic 12-raider wave per day, shared bounded navigation toward the settlement, dawn retreat, active-raid save/load, old-save migration, inspection/debug rendering. 26 tests pass and CI builds successfully.

**M2.2 verified:** player melee, guard interception, raider counterattacks, persisted combat health/cooldowns, defender downing/recovery, raider death and raid-clear tracking. 32 tests pass and CI builds successfully.

**M2.3 verified:** Wooden Walls/Gates, asymmetric gate navigation, structure HP/hit state, raider structure targeting, destructible fortification breaches, critical core-building damage, and timber-consuming daylight repair jobs. 39 tests pass and CI builds successfully.

**M2.4 verified:** deterministic raid pressure now starts at 20 attackers, grows by four per wave, and caps at 40. A dedicated 40-raider regression keeps all hostile routing inside the shared two-paths-per-tick budget.

**Full M2 technical exit:** implemented at the intended 20–40 attacker scale. Live user balance feedback can still tune HP/damage/pacing, but the next major systems milestone is M3.

## M3 — Needs and production

- [x] food/housing/safety/recreation foundation
- [ ] blacksmith production
- [x] tavern service
- [x] Brewery → Ale → Tavern production chain
- [x] population attraction/immigration
- [x] happiness consequences
- [ ] better logistics/resource reservations
- [x] building/construction UX pass
- [x] settlement visual/atmosphere readability pass

**M3.0 verified:** food consumption, bed-backed Housing, defense-backed Safety, capacity-limited Campfire Recreation, persisted per-settler needs and derived Happiness.

**M3.1 verified:** reusable service-provider definitions, stable slot assignment, supplied Tavern operation, physical daytime pantry hauling, stronger Tavern recreation, dry-Tavern fallback to Campfires, save migration and conservation accounting.

**M3.2 verified:** Ale as a third resource, generic production progress, Brewery Food input/Ale output, stockpile-staged Ale logistics, Tavern Ale consumption and conservation accounting.

**M3.3 verified:** deterministic attraction from spare housing, stored Food, Happiness, Safety and raid outcomes; two-Day qualification; physical edge-entry immigrants; arriving-settler job exclusion; QA visibility; and current-state save/load coverage.

**M3.4 verified:** categorized build mode, 1–8 hotkeys, persisted R rotation, Shift-repeat placement, atomic straight wall dragging, direct wall→gate conversion, footprint-aware selection, safe 50% demolition refunds, and clearer placement feedback.

**M3.5 verified:** building silhouettes, construction-stage readability, damage/ruin presentation, terrain variation, occupied settlement glow, moonlight/fog, Campfire activity and Brewery production smoke remain renderer-owned and batched.

**M3.6 target:** make the four existing needs affect actual labor without new persisted state. Happiness bands provide +15% / baseline / -10% / -25% / -40% hands-on work rates, while Happiness below 20% or Food below 15% restricts settlers to Food gathering and emergency repairs. Walking speed, combat, production buildings, pathfinding and the population cap remain unchanged.

**Exit:** settlement layout and production meaningfully affect growth and survival.

## M4 — Scale proof

- [ ] benchmark scene
- [ ] spatial partitioning
- [x] basic path request budget (implemented in M1; large-scale validation still pending)
- [ ] AI update tiers
- [ ] rendering LOD
- [ ] large repeated-content instancing
- [ ] profile 100/250/500+ simulated agents

**Exit:** documented performance envelope and architecture validated before content explosion.

## M5 — Mature city expansion

Only after M1–M4 are healthy:

- bathhouses/hygiene
- adult brothel/pleasure-house service economy with clearly adult characters
- markets/trade
- richer citizen classes
- more enemy archetypes
- modular equipment and higher-quality hero characters

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

- [ ] dusk behavior transition
- [ ] guard role/post
- [ ] simple enemy entity store
- [ ] raid spawn/director
- [ ] basic enemy navigation toward settlement
- [ ] basic NPC combat
- [ ] player melee combat
- [ ] wooden walls and gate
- [ ] structure health/damage
- [ ] morning cleanup and repairs

**Exit:** build by day, survive 20–40 attackers at night, repair next morning.

## M3 — Needs and production

- [ ] food/housing/safety/recreation
- [ ] blacksmith production
- [ ] tavern service
- [ ] population attraction/immigration
- [ ] happiness consequences
- [ ] better logistics/resource reservations

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

- breweries/ale
- bathhouses/hygiene
- adult brothel/pleasure-house service economy with clearly adult characters
- markets/trade
- richer citizen classes
- more enemy archetypes
- modular equipment and higher-quality hero characters

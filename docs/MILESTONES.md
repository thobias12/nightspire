# Milestones

## M0 — Foundation (current)

- [x] Vite + TypeScript + Three.js boots
- [x] Strict typecheck/build
- [x] Minimal renderer ownership
- [x] Renderer-independent world-state placeholder
- [x] Basic day/night lighting visualization
- [x] Example instanced world content
- [x] Agent/project documentation

## M1 — Settlement loop

- [ ] player controller and camera modes
- [ ] resource inventory/stockpile model
- [ ] harvestable trees/food nodes
- [ ] settler entity store
- [ ] task/job queue
- [ ] wood gathering end-to-end
- [ ] food gathering end-to-end
- [ ] building placement ghost
- [ ] construction work delivered by settlers
- [ ] houses provide housing
- [ ] save/load foundation
- [ ] QA panel with time/resource/spawn controls

**Exit:** 10 settlers can gather, haul and construct a tiny settlement reliably.

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
- [ ] path request budgets
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

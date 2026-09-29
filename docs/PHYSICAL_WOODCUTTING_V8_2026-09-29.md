# Physical woodcutting V8 — 2026-09-29

## Goal

Make harvestable trees read as physical objects instead of generic resource nodes.

## Gameplay flow

- Unassigned Laborers continue to gather Wood through the normal job system.
- Assigned Foresters now receive real Wood gather jobs within their lodge radius instead of producing Wood invisibly at the lodge.
- A Forester reserves one tree, travels to it, performs the gather work, carries a five-Wood batch back to the Forester's Lodge buffer, and normal haulers move buffered timber onward.
- Forester workplace production no longer decrements tree nodes directly.
- Existing resource conservation, one-gatherer-per-node reservation, work speed and carry capacity stay authoritative.

## Tree presentation

`TreeRenderer.ts` owns the harvestable tree visual family:

1. new irregular trunk / branch / crown model,
2. visible notch and wood chips while chopping,
3. animated felling transition during the first harvest,
4. a fallen trunk after the tree is down,
5. progressively smaller bucked log rounds as Wood is removed,
6. a persistent stump when the node is exhausted,
7. managed saplings still grow into full harvestable trees.

Woodcutters face the active tree and carry a visible swinging axe while the gather job is in its work stage.

## Guardrails

- No new persisted fields are required; visual state is derived from existing node remaining Wood plus the active gather job.
- Managed trees still mature to 18 Wood and wild trees retain the existing 40-Wood yield.
- Save validation accepts the bounded Forester's Lodge resource-operation buffer as a gather destination.
- Tree rendering remains presentation-only; the simulation remains authoritative.

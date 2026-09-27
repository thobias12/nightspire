# M3.11.7 — Agriculture & Point-Drawn Farm Fields

M3.11.7 adds Nightspire's first real agricultural land-use system. The placement interaction is intentionally inspired by the freeform field planning used by games such as Manor Lords: the player defines the parcel itself instead of placing a fixed rectangular farm object.

## Farmhouse

The Farmhouse costs 45 Wood and provides:

- 3 dedicated Farmer workplace slots
- 60 Food of local harvest storage
- automatic ownership of nearby unassigned fields

Farmers use the existing workplace system. They remain dedicated workers, physically travel from the Farmhouse to their assigned fields during the Day, and return when no field currently needs work.

## Point-drawn fields

Use **P** to enter the Field tool.

- left click adds a corner
- 3–8 corners are supported
- Enter or double-click closes the polygon
- RMB or Backspace removes the latest corner
- **G** toggles 1m Grid Snap
- freeform placement works with Grid Snap off

The resulting field is a true irregular polygon. It is not converted into a fixed building footprint.

A field must stay inside the settlement boundary and have 12–180m² of area. Self-crossing polygons are rejected.

Fields cannot overlap:

- another field
- buildings or blueprints
- residential plots
- uncleared trees, food bushes or ore deposits
- existing roads

Once a field exists, later roads, buildings and residential plots also respect its land.

## Yield and work

Field size directly drives output.

Expected Food yield is approximately **0.55 Food per m²**, bounded to 8–60 Food for one field.

Sowing work scales with field area, as does harvesting work. This makes a huge field more productive but also more labor-intensive; simply drawing the largest possible parcel is not free output.

## Crop cycle

The first crop cycle is deliberately readable:

**Fallow → Sown → Growing → Ready → Harvested → Fallow**

Farmers sow Fallow fields through physical work. A newly Sown field starts its growth timer on that Day, advances to Growing on a later Day, and becomes Ready after two growth Days.

Ready fields are prioritized ahead of new sowing so a limited Farmer workforce does not ignore mature crops.

Harvest is also physical Farmer work. The full expected crop must fit in Farmhouse storage before the harvest can complete. If storage is full, the crop remains Ready.

## Logistics

Harvested Food appears in the Farmhouse first rather than teleporting into settlement storage.

General Laborers then create ordinary supply jobs to carry Farmhouse Food into Stockpiles that accept Food under the M3.11.2 specialization rules. From there, the existing Market and household systems take over.

Food sitting in a usable Farmhouse still counts toward settlement Food reserves, but daily Market/camp consumption continues to use the established distribution paths. This keeps farming tied to actual hauling capacity.

## Field presentation

The world renders tilled soil and crop strips only inside the polygon footprint. Crop presentation changes by phase:

- Fallow: dark worked soil
- Sown: short green rows
- Growing: taller green crop
- Ready: golden mature crop
- Harvested: cut/brown field

The field placement preview outlines the player's corners before finalization.

## Scope boundary

This slice keeps Food as the first crop so agriculture can be proven without multiplying resources immediately. Crop selection, fertility, seasonal windows, crop rotation, Grain, Flour, Bread and ox/plough mechanics are deferred.

The existing road generation itself is not rewritten here. The only road interaction added is land-use protection: established field parcels cannot later be crossed by a new road.

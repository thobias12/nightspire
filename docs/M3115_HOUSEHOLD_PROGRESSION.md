# M3.11.5 — Household Prosperity & Home Progression

M3.11.5 gives the local household systems a long-term payoff. Good neighborhood planning now grows housing capacity instead of only satisfying a dashboard requirement.

## Prosperity tiers

Every House persists one of three prosperity levels:

| Level | Name | Beds |
| --- | --- | ---: |
| 1 | Cottage | 4 |
| 2 | Established Home | 5 |
| 3 | Prosperous Home | 6 |

All existing and migrated Houses begin at Level 1.

## Daily qualification

Progression is evaluated once when a new Day begins. Repeated decision ticks, time controls or other calls in the same Day cannot increment the streak twice.

To progress from **Cottage → Established Home**, the House must be occupied and have:

- household Food access
- household recreation access
- Safety at least 60%
- household satisfaction at least 70%

Those conditions must hold for **2 qualifying Days**.

To progress from **Established Home → Prosperous Home**, the same household must hold:

- Food access
- recreation access
- Safety at least 70%
- household satisfaction at least 80%

for **3 further qualifying Days**.

If any requirement fails during the active tier's streak, that streak resets to zero. Once a House reaches Level 3 it remains there.

## Stable households

Increasing capacity should not cause families to teleport between homes. `assignHousing` now preserves every valid existing home assignment up to that House's current capacity. Only settlers who are unhoused or displaced by an invalid/destroyed home are assigned into open beds.

This means an upgrade creates a genuinely new spare bed instead of pulling a resident out of another established household.

## Immigration effect

Population attraction now uses the dynamic bed capacity from prosperity tiers. A Level 2 House contributes five beds and a Level 3 House contributes six, so well-served neighborhoods can create spare capacity for future immigrants without immediately building another House.

The normal gameplay population cap remains 10.

## UI

The House inspector shows:

- current prosperity level and name
- current bed capacity
- next prosperity tier
- current qualifying streak
- required Safety and satisfaction thresholds
- current blockers or **Qualifying today**

The HUD also reports L1/L2/L3 home counts and total settlement bed capacity.

## Persistence and scope

`houseLevel`, `houseQualifyingDays` and `houseLastEvaluationDay` persist in saves. Older saves migrate safely to Cottage with a zero streak.

This is a systems-only progression slice. It deliberately does not change House meshes or `SceneRenderer.ts`, keeping Astra's pending road-rendering work isolated. Visual tier differentiation can be added later after the road-art branch is recovered.

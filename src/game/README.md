# Game source layout

Nightspire is organized by **ownership**, not by milestone.

- `app/` — browser-facing coordinator and input.
- `benchmark/` — isolated benchmark runner/scenarios.
- `data/` — declarative building/resource/job definitions.
- `model/` — serializable state records and core domain types.
- `persistence/` — save validation/serialization.
- `runtime/` — fixed-step orchestration and time progression.
- `world/` — map generation, grid/navigation, roads/plots/fields.
- `systems/construction/` — building placement/lifecycle.
- `systems/jobs/` — job generation and reservations.
- `systems/economy/` — production, extraction, stockpiles, trade, agriculture.
- `systems/population/` — settlers, needs, services, workforce.
- `systems/combat/` — raids and combat.
- `render/` — Three.js presentation only.
- `ui/` — DOM/HUD presentation only.

See `docs/AI_NAVIGATION.md` before making cross-cutting changes.

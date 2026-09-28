# Nightspire UI art slots

The [current reference pass](MEDIEVAL_UI.md) uses portrait construction cards and parchment previews with these existing assets. The construction shelf is now fixed above the command row; selected-object panels remain draggable. General / People / Advanced tabs replace the four-tab layout; operation details expand under General and demolition is under Advanced. Portrait-format illustrations are the next useful art improvement.

The M3.11.7 UI shell intentionally separates layout from final artwork. Astra can replace these placeholders without changing HUD structure or gameplay wiring.

## Resource icons

Each resource uses `data-icon-slot` on a 22×22 px square in the top HUD.

- `resource-wood`
- `resource-food`
- `resource-ale`
- `resource-ore`
- `resource-tools`
- `resource-gold`

## Command icons

Bottom dock slots use `data-icon-slot` and currently reserve a 28×28 px square.

- `command-build`
- `command-rotate`
- `command-inspect`
- `command-camera`
- `command-street-view`
- `command-center`
- `command-save`
- `command-load`

Utility slots:

- `settlement-overview`
- `selection`
- `developer`
- `time-pause`
- `settlement-crest` uses `data-art-slot` and reserves 38×38 px

## Construction artwork

Construction cards reserve a wide 54 px-tall art area through `data-art-slot`.

- `build-road`
- `build-residential-plot`
- `build-field`
- `tool-grid-snap`
- `build-stockpile`
- `build-trading-post`
- `build-farmhouse`
- `build-brewery`
- `build-blacksmith`
- `build-campfire`
- `build-tavern`
- `build-market`
- `build-guard-post`
- `build-wood-wall`
- `build-wood-gate`

## Integration contract

Artwork should be added through CSS backgrounds, pseudo-elements, or a tiny asset resolver keyed by these attributes. Do not replace the buttons or remove their `data-action` attributes; those are gameplay controls.

Recommended output from Astra:

- transparent PNG/WebP or SVG-like game-safe assets with consistent padding
- square resource/command icons designed to read at 22–28 px
- wider construction thumbnails composed for roughly 2.4:1 card art
- no baked labels, costs, numbers, hotkeys or borders in the artwork
- keep icon silhouettes distinct without relying only on color

The layout is intentionally neutral right now: dashed boxes are placeholders, not final UI art.


## Contextual building panels

The live HUD now reserves stable asset hooks using `data-ui-asset`.

Building header illustrations:

- `building-header:house`
- `building-header:stockpile`
- `building-header:guard-post`
- `building-header:wood-wall`
- `building-header:wood-gate`
- `building-header:campfire`
- `building-header:tavern`
- `building-header:brewery`
- `building-header:blacksmith`
- `building-header:market`
- `building-header:trading-post`
- `building-header:farmhouse`

Matching small building icons use `building-icon:<building-id>`.

Recommended header composition: roughly 3:1 landscape, medieval manuscript / painted-codex scene, no baked UI chrome and no text.

## Tasks & Messages

Notification art keys:

- `notification:task-raid`
- `notification:task-housing`
- `notification:task-food`
- `notification:task-storage`
- `notification:task-repair`
- `notification:task-trade`
- `notification:task-arrival`
- `notification:task-event`

## Portraits and services

Reserve the following path families for the next art pass:

- `portrait:settler-*`
- `portrait:worker-empty`
- `service:recreation`
- `service:food`
- `service:safety`
- `service:trade`
- `service:agriculture`

The implementation contract is centralized in `src/game/ui/UiAssets.ts`. Final files should live beneath `assets/ui/<kind>/` and can be wired without changing simulation or HUD structure.


### Planned construction cards

The construction catalog also reserves artwork for future locked cards:

- `build-granary`
- `build-bakery`
- `build-quarry`
- `build-mine`
- `build-well`
- `build-chapel`
- `build-bathhouse`
- `build-pleasure-house`
- `build-manor`
- `build-watchtower`
- `build-barracks`

These are visual roadmap slots only and remain disabled until their simulation systems exist.


## Temporarily disabled

Minimap is temporarily disabled in the live HUD. Its asset keys and implementation notes remain reserved so it can be restored later without redesigning the UI.


## Worker and resident portraits

The building panel now renders stable portrait placeholders.

Current generic portrait keys:
- `portrait:settler-1`
- `portrait:settler-2`
- `portrait:settler-3`
- `portrait:settler-4`
- `portrait:settler-5`
- `portrait:settler-6`
- `portrait:settler-7`
- `portrait:settler-8`
- `portrait:worker-empty`

These can initially be illustrated archetypes rather than unique generated faces. The same portrait can appear in houses, workplaces, service visitor slots and guard details.

## Context-detail assets

The richer building panel also reserves:
- `resource:<resource-id>` for recipe and storage rows
- `service:recreation`
- `service:food`
- `service:agriculture`

Final asset integration should preserve the live data and markup structure; only replace the visual placeholder treatment.


## Floating contextual panels

Transient UI is intentionally movable:

- selected-object / building inspector
- construction catalog
- road context controls

The inspector initially opens beside the selected world object using the renderer's world-to-screen projection. That projection is used only once per selection: after opening, the panel remains fixed in screen space even if the object moves or the camera pans/zooms. Dragging still repositions it manually, and selecting a different world object gives the new selection a fresh initial placement.

Permanent HUD elements such as the top resource bar, Tasks & Messages and command dock stay fixed.

The selected-building X uses a dedicated `close-selection` action; it no longer reuses placement cancellation.


## Contextual selection assets

The non-building inspector now uses the same floating parchment-window system as buildings.

Reserved assets:
- `portrait:raider`
- `service:housing`
- `service:safety`
- `category:planning`
- `category:logistics`
- `category:industry`
- `category:services`
- `category:defense`

Existing `portrait:settler-*`, `resource:<resource-id>`, `service:food`, `service:recreation` and `service:agriculture` slots are reused.

Context navigation buttons can jump directly between linked world objects (for example Settler → Home, Settler → Workplace, Field → Farmhouse, Raider → Target) while preserving the world-anchored floating-panel behavior.


## Construction catalog strip

The construction menu is now intentionally a horizontal illustrated strip rather than a responsive card grid.

Art requirements:
- building-card art remains the dominant area of every live or planned card
- category icons remain small and quiet
- planned cards use the same art dimensions but are visually subdued
- planning utilities such as Grid Snap are not building cards and use compact utility icons

The live HUD also marks unaffordable building cards from current settlement resources without disabling placement, so the player still receives the simulation's normal placement feedback.


## Permanent HUD

The permanent HUD is intentionally fixed rather than draggable.

Additional art slots:
- `settlement-crest`
- `time-pause`
- existing resource icons `resource-wood`, `resource-food`, `resource-ale`, `resource-ore`, `resource-tools`, `resource-gold`
- command medallions `command-build`, `command-rotate`, `command-inspect`, `command-camera`, `command-street-view`, `command-center`
- compact utility icons `command-save`, `command-load`

Tasks & Messages deliberately suppresses routine hauling/deposit chatter. It should surface actionable settlement conditions plus only meaningful recent events.


## Compact overview and adaptive catalog

The optional Settlement Overview is now a draggable transient panel. Its collapsed header shows an actionable issue count, while the expanded checklist is deliberately compact and scroll-limited.

The construction catalog no longer reserves the maximum width for every category. It sizes to the active category up to the existing 940px maximum, which keeps Planning/Logistics compact while still allowing Industry/Services to browse horizontally.


## Construction hover information

Construction cards now expose a separate Manor-Lords-style information card on hover and keyboard focus. This keeps the bottom shelf compact while still showing:

- building/tool description
- Wood cost and footprint
- workers, guard slots, storage or production/service role
- road/frontage/Farmhouse placement requirements
- current Available / Low resources / Planned state

The preview has its own large `data-art-slot` area and reuses the same building-card artwork key, so Astra artwork can populate both surfaces consistently.


## Integrated proof art set

The first generated artwork batch is now wired into the live HUD rather than remaining placeholders.

Integrated assets:
- Nightspire settlement crest
- Wood, Food, Ale, Ore, Tools and Gold resource icons
- Planning, Logistics, Industry, Services and Defense category icons
- Build, Rotate, Inspect, Follow/Camera and Street View command medallions
- Farmhouse, Brewery and Tavern construction-card illustrations
- Farmhouse, Brewery and Tavern selected-building header illustrations, reusing the same source art for this proof pass

All files are optimized WebP assets under `assets/ui/`. The original generated source PNGs are intentionally not committed at full resolution.


## Integrated art presentation polish

After the first in-game proof, the generated art remains unchanged but its presentation is tuned around the actual HUD:

- crest and top-resource artwork render larger without increasing the top bar
- category icons have more visual weight
- command artwork is cropped/zoomed into the circular medallions
- illustrated construction cards devote more of their surface to the artwork
- low-resource state moved out of the artwork itself into a quieter card footer treatment
- construction hover information uses a darker aged-parchment treatment with larger copy
- Farmhouse, Brewery and Tavern card/preview crops are aligned consistently


## Full-height resource ribbon

The top resource strip now follows the Manor Lords reference more closely: resource tokens use the full height of the central HUD band, artwork and values share one baseline, text labels are hidden in favor of recognizable iconography, and only subtle separators remain between resources. Target values stay available as muted inline secondary text and in the existing hover titles.


## Second integrated art set

The second generated artwork batch is integrated into the existing live HUD slots:

- Stockpile / supply-yard illustration
- Market illustration
- Blacksmith illustration
- Trading Post illustration
- Guard Post illustration
- Road planning illustration
- Residential Plot planning illustration
- Field / harvest illustration
- Center command compass emblem
- Save and Load ledger emblem

The five live building scenes are also reused for their selected-building header and construction hover preview surfaces. Road, Residential Plot and Field populate both their shelf cards and hover previews.

All source PNGs were resized and optimized to WebP before commit; this batch is roughly 1.2 MB total instead of committing the original ~30 MB generation outputs.


## Active-surface art completion pass

The remaining currently playable visual gaps are now filled without enabling any planned gameplay:

- Campfire construction art
- Wood Wall construction art
- Wood Gate construction art
- House selected-building header art
- Settlement Overview, Selection, Developer, Tasks & Messages and Pause utility symbols

All selectable live building headers now have artwork, and internal `data-art-slot` / `data-ui-asset` debug labels are suppressed wherever finished art is present. Planned roadmap cards intentionally remain subdued placeholders until their systems are implemented.


## Context artwork pass

The remaining live contextual placeholders now use original medieval UI sprites:

- eight settler portrait archetypes plus empty-worker and raider portraits
- Food, Housing, Safety, Recreation and Agriculture service/need symbols
- Raid, Housing, Food, Storage, Repair, Trade, Arrival and Event task symbols
- recipe, storage and cargo rows reuse the existing resource artwork
- selected-building title icons reuse each building's integrated illustration

The portrait and status artwork is packed into lightweight SVG sprite sheets so the UI gains visual identity without adding dozens of network requests.


## Roadmap-card artwork completion

All visible construction-card slots now have artwork, including the locked roadmap cards:

- Granary, Bakery, Quarry and Mine
- Well, Chapel, Bathhouse, Pleasure House and Manor
- Watchtower and Barracks
- Grid Snap planning utility

The roadmap illustrations are deliberately muted compared with playable buildings and remain `aria-disabled`; this is presentation-only and does not enable any planned simulation system.

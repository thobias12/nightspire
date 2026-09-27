# Nightspire UI art slots

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

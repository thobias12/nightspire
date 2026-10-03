export function createHudTemplate(): string {
  return `
      <header class="topbar">
        <div id="settlement-summary" class="settlement-summary" aria-label="Settlement status"></div>
        <div class="settlement-brand">
          <span class="ui-crest-slot" data-art-slot="settlement-crest" aria-hidden="true"></span>
          <div class="settlement-copy">
            <b>NIGHTSPIRE</b>
          </div>
        </div>
        <div id="resources" class="resource-strip" aria-label="Settlement resources"></div>
        <div class="time-block">
          <div id="time-readout" class="time-readout"></div>
          <div class="simulation-controls">
            <button class="sim-button" data-action="pause" title="Pause / resume simulation"><span class="ui-icon-slot compact" data-icon-slot="time-pause" aria-hidden="true"></span><span>Pause</span></button>
            <label class="speed-control">Speed
              <select aria-label="Simulation speed" data-action="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
            </label>
          </div>
        </div>
      </header>

      <details class="settlement-drawer panel floating-panel" data-draggable-panel data-panel-id="settlement-overview">
        <summary><span class="ui-icon-slot" data-icon-slot="settlement-overview" aria-hidden="true"></span><span>Settlement overview</span><span id="overview-count" class="overview-count">0</span><span class="drawer-drag-handle" data-drag-handle data-drag-only title="Drag panel" aria-hidden="true"></span></summary>
        <div class="drawer-body">
          <div id="objective"></div>
          <div id="workforce"></div>
          <details><summary>Region map</summary>
            <p>Choose a landscape and preview a fresh settlement before starting.</p>
            <button data-action="map-setup">Choose landscape</button>
<div><span id="region-label">Nightspire</span> <button data-action="region-view">Region view</button></div>
<div id="minimap-map" class="minimap-map" style="height:150px"></div>
          </details>
        </div>
      </details>

      <aside class="tasks-panel panel" aria-label="Tasks and messages">
        <div class="tasks-header">
          <span class="ui-icon-slot compact" data-icon-slot="tasks-messages" aria-hidden="true"></span>
          <strong>Tasks & Messages</strong>
          <span id="task-count" class="task-count">0</span>
        </div>
        <div id="tasks" class="tasks-list"></div>
      </aside>

      <section class="inspector panel floating-panel" data-draggable-panel data-panel-id="inspector">
        <div class="panel-kicker" data-drag-handle><span class="ui-icon-slot" data-icon-slot="selection" aria-hidden="true"></span><span>Selection</span><button class="panel-close" data-action="close-inspector" title="Close">×</button></div>
        <div id="inspection">Select something in the world.</div>
      </section>

      <details class="qa panel">
        <summary><span class="ui-icon-slot compact" data-icon-slot="developer" aria-hidden="true"></span><span>DEV / QA</span></summary>
        <div class="qa-body">
          <label>Set hour <input aria-label="Set hour" type="range" min="0" max="23" value="8" data-action="time"></label>
          <div class="row phase-buttons"><button data-action="jump-day">Day</button><button data-action="jump-dusk">Dusk</button><button data-action="jump-night">Night</button><button data-action="jump-dawn">Dawn</button></div>
          <button data-action="next-raid">Next raid</button>
          <h3>Stock targets</h3>
          <div class="row"><label>Wood <input class="number-input" aria-label="Wood stock target" type="number" min="0" max="10000" step="25" data-action="target-wood"></label><label>Food <input class="number-input" aria-label="Food stock target" type="number" min="0" max="10000" step="25" data-action="target-food"></label><label>Ore <input class="number-input" aria-label="Ore stock target" type="number" min="0" max="10000" step="5" data-action="target-ore"></label></div>
          <div class="row"><button data-action="resources">+50 wood / food</button><button data-action="resources-ore">+30 ore</button><button data-action="spawn">Spawn settler</button></div>
          <button data-action="town-visual">Stage road-planner visual target</button>
          <button data-action="immigration-test">Test immigration now</button>
          <div class="row"><button data-action="needs-low">Needs → 25%</button><button data-action="needs-reset">Needs → 100%</button></div>
          <div class="row"><button data-action="building-supply">+5 selected input</button><button data-action="damage-selected">Damage selected -60 HP</button></div>
          <label><input type="checkbox" data-action="paths"> Show navigation paths</label>
          <button data-action="audit">Check state integrity</button>
          <p><a href="?benchmark=1" target="_blank" rel="noopener">Open M4 scale benchmark</a></p>
          <h3>Save tools</h3>
          <div class="row"><button data-action="export-save">Export JSON</button><button data-action="load-backup">Load backup</button></div>
          <label>Import JSON <input aria-label="Import save file" type="file" accept=".json,application/json" data-action="import-save"></label>
          <div id="metrics"></div><div id="workers"></div>
        </div>
      </details>

      <footer class="bottom">
        <div class="build-catalog panel" aria-hidden="true">
          <div class="catalog-header">
            <div><span class="eyebrow">CONSTRUCTION</span><strong>Choose what to place</strong></div>
            <button class="catalog-close" data-hud-toggle="build-menu" title="Close construction menu">×</button>
          </div>
          <div class="catalog-navigation">
          <div class="build-tabs" role="tablist" aria-label="Construction categories">
            <button data-build-tab="planning" aria-pressed="true" title="Planning"><span class="category-icon" data-ui-asset="category:planning" aria-hidden="true"></span><span>Planning</span></button>
            <button data-build-tab="logistics" aria-pressed="false" title="Logistics"><span class="category-icon" data-ui-asset="category:logistics" aria-hidden="true"></span><span>Logistics</span></button>
            <button data-build-tab="industry" aria-pressed="false" title="Industry"><span class="category-icon" data-ui-asset="category:industry" aria-hidden="true"></span><span>Industry</span></button>
            <button data-build-tab="services" aria-pressed="false" title="Services"><span class="category-icon" data-ui-asset="category:services" aria-hidden="true"></span><span>Services</span></button>
            <button data-build-tab="defense" aria-pressed="false" title="Defense"><span class="category-icon" data-ui-asset="category:defense" aria-hidden="true"></span><span>Defense</span></button>
          </div>

          <div class="catalog-tools" aria-label="Planning utilities">
            <button class="catalog-tool" data-action="grid-snap" title="Hotkey G · shared 1m planning grid">
              <span class="category-icon" data-art-slot="tool-grid-snap" aria-hidden="true"></span>
              <span class="catalog-tool-label">Grid Snap</span>
              <small>[G]</small>
            </button>
            <span class="catalog-tool-note">Planning tools use the same 1m grid as roads and fields.</span>
          </div>
          </div>

          <div id="build-preview" class="build-preview" aria-hidden="true"></div>

          <div class="build-panel is-active" data-build-panel="planning">
            <button class="build-card" data-action="road" title="Hotkey 0 · point-drawn curved road"><span class="build-art-slot" data-art-slot="build-road" aria-hidden="true"></span><span class="build-name">Road</span><small>[0] Draw point by point</small></button>
            <button class="build-card" data-action="residential-plot" title="Hotkey 1 · requires road frontage"><span class="build-art-slot" data-art-slot="build-residential-plot" aria-hidden="true"></span><span class="build-name">Residential Plot</span><small>[1] Road-fronted parcel</small></button>
            <button class="build-card" data-action="field" title="Hotkey P · requires nearby Farmhouse"><span class="build-art-slot" data-art-slot="build-field" aria-hidden="true"></span><span class="build-name">Field</span><small>[P] Irregular crop parcel</small></button>
          </div>

          <div class="build-panel" data-build-panel="logistics">
            <button class="build-card" data-action="stockpile" data-building-type="stockpile" title="Hotkey 2"><span class="build-art-slot" data-art-slot="build-stockpile" aria-hidden="true"></span><span class="build-name">Stockpile</span><small>10 wood · 400 storage</small></button>
            <button class="build-card" data-action="trading-post" data-building-type="trading-post" title="Hotkey T"><span class="build-art-slot" data-art-slot="build-trading-post" aria-hidden="true"></span><span class="build-name">Trading Post</span><small>50 wood · 2 Traders</small></button>
            <button class="build-card" data-action="ore-yard" data-building-type="ore-yard"><span class="build-art-slot" data-art-slot="build-ore-yard" aria-hidden="true"></span><span class="build-name">Ore Yard</span><small>25 wood · Ore-only storage</small></button>
            <div class="planned-divider"><span>Planned</span></div>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-granary" aria-hidden="true"></span><span class="build-name">Granary</span><small>Planned · food logistics</small></button>
          </div>

          <div class="build-panel" data-build-panel="industry">
            <button class="build-card" data-action="farmhouse" data-building-type="farmhouse" title="Hotkey A"><span class="build-art-slot" data-art-slot="build-farmhouse" aria-hidden="true"></span><span class="build-name">Farmhouse</span><small>45 wood · 3 Farmers</small></button>
            <button class="build-card" data-action="brewery" data-building-type="brewery" title="Hotkey 4"><span class="build-art-slot" data-art-slot="build-brewery" aria-hidden="true"></span><span class="build-name">Brewery</span><small>35 wood · Food → Ale</small></button>
            <button class="build-card" data-action="blacksmith" data-building-type="blacksmith" title="Hotkey 9"><span class="build-art-slot" data-art-slot="build-blacksmith" aria-hidden="true"></span><span class="build-name">Blacksmith</span><small>45 wood · Ore → Tools</small></button>
            <button class="build-card" data-action="foresters-lodge" data-building-type="foresters-lodge"><span class="build-art-slot" data-art-slot="build-foresters-lodge" aria-hidden="true"></span><span class="build-name">Forester's Lodge</span><small>35 wood · 3 Foresters · replanting</small></button>
            <button class="build-card" data-action="mine" data-building-type="mine"><span class="build-art-slot" data-art-slot="build-mine" aria-hidden="true"></span><span class="build-name">Mine</span><small>55 wood · 3 Miners · Ore</small></button>
            <button class="build-card" data-action="fishing-hut" data-building-type="fishing-hut"><span class="build-art-slot" data-art-slot="build-fishing-hut" aria-hidden="true"></span><span class="build-name">Fisherman's Hut</span><small>30 wood · 2 Fishers · renewable Food</small></button>
            <div class="planned-divider"><span>Planned</span></div>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-bakery" aria-hidden="true"></span><span class="build-name">Bakery</span><small>Planned · processed food</small></button>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-quarry" aria-hidden="true"></span><span class="build-name">Quarry</span><small>Planned · stone</small></button>
          </div>

          <div class="build-panel" data-build-panel="services">
            <button class="build-card" data-action="campfire" data-building-type="campfire" title="Hotkey 3"><span class="build-art-slot" data-art-slot="build-campfire" aria-hidden="true"></span><span class="build-name">Campfire</span><small>10 wood · recreation</small></button>
            <button class="build-card" data-action="tavern" data-building-type="tavern" title="Hotkey 5"><span class="build-art-slot" data-art-slot="build-tavern" aria-hidden="true"></span><span class="build-name">Tavern</span><small>40 wood · Ale service</small></button>
            <button class="build-card" data-action="market" data-building-type="market" title="Hotkey M"><span class="build-art-slot" data-art-slot="build-market" aria-hidden="true"></span><span class="build-name">Market</span><small>30 wood · Food stalls</small></button>
            <div class="planned-divider"><span>Planned</span></div>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-well" aria-hidden="true"></span><span class="build-name">Well</span><small>Planned · water service</small></button>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-chapel" aria-hidden="true"></span><span class="build-name">Chapel</span><small>Planned · faith service</small></button>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-bathhouse" aria-hidden="true"></span><span class="build-name">Bathhouse</span><small>Planned · hygiene & luxury</small></button>
            <button class="build-card" data-action="pleasure-house" data-building-type="pleasure-house"><span class="build-art-slot" data-art-slot="build-pleasure-house" aria-hidden="true"></span><span class="build-name">Pleasure House</span><small>60 wood · 2 Hosts · Ale recreation</small></button>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-manor" aria-hidden="true"></span><span class="build-name">Manor</span><small>Planned · civic progression</small></button>
          </div>

          <div class="build-panel" data-build-panel="defense">
            <button class="build-card" data-action="guard-post" data-building-type="guard-post" title="Hotkey 6"><span class="build-art-slot" data-art-slot="build-guard-post" aria-hidden="true"></span><span class="build-name">Guard Post</span><small>25 wood · 2 Guards</small></button>
            <button class="build-card" data-action="wood-wall" data-building-type="wood-wall" title="Hotkey 7"><span class="build-art-slot" data-art-slot="build-wood-wall" aria-hidden="true"></span><span class="build-name">Wood Wall</span><small>[7] Drag placement</small></button>
            <button class="build-card" data-action="wood-gate" data-building-type="wood-gate" title="Hotkey 8"><span class="build-art-slot" data-art-slot="build-wood-gate" aria-hidden="true"></span><span class="build-name">Wood Gate</span><small>[8] Wall opening</small></button>
            <div class="planned-divider"><span>Planned</span></div>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-watchtower" aria-hidden="true"></span><span class="build-name">Watchtower</span><small>Planned · ranged defense</small></button>
            <button class="build-card is-planned" aria-disabled="true" title="Planned feature"><span class="build-art-slot" data-art-slot="build-barracks" aria-hidden="true"></span><span class="build-name">Barracks</span><small>Planned · military</small></button>
          </div>

          <div class="catalog-help">Hotkeys remain active while this menu is closed.</div>
        </div>

        <div class="road-context panel floating-panel" data-draggable-panel data-panel-id="road-context">
          <span class="context-title" data-drag-handle>Road</span>
          <button data-action="road-curve" title="Hotkey C">Curve [C]</button>
          <button data-action="road-width" title="Hotkeys [ and ]">Road width</button>
          <button data-action="road-snap" title="Hotkey F">Road Join [F]</button>
        </div>

        <div class="status" role="status" id="message"></div>

        <div class="command-dock" aria-label="Primary controls">
          <div class="dock-main-group">
            <button class="dock-button primary" data-hud-toggle="build-menu" aria-pressed="false" title="Construction menu">
              <span class="dock-icon-slot" data-icon-slot="command-build" aria-hidden="true"></span><span>Build</span><small></small>
            </button>
            <button class="dock-button" data-action="rotate-build" title="Rotate selected blueprint [R]">
              <span class="dock-icon-slot" data-icon-slot="command-rotate" aria-hidden="true"></span><span>Rotate</span><small>R</small>
            </button>
            <button class="dock-button" data-action="cancel" title="Leave placement / inspect [Esc]">
              <span class="dock-icon-slot" data-icon-slot="command-inspect" aria-hidden="true"></span><span>Inspect</span><small>Esc</small>
            </button>
            <button class="dock-button" data-action="camera" title="Toggle settlement/player camera">
              <span class="dock-icon-slot" data-icon-slot="command-camera" aria-hidden="true"></span><span class="dock-label">Follow player</span><small></small>
            </button>
            <button class="dock-button" data-action="cinematic" title="Street view [V]">
              <span class="dock-icon-slot" data-icon-slot="command-street-view" aria-hidden="true"></span><span class="dock-label">Street view</span><small>V</small>
            </button>
            <button class="dock-button" data-action="center" title="Center settlement">
              <span class="dock-icon-slot" data-icon-slot="command-center" aria-hidden="true"></span><span>Center</span><small></small>
            </button>
          </div>
          <div class="dock-utility-group" aria-label="Game utilities">
            <button class="dock-utility" data-action="main-menu" title="Return to start screen"><span class="dock-icon-slot" data-icon-slot="command-center" aria-hidden="true"></span><span>Menu</span></button>
            <button class="dock-utility" data-action="save" title="Save game">
              <span class="dock-icon-slot" data-icon-slot="command-save" aria-hidden="true"></span><span>Save</span>
            </button>
            <button class="dock-utility" data-action="load" title="Load game">
              <span class="dock-icon-slot" data-icon-slot="command-load" aria-hidden="true"></span><span>Load</span>
            </button>
          </div>
        </div>
      </footer>
    `
}

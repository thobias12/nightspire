import { forestDensity, worldHalf } from '../simulation/MapGenerator'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import { agricultureSummary, fieldHarvestWork, fieldSowWork, fieldsForFarmhouse } from '../simulation/Agriculture'
import { available, freeStorage, reserved, stockpiles } from '../simulation/Buildings'
import { phaseForTime, phaseLabel } from '../simulation/DayNight'
import { happinessEffect, settlementHappinessEffect } from '../simulation/Happiness'
import { houseBedCapacity, houseProgressionStatus } from '../simulation/HouseProgression'
import { householdStatus, householdSummary } from '../simulation/Households'
import { happinessOf, settlementNeeds } from '../simulation/Needs'
import { marketSummary } from '../simulation/Markets'
import { IMMIGRATION_REQUIRED_DAYS, populationAttraction } from '../simulation/Population'
import { raidSizeForWave } from '../simulation/Raid'
import { assignedGuardPost } from '../simulation/Schedule'
import { serviceAssignment, serviceAvailable, serviceSummary } from '../simulation/Services'
import { toolCoverage } from '../simulation/Tools'
import {
  merchantIntervalDays, merchantPresent, primaryTradingPost, tradeModeLabel, tradeReputation, tradeStorageUsed, TRADE_PRICES,
} from '../simulation/Trading'
import { enemyLabel, MAX_SETTLERS, settlerLabel, type WorldState } from '../simulation/WorldState'
import { residentialFrontage, residentialPresentationProfile } from '../render/ResidentialPresentation'
import { assignedWorkplace, professionLabel, workplaceStaffing } from '../simulation/Workforce'
import { stockpilePriorityLabel } from '../simulation/StockpileLogistics'
import { haulPriorityLabel, workplaceInputTarget, workplaceOutputThreshold } from '../simulation/WorkplaceLogistics'

export interface Metrics { frame: number; simulation: number; render: number; calls: number; triangles: number; paths: number; requests: number; queue: number; failures: number; dropped: number }
export interface HudState {
  paused: boolean
  selectedId: number | null
  buildType: BuildingId | null
  planningTool: 'road' | 'residential-plot' | 'field' | null
  gridSnap: boolean
  roadSnap: boolean
  roadWidth: number
  roadCurve: number
  roadAngleSnap: boolean
  roadPointCount: number
  fieldPointCount: number
  buildRotation: number
  dragCount: number
  message: string
  cameraPoint?: { x: number; z: number }
  camera: string
  cinematic: boolean
  metrics: Metrics
}
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const needLabel = (value: string) => value[0].toUpperCase() + value.slice(1)

export class Hud {
  readonly element = document.createElement('div')
  private readonly abort = new AbortController()
  private rosterPage = 0
  private mapBackgroundKey = ''
  private mapBackground = ''
  private buildMenuOpen = false
  private activeBuildTab = 'planning'
  private activeContextTab = 'general'
  private lastContextId: number | null = null

  constructor(root: HTMLElement, action: (action: string, value?: string) => void) {
    this.element.className = 'hud'
    this.element.innerHTML = `
      <header class="topbar">
        <div class="settlement-brand">
          <span class="ui-crest-slot" data-art-slot="settlement-crest" aria-hidden="true"></span>
          <div class="settlement-copy">
            <b>NIGHTSPIRE</b>
            <div id="settlement-summary" class="settlement-summary"></div>
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

      <details class="settlement-drawer panel">
        <summary><span class="ui-icon-slot" data-icon-slot="settlement-overview" aria-hidden="true"></span><span>Settlement overview</span></summary>
        <div class="drawer-body">
          <div id="objective"></div>
          <div id="workforce"></div>
          <details><summary>New region</summary>
            <p>Start a seeded landscape. Your current settlement is saved before replacement.</p>
            <label>Map seed <input id="map-seed" aria-label="Map seed" type="number" min="0" max="4294967295" value="137"></label>
            <label>Region size <select id="map-size" aria-label="Region size"><option value="129">129 × 129 m</option><option value="257" selected>257 × 257 m</option><option value="513">513 × 513 m</option></select></label>
            <label>Landscape <select id="map-landscape" aria-label="Landscape"><option value="meadows">Meadows & copses</option><option value="woodland">Woodland clearings</option></select></label>
            <button data-action="new-region">Start new region (save current)</button>
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

      <section class="inspector panel">
        <div class="panel-kicker"><span class="ui-icon-slot" data-icon-slot="selection" aria-hidden="true"></span><span>Selection</span></div>
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

      <aside class="minimap-shell panel" aria-label="Settlement minimap">
        <div class="minimap-header"><span id="region-label">Nightspire</span><button data-action="region-view">Region view</button></div>
        <div id="minimap-map" class="minimap-map"></div>
        <div class="minimap-legend"><span><i class="legend-building"></i>Buildings</span><span><i class="legend-field"></i>Fields</span><span><i class="legend-hostile"></i>Raiders</span></div>
      </aside>

      <footer class="bottom">
        <div class="build-catalog panel" aria-hidden="true">
          <div class="catalog-header">
            <div><span class="eyebrow">CONSTRUCTION</span><strong>Choose what to place</strong></div>
            <button class="catalog-close" data-hud-toggle="build-menu" title="Close construction menu">×</button>
          </div>
          <div class="build-tabs" role="tablist" aria-label="Construction categories">
            <button data-build-tab="planning" aria-pressed="true">Planning</button>
            <button data-build-tab="logistics" aria-pressed="false">Logistics</button>
            <button data-build-tab="industry" aria-pressed="false">Industry</button>
            <button data-build-tab="services" aria-pressed="false">Services</button>
            <button data-build-tab="defense" aria-pressed="false">Defense</button>
          </div>

          <div class="build-panel is-active" data-build-panel="planning">
            <button class="build-card" data-action="road" title="Hotkey 0 · point-drawn curved road"><span class="build-art-slot" data-art-slot="build-road" aria-hidden="true"></span><span class="build-name">Road</span><small>[0] Draw point by point</small></button>
            <button class="build-card" data-action="residential-plot" title="Hotkey 1 · requires road frontage"><span class="build-art-slot" data-art-slot="build-residential-plot" aria-hidden="true"></span><span class="build-name">Residential Plot</span><small>[1] Road-fronted parcel</small></button>
            <button class="build-card" data-action="field" title="Hotkey P · requires nearby Farmhouse"><span class="build-art-slot" data-art-slot="build-field" aria-hidden="true"></span><span class="build-name">Field</span><small>[P] Irregular crop parcel</small></button>
            <button class="build-card compact-card" data-action="grid-snap" title="Hotkey G · shared 1m planning grid"><span class="build-art-slot" data-art-slot="tool-grid-snap" aria-hidden="true"></span><span class="build-name">Grid Snap</span><small>[G] Shared planning grid</small></button>
          </div>

          <div class="build-panel" data-build-panel="logistics">
            <button class="build-card" data-action="stockpile" title="Hotkey 2"><span class="build-art-slot" data-art-slot="build-stockpile" aria-hidden="true"></span><span class="build-name">Stockpile</span><small>10 wood · 400 storage</small></button>
            <button class="build-card" data-action="trading-post" title="Hotkey T"><span class="build-art-slot" data-art-slot="build-trading-post" aria-hidden="true"></span><span class="build-name">Trading Post</span><small>50 wood · 2 Traders</small></button>
          </div>

          <div class="build-panel" data-build-panel="industry">
            <button class="build-card" data-action="farmhouse" title="Hotkey A"><span class="build-art-slot" data-art-slot="build-farmhouse" aria-hidden="true"></span><span class="build-name">Farmhouse</span><small>45 wood · 3 Farmers</small></button>
            <button class="build-card" data-action="brewery" title="Hotkey 4"><span class="build-art-slot" data-art-slot="build-brewery" aria-hidden="true"></span><span class="build-name">Brewery</span><small>35 wood · Food → Ale</small></button>
            <button class="build-card" data-action="blacksmith" title="Hotkey 9"><span class="build-art-slot" data-art-slot="build-blacksmith" aria-hidden="true"></span><span class="build-name">Blacksmith</span><small>45 wood · Ore → Tools</small></button>
          </div>

          <div class="build-panel" data-build-panel="services">
            <button class="build-card" data-action="campfire" title="Hotkey 3"><span class="build-art-slot" data-art-slot="build-campfire" aria-hidden="true"></span><span class="build-name">Campfire</span><small>10 wood · recreation</small></button>
            <button class="build-card" data-action="tavern" title="Hotkey 5"><span class="build-art-slot" data-art-slot="build-tavern" aria-hidden="true"></span><span class="build-name">Tavern</span><small>40 wood · Ale service</small></button>
            <button class="build-card" data-action="market" title="Hotkey M"><span class="build-art-slot" data-art-slot="build-market" aria-hidden="true"></span><span class="build-name">Market</span><small>30 wood · Food stalls</small></button>
          </div>

          <div class="build-panel" data-build-panel="defense">
            <button class="build-card" data-action="guard-post" title="Hotkey 6"><span class="build-art-slot" data-art-slot="build-guard-post" aria-hidden="true"></span><span class="build-name">Guard Post</span><small>25 wood · 2 Guards</small></button>
            <button class="build-card" data-action="wood-wall" title="Hotkey 7"><span class="build-art-slot" data-art-slot="build-wood-wall" aria-hidden="true"></span><span class="build-name">Wood Wall</span><small>[7] Drag placement</small></button>
            <button class="build-card" data-action="wood-gate" title="Hotkey 8"><span class="build-art-slot" data-art-slot="build-wood-gate" aria-hidden="true"></span><span class="build-name">Wood Gate</span><small>[8] Wall opening</small></button>
          </div>

          <div class="catalog-help">Hotkeys remain active while this menu is closed. Building artwork and icons intentionally use empty <code>data-art-slot</code> / <code>data-icon-slot</code> hooks.</div>
        </div>

        <div class="road-context panel">
          <span class="context-title">Road</span>
          <button data-action="road-curve" title="Hotkey C">Curve [C]</button>
          <button data-action="road-width" title="Hotkeys [ and ]">Road width</button>
          <button data-action="road-snap" title="Hotkey F">Road Join [F]</button>
        </div>

        <div class="status" role="status" id="message"></div>

        <div class="command-dock" aria-label="Primary controls">
          <button class="dock-button primary" data-hud-toggle="build-menu" aria-pressed="false" title="Construction menu">
            <span class="dock-icon-slot" data-icon-slot="command-build" aria-hidden="true"></span><span>Build</span>
          </button>
          <button class="dock-button" data-action="rotate-build" title="Rotate selected blueprint [R]">
            <span class="dock-icon-slot" data-icon-slot="command-rotate" aria-hidden="true"></span><span>Rotate</span>
          </button>
          <button class="dock-button" data-action="cancel" title="Leave placement / inspect [Esc]">
            <span class="dock-icon-slot" data-icon-slot="command-inspect" aria-hidden="true"></span><span>Inspect</span>
          </button>
          <button class="dock-button" data-action="camera" title="Toggle settlement/player camera">
            <span class="dock-icon-slot" data-icon-slot="command-camera" aria-hidden="true"></span><span>Follow player</span>
          </button>
          <button class="dock-button" data-action="cinematic" title="Street view [V]">
            <span class="dock-icon-slot" data-icon-slot="command-street-view" aria-hidden="true"></span><span>Street view</span>
          </button>
          <button class="dock-button" data-action="center" title="Center settlement">
            <span class="dock-icon-slot" data-icon-slot="command-center" aria-hidden="true"></span><span>Center</span>
          </button>
          <button class="dock-button" data-action="save" title="Save game">
            <span class="dock-icon-slot" data-icon-slot="command-save" aria-hidden="true"></span><span>Save</span>
          </button>
          <button class="dock-button" data-action="load" title="Load game">
            <span class="dock-icon-slot" data-icon-slot="command-load" aria-hidden="true"></span><span>Load</span>
          </button>
        </div>
      </footer>
    `
    root.append(this.element)
    this.syncBuildMenu()

    const signal = this.abort.signal
    this.element.addEventListener('click', e => {
      const target = e.target as HTMLElement
      const minimap = target.closest<HTMLElement>('#minimap-map')
      if (minimap) {
        const rect = minimap.getBoundingClientRect()
        action('map-focus', ((e.clientX - rect.left) / rect.width * 2 - 1) + ',' + ((e.clientY - rect.top) / rect.height * 2 - 1))
        return
      }
      const roster = target.closest<HTMLButtonElement>('button[data-roster]')
      if (roster) { this.rosterPage = Math.max(0, this.rosterPage + Number(roster.dataset.roster)); return }

      const hudToggle = target.closest<HTMLButtonElement>('button[data-hud-toggle]')
      if (hudToggle?.dataset.hudToggle === 'build-menu') {
        this.buildMenuOpen = !this.buildMenuOpen
        this.syncBuildMenu()
        return
      }

      const buildTab = target.closest<HTMLButtonElement>('button[data-build-tab]')
      if (buildTab?.dataset.buildTab) {
        this.activeBuildTab = buildTab.dataset.buildTab
        this.buildMenuOpen = true
        this.syncBuildMenu()
        return
      }

      const contextTab = target.closest<HTMLButtonElement>('button[data-context-tab]')
      if (contextTab?.dataset.contextTab) {
        this.activeContextTab = contextTab.dataset.contextTab
        this.syncContextTabs()
        return
      }

      const button = target.closest<HTMLButtonElement>('button[data-action]')
      if (button?.dataset.action === 'new-region') {
        const input = (id: string) => this.element.querySelector<HTMLInputElement>('#' + id)!.value
        action('new-region', JSON.stringify({ seed: Number(input('map-seed')), size: Number(input('map-size')), landscape: input('map-landscape') }))
      } else if (button) action(button.dataset.action!, button.dataset.value)
    }, { signal })

    this.element.addEventListener('change', e => {
      const input = e.target as HTMLInputElement
      if (!input.dataset.action) return
      if (input.dataset.action === 'import-save') {
        const file = input.files?.[0]
        if (!file) return
        file.text().then(text => action('import-save', text)).catch(error => action('import-error', String(error)))
        input.value = ''
        return
      }
      action(input.dataset.action, input.type === 'checkbox' ? String(input.checked) : input.value)
    }, { signal })
  }

  private syncBuildMenu(): void {
    const catalog = this.element.querySelector<HTMLElement>('.build-catalog')
    if (!catalog) return
    catalog.classList.toggle('is-open', this.buildMenuOpen)
    catalog.setAttribute('aria-hidden', String(!this.buildMenuOpen))

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-hud-toggle="build-menu"]')) {
      button.setAttribute('aria-pressed', String(this.buildMenuOpen))
    }
    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('button[data-build-tab]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.buildTab === this.activeBuildTab))
    }
    for (const panel of this.element.querySelectorAll<HTMLElement>('[data-build-panel]')) {
      panel.classList.toggle('is-active', panel.dataset.buildPanel === this.activeBuildTab)
    }
  }

  private syncContextTabs(): void {
    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('button[data-context-tab]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.contextTab === this.activeContextTab))
    }
    for (const pane of this.element.querySelectorAll<HTMLElement>('[data-context-panel]')) {
      pane.classList.toggle('is-active', pane.dataset.contextPanel === this.activeContextTab)
    }
  }

  private set(id: string, text: string): void {
    const target = this.element.querySelector('#' + id)!
    if (target.innerHTML !== text) target.innerHTML = text
  }

  update(s: WorldState, ui: HudState): void {
    const stores = stockpiles(s)
    const wood = stores.reduce((n, b) => n + b.inventory.wood, 0)
    const markets = marketSummary(s)
    const agriculture = agricultureSummary(s)
    const foodInStockpiles = stores.reduce((n, b) => n + b.inventory.food, 0)
    const food = foodInStockpiles + markets.food + agriculture.farmFood
    const ale = stores.reduce((n, b) => n + b.inventory.ale, 0)
    const ore = stores.reduce((n, b) => n + b.inventory.ore, 0)
    const storedTools = stores.reduce((n, b) => n + b.inventory.tools, 0)
    const held = stores.reduce((n, b) => n + reserved(s, b.id, 'wood'), 0)
    const housed = s.settlers.filter(a => a.homeId !== null).length
    const beds = s.buildings.filter(b => b.complete && !b.destroyed).reduce((n, b) => n + houseBedCapacity(b), 0)
    const guards = s.settlers.filter(a => a.role === 'guard').length
    const laborers = s.settlers.filter(a => a.role === 'worker' && a.workplaceId === null && a.arrivalTarget === null).length
    const guardSlots = s.buildings.filter(b => b.complete && !b.destroyed).reduce((n, b) => n + BUILDINGS[b.type].guardSlots, 0)
    const workplaces = s.buildings.filter(b => b.complete && !b.destroyed && (BUILDINGS[b.type].workerSlots ?? 0) > 0)
    const assignedWorkplaceWorkers = workplaces.reduce((n, b) => n + workplaceStaffing(s, b).assigned, 0)
    const workplaceSlots = workplaces.reduce((n, b) => n + (BUILDINGS[b.type].workerSlots ?? 0), 0)
    const phase = phaseForTime(s.timeOfDay)
    const damaged = s.buildings.filter(b => b.complete && b.health < b.maxHealth).length
    const walls = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'wood-wall').length
    const gates = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'wood-gate').length
    const services = serviceSummary(s, phase)
    const taverns = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'tavern')
    const breweries = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'brewery')
    const suppliedTaverns = taverns.filter(serviceAvailable).length
    const needSummary = settlementNeeds(s)
    const moraleSummary = settlementHappinessEffect(s)
    const toolSummary = toolCoverage(s)
    const effectiveWorkRate = moraleSummary.averageWorkRate * toolSummary.workMultiplier
    const attraction = populationAttraction(s)
    const arriving = s.settlers.filter(settler => settler.arrivalTarget !== null).length
    const fedToday = s.settlers.filter(settler => settler.lastMealDay === s.day).length
    const households = householdSummary(s)
    const tradingPost = primaryTradingPost(s)
    const merchantHere = merchantPresent(s)
    const reputation = tradeReputation(s)
    const houseTiers = s.buildings
      .filter(building => building.type === 'house' && building.complete && !building.destroyed)
      .reduce((counts, house) => {
        const level = Math.max(1, Math.min(3, house.houseLevel))
        counts[level] = (counts[level] ?? 0) + 1
        return counts
      }, {} as Record<number, number>)

    this.set('settlement-summary',
      '<span>Population ' + s.settlers.length + '/' + MAX_SETTLERS + '</span>'
      + '<span>Laborers ' + laborers + '</span>'
      + '<span>Housing ' + housed + '/' + s.settlers.length + '</span>'
      + '<span>Approval ' + needSummary.happiness + '%</span>'
    )
    this.set('resources', `
      <div class="resource-chip" title="Wood: ${wood}/${s.targets.wood}; ${held} reserved"><span class="ui-icon-slot" data-icon-slot="resource-wood" aria-hidden="true"></span><span class="resource-label">Wood</span><strong>${wood}</strong><small>/${s.targets.wood}</small></div>
      <div class="resource-chip" title="Food: ${food}/${s.targets.food}; market ${markets.food}; farm ${agriculture.farmFood}"><span class="ui-icon-slot" data-icon-slot="resource-food" aria-hidden="true"></span><span class="resource-label">Food</span><strong>${food}</strong><small>/${s.targets.food}</small></div>
      <div class="resource-chip" title="Ale"><span class="ui-icon-slot" data-icon-slot="resource-ale" aria-hidden="true"></span><span class="resource-label">Ale</span><strong>${ale}</strong></div>
      <div class="resource-chip" title="Ore: ${ore}/${s.targets.ore}"><span class="ui-icon-slot" data-icon-slot="resource-ore" aria-hidden="true"></span><span class="resource-label">Ore</span><strong>${ore}</strong><small>/${s.targets.ore}</small></div>
      <div class="resource-chip" title="Tools"><span class="ui-icon-slot" data-icon-slot="resource-tools" aria-hidden="true"></span><span class="resource-label">Tools</span><strong>${storedTools}</strong></div>
      <div class="resource-chip" title="Treasury Gold"><span class="ui-icon-slot" data-icon-slot="resource-gold" aria-hidden="true"></span><span class="resource-label">Gold</span><strong>${s.trade.gold}</strong></div>
    `)

    const minutes = Math.floor(s.timeOfDay * 1440)
    this.set('time-readout', `<div><span class="phase phase-${phase}">${phaseLabel(phase)}</span><strong>Day ${s.day}</strong><span>${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}</span>${ui.paused ? '<em>PAUSED</em>' : ''}</div><small>${tradingPost ? (merchantHere ? 'Merchant visiting' : 'Merchant Day ' + s.trade.nextMerchantDay) + ' · Rep ' + reputation : 'No Trading Post'}</small>`)

    const hasPost = s.buildings.some(b => b.complete && !b.destroyed && b.type === 'guard-post')
    const shelterReady = beds >= s.settlers.length
    this.set('objective', `<div class="objective-row">${effectiveWorkRate >= 1 ? '✓' : '○'} Settlement productivity · ${Math.round(effectiveWorkRate * 100)}%</div><div class="objective-row">${toolSummary.coverage >= 1 ? '✓' : '○'} Tool coverage · ${toolSummary.stored}/${toolSummary.required} · +${Math.round((toolSummary.workMultiplier - 1) * 100)}%</div><div class="objective-row">${moraleSummary.refusing === 0 ? '✓' : '○'} Essentials-only workers · ${moraleSummary.refusing}</div><div class="objective-row">${attraction.spareBeds > 0 ? '✓' : '○'} Spare bed · ${attraction.spareBeds}</div><div class="objective-row">${attraction.food >= attraction.foodRequired ? '✓' : '○'} Food buffer · ${attraction.food}/${attraction.foodRequired}</div><div class="objective-row">${attraction.households === 0 || attraction.marketCoveredHouseholds >= attraction.households ? '✓' : '○'} Household Market coverage · ${attraction.marketCoveredHouseholds}/${attraction.households}</div><div class="objective-row">${attraction.happiness >= 65 ? '✓' : '○'} Happiness ≥ 65% · ${attraction.happiness}%</div><div class="objective-row">${attraction.safety >= 55 ? '✓' : '○'} Safety ≥ 55% · ${attraction.safety}%</div><div class="objective-row">${attraction.raidReady ? '✓' : '○'} Settlement safe after raids</div><div class="objective-row">${s.immigration.eligibleDays >= IMMIGRATION_REQUIRED_DAYS ? '✓' : '○'} Qualification streak · ${s.immigration.eligibleDays}/${IMMIGRATION_REQUIRED_DAYS}</div><div class="objective-row">${s.immigration.totalArrivals > 0 ? '✓' : '○'} Immigrants arrived · ${s.immigration.totalArrivals}</div>`)
    const workforceParts = workplaces.map(building => {
      const staffing = workplaceStaffing(s, building)
      const label = BUILDINGS[building.type].profession ?? BUILDINGS[building.type].label
      return label + ' ' + staffing.assigned + '/' + staffing.slots
    })
    this.set('workforce', '<p><b>Workforce</b> · Laborers ' + laborers
      + (workforceParts.length ? ' · ' + workforceParts.join(' · ') : ' · no staffed workplaces yet')
      + ' · Guards ' + guards + '/' + guardSlots
      + (markets.markets ? ' · Markets ' + markets.active + '/' + markets.markets + ' active · Meals ' + markets.mealsServed + '/' + markets.mealCapacity : '')
      + (agriculture.fields ? ' · Fields ' + agriculture.fields + ' · Ready ' + agriculture.phases.ready + ' · Expected ' + agriculture.expected + ' Food' : '')
      + '</p>')

    const a = s.settlers.find(a => a.id === ui.selectedId)
    const b = s.buildings.find(b => b.id === ui.selectedId)
    const field = s.fields.find(field => field.id === ui.selectedId)
    const n = s.nodes.find(n => n.id === ui.selectedId)
    const e = s.enemies.find(e => e.id === ui.selectedId)
    if (!b) this.lastContextId = null

    if (a) {
      const guardAssignment = assignedGuardPost(s, a)
      const service = serviceAssignment(s, a, phase)
      const morale = happinessEffect(a)
      const modifier = Math.round((morale.workRate - 1) * 100)
      const effectiveRate = morale.workRate * toolSummary.workMultiplier
      const serviceText = service ? service.label + ' · +' + service.gainPerSecond + ' recreation/s' : (phase === 'dusk' || phase === 'dawn' ? 'No available service slot' : 'Off hours only')
      const moraleText = morale.label + ' · morale ' + (modifier >= 0 ? '+' : '') + modifier + '% · tools +' + Math.round((toolSummary.workMultiplier - 1) * 100) + '% · effective ' + Math.round(effectiveRate * 100) + '%' + (morale.refusesNonessential ? ' · <b>ESSENTIALS ONLY</b>' + (morale.reason ? ' (' + morale.reason + ')' : '') : '')
      const profession = professionLabel(s, a)
      const workplace = assignedWorkplace(s, a)
      const workplaceText = workplace ? BUILDINGS[workplace.type].label + ' ' + workplace.id : 'General labor pool'
      this.set('inspection', `<h2>${settlerLabel(s, a.id)}</h2><p><b>${profession}</b> · ${escape(a.status)}</p><p><b>Happiness ${happinessOf(a)}% · ${moraleText}</b><br>Food ${Math.round(a.needs.food)}% · Housing ${Math.round(a.needs.housing)}%<br>Safety ${Math.round(a.needs.safety)}% · Recreation ${Math.round(a.needs.recreation)}%</p><p>${a.arrivalTarget ? '<b>Immigrant:</b> walking into the settlement<br>' : ''}Recreation service: ${serviceText}<br>HP: ${a.health}/${a.maxHealth}<br>Cargo: ${a.cargo.wood} wood, ${a.cargo.food} food, ${a.cargo.ale} ale, ${a.cargo.ore} ore, ${a.cargo.tools} tools<br>Home: ${a.homeId === null ? 'Unhoused' : 'House ' + a.homeId}<br>Workplace: ${workplaceText}<br>Night post: ${a.role === 'guard' ? (guardAssignment ? 'Guard Post ' + guardAssignment.buildingId : 'No slot available') : 'Civilian shelter'}<br>Last meal: Day ${a.lastMealDay}<br>Position: ${a.x.toFixed(1)}, ${a.z.toFixed(1)}</p>${a.arrivalTarget ? '' : (a.workplaceId !== null ? '<button data-action="unassign-workplace" data-value="' + a.id + '">Return to labor pool</button>' : '') + '<button data-action="toggle-role">' + (a.role === 'guard' ? 'Return to worker duty' : 'Assign as guard') + '</button>'}`)
    } else if (e) {
      const target = s.buildings.find(b => b.id === e.targetId)
      this.set('inspection', `<h2>${enemyLabel(s, e.id)}</h2><p><b>Raider</b> · ${escape(e.status)}</p><p>HP: ${e.health}/${e.maxHealth}<br>Wave: ${s.raid.wave}<br>Target: ${target ? BUILDINGS[target.type].label + ' ' + target.id : 'Settlement'}<br>Position: ${e.x.toFixed(1)}, ${e.z.toFixed(1)}</p><p class="muted">Move the player within melee range and press Space, or let guards intercept.</p>`)
    } else if (field) {
      const farmhouse = field.farmhouseId === null ? null : s.buildings.find(building => building.id === field.farmhouseId)
      const cropPhase = field.phase[0].toUpperCase() + field.phase.slice(1)
      const workTarget = field.phase === 'fallow' ? fieldSowWork(field) : field.phase === 'ready' ? fieldHarvestWork(field) : 0
      const workText = workTarget > 0
        ? '<br>Work: ' + field.work.toFixed(1) + '/' + workTarget.toFixed(1)
        : ''
      this.set('inspection', '<h2>Farm Field ' + field.id + '</h2><p><b>' + cropPhase + '</b>'
        + '<br>Area: ' + field.area.toFixed(1) + 'm²'
        + '<br>Expected harvest: ' + field.yield + ' Food'
        + '<br>Growth: ' + field.growthDays + '/2 Days'
        + workText
        + '<br>Farmhouse: ' + (farmhouse ? 'Farmhouse ' + farmhouse.id : 'Unassigned — build/repair a Farmhouse')
        + '<br>Corners: ' + field.points.length
        + '</p><p class="muted">Ready fields are harvested before fallow fields are sown. Harvest waits if the Farmhouse Food store cannot fit the full crop.</p>'
        + '<button class="danger" data-action="remove-field">Remove field</button>')
    } else if (b) {
      const def = BUILDINGS[b.type]
      const starter = b.type === 'stockpile' && b.x === 0 && b.z === 0
      const cancel = b.complete ? '' : '<button data-action="cancel-blueprint">Cancel blueprint</button>'
      const refundWood = b.destroyed ? 0 : Math.floor(def.buildCost.wood * 0.5)
      const demolish = b.complete && !starter
        ? '<button class="danger" data-action="demolish-selected">Demolish · refund ' + refundWood + ' wood</button>'
        : ''
      const facing = b.facingAngle === undefined
        ? ['South', 'East', 'North', 'West'][b.rotation ?? 0]
        : 'Road-aligned ' + Math.round(((b.facingAngle * 180 / Math.PI) + 360) % 360) + '°'
      const residentialPlot = b.type === 'house' ? s.residentialPlots.find(plot => plot.buildingId === b.id) : undefined
      const household = b.type === 'house' && b.complete && !b.destroyed ? householdStatus(s, b) : null
      const houseProgress = household ? houseProgressionStatus(s, b) : null
      const compoundText = residentialPlot
        ? (() => {
            const profile = residentialPresentationProfile(residentialPlot)
            const frontage = residentialFrontage(residentialPlot)
            const passage = profile.sidePassage === 0 ? '' : ' · side passage'
            const courtyard = profile.courtyard === 'none' ? '' : ' · ' + profile.courtyard.toUpperCase() + '-courtyard'
            return '<br><b>' + profile.label + '</b> · ' + frontage.toFixed(1) + 'm frontage × ' + residentialPlot.depth.toFixed(1) + 'm depth · ' + residentialPlot.backyard + passage
              + '<br><span class="muted">' + profile.roofFront + '-front roof · ' + profile.frontageStyle + ' frontage · ' + profile.rearStructure + courtyard + '</span>'
          })()
        : ''
      let details = ''
      let operations = ''
      if (b.complete) {
        const repairJob = s.jobs.find(j => j.kind === 'repair' && j.targetId === b.id)
        const supplyJob = s.jobs.filter(j => j.kind === 'supply' && j.targetId === b.id).reduce((sum, j) => sum + j.amount, 0)
        const service = def.service
        const production = def.production
        const serviceText = service
          ? service.slots + ' ' + service.need + ' slots · +' + service.gainPerSecond + '/s'
            + (service.supplyResource ? '<br>Pantry: ' + b.inventory[service.supplyResource] + '/' + service.supplyCapacity + ' ' + service.supplyResource + ' · inbound ' + supplyJob : '<br>No operating supplies required')
          : ''
        const staffing = (def.workerSlots ?? 0) > 0 ? workplaceStaffing(s, b) : null
        const distribution = def.foodDistribution
        const tradeStorage = def.tradeStorageCapacity
        const farmStorage = def.agricultureStorageCapacity
        const inboundProduction = production
          ? s.jobs.filter(j => j.kind === 'supply' && j.targetId === b.id && j.resource === production.inputResource).reduce((sum, j) => sum + j.amount, 0)
          : 0
        const outboundProduction = production
          ? s.jobs.filter(j => j.kind === 'supply' && j.sourceId === b.id && j.resource === production.outputResource).reduce((sum, j) => sum + j.amount, 0)
          : 0
        const productionText = production
          ? production.inputAmount + ' ' + production.inputResource + ' → ' + production.outputAmount + ' ' + production.outputResource + ' every ' + production.cycleSeconds + 's at full staffing'
            + '<br><b>Local input:</b> ' + b.inventory[production.inputResource] + '/' + workplaceInputTarget(b) + ' target (' + production.inputCapacity + ' max) · inbound ' + inboundProduction
            + '<br><b>Local output:</b> ' + b.inventory[production.outputResource] + '/' + production.outputCapacity + ' · pickup from ' + workplaceOutputThreshold(b) + ' · outbound ' + outboundProduction
            + '<br>Batch progress: ' + Math.round(b.productionProgress / production.cycleSeconds * 100) + '%'
            + (staffing ? '<br>Staffing: ' + staffing.assigned + '/' + staffing.slots + ' assigned · ' + staffing.active + ' present · ' + Math.round(staffing.efficiency * 100) + '% speed' : '')
          : ''
        const functionText = def.housing
          ? (() => {
              if (!household) return def.housing + ' beds'
              const residents = household.residents.length
                ? household.residents.map(resident => settlerLabel(s, resident.id)).join(', ')
                : 'Empty'
              const market = household.foodAccessLabel
                + (household.marketDistance === null ? '' : ' · ' + household.marketDistance.toFixed(1) + 'm')
              const recreation = household.recreation
                ? BUILDINGS[household.recreation.type].label + ' ' + household.recreation.id + ' · ' + household.recreationDistance!.toFixed(1) + 'm'
                : 'No available recreation within 18m'
              const progression = houseProgress
                ? '<br><b>Prosperity:</b> Level ' + houseProgress.level + ' · ' + houseProgress.label
                  + (houseProgress.next
                    ? '<br><b>Next:</b> ' + houseProgress.next.label + ' · streak ' + houseProgress.qualifyingDays + '/' + houseProgress.next.requiredDays
                      + ' · needs Safety ' + houseProgress.next.minimumSafety + '% / Satisfaction ' + houseProgress.next.minimumSatisfaction + '%'
                      + (houseProgress.blockers.length ? '<br><span class="muted">Blocked: ' + houseProgress.blockers.join(' · ') + '</span>' : '<br><span class="muted">Qualifying today</span>')
                    : '<br><span class="muted">Maximum household prosperity reached</span>')
                : ''
              return houseBedCapacity(b) + ' beds · ' + household.residents.length + ' residents'
                + '<br><b>Residents:</b> ' + residents
                + '<br><b>Food access:</b> ' + market
                + '<br><b>Recreation:</b> ' + recreation
                + '<br><b>Safety:</b> ' + household.safety + '%'
                + '<br><b>Household satisfaction:</b> ' + household.satisfaction + '%'
                + progression
            })()
          : def.guardSlots ? def.guardSlots + ' guard slots'
          : def.storage ? `Wood ${b.inventory.wood} (${available(s, b, 'wood')} available)<br>Food ${b.inventory.food}<br>Ale ${b.inventory.ale}<br>Ore ${b.inventory.ore}<br>Tools ${b.inventory.tools}<br>Unreserved capacity: ${Math.max(0, freeStorage(s, b))}<br>Receiving priority: ${stockpilePriorityLabel(b.stockpilePriority)}`
          : distribution
            ? `Food stalls: ${b.inventory.food}/${distribution.capacity}<br>Meals served today: ${b.distributionDay === s.day ? b.distributionServed : 0}<br>Each active Vendor distributes ${distribution.mealsPerWorkerPerDay} meals/Day<br>Assigned Vendors buffer up to ${distribution.reserveDays} Days of their capacity.`
          : tradeStorage
            ? `Trade cargo: ${tradeStorageUsed(b)}/${tradeStorage}<br>Wood ${b.inventory.wood} · Food ${b.inventory.food} · Ale ${b.inventory.ale} · Ore ${b.inventory.ore} · Tools ${b.inventory.tools}<br>Gold: ${s.trade.gold}<br>${merchantPresent(s) ? (s.trade.lastTransactionDay === s.day ? 'Merchant deal completed today' : 'Merchant waiting for an active Trader') : 'Next merchant: Day ' + s.trade.nextMerchantDay}<br>Trade reputation: ${tradeReputation(s)} · caravan every ${merchantIntervalDays(s)} Days`
          : farmStorage
            ? `Harvest store: ${b.inventory.food}/${farmStorage} Food<br>Assigned fields: ${fieldsForFarmhouse(s, b.id).length}<br>Farmers sow fallow fields and harvest ready crops before returning to the Farmhouse.`
          : production ? productionText
          : service ? serviceText
          : def.friendlyPassable ? 'Friendlies pass through; raiders treat it as closed.'
          : def.fortification ? 'Blocks friendly and hostile movement until destroyed.'
          : ''
        details = `<b>${b.destroyed ? 'DESTROYED RUIN' : 'HP ' + b.health + '/' + b.maxHealth}</b><br><progress value="${b.health}" max="${b.maxHealth}"></progress>`
        operations = functionText + (repairJob ? '<br>Repair job active · ' + repairJob.amount + ' wood' : '')
      } else {
        details = `Delivered: ${b.delivered.wood}/${def.buildCost.wood} wood<br>Assigned deliveries: ${s.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id).reduce((sum, j) => sum + j.amount, 0)} wood<br>Work: ${Math.round(b.work / def.constructionWork * 100)}%<br><progress value="${b.work}" max="${def.constructionWork}"></progress>${cancel}`
      }
      const workplaceControls = b.complete && !b.destroyed && (def.workerSlots ?? 0) > 0
        ? (() => {
            const staffing = workplaceStaffing(s, b)
            const rows = staffing.workers.map(worker =>
              '<div class="worker">' + settlerLabel(s, worker.id) + ' · ' + professionLabel(s, worker)
              + (worker.jobId !== null ? ' · finishing current task' : worker.status.startsWith('Working') ? ' · present' : ' · reporting')
              + ' <button data-action="unassign-workplace" data-value="' + worker.id + '">Unassign</button></div>'
            ).join('')
            const assign = staffing.assigned < staffing.slots
              ? '<button data-action="assign-workplace">Assign laborer</button>'
              : '<button disabled>Fully staffed</button>'
            const logistics = def.production
              ? '<button data-action="workplace-haul-priority">Hauling: ' + haulPriorityLabel(b.haulPriority) + '</button>'
                + '<p class="muted">Low keeps one input batch and delays output pickup. Normal keeps a working reserve. High fills local input storage and clears finished goods quickly.</p>'
              : ''
            return '<p><b>Workforce ' + staffing.assigned + '/' + staffing.slots + '</b> · ' + staffing.active + ' physically at work</p>' + rows + assign + logistics
          })()
        : ''
      const stockpileControls = b.complete && !b.destroyed && def.storage > 0
        ? (() => {
            const filters = RESOURCE_IDS.map(resource =>
              '<button data-action="stockpile-filter" data-value="' + resource + '" aria-pressed="' + b.stockpileFilters[resource] + '">'
              + RESOURCES[resource].label + ' ' + (b.stockpileFilters[resource] ? '✓' : '✕') + '</button>'
            ).join('')
            return '<p><b>Accepted resources</b></p><div class="row">' + filters + '</div>'
              + '<button data-action="stockpile-priority">Receiving: ' + stockpilePriorityLabel(b.stockpilePriority) + '</button>'
              + '<p class="muted">Priority is chosen before distance. Disabled resources already stored here remain usable; deliveries already in flight may still finish.</p>'
          })()
        : ''
      const tradeControls = b.complete && !b.destroyed && b.type === 'trading-post'
        ? (() => {
            const rows = RESOURCE_IDS.map(resource => {
              const policy = s.trade.policies[resource]
              const prices = TRADE_PRICES[resource]
              return '<div class="worker"><b>' + RESOURCES[resource].label + '</b> · '
                + '<button data-action="trade-policy" data-value="' + resource + '">' + tradeModeLabel(policy.mode) + '</button>'
                + ' · reserve ' + policy.reserve
                + ' <button data-action="trade-reserve-down" data-value="' + resource + '">−5</button>'
                + ' <button data-action="trade-reserve-up" data-value="' + resource + '">+5</button>'
                + ' · buy ' + prices.buy + 'G / sell ' + prices.sell + 'G</div>'
            }).join('')
            return '<p><b>Trade policies</b></p>' + rows
              + '<p class="muted">Export surplus stages only stock above the reserve. Import buys toward the reserve when a merchant visits and Gold is available.</p>'
          })()
        : ''
      if (this.lastContextId !== b.id) {
        this.lastContextId = b.id
        this.activeContextTab = 'general'
      }
      const buildingStatus = b.complete ? (b.destroyed ? 'Ruined' : 'Fully operational') : 'Under construction'
      const peopleBody = workplaceControls
        || (b.type === 'house' && operations ? operations : '')
        || (def.guardSlots ? operations : '')
        || '<p class="context-empty">No dedicated workforce assigned to this building.</p>'
      const operationBody = b.type === 'house' || def.guardSlots
        ? '<p class="context-empty">Household and staffing information is shown under People.</p>'
        : (operations || '<p class="context-empty">No active production or service cycle.</p>')
      const advancedBody = stockpileControls + tradeControls
        || '<p class="context-empty">No advanced policies are available for this building yet.</p>'
      const contextTabs = [
        { id: 'general', label: 'General', body: '<p><b>' + buildingStatus + '</b> · Facing ' + facing + compoundText + '</p><div class="context-status">' + details + '</div>' + demolish },
        { id: 'people', label: 'People', body: peopleBody },
        { id: 'operations', label: def.production ? 'Production' : def.service ? 'Services' : def.storage || def.tradeStorageCapacity || def.agricultureStorageCapacity ? 'Storage' : 'Operations', body: operationBody },
        { id: 'advanced', label: 'Advanced', body: advancedBody },
      ]
      const contextTabsHtml = contextTabs.map(tab =>
        '<button data-context-tab="' + tab.id + '" aria-pressed="' + (this.activeContextTab === tab.id) + '">' + tab.label + '</button>'
      ).join('')
      const contextPanelsHtml = contextTabs.map(tab =>
        '<div class="context-pane ' + (this.activeContextTab === tab.id ? 'is-active' : '') + '" data-context-panel="' + tab.id + '">' + tab.body + '</div>'
      ).join('')
      this.set('inspection',
        '<div class="building-panel">'
        + '<div class="building-panel-title"><span class="ui-icon-slot" data-ui-asset="building-icon:' + b.type + '" aria-hidden="true"></span><div><span class="eyebrow">' + (def.profession ?? (def.housing ? 'Residential' : def.fortification ? 'Defense' : 'Settlement building')) + '</span><h2>' + def.label + ' <small>#' + b.id + '</small></h2></div><button class="context-close" data-action="cancel" title="Close selection">×</button></div>'
        + '<div class="building-hero" data-ui-asset="building-header:' + b.type + '"><span>Artwork slot · ' + def.label + '</span></div>'
        + '<div class="context-tabs" role="tablist">' + contextTabsHtml + '</div>'
        + '<div class="context-content">' + contextPanelsHtml + '</div>'
        + '</div>')
    } else if (n) {
      this.set('inspection', `<h2>${n.resource === 'wood' ? 'Tree' : n.resource === 'food' ? 'Food bush' : RESOURCES[n.resource].label + ' deposit'} ${n.id}</h2><p>${n.remaining} ${n.resource} remaining<br>${s.jobs.some(j => j.sourceId === n.id) ? 'Claimed by a settler' : 'Available for gathering'}</p>`)
    } else {
      const facing = ['South', 'East', 'North', 'West'][ui.buildRotation]
      const curveLabel = ui.roadCurve <= 0.05 ? 'Straight' : ui.roadCurve < 0.8 ? 'Smooth' : 'Curved'
      const widthLabel = ui.roadWidth <= 1.25 ? 'Path' : ui.roadWidth >= 2.35 ? 'Main road' : 'Lane'
      const placement = ui.planningTool === 'field'
        ? 'Field tool · Farmhouse-linked parcel · click corners ' + ui.fieldPointCount + '/8 · shared Grid ' + (ui.gridSnap ? 'ON' : 'OFF') + ' · must stay within 18m of a Farmhouse · Enter/double-click/first marker closes.'
        : ui.planningTool === 'road'
        ? 'Road tool · click control points · ' + curveLabel + ' · ' + widthLabel + ' ' + ui.roadWidth.toFixed(1) + 'm · points ' + ui.roadPointCount
          + ' · Grid ' + (ui.gridSnap ? 'ON' : 'OFF') + ' · Road Snap ' + (ui.roadSnap ? 'ON' : 'OFF')
          + (ui.roadAngleSnap ? ' · Shift angle constrain ON' : ' · hold Shift to constrain') + ' · double-click/Enter finishes.'
        : ui.planningTool === 'residential-plot'
          ? 'Residential Plot · road frontage is mandatory. ' + (ui.gridSnap ? 'Width/depth snap to whole metres.' : 'Freeform plot dimensions enabled.')
          : ui.buildType
            ? 'Placing ' + BUILDINGS[ui.buildType].label + ' · ' + (!BUILDINGS[ui.buildType].fortification && ui.buildType !== 'house'
              ? 'Road frontage mandatory: the building snaps/alines to a nearby street.'
              : 'Manual grid facing ' + facing + '.')
              + (ui.dragCount > 1 ? ' · ' + ui.dragCount + ' wall segments' : '')
            : 'Select a settler to assign guard duty, or inspect a resource/building.'
      this.set('inspection', '<p>' + placement + '</p>')
    }

    this.set('message', escape(ui.message))
    const m = ui.metrics
    this.set('metrics', `<dl><dt>Region / resource nodes</dt><dd>${s.map?.size ?? 47}m / ${s.nodes.length}</dd><dt>Phase</dt><dd>${phaseLabel(phase)}</dd><dt>Frame / FPS</dt><dd>${m.frame.toFixed(1)} ms / ${(1000 / Math.max(m.frame, 1)).toFixed(0)}</dd><dt>Simulation CPU</dt><dd>${m.simulation.toFixed(2)} ms</dd><dt>Render submission CPU</dt><dd>${m.render.toFixed(2)} ms</dd><dt>Draws / triangles</dt><dd>${m.calls} / ${m.triangles}</dd><dt>Active jobs / settlers</dt><dd>${s.jobs.length} / ${s.settlers.length}</dd><dt>Guards / post slots</dt><dd>${guards} / ${guardSlots}</dd><dt>Path requests / solves</dt><dd>${m.requests} / ${m.paths}</dd><dt>Queued paths</dt><dd>${m.queue}</dd><dt>Path failures</dt><dd>${m.failures}</dd><dt>Catch-up dropped</dt><dd>${m.dropped.toFixed(2)} s</dd><dt>Enemies</dt><dd>${s.enemies.length}</dd><dt>Raid wave / spawned</dt><dd>${s.raid.wave} / ${s.raid.totalSpawned}</dd><dt>Next wave size</dt><dd>${raidSizeForWave(s.raid.wave + 1)}</dd><dt>Happiness / worst</dt><dd>${needSummary.happiness}% / ${needLabel(needSummary.worst)} ${Math.round(needSummary.averages[needSummary.worst])}%</dd><dt>Work productivity</dt><dd>${Math.round(effectiveWorkRate * 100)}% · morale ${Math.round(moraleSummary.averageWorkRate * 100)}% · tools +${Math.round((toolSummary.workMultiplier - 1) * 100)}%</dd><dt>Tools / coverage</dt><dd>${toolSummary.stored}/${toolSummary.required} · ${Math.round(toolSummary.coverage * 100)}%</dd><dt>Attraction / blocker</dt><dd>${attraction.score} / ${attraction.eligible ? 'Eligible' : escape(attraction.blockers[0] ?? 'Score too low')}</dd><dt>Qualification streak</dt><dd>${s.immigration.eligibleDays}/${IMMIGRATION_REQUIRED_DAYS}</dd><dt>Immigrants / arriving</dt><dd>${s.immigration.totalArrivals} / ${arriving}</dd><dt>Need averages</dt><dd>F ${Math.round(needSummary.averages.food)} · H ${Math.round(needSummary.averages.housing)} · S ${Math.round(needSummary.averages.safety)} · R ${Math.round(needSummary.averages.recreation)}</dd><dt>Fed today</dt><dd>${fedToday}/${s.settlers.length}</dd><dt>Household Market coverage</dt><dd>${households.marketCovered}/${households.occupied}</dd><dt>Household recreation coverage</dt><dd>${households.recreationCovered}/${households.occupied}</dd><dt>Fully supported households</dt><dd>${households.fullySupported}/${households.occupied}</dd><dt>Home prosperity tiers</dt><dd>L1 ${houseTiers[1] ?? 0} · L2 ${houseTiers[2] ?? 0} · L3 ${houseTiers[3] ?? 0}</dd><dt>Total beds</dt><dd>${beds}</dd><dt>Gold</dt><dd>${s.trade.gold} · earned ${s.trade.goldEarned} · spent ${s.trade.goldSpent}</dd><dt>Merchant visits</dt><dd>${s.trade.visits} · next Day ${s.trade.nextMerchantDay}</dd><dt>Food consumed</dt><dd>${s.totals.foodConsumed}</dd><dt>Service providers</dt><dd>${services.suppliedProviders}/${services.providers} supplied</dd><dt>Service slots / visitors</dt><dd>${services.slots} / ${services.activeVisitors}</dd><dt>Food → production</dt><dd>${s.totals.productionConsumed.food}</dd><dt>Ale produced / used</dt><dd>${s.totals.produced.ale} / ${s.totals.serviceConsumed.ale}</dd><dt>Ore → production</dt><dd>${s.totals.productionConsumed.ore}</dd><dt>Tools produced / stored</dt><dd>${s.totals.produced.tools} / ${storedTools}</dd><dt>Raiders defeated</dt><dd>${s.raid.totalDefeated}</dd><dt>Last cleared wave</dt><dd>${s.raid.lastClearedWave || '—'}</dd><dt>Player HP</dt><dd>${s.player.health}/${s.player.maxHealth}</dd><dt>Structure damage</dt><dd>${s.totals.structureDamage} HP</dd><dt>Repaired</dt><dd>${s.totals.repairedHealth} HP / ${s.totals.repairWoodUsed} wood</dd><dt>Damaged structures</dt><dd>${damaged}</dd><dt>Completed / sites</dt><dd>${s.totals.constructed} / ${s.buildings.filter(b => !b.complete).length}</dd><dt>Roads / residential plots</dt><dd>${s.roads.length} / ${s.residentialPlots.length}</dd><dt>Simulation tick</dt><dd>${s.tick}</dd></dl>`)
    if (this.element.querySelector<HTMLDetailsElement>('.qa')!.open) {
      const size = 25
      const pages = Math.max(1, Math.ceil(s.settlers.length / size))
      this.rosterPage = Math.min(this.rosterPage, pages - 1)
      const start = this.rosterPage * size
      const paging = pages > 1
        ? `<div class="row"><button data-roster="-1" ${this.rosterPage === 0 ? 'disabled' : ''}>Previous settlers</button><span>${this.rosterPage + 1}/${pages}</span><button data-roster="1" ${this.rosterPage === pages - 1 ? 'disabled' : ''}>Next settlers</button></div>`
        : ''
    this.set('workers', '<h3>Settlers</h3>' + paging + s.settlers.slice(start, start + size).map(a => { const morale = happinessEffect(a); return `<div class="worker">${settlerLabel(s, a.id)} · ${professionLabel(s, a)} · ${morale.label} ${happinessOf(a)}% · Work ${Math.round(morale.workRate * toolSummary.workMultiplier * 100)}% · ${escape(a.status)}</div>` }).join('') + (s.enemies.length ? '<h3>Raiders</h3>' + s.enemies.map(e => `<div class="worker enemy-row">${enemyLabel(s, e.id)} · ${e.health}/${e.maxHealth} HP · ${escape(e.status)}</div>`).join('') : '') + '<h3>Recent activity</h3>' + s.events.map(e => `<div class="worker">${escape(e)}</div>`).join(''))
    }

    const taskItems: { tone: string; icon: string; title: string; detail: string }[] = []
    if (s.enemies.length > 0) taskItems.push({ tone: 'danger', icon: 'task-raid', title: 'Raiders inside the region', detail: s.enemies.length + ' hostile' + (s.enemies.length === 1 ? '' : 's') + ' remain' })
    if (!shelterReady) taskItems.push({ tone: 'warning', icon: 'task-housing', title: (s.settlers.length - beds) + ' settler' + (s.settlers.length - beds === 1 ? '' : 's') + ' awaiting housing', detail: beds + '/' + s.settlers.length + ' beds available' })
    if (food < Math.max(s.settlers.length * 2, 8)) taskItems.push({ tone: 'warning', icon: 'task-food', title: 'Food reserves are low', detail: food + ' Food across settlement storage' })
    const fullStores = stores.filter(store => freeStorage(s, store) <= 0)
    if (fullStores.length) taskItems.push({ tone: 'warning', icon: 'task-storage', title: fullStores.length + ' stockpile' + (fullStores.length === 1 ? '' : 's') + ' full', detail: 'Expand or change accepted resources' })
    if (damaged) taskItems.push({ tone: 'warning', icon: 'task-repair', title: damaged + ' damaged structure' + (damaged === 1 ? '' : 's'), detail: 'Repairs need free labor and Wood' })
    if (merchantHere) taskItems.push({ tone: 'info', icon: 'task-trade', title: 'Trade caravan has arrived', detail: s.trade.lastTransactionDay === s.day ? 'Today\'s trade completed' : 'A Trader can complete active policies' })
    if (arriving) taskItems.push({ tone: 'info', icon: 'task-arrival', title: arriving + ' new settler' + (arriving === 1 ? '' : 's') + ' arriving', detail: 'Immigrants are walking into Nightspire' })
    const eventItems = s.events.slice(0, Math.max(0, 5 - taskItems.length)).map(message => ({ tone: 'event', icon: 'task-event', title: message, detail: 'Recent settlement event' }))
    const visibleTasks = [...taskItems, ...eventItems].slice(0, 5)
    this.set('task-count', String(visibleTasks.length))
    this.set('tasks', visibleTasks.length
      ? visibleTasks.map(item => '<div class="task-item task-' + item.tone + '"><span class="ui-icon-slot compact" data-ui-asset="notification:' + item.icon + '" aria-hidden="true"></span><div><strong>' + escape(item.title) + '</strong><small>' + escape(item.detail) + '</small></div></div>').join('')
      : '<div class="task-empty">No urgent settlement matters.</div>')

    const miniRoads = s.roads.map(road => '<polyline class="mini-road" points="' + road.points.map(point => point.x.toFixed(2) + ',' + point.z.toFixed(2)).join(' ') + '"/>').join('')
    const miniFields = s.fields.map(field => '<polygon class="mini-field" points="' + field.points.map(point => point.x.toFixed(2) + ',' + point.z.toFixed(2)).join(' ') + '"/>').join('')
    const miniBuildings = s.buildings.filter(building => !building.destroyed).map(building =>
      '<rect class="mini-building' + (building.id === ui.selectedId ? ' is-selected' : '') + '" x="' + (building.x - 0.7).toFixed(2) + '" y="' + (building.z - 0.7).toFixed(2) + '" width="1.4" height="1.4"/>'
    ).join('')
    const miniSettlers = s.settlers.map(settler => '<circle class="mini-settler" cx="' + settler.x.toFixed(2) + '" cy="' + settler.z.toFixed(2) + '" r=".33"/>').join('')
    const miniEnemies = s.enemies.map(enemy => '<circle class="mini-enemy" cx="' + enemy.x.toFixed(2) + '" cy="' + enemy.z.toFixed(2) + '" r=".48"/>').join('')
    const half = worldHalf(s), mapKey = JSON.stringify(s.map)
    if (mapKey !== this.mapBackgroundKey) {
      this.mapBackgroundKey = mapKey; this.mapBackground = ''
      if (s.map) for (let z = -half; z < half; z += half / 20) for (let x = -half; x < half; x += half / 20) {
        const density = forestDensity(x, z, s.map)
        if (density > 0.15) this.mapBackground += '<rect x="' + x + '" y="' + z + '" width="' + half / 20 + '" height="' + half / 20 + '" fill="#344c35" opacity="' + density + '"/>'
      }
      this.set('minimap-map', '<svg viewBox="' + [-half, -half, half * 2, half * 2].join(' ') + '" preserveAspectRatio="none" role="img" aria-label="Settlement overview">' + this.mapBackground + '<g id="minimap-live"></g></svg>')
    }
    this.set('region-label', s.map ? s.map.size + 'm · seed ' + s.map.seed : 'Camp')
    this.set('minimap-live', '<circle cx="' + (ui.cameraPoint?.x ?? 0) + '" cy="' + (ui.cameraPoint?.z ?? 0) + '" r="' + half / 15 + '" fill="none" stroke="#edd39a" stroke-width="' + half / 160 + '"/>' + miniFields + miniRoads + miniBuildings + miniSettlers + miniEnemies + '<circle cx="0" cy="0" r="' + Math.max(1, half / 40) + '" fill="#edce89"/>')

    const inspector = this.element.querySelector<HTMLElement>('.inspector')!
    inspector.classList.toggle('is-active', ui.selectedId !== null || ui.buildType !== null || ui.planningTool !== null)
    inspector.classList.toggle('is-building', Boolean(b))
    this.element.querySelector<HTMLElement>('.road-context')!.classList.toggle('is-active', ui.planningTool === 'road')
    this.element.querySelector<HTMLElement>('#message')!.classList.toggle('is-visible', ui.message.trim().length > 0)

    this.element.querySelector('[data-action="pause"]')!.textContent = ui.paused ? 'Resume' : 'Pause'
    this.element.querySelector('[data-action="camera"]')!.textContent = ui.camera === 'settlement' ? 'Follow player' : 'Settlement camera'
    const cinematic = this.element.querySelector('[data-action="cinematic"]') as HTMLButtonElement
    cinematic.textContent = ui.cinematic ? 'Overview [V]' : 'Street view [V]'
    cinematic.setAttribute('aria-pressed', String(ui.cinematic))
    ;(this.element.querySelector('[data-action="spawn"]') as HTMLButtonElement).disabled = s.settlers.length >= MAX_SETTLERS
    ;(this.element.querySelector('[data-action="rotate-build"]') as HTMLButtonElement).disabled = ui.buildType === null
    this.element.querySelector('[data-action="road"]')!.setAttribute('aria-pressed', String(ui.planningTool === 'road'))
    this.element.querySelector('[data-action="residential-plot"]')!.setAttribute('aria-pressed', String(ui.planningTool === 'residential-plot'))
    const gridSnap = this.element.querySelector('[data-action="grid-snap"]') as HTMLButtonElement
    const roadCurve = this.element.querySelector('[data-action="road-curve"]') as HTMLButtonElement
    const roadWidth = this.element.querySelector('[data-action="road-width"]') as HTMLButtonElement
    const roadSnap = this.element.querySelector('[data-action="road-snap"]') as HTMLButtonElement
    const curveLabel = ui.roadCurve <= 0.05 ? 'Straight' : ui.roadCurve < 0.8 ? 'Smooth' : 'Curved'
    const widthLabel = ui.roadWidth <= 1.25 ? 'Path' : ui.roadWidth >= 2.35 ? 'Main' : 'Lane'
    gridSnap.textContent = 'Grid Snap ' + (ui.gridSnap ? 'ON' : 'OFF') + ' [G]'
    roadCurve.textContent = 'Curve ' + curveLabel + ' [C]'
    roadWidth.textContent = 'Width ' + widthLabel + ' ' + ui.roadWidth.toFixed(1) + 'm'
    roadSnap.textContent = 'Road Join ' + (ui.roadSnap ? 'ON' : 'OFF') + ' [F]'
    gridSnap.setAttribute('aria-pressed', String(ui.gridSnap))
    roadCurve.setAttribute('aria-pressed', String(ui.roadCurve > 0.05))
    roadSnap.setAttribute('aria-pressed', String(ui.roadSnap))
    for (const type of ['stockpile', 'guard-post', 'campfire', 'brewery', 'tavern', 'blacksmith', 'farmhouse', 'market', 'trading-post', 'wood-wall', 'wood-gate']) this.element.querySelector('[data-action="' + type + '"]')!.setAttribute('aria-pressed', String(ui.buildType === type))
    this.element.querySelector('[data-action="field"]')!.setAttribute('aria-pressed', String(ui.planningTool === 'field'))

    const hour = this.element.querySelector<HTMLInputElement>('[data-action="time"]')!
    if (document.activeElement !== hour) hour.value = String(Math.floor(s.timeOfDay * 24))
    const woodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-wood"]')!
    const foodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-food"]')!
    const oreTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-ore"]')!
    if (document.activeElement !== woodTarget) woodTarget.value = String(s.targets.wood)
    if (document.activeElement !== foodTarget) foodTarget.value = String(s.targets.food)
    if (document.activeElement !== oreTarget) oreTarget.value = String(s.targets.ore)
  }

  dispose(): void { this.abort.abort(); this.element.remove() }
}

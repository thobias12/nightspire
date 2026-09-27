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

  constructor(root: HTMLElement, action: (action: string, value?: string) => void) {
    this.element.className = 'hud'
    this.element.innerHTML = `
      <header class="topbar"><div><b>NIGHTSPIRE</b><span class="tag">M3.11.7 · AGRICULTURE & FARMS</span></div><div id="resources"></div><div id="clock"></div></header>
      <section class="guide panel"><span class="eyebrow">SHAPE THE LAND LIKE MANOR LORDS</span><h1>Farm fields are point-drawn polygons, not fixed building tiles.</h1>
        <p>Place a Farmhouse, assign Farmers, then use the Field tool to click 3–8 corners around the land you want to cultivate. Farmers physically walk to fallow/ready fields to sow and harvest them; crops grow across Days, harvest into Farmhouse storage, then Laborers haul Food into your normal Stockpile and Market network.</p>
        <div id="objective"></div>
        <div id="workforce"></div>
        <p class="muted">Gold: workers · Rust: guards · Dark red: raiders · Cyan: you<br>Damaged structures show health bars; recent hits flash red.</p>
      </section>
      <section class="inspector panel"><span class="eyebrow">INSPECT</span><div id="inspection">Select something in the world.</div></section>
      <details class="qa panel" open><summary>QA & performance</summary><div class="qa-body">
        <div class="row"><button data-action="pause">Pause</button><label>Speed <select aria-label="Simulation speed" data-action="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>
        <label>Set hour <input aria-label="Set hour" type="range" min="0" max="23" value="8" data-action="time"></label>
        <div class="row phase-buttons"><button data-action="jump-day">Day</button><button data-action="jump-dusk">Dusk</button><button data-action="jump-night">Night</button><button data-action="jump-dawn">Dawn</button></div><button data-action="next-raid">Next raid</button>
        <h3>Stock targets</h3>
        <div class="row"><label>Wood <input class="number-input" aria-label="Wood stock target" type="number" min="0" max="10000" step="25" data-action="target-wood"></label><label>Food <input class="number-input" aria-label="Food stock target" type="number" min="0" max="10000" step="25" data-action="target-food"></label><label>Ore <input class="number-input" aria-label="Ore stock target" type="number" min="0" max="10000" step="5" data-action="target-ore"></label></div>
        <div class="row"><button data-action="resources">+50 wood / food</button><button data-action="resources-ore">+30 ore</button><button data-action="spawn">Spawn settler</button></div>
        <button data-action="town-visual">Stage M3.10.2 road-planner visual target</button>
        <button data-action="immigration-test">Test immigration now</button>
        <div class="row"><button data-action="needs-low">Needs → 25%</button><button data-action="needs-reset">Needs → 100%</button></div>
        <div class="row"><button data-action="building-supply">+5 selected input</button><button data-action="damage-selected">Damage selected -60 HP</button></div>
        <label><input type="checkbox" data-action="paths"> Show navigation paths</label>
        <button data-action="audit">Check state integrity</button>
        <p><a href="?benchmark=1" target="_blank" rel="noopener">Open M4 scale benchmark (separate QA world)</a></p>
        <h3>Save tools</h3>
        <div class="row"><button data-action="export-save">Export JSON</button><button data-action="load-backup">Load backup</button></div>
        <label>Import JSON <input aria-label="Import save file" type="file" accept=".json,application/json" data-action="import-save"></label>
        <div id="metrics"></div><div id="workers"></div>
      </div></details>
      <footer class="bottom"><div class="toolbar panel">
        <div class="build-group"><span>Town planning</span>
          <button data-action="road" title="Hotkey 0 · LMB points · double-click/Enter finish · RMB cancel draft · Esc exit">[0] Road <small>Point-drawn curved road</small></button>
          <button data-action="residential-plot" title="Hotkey 1 · requires road frontage">[1] Residential Plot <small>Shape-driven frontage · lived-in compound</small></button>
        </div>
        <div class="build-group"><span>Road controls</span>
          <button data-action="grid-snap" title="Hotkey G · 1m road control points / plot dimensions">Grid Snap [G]</button>
          <button data-action="road-curve" title="Hotkey C · cycles Straight / Smooth / Curved">Curve [C]</button>
          <button data-action="road-width" title="Cycles Path / Lane / Main Road; [ and ] also adjust while drawing">Road width</button>
          <button data-action="road-snap" title="Hotkey F · road endpoint/centerline joins + conventional building alignment">Road Snap [F]</button>
        </div>
        <div class="build-group"><span>Infrastructure</span>
          <button data-action="stockpile" title="Hotkey 2">[2] Stockpile <small>10 wood · 400 storage</small></button>
          <button data-action="campfire" title="Hotkey 3">[3] Campfire <small>10 wood · 6 free slots</small></button>
        </div>
        <div class="build-group"><span>Agriculture</span>
          <button data-action="farmhouse" title="Hotkey A">[A] Farmhouse <small>45 wood · 3 Farmers · 60 Food</small></button>
          <button data-action="field" title="Hotkey P · click polygon corners · Enter/double-click finish">[P] Field <small>Point-drawn irregular crop field</small></button>
        </div>
        <div class="build-group"><span>Production & services</span>
          <button data-action="brewery" title="Hotkey 4">[4] Brewery <small>35 wood · Food → Ale · 2 Brewers</small></button>
          <button data-action="tavern" title="Hotkey 5">[5] Tavern <small>40 wood · 12 Ale-fed slots</small></button>
          <button data-action="blacksmith" title="Hotkey 9">[9] Blacksmith <small>45 wood · Ore → Tools · 2 Smiths</small></button>
          <button data-action="market" title="Hotkey M">[M] Market <small>30 wood · 20 Food · 2 Vendors</small></button>
          <button data-action="trading-post" title="Hotkey T">[T] Trading Post <small>50 wood · 60 cargo · 2 Traders</small></button>
        </div>
        <div class="build-group"><span>Defense</span>
          <button data-action="guard-post" title="Hotkey 6">[6] Guard Post <small>25 wood · 2 guards</small></button>
          <button data-action="wood-wall" title="Hotkey 7">[7] Wood Wall <small>Drag placement</small></button>
          <button data-action="wood-gate" title="Hotkey 8">[8] Wood Gate <small>Can replace a wall</small></button>
        </div>
        <div class="build-group tools"><span>Tools</span>
          <button data-action="rotate-build" title="Rotate selected blueprint">Rotate [R]</button>
          <button data-action="cancel">Inspect / Esc</button>
          <button data-action="camera">Follow player</button>
          <button data-action="cinematic" title="Toggle low street-oblique settlement camera">Street view [V]</button>
          <button data-action="center">Center camp</button>
          <button data-action="save">Save</button>
          <button data-action="load">Load</button>
        </div>
      </div><div class="status panel" role="status" id="message"></div>
      <div class="controls">0: road · 1: residential plot · P: point-drawn field · A: farmhouse · M: market · T: trading post · G: grid snap · F: building road snap · 2–9: buildings · R: rotate · V: street view · Q/E: camera rotate · Esc: inspect · Space: melee</div></footer>
    `
    root.append(this.element)
    const signal = this.abort.signal
    this.element.addEventListener('click', e => {
      const roster = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-roster]')
      if (roster) { this.rosterPage = Math.max(0, this.rosterPage + Number(roster.dataset.roster)); return }
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
      if (button) action(button.dataset.action!, button.dataset.value)
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

    this.set('resources', `<b>Wood ${wood}/${s.targets.wood}</b> <span>(${held} reserved)</span> <b>Food ${food}/${s.targets.food}</b> <span>(${markets.food} market · ${agriculture.farmFood} farm)</span> <b>Ale ${ale}</b> <b>Ore ${ore}/${s.targets.ore}</b> <b>Tools ${storedTools}</b> <b>Population ${s.settlers.length}/${MAX_SETTLERS}</b> <b>Housing ${housed}/${s.settlers.length} · ${beds} beds</b> <b>Households ${households.marketCovered}/${households.occupied} supplied</b> <b>Homes L1 ${houseTiers[1] ?? 0} · L2 ${houseTiers[2] ?? 0} · L3 ${houseTiers[3] ?? 0}</b> <b>Gold ${s.trade.gold}</b> <b>Laborers ${laborers}</b> <b>Workplaces ${assignedWorkplaceWorkers}/${workplaceSlots}</b> <b>Guards ${guards}/${guardSlots}</b> <b>Raiders ${s.enemies.length}</b> <b>Happy ${needSummary.happiness}%</b> <b>Work ${Math.round(effectiveWorkRate * 100)}%</b> <b>Attraction ${attraction.score}</b> <b>You ${s.player.health}/${s.player.maxHealth} HP</b>`)
    const minutes = Math.floor(s.timeOfDay * 1440)
    this.set('clock', `<span class="phase phase-${phase}">${phaseLabel(phase)}</span> · Day ${s.day} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${ui.paused ? '· PAUSED' : ''}<small>${tradingPost ? (merchantHere ? 'Merchant caravan visiting today' : 'Next merchant Day ' + s.trade.nextMerchantDay) + ' · trade reputation ' + reputation + ' · interval ' + merchantIntervalDays(s) + ' Days' : 'Build a Trading Post to unlock Gold trade'}</small>`)

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
        details = `<b>${b.destroyed ? 'DESTROYED RUIN' : 'HP ' + b.health + '/' + b.maxHealth}</b><br><progress value="${b.health}" max="${b.maxHealth}"></progress><br>${functionText}${repairJob ? '<br>Repair job active · ' + repairJob.amount + ' wood' : ''}`
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
      this.set('inspection', `<h2>${def.label} ${b.id}</h2><p>${b.complete ? (b.destroyed ? 'Ruined — non-blocking until repaired' : 'Complete') : 'Under construction'} · Facing ${facing}${compoundText}</p><p>${details}</p>${workplaceControls}${stockpileControls}${tradeControls}${demolish}`)
    } else if (n) {
      this.set('inspection', `<h2>${n.resource === 'wood' ? 'Tree' : n.resource === 'food' ? 'Food bush' : RESOURCES[n.resource].label + ' deposit'} ${n.id}</h2><p>${n.remaining} ${n.resource} remaining<br>${s.jobs.some(j => j.sourceId === n.id) ? 'Claimed by a settler' : 'Available for gathering'}</p>`)
    } else {
      const facing = ['South', 'East', 'North', 'West'][ui.buildRotation]
      const curveLabel = ui.roadCurve <= 0.05 ? 'Straight' : ui.roadCurve < 0.8 ? 'Smooth' : 'Curved'
      const widthLabel = ui.roadWidth <= 1.25 ? 'Path' : ui.roadWidth >= 2.35 ? 'Main road' : 'Lane'
      const placement = ui.planningTool === 'field'
        ? 'Field tool · Manor Lords-style polygon · click corners ' + ui.fieldPointCount + '/8 · Grid ' + (ui.gridSnap ? 'ON' : 'OFF') + ' · Enter/double-click closes · RMB/Backspace removes last corner.'
        : ui.planningTool === 'road'
        ? 'Road tool · click control points · ' + curveLabel + ' · ' + widthLabel + ' ' + ui.roadWidth.toFixed(1) + 'm · points ' + ui.roadPointCount
          + ' · Grid ' + (ui.gridSnap ? 'ON' : 'OFF') + ' · Road Snap ' + (ui.roadSnap ? 'ON' : 'OFF')
          + (ui.roadAngleSnap ? ' · Shift angle constrain ON' : ' · hold Shift to constrain') + ' · double-click/Enter finishes.'
        : ui.planningTool === 'residential-plot'
          ? 'Residential Plot · road frontage is mandatory. ' + (ui.gridSnap ? 'Width/depth snap to whole metres.' : 'Freeform plot dimensions enabled.')
          : ui.buildType
            ? 'Placing ' + BUILDINGS[ui.buildType].label + ' · ' + (ui.roadSnap && !BUILDINGS[ui.buildType].fortification && ui.buildType !== 'campfire'
              ? 'Road Snap ON: nearby streets magnetically control position/facing.'
              : 'Manual grid facing ' + facing + '.')
              + (ui.dragCount > 1 ? ' · ' + ui.dragCount + ' wall segments' : '')
            : 'Select a settler to assign guard duty, or inspect a resource/building.'
      this.set('inspection', '<p>' + placement + '</p>')
    }

    this.set('message', escape(ui.message))
    const m = ui.metrics
    this.set('metrics', `<dl><dt>Phase</dt><dd>${phaseLabel(phase)}</dd><dt>Frame / FPS</dt><dd>${m.frame.toFixed(1)} ms / ${(1000 / Math.max(m.frame, 1)).toFixed(0)}</dd><dt>Simulation CPU</dt><dd>${m.simulation.toFixed(2)} ms</dd><dt>Render submission CPU</dt><dd>${m.render.toFixed(2)} ms</dd><dt>Draws / triangles</dt><dd>${m.calls} / ${m.triangles}</dd><dt>Active jobs / settlers</dt><dd>${s.jobs.length} / ${s.settlers.length}</dd><dt>Guards / post slots</dt><dd>${guards} / ${guardSlots}</dd><dt>Path requests / solves</dt><dd>${m.requests} / ${m.paths}</dd><dt>Queued paths</dt><dd>${m.queue}</dd><dt>Path failures</dt><dd>${m.failures}</dd><dt>Catch-up dropped</dt><dd>${m.dropped.toFixed(2)} s</dd><dt>Enemies</dt><dd>${s.enemies.length}</dd><dt>Raid wave / spawned</dt><dd>${s.raid.wave} / ${s.raid.totalSpawned}</dd><dt>Next wave size</dt><dd>${raidSizeForWave(s.raid.wave + 1)}</dd><dt>Happiness / worst</dt><dd>${needSummary.happiness}% / ${needLabel(needSummary.worst)} ${Math.round(needSummary.averages[needSummary.worst])}%</dd><dt>Work productivity</dt><dd>${Math.round(effectiveWorkRate * 100)}% · morale ${Math.round(moraleSummary.averageWorkRate * 100)}% · tools +${Math.round((toolSummary.workMultiplier - 1) * 100)}%</dd><dt>Tools / coverage</dt><dd>${toolSummary.stored}/${toolSummary.required} · ${Math.round(toolSummary.coverage * 100)}%</dd><dt>Attraction / blocker</dt><dd>${attraction.score} / ${attraction.eligible ? 'Eligible' : escape(attraction.blockers[0] ?? 'Score too low')}</dd><dt>Qualification streak</dt><dd>${s.immigration.eligibleDays}/${IMMIGRATION_REQUIRED_DAYS}</dd><dt>Immigrants / arriving</dt><dd>${s.immigration.totalArrivals} / ${arriving}</dd><dt>Need averages</dt><dd>F ${Math.round(needSummary.averages.food)} · H ${Math.round(needSummary.averages.housing)} · S ${Math.round(needSummary.averages.safety)} · R ${Math.round(needSummary.averages.recreation)}</dd><dt>Fed today</dt><dd>${fedToday}/${s.settlers.length}</dd><dt>Household Market coverage</dt><dd>${households.marketCovered}/${households.occupied}</dd><dt>Household recreation coverage</dt><dd>${households.recreationCovered}/${households.occupied}</dd><dt>Fully supported households</dt><dd>${households.fullySupported}/${households.occupied}</dd><dt>Home prosperity tiers</dt><dd>L1 ${houseTiers[1] ?? 0} · L2 ${houseTiers[2] ?? 0} · L3 ${houseTiers[3] ?? 0}</dd><dt>Total beds</dt><dd>${beds}</dd><dt>Gold</dt><dd>${s.trade.gold} · earned ${s.trade.goldEarned} · spent ${s.trade.goldSpent}</dd><dt>Merchant visits</dt><dd>${s.trade.visits} · next Day ${s.trade.nextMerchantDay}</dd><dt>Food consumed</dt><dd>${s.totals.foodConsumed}</dd><dt>Service providers</dt><dd>${services.suppliedProviders}/${services.providers} supplied</dd><dt>Service slots / visitors</dt><dd>${services.slots} / ${services.activeVisitors}</dd><dt>Food → production</dt><dd>${s.totals.productionConsumed.food}</dd><dt>Ale produced / used</dt><dd>${s.totals.produced.ale} / ${s.totals.serviceConsumed.ale}</dd><dt>Ore → production</dt><dd>${s.totals.productionConsumed.ore}</dd><dt>Tools produced / stored</dt><dd>${s.totals.produced.tools} / ${storedTools}</dd><dt>Raiders defeated</dt><dd>${s.raid.totalDefeated}</dd><dt>Last cleared wave</dt><dd>${s.raid.lastClearedWave || '—'}</dd><dt>Player HP</dt><dd>${s.player.health}/${s.player.maxHealth}</dd><dt>Structure damage</dt><dd>${s.totals.structureDamage} HP</dd><dt>Repaired</dt><dd>${s.totals.repairedHealth} HP / ${s.totals.repairWoodUsed} wood</dd><dt>Damaged structures</dt><dd>${damaged}</dd><dt>Completed / sites</dt><dd>${s.totals.constructed} / ${s.buildings.filter(b => !b.complete).length}</dd><dt>Roads / residential plots</dt><dd>${s.roads.length} / ${s.residentialPlots.length}</dd><dt>Simulation tick</dt><dd>${s.tick}</dd></dl>`)
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
    roadSnap.textContent = 'Road Snap ' + (ui.roadSnap ? 'ON' : 'OFF') + ' [F]'
    gridSnap.setAttribute('aria-pressed', String(ui.gridSnap))
    roadCurve.setAttribute('aria-pressed', String(ui.roadCurve > 0.05))
    roadSnap.setAttribute('aria-pressed', String(ui.roadSnap))
    for (const type of ['stockpile', 'guard-post', 'campfire', 'brewery', 'tavern', 'blacksmith', 'wood-wall', 'wood-gate']) this.element.querySelector('[data-action="' + type + '"]')!.setAttribute('aria-pressed', String(ui.buildType === type))

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

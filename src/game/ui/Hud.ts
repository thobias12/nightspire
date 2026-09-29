import { forestDensity, worldHalf } from '../world/MapGenerator'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import { agricultureSummary, fieldHarvestWork, fieldSowWork, fieldsForFarmhouse } from '../systems/economy/Agriculture'
import { available, freeStorage, reserved, stockpiles } from '../systems/construction/Buildings'
import { phaseForTime, phaseLabel } from '../runtime/DayNight'
import { happinessEffect, settlementHappinessEffect } from '../systems/population/Happiness'
import { houseBedCapacity, houseProgressionStatus } from '../systems/population/HouseProgression'
import { householdStatus, householdSummary } from '../systems/population/Households'
import { happinessOf, settlementNeeds } from '../systems/population/Needs'
import { marketSummary } from '../systems/economy/Markets'
import { IMMIGRATION_REQUIRED_DAYS, populationAttraction } from '../systems/population/Population'
import { raidSizeForWave } from '../systems/combat/Raid'
import { assignedGuardPost } from '../systems/population/Schedule'
import { serviceAssignment, serviceAssignments, serviceAvailable, serviceSummary } from '../systems/population/Services'
import { toolCoverage } from '../systems/economy/Tools'
import {
  merchantIntervalDays, merchantPresent, primaryTradingPost, tradeModeLabel, tradeReputation, tradeStorageUsed, TRADE_PRICES,
} from '../systems/economy/Trading'
import { enemyLabel, MAX_SETTLERS, settlerLabel, type Settler, type WorldState } from '../model/WorldState'
import { residentialFrontage, residentialPresentationProfile } from '../render/ResidentialPresentation'
import { assignedWorkplace, professionLabel, workplaceStaffing } from '../systems/population/Workforce'
import { stockpilePriorityLabel } from '../systems/economy/StockpileLogistics'
import { haulPriorityLabel, workplaceInputTarget, workplaceOutputThreshold } from '../systems/economy/WorkplaceLogistics'
import {
  BUILDING_DESCRIPTIONS,
  PLANNED_CATALOG_PREVIEWS,
  PLANNING_CATALOG_PREVIEWS,
  contextualPanel,
  emptyPersonCard,
  escape,
  needLabel,
  needMeter,
  percentage,
  personCard,
  portraitAsset,
} from './HudContent'
import { createHudTemplate } from './HudTemplate'
import { catalogPreviewFor } from './HudCatalog'
import { bindHudEvents } from './HudEvents'

export type { Metrics, HudState } from './HudTypes'
import type { HudState } from './HudTypes'

export class Hud {
  readonly element = document.createElement('div')
  private readonly abort = new AbortController()
  private rosterPage = 0
  private mapBackgroundKey = ''
  private mapBackground = ''
  private buildMenuOpen = false
  private activeBuildTab = 'planning'
  private activeContextTab = 'general'
  private operationDetailsOpen = false
  private lastContextId: number | null = null
  private lastFloatingSelectionId: number | null = null
  private inspectorManuallyPositioned = false
  private inspectorAutoPositioned = false
  constructor(root: HTMLElement, action: (action: string, value?: string) => void) {
    this.element.className = 'hud medieval-hud'
    this.element.innerHTML = createHudTemplate()
    root.append(this.element)
    // Card details remain in the hover/focus preview; the shelf stays legible at a glance.
    for (const card of this.element.querySelectorAll<HTMLButtonElement>('.build-card')) {
      const name = card.querySelector('.build-name')?.textContent ?? ''
      card.setAttribute('aria-label', name + (card.classList.contains('is-planned') ? ' (planned)' : ''))
    }
    this.syncBuildMenu()

    bindHudEvents(this.element, this.abort.signal, {
      action,
      setOperationDetailsOpen: open => { this.operationDetailsOpen = open },
      moveRosterPage: delta => { this.rosterPage = Math.max(0, this.rosterPage + delta) },
      toggleBuildMenu: () => {
        this.buildMenuOpen = !this.buildMenuOpen
        this.syncBuildMenu()
      },
      selectBuildTab: tab => {
        this.activeBuildTab = tab
        this.buildMenuOpen = true
        this.syncBuildMenu()
      },
      selectContextTab: tab => {
        this.activeContextTab = tab
        this.syncContextTabs()
      },
      showBuildPreview: card => this.showBuildPreview(card),
      hideBuildPreview: () => this.hideBuildPreview(),
      markInspectorPositioned: () => { this.inspectorManuallyPositioned = true },
      placeFloatingPanel: (panel, left, top) => this.placeFloatingPanel(panel, left, top),
      clampFloatingPanels: () => this.clampFloatingPanels(),
    })
  }

  private placeFloatingPanel(panel: HTMLElement, left: number, top: number): void {
    const margin = 6
    const rect = panel.getBoundingClientRect()
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
    const maxTop = Math.max(78, window.innerHeight - rect.height - 74)
    panel.style.position = 'fixed'
    panel.style.left = Math.max(margin, Math.min(maxLeft, left)) + 'px'
    panel.style.top = Math.max(78, Math.min(maxTop, top)) + 'px'
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.margin = '0'
    panel.style.transform = 'none'
  }

  private clampFloatingPanels(): void {
    for (const panel of this.element.querySelectorAll<HTMLElement>('[data-draggable-panel].is-user-positioned')) {
      const rect = panel.getBoundingClientRect()
      this.placeFloatingPanel(panel, rect.left, rect.top)
    }
  }

  private resetInspectorPosition(): void {
    const panel = this.element.querySelector<HTMLElement>('.inspector')
    if (!panel) return
    panel.classList.remove('is-user-positioned', 'is-dragging', 'is-world-anchored')
    for (const property of ['position', 'left', 'top', 'right', 'bottom', 'margin', 'transform']) {
      panel.style.removeProperty(property)
    }
    this.inspectorManuallyPositioned = false
    this.inspectorAutoPositioned = false
  }

  private positionInspector(anchor: { x: number; y: number } | null): void {
    const panel = this.element.querySelector<HTMLElement>('.inspector')
    if (!panel || !panel.classList.contains('is-active') || this.inspectorManuallyPositioned || this.inspectorAutoPositioned || !anchor) return

    const rect = panel.getBoundingClientRect()
    const gap = 20
    const margin = 8
    let left = anchor.x + gap
    if (left + rect.width > window.innerWidth - margin) left = anchor.x - rect.width - gap
    if (left < margin) left = margin

    // The world position is only used when the window first opens. After that
    // the panel stays fixed in screen space so moving settlers, camera motion
    // and zoom do not make the UI chase the selected object.
    const top = anchor.y - 72
    this.placeFloatingPanel(panel, left, top)
    panel.classList.add('is-world-anchored')
    this.inspectorAutoPositioned = true
  }

  private showBuildPreview(card: HTMLButtonElement): void {
    const preview = this.element.querySelector<HTMLElement>('#build-preview')
    const catalog = this.element.querySelector<HTMLElement>('.build-catalog')
    if (!preview || !catalog || !this.buildMenuOpen) return
    const data = catalogPreviewFor(card)
    if (!data) return

    const availability = data.planned
      ? '<span class="preview-state planned">Planned</span>'
      : card.classList.contains('is-unaffordable')
        ? '<span class="preview-state warning">Low resources</span>'
        : '<span class="preview-state available">Available</span>'

    preview.innerHTML =
      '<div class="build-preview-heading"><span><small>' + escape(data.category) + '</small><b>' + escape(data.title) + '</b></span>' + availability + '</div>'
      + '<div class="build-preview-art" data-art-slot="' + escape(data.art) + '"><span>Artwork slot</span></div>'
      + '<div class="build-preview-copy">'
      + '<p>' + escape(data.description) + '</p>'
      + '<div class="build-preview-meta">' + escape(data.detail) + '</div>'
      + '<div class="build-preview-requirement">' + escape(data.requirement) + '</div>'
      + '</div>'

    preview.classList.add('is-visible')
    preview.setAttribute('aria-hidden', 'false')

    const cardRect = card.getBoundingClientRect()
    const width = preview.offsetWidth || 360
    const height = preview.offsetHeight
    preview.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, cardRect.left + cardRect.width / 2 - width / 2)) + 'px'
    preview.style.top = Math.max(8, cardRect.top - height - 12) + 'px'
  }

  private hideBuildPreview(): void {
    const preview = this.element.querySelector<HTMLElement>('#build-preview')
    if (!preview) return
    preview.classList.remove('is-visible')
    preview.setAttribute('aria-hidden', 'true')
  }

  private syncBuildMenu(): void {
    const catalog = this.element.querySelector<HTMLElement>('.build-catalog')
    if (!catalog) return
    catalog.classList.toggle('is-open', this.buildMenuOpen)
    catalog.setAttribute('aria-hidden', String(!this.buildMenuOpen))
    if (!this.buildMenuOpen) this.hideBuildPreview()

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button[data-hud-toggle="build-menu"]')) {
      button.setAttribute('aria-pressed', String(this.buildMenuOpen))
    }
    for (const tab of this.element.querySelectorAll<HTMLButtonElement>('button[data-build-tab]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.buildTab === this.activeBuildTab))
    }
    for (const panel of this.element.querySelectorAll<HTMLElement>('[data-build-panel]')) {
      panel.classList.toggle('is-active', panel.dataset.buildPanel === this.activeBuildTab)
    }

    const activePanel = this.element.querySelector<HTMLElement>('[data-build-panel="' + this.activeBuildTab + '"]')
    const cardCount = activePanel?.querySelectorAll('.build-card').length ?? 0
    const dividerCount = activePanel?.querySelectorAll('.planned-divider').length ?? 0
    const desiredWidth = Math.min(1120, Math.max(580, 24 + cardCount * 112 + dividerCount * 20))
    catalog.style.setProperty('--catalog-width', desiredWidth + 'px')
    if (catalog.classList.contains('is-user-positioned')) this.clampFloatingPanels()
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
    const suppliedTaverns = taverns.filter(building => serviceAvailable(building, s)).length
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
      <div class="resource-chip ${wood < 10 ? 'is-critical' : ''}" title="Wood: ${wood}/${s.targets.wood}; ${held} reserved"><span class="ui-icon-slot" data-icon-slot="resource-wood" aria-hidden="true"></span><span class="resource-label">Wood</span><strong>${wood}</strong><small>/${s.targets.wood}</small></div>
      <div class="resource-chip ${food < Math.max(s.settlers.length * 2, 8) ? 'is-critical' : ''}" title="Food: ${food}/${s.targets.food}; market ${markets.food}; farm ${agriculture.farmFood}"><span class="ui-icon-slot" data-icon-slot="resource-food" aria-hidden="true"></span><span class="resource-label">Food</span><strong>${food}</strong><small>/${s.targets.food}</small></div>
      <div class="resource-chip" title="Ale"><span class="ui-icon-slot" data-icon-slot="resource-ale" aria-hidden="true"></span><span class="resource-label">Ale</span><strong>${ale}</strong></div>
      <div class="resource-chip" title="Ore: ${ore}/${s.targets.ore}"><span class="ui-icon-slot" data-icon-slot="resource-ore" aria-hidden="true"></span><span class="resource-label">Ore</span><strong>${ore}</strong><small>/${s.targets.ore}</small></div>
      <div class="resource-chip" title="Tools"><span class="ui-icon-slot" data-icon-slot="resource-tools" aria-hidden="true"></span><span class="resource-label">Tools</span><strong>${storedTools}</strong></div>
      <div class="resource-chip" title="Treasury Gold"><span class="ui-icon-slot" data-icon-slot="resource-gold" aria-hidden="true"></span><span class="resource-label">Gold</span><strong>${s.trade.gold}</strong></div>
    `)

    const minutes = Math.floor(s.timeOfDay * 1440)
    this.set('time-readout', `<div><span class="phase phase-${phase}">${phaseLabel(phase)}</span><strong>Day ${s.day}</strong><span>${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}</span>${ui.paused ? '<em>PAUSED</em>' : ''}</div><small>${tradingPost ? (merchantHere ? 'Merchant visiting' : 'Merchant Day ' + s.trade.nextMerchantDay) + ' · Rep ' + reputation : 'No Trading Post'}</small>`)

    const hasPost = s.buildings.some(b => b.complete && !b.destroyed && b.type === 'guard-post')
    const shelterReady = beds >= s.settlers.length
    const overviewIssues = [
      effectiveWorkRate < 1,
      toolSummary.coverage < 1,
      moraleSummary.refusing > 0,
      attraction.spareBeds <= 0,
      attraction.food < attraction.foodRequired,
      attraction.households > 0 && attraction.marketCoveredHouseholds < attraction.households,
      attraction.happiness < 65,
      attraction.safety < 55,
      !attraction.raidReady,
    ].filter(Boolean).length
    this.set('overview-count', overviewIssues ? String(overviewIssues) : '✓')
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
      const serviceText = service ? service.label + ' · +' + service.gainPerSecond + '/s' : (phase === 'dusk' || phase === 'dawn' ? 'No available service slot' : 'Off hours')
      const profession = professionLabel(s, a)
      const workplace = assignedWorkplace(s, a)
      const cargo = RESOURCE_IDS.filter(resource => a.cargo[resource] > 0)
        .map(resource => '<span class="cargo-chip"><i data-ui-asset="resource:' + resource + '"></i>' + a.cargo[resource] + ' ' + RESOURCES[resource].label + '</span>')
        .join('')
      const links = [
        a.homeId !== null ? '<button data-action="select-object" data-value="' + a.homeId + '">Open Home</button>' : '',
        workplace ? '<button data-action="select-object" data-value="' + workplace.id + '">Open Workplace</button>' : '',
        guardAssignment ? '<button data-action="select-object" data-value="' + guardAssignment.buildingId + '">Open Guard Post</button>' : '',
      ].filter(Boolean).join('')
      const actions = a.arrivalTarget
        ? ''
        : (a.workplaceId !== null ? '<button data-action="unassign-workplace" data-value="' + a.id + '">Return to labor pool</button>' : '')
          + '<button data-action="toggle-role">' + (a.role === 'guard' ? 'Return to worker duty' : 'Assign as guard') + '</button>'
      const body =
        '<div class="person-hero">'
        + '<span class="large-portrait" data-ui-asset="' + portraitAsset(a) + '" aria-hidden="true"></span>'
        + '<div><b>' + escape(a.status) + '</b><small>' + escape(morale.label) + ' · work rate ' + Math.round(effectiveRate * 100) + '%'
        + (modifier === 0 ? '' : ' · morale ' + (modifier > 0 ? '+' : '') + modifier + '%') + '</small>'
        + '<div class="health-line"><span>Health</span><div><i style="width:' + percentage(a.health, a.maxHealth) + '%"></i></div><em>' + a.health + '/' + a.maxHealth + '</em></div>'
        + '</div></div>'
        + '<div class="need-grid">'
        + needMeter('Food', a.needs.food, 'service:food')
        + needMeter('Housing', a.needs.housing, 'service:housing')
        + needMeter('Safety', a.needs.safety, 'service:safety')
        + needMeter('Recreation', a.needs.recreation, 'service:recreation')
        + '</div>'
        + '<div class="object-info-grid">'
        + '<div><span>Home</span><b>' + (a.homeId === null ? 'Unhoused' : 'House #' + a.homeId) + '</b></div>'
        + '<div><span>Work</span><b>' + escape(workplace ? BUILDINGS[workplace.type].label : 'General labor') + '</b></div>'
        + '<div><span>Night</span><b>' + escape(a.role === 'guard' ? (guardAssignment ? 'Guard Post #' + guardAssignment.buildingId : 'No guard slot') : 'Civilian shelter') + '</b></div>'
        + '<div><span>Recreation</span><b>' + escape(serviceText) + '</b></div>'
        + '</div>'
        + (cargo ? '<div class="cargo-row">' + cargo + '</div>' : '<p class="context-note">Not carrying any resources.</p>')
        + '<div class="context-actions">' + links + '</div>'
        + '<div class="context-actions secondary-actions">' + actions + '</div>'
      this.set('inspection', contextualPanel(profession, settlerLabel(s, a.id), portraitAsset(a), body))
    } else if (e) {
      const target = s.buildings.find(b => b.id === e.targetId)
      const body =
        '<div class="danger-summary"><b>' + escape(e.status) + '</b><strong>Wave ' + s.raid.wave + '</strong></div>'
        + '<div class="health-line danger-health"><span>Health</span><div><i style="width:' + percentage(e.health, e.maxHealth) + '%"></i></div><em>' + e.health + '/' + e.maxHealth + '</em></div>'
        + '<div class="object-info-grid">'
        + '<div><span>Target</span><b>' + escape(target ? BUILDINGS[target.type].label + ' #' + target.id : 'Settlement') + '</b></div>'
        + '<div><span>Position</span><b>' + e.x.toFixed(1) + ', ' + e.z.toFixed(1) + '</b></div>'
        + '</div>'
        + (target ? '<div class="context-actions"><button data-action="select-object" data-value="' + target.id + '">Open Target</button></div>' : '')
        + '<p class="context-note warning-note">Move the player within melee range and press Space, or let guards intercept.</p>'
      this.set('inspection', contextualPanel('Hostile', enemyLabel(s, e.id), 'portrait:raider', body, 'danger'))
    } else if (field) {
      const farmhouse = field.farmhouseId === null ? null : s.buildings.find(building => building.id === field.farmhouseId)
      const cropPhase = field.phase[0].toUpperCase() + field.phase.slice(1)
      const workTarget = field.phase === 'fallow' ? fieldSowWork(field) : field.phase === 'ready' ? fieldHarvestWork(field) : 0
      const progress = workTarget > 0
        ? percentage(field.work, workTarget)
        : field.phase === 'growing'
          ? percentage(field.growthDays, 2)
          : field.phase === 'sown'
            ? 25
            : field.phase === 'harvested'
              ? 100
              : 0
      const body =
        '<div class="field-phase-card"><span class="field-big-icon" data-ui-asset="service:agriculture"></span><div><b>' + cropPhase + '</b><small>' + field.area.toFixed(1) + 'm² · ' + field.points.length + ' corners</small></div><strong>' + progress + '%</strong></div>'
        + '<div class="production-progress field-progress"><i style="width:' + progress + '%"></i></div>'
        + '<div class="object-info-grid">'
        + '<div><span>Expected harvest</span><b>' + field.yield + ' Food</b></div>'
        + '<div><span>Growth</span><b>' + field.growthDays + ' / 2 Days</b></div>'
        + '<div><span>Farmhouse</span><b>' + escape(farmhouse ? 'Farmhouse #' + farmhouse.id : 'Unassigned') + '</b></div>'
        + '<div><span>Field work</span><b>' + (workTarget > 0 ? field.work.toFixed(1) + ' / ' + workTarget.toFixed(1) : 'No active work') + '</b></div>'
        + '</div>'
        + (farmhouse ? '<div class="context-actions"><button data-action="select-object" data-value="' + farmhouse.id + '">Open Farmhouse</button></div>' : '<p class="context-note warning-note">Build or repair a Farmhouse within range to work this field.</p>')
        + '<p class="context-note">Ready fields are harvested before fallow fields are sown. Harvest waits if the Farmhouse Food store cannot fit the full crop.</p>'
        + '<div class="context-actions secondary-actions"><button class="danger" data-action="remove-field">Remove field</button></div>'
      this.set('inspection', contextualPanel('Agriculture', 'Farm Field #' + field.id, 'service:agriculture', body))
    } else if (b) {
      const def = BUILDINGS[b.type]
      const distribution = def.foodDistribution
      const farmStorage = def.agricultureStorageCapacity
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
            const cards = staffing.workers.map(worker =>
              personCard(
                s,
                worker,
                professionLabel(s, worker) + (worker.jobId !== null ? ' · finishing task' : worker.status.startsWith('Working') ? ' · present' : ' · reporting'),
                '<button class="person-action" data-action="unassign-workplace" data-value="' + worker.id + '" title="Unassign">×</button>',
              )
            )
            while (cards.length < staffing.slots) cards.push(emptyPersonCard(def.profession ?? 'Worker'))
            const assign = staffing.assigned < staffing.slots
              ? '<button class="context-primary" data-action="assign-workplace">+ Assign laborer</button>'
              : '<button disabled>Fully staffed</button>'
            const logistics = def.production
              ? '<div class="context-control-row"><span><b>Hauling priority</b><small>Controls input buffer and finished-goods pickup.</small></span><button data-action="workplace-haul-priority">' + haulPriorityLabel(b.haulPriority) + '</button></div>'
              : ''
            return '<div class="context-section-head"><span><b>Workers</b><small>' + staffing.active + ' of ' + staffing.assigned + ' assigned currently active</small></span><strong>' + staffing.assigned + ' / ' + staffing.slots + '</strong></div>'
              + '<div class="people-grid">' + cards.join('') + '</div>'
              + '<div class="context-actions">' + assign + '</div>'
              + logistics
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
        this.operationDetailsOpen = false
      }
      const buildingStatus = b.complete ? (b.destroyed ? 'Ruined' : 'Fully operational') : 'Under construction'
      const statusTone = b.destroyed ? 'danger' : !b.complete || b.health < b.maxHealth ? 'warning' : 'good'
      const hpPercent = percentage(b.health, b.maxHealth)
      const generalBody =
        '<p class="building-description">' + BUILDING_DESCRIPTIONS[b.type] + '</p>'
        + '<div class="building-status-banner status-' + statusTone + '"><span><b>' + buildingStatus + '</b><small>Facing ' + facing + ' · HP ' + b.health + '/' + b.maxHealth + '</small></span><strong>' + hpPercent + '%</strong></div>'
        + compoundText
        + (!b.complete || b.destroyed ? '<div class="context-status">' + details + '</div>' : '')

      const residentCards = household
        ? (() => {
            const cards = household.residents.map(resident =>
              personCard(
                s,
                resident,
                'Resident · ' + Math.round(happinessOf(resident)) + '% satisfaction',
              )
            )
            while (cards.length < houseBedCapacity(b)) cards.push(emptyPersonCard('Available bed'))
            return cards.join('')
          })()
        : ''
      const housePeopleBody = household
        ? '<div class="context-section-head"><span><b>Residents</b><small>Household members and available beds</small></span><strong>' + household.residents.length + ' / ' + houseBedCapacity(b) + '</strong></div>'
          + '<div class="people-grid">' + residentCards + '</div>'
          + '<div class="household-needs">'
          + '<div><span>Food access</span><b>' + escape(household.foodAccessLabel) + '</b></div>'
          + '<div><span>Recreation</span><b>' + escape(household.recreation ? BUILDINGS[household.recreation.type].label : 'Unavailable') + '</b></div>'
          + '<div><span>Safety</span><b>' + household.safety + '%</b></div>'
          + '<div><span>Satisfaction</span><b>' + household.satisfaction + '%</b></div>'
          + '</div>'
        : ''

      const guardsAtPost = def.guardSlots > 0
        ? s.settlers.filter(settler => assignedGuardPost(s, settler)?.buildingId === b.id)
        : []
      const guardPeopleBody = def.guardSlots > 0
        ? (() => {
            const cards = guardsAtPost.map(guard => personCard(s, guard, 'Guard · ' + guard.status))
            while (cards.length < def.guardSlots) cards.push(emptyPersonCard('Guard slot'))
            return '<div class="context-section-head"><span><b>Guard detail</b><small>Assigned by settlement guard order</small></span><strong>' + guardsAtPost.length + ' / ' + def.guardSlots + '</strong></div>'
              + '<div class="people-grid">' + cards.join('') + '</div>'
          })()
        : ''

      const serviceBody = def.service && b.complete && !b.destroyed
        ? (() => {
            const service = def.service!
            const assignments = serviceAssignments(s, phase)
            const visitorIds = [...assignments.entries()].filter(([, assignment]) => assignment.buildingId === b.id).map(([id]) => id)
            const visitors = visitorIds.map(id => s.settlers.find(settler => settler.id === id)).filter((settler): settler is Settler => !!settler)
            const supplied = serviceAvailable(b, s)
            const supply = service.supplyResource
            const supplyText = supply
              ? '<div class="resource-meter"><div class="resource-meter-label"><span data-ui-asset="resource:' + supply + '"></span><b>' + RESOURCES[supply].label + '</b><em>' + b.inventory[supply] + ' / ' + service.supplyCapacity + '</em></div><div class="resource-meter-track"><i style="width:' + percentage(b.inventory[supply], service.supplyCapacity) + '%"></i></div></div>'
              : '<div class="context-note">No operating supply is required.</div>'
            const visitorCards = visitors.slice(0, service.slots).map(visitor => personCard(s, visitor, 'Visitor · ' + Math.round(visitor.needs[service.need]) + '% ' + service.need))
            while (visitorCards.length < Math.min(service.slots, 6)) visitorCards.push(emptyPersonCard('Visitor slot'))
            return '<div class="context-section-head"><span><b>' + needLabel(service.need) + ' service</b><small>' + (supplied ? 'Open during ' + service.activePhases.map(phaseLabel).join(' / ') : 'Waiting for supplies') + '</small></span><strong>' + visitors.length + ' / ' + service.slots + '</strong></div>'
              + '<div class="service-effect"><span class="ui-icon-slot" data-ui-asset="service:' + service.need + '"></span><div><b>+' + service.gainPerSecond + ' / sec</b><small>Need recovery while actively visiting</small></div></div>'
              + supplyText
              + '<div class="people-grid compact-people">' + visitorCards.join('') + '</div>'
          })()
        : ''

      const productionBody = def.production && b.complete && !b.destroyed
        ? (() => {
            const production = def.production!
            const staffing = workplaceStaffing(s, b)
            const input = production.inputResource
            const output = production.outputResource
            const inbound = s.jobs.filter(j => j.kind === 'supply' && j.targetId === b.id && j.resource === input).reduce((sum, j) => sum + j.amount, 0)
            const outbound = s.jobs.filter(j => j.kind === 'supply' && j.sourceId === b.id && j.resource === output).reduce((sum, j) => sum + j.amount, 0)
            return '<div class="context-section-head"><span><b>Active recipe</b><small>' + production.cycleSeconds + ' sec base cycle · ' + Math.round(staffing.efficiency * 100) + '% staffing speed</small></span><strong>' + Math.round(b.productionProgress / production.cycleSeconds * 100) + '%</strong></div>'
              + '<div class="recipe-row">'
              + '<div class="recipe-item"><span class="recipe-icon" data-ui-asset="resource:' + input + '"></span><b>' + production.inputAmount + ' ' + RESOURCES[input].label + '</b></div>'
              + '<span class="recipe-arrow">→</span>'
              + '<div class="recipe-item"><span class="recipe-icon" data-ui-asset="resource:' + output + '"></span><b>' + production.outputAmount + ' ' + RESOURCES[output].label + '</b></div>'
              + '</div>'
              + '<div class="production-progress"><i style="width:' + percentage(b.productionProgress, production.cycleSeconds) + '%"></i></div>'
              + '<div class="resource-meter"><div class="resource-meter-label"><span data-ui-asset="resource:' + input + '"></span><b>Input store</b><em>' + b.inventory[input] + ' / ' + production.inputCapacity + ' · +' + inbound + ' inbound</em></div><div class="resource-meter-track"><i style="width:' + percentage(b.inventory[input], production.inputCapacity) + '%"></i></div></div>'
              + '<div class="resource-meter"><div class="resource-meter-label"><span data-ui-asset="resource:' + output + '"></span><b>Output store</b><em>' + b.inventory[output] + ' / ' + production.outputCapacity + ' · ' + outbound + ' outbound</em></div><div class="resource-meter-track"><i style="width:' + percentage(b.inventory[output], production.outputCapacity) + '%"></i></div></div>'
              + '<div class="context-control-row"><span><b>Pickup threshold</b><small>Haulers collect at ' + workplaceOutputThreshold(b) + ' ' + RESOURCES[output].label + '</small></span><button data-action="workplace-haul-priority">' + haulPriorityLabel(b.haulPriority) + '</button></div>'
          })()
        : ''

      const storageBody = b.complete && !b.destroyed && (def.storage > 0 || def.tradeStorageCapacity || def.agricultureStorageCapacity)
        ? (() => {
            const capacity = def.storage || def.tradeStorageCapacity || def.agricultureStorageCapacity || 1
            const relevant = def.agricultureStorageCapacity
              ? (['food'] as const)
              : RESOURCE_IDS
            const meters = relevant.map(resource =>
              '<div class="resource-meter"><div class="resource-meter-label"><span data-ui-asset="resource:' + resource + '"></span><b>' + RESOURCES[resource].label + '</b><em>' + b.inventory[resource] + ' / ' + capacity + '</em></div><div class="resource-meter-track"><i style="width:' + percentage(b.inventory[resource], capacity) + '%"></i></div></div>'
            ).join('')
            const extra = def.agricultureStorageCapacity
              ? '<div class="context-note">' + fieldsForFarmhouse(s, b.id).length + ' field(s) assigned to this Farmhouse.</div>'
              : def.tradeStorageCapacity
                ? '<div class="context-note">Trade cargo used: ' + tradeStorageUsed(b) + ' / ' + def.tradeStorageCapacity + ' · Gold ' + s.trade.gold + '</div>'
                : '<div class="context-note">Unreserved shared capacity: ' + Math.max(0, freeStorage(s, b)) + '</div>'
            return '<div class="context-section-head"><span><b>Local storage</b><small>Resources physically held at this building</small></span><strong>' + (def.tradeStorageCapacity ? tradeStorageUsed(b) : b.inventory.wood + b.inventory.food + b.inventory.ale + b.inventory.ore + b.inventory.tools) + ' / ' + capacity + '</strong></div>'
              + meters + extra
          })()
        : ''

      const marketBody = distribution && b.complete && !b.destroyed
        ? (() => {
            const staffing = workplaceStaffing(s, b)
            const served = b.distributionDay === s.day ? b.distributionServed : 0
            const dailyCapacity = staffing.active * distribution.mealsPerWorkerPerDay
            return '<div class="context-section-head"><span><b>Food distribution</b><small>Nearby households draw meals from staffed stalls</small></span><strong>' + served + ' / ' + dailyCapacity + '</strong></div>'
              + '<div class="resource-meter"><div class="resource-meter-label"><span data-ui-asset="resource:food"></span><b>Food stalls</b><em>' + b.inventory.food + ' / ' + distribution.capacity + '</em></div><div class="resource-meter-track"><i style="width:' + percentage(b.inventory.food, distribution.capacity) + '%"></i></div></div>'
              + '<div class="service-effect"><span class="ui-icon-slot" data-ui-asset="service:food"></span><div><b>' + distribution.mealsPerWorkerPerDay + ' meals / active Vendor / Day</b><small>' + distribution.reserveDays + ' Days of assigned capacity targeted in local stock</small></div></div>'
          })()
        : ''

      const farmBody = farmStorage && b.complete && !b.destroyed
        ? (() => {
            const fields = fieldsForFarmhouse(s, b.id)
            const rows = fields.slice(0, 6).map(field => {
              const workMax = field.phase === 'ready' ? fieldHarvestWork(field) : field.phase === 'fallow' ? fieldSowWork(field) : 1
              const work = field.phase === 'ready' || field.phase === 'fallow' ? percentage(field.work, workMax) : field.phase === 'growing' ? percentage(field.growthDays, 2) : field.phase === 'sown' ? 35 : 100
              return '<div class="field-row"><span class="field-icon" data-ui-asset="service:agriculture"></span><div><b>Field #' + field.id + '</b><small>' + needLabel(field.phase) + ' · ' + field.area.toFixed(0) + 'm² · yield ' + field.yield + ' Food</small></div><em>' + work + '%</em></div>'
            }).join('')
            return storageBody
              + '<div class="context-subhead"><b>Assigned fields</b><span>' + fields.length + '</span></div>'
              + (rows || '<p class="context-empty">No fields are assigned. Draw a field within Farmhouse range.</p>')
              + (fields.length > 6 ? '<p class="muted">+' + (fields.length - 6) + ' more field(s)</p>' : '')
          })()
        : ''

      const peopleBody = workplaceControls
        || housePeopleBody
        || guardPeopleBody
        || '<p class="context-empty">This building has no dedicated resident or worker slots.</p>'

      const operationBody = productionBody
        || serviceBody
        || marketBody
        || farmBody
        || storageBody
        || (b.type === 'house' && houseProgress
          ? '<div class="context-section-head"><span><b>Household prosperity</b><small>' + escape(houseProgress.label) + '</small></span><strong>Level ' + houseProgress.level + '</strong></div>'
            + (houseProgress.next
              ? '<div class="prosperity-progress"><i style="width:' + percentage(houseProgress.qualifyingDays, houseProgress.next.requiredDays) + '%"></i></div><p>Qualifying streak ' + houseProgress.qualifyingDays + ' / ' + houseProgress.next.requiredDays + ' Days</p>'
                + (houseProgress.blockers.length ? '<p class="context-note warning-note">Blocked: ' + escape(houseProgress.blockers.join(' · ')) + '</p>' : '<p class="context-note good-note">Qualifying today</p>')
              : '<p class="context-note good-note">Maximum household prosperity reached.</p>')
          : operations || '<p class="context-empty">No active production, service or storage cycle.</p>')

      const advancedBody = stockpileControls + tradeControls
        || (def.production ? '<div class="context-control-row"><span><b>Hauling behavior</b><small>Low conserves hauling labor. High prioritizes this workplace.</small></span><button data-action="workplace-haul-priority">' + haulPriorityLabel(b.haulPriority) + '</button></div>' : '')
        || '<p class="context-empty">No advanced policies are available for this building yet.</p>'

      const workerRibbon = b.complete && !b.destroyed && (def.workerSlots ?? 0) > 0
        ? (() => {
            const staffing = workplaceStaffing(s, b)
            const last = staffing.workers.at(-1)
            const slots = Array.from({ length: staffing.slots }, (_, i) => {
              const worker = staffing.workers[i]
              return '<span class="staff-token ' + (worker ? 'is-filled' : '') + '" title="' + escape(worker ? settlerLabel(s, worker.id) + ' · ' + worker.status : 'Unassigned slot') + '"><span aria-hidden="true">♟</span></span>'
            }).join('')
            return '<div class="staff-ribbon" aria-label="Workplace staffing"><button data-action="unassign-workplace" data-value="' + (last?.id ?? '') + '" aria-label="Remove one worker" title="Remove one worker" ' + (!last ? 'disabled' : '') + '>−</button>'
              + slots + '<button data-action="assign-workplace" aria-label="Assign one laborer" title="Assign one laborer" ' + (staffing.assigned >= staffing.slots || laborers === 0 ? 'disabled' : '') + '>+</button>'
              + '<small>' + staffing.assigned + '/' + staffing.slots + ' assigned<br>' + staffing.active + ' at work</small></div>'
          })()
        : ''
      const contextTabs = [
        { id: 'general', label: 'General', body: generalBody + '<details class="operation-details"' + (this.operationDetailsOpen ? ' open' : '') + '><summary>Operation & storage</summary>' + operationBody + '</details>' },
        { id: 'people', label: 'People', body: peopleBody },
        { id: 'advanced', label: 'Advanced', body: advancedBody + demolish },
      ]
      const contextTabsHtml = contextTabs.map(tab =>
        '<button data-context-tab="' + tab.id + '" aria-pressed="' + (this.activeContextTab === tab.id) + '">' + tab.label + '</button>'
      ).join('')
      const contextPanelsHtml = contextTabs.map(tab =>
        '<div class="context-pane ' + (this.activeContextTab === tab.id ? 'is-active' : '') + '" data-context-panel="' + tab.id + '">' + tab.body + '</div>'
      ).join('')
      this.set('inspection',
        '<div class="building-panel">'
        + '<div class="building-panel-title" data-drag-handle><span class="ui-icon-slot" data-ui-asset="building-icon:' + b.type + '" aria-hidden="true"></span><div><span class="eyebrow">' + (def.profession ?? (def.housing ? 'Residential' : def.fortification ? 'Defense' : 'Settlement building')) + '</span><h2>' + def.label + ' <small>#' + b.id + '</small></h2></div><button class="context-close" data-action="close-inspector" title="Close">×</button></div>'
        + '<div class="building-hero" data-ui-asset="building-header:' + b.type + '"><span>Artwork slot · ' + def.label + '</span></div>'
        + '<div class="context-tabs" role="tablist">' + contextTabsHtml + '</div>'
        + workerRibbon
        + '<div class="context-content">' + contextPanelsHtml + '</div>'
        + '</div>')
    } else if (n) {
      const sourceJob = s.jobs.find(job => job.sourceId === n.id)
      const label = n.resource === 'wood' ? 'Tree' : n.resource === 'food' ? 'Food Bush' : RESOURCES[n.resource].label + ' Deposit'
      const worker = sourceJob?.settlerId ? s.settlers.find(settler => settler.id === sourceJob.settlerId) : null
      const body =
        '<div class="resource-focus"><span class="resource-focus-icon" data-ui-asset="resource:' + n.resource + '"></span><div><b>' + n.remaining + ' ' + RESOURCES[n.resource].label + '</b><small>' + (sourceJob ? 'Currently claimed for gathering' : 'Available for gathering') + '</small></div></div>'
        + '<div class="object-info-grid">'
        + '<div><span>Resource</span><b>' + RESOURCES[n.resource].label + '</b></div>'
        + '<div><span>Gatherer</span><b>' + escape(worker ? settlerLabel(s, worker.id) : 'Unassigned') + '</b></div>'
        + '<div><span>Position</span><b>' + n.x.toFixed(1) + ', ' + n.z.toFixed(1) + '</b></div>'
        + '<div><span>Node ID</span><b>#' + n.id + '</b></div>'
        + '</div>'
        + (worker ? '<div class="context-actions"><button data-action="select-object" data-value="' + worker.id + '">Open Gatherer</button></div>' : '')
      this.set('inspection', contextualPanel('Resource', label + ' #' + n.id, 'resource:' + n.resource, body))
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
    const noisyEvent = /(deposited|picked up|gathered|carrying|hauling|delivered|reserved|working at|walking to|collected)\b/i
    const meaningfulEvents = s.events
      .filter(message => !noisyEvent.test(message))
      .slice(0, Math.max(0, 4 - taskItems.length))
      .map(message => ({ tone: 'event', icon: 'task-event', title: message, detail: 'Recent settlement event' }))
    const visibleTasks = [...taskItems, ...meaningfulEvents].slice(0, 4)
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
    if (ui.selectedId !== this.lastFloatingSelectionId) {
      this.lastFloatingSelectionId = ui.selectedId
      this.resetInspectorPosition()
    }
    inspector.classList.toggle('is-active', ui.selectedId !== null || ui.buildType !== null || ui.planningTool !== null)
    inspector.classList.toggle('is-building', Boolean(b))
    inspector.classList.toggle('is-contextual', Boolean(a || b || field || n || e))
    inspector.classList.toggle('is-world-anchored', ui.selectedId !== null && !this.inspectorManuallyPositioned)
    if (ui.selectedId !== null) this.positionInspector(ui.selectionAnchor)
    this.element.querySelector<HTMLElement>('.road-context')!.classList.toggle('is-active', ui.planningTool === 'road')
    this.element.querySelector<HTMLElement>('#message')!.classList.toggle('is-visible', ui.message.trim().length > 0)

    const pauseButton = this.element.querySelector<HTMLButtonElement>('[data-action="pause"]')!
    pauseButton.querySelector('span:last-child')!.textContent = ui.paused ? 'Resume' : 'Pause'
    const cameraButton = this.element.querySelector<HTMLButtonElement>('[data-action="camera"]')!
    cameraButton.querySelector<HTMLElement>('.dock-label')!.textContent = ui.camera === 'settlement' ? 'Follow player' : 'Settlement camera'
    const cinematic = this.element.querySelector<HTMLButtonElement>('[data-action="cinematic"]')!
    cinematic.querySelector<HTMLElement>('.dock-label')!.textContent = ui.cinematic ? 'Overview' : 'Street view'
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
    gridSnap.querySelector<HTMLElement>('.catalog-tool-label')!.textContent = 'Grid Snap ' + (ui.gridSnap ? 'ON' : 'OFF')
    roadCurve.textContent = 'Curve ' + curveLabel + ' [C]'
    roadWidth.textContent = 'Width ' + widthLabel + ' ' + ui.roadWidth.toFixed(1) + 'm'
    roadSnap.textContent = 'Road Join ' + (ui.roadSnap ? 'ON' : 'OFF') + ' [F]'
    gridSnap.setAttribute('aria-pressed', String(ui.gridSnap))
    roadCurve.setAttribute('aria-pressed', String(ui.roadCurve > 0.05))
    roadSnap.setAttribute('aria-pressed', String(ui.roadSnap))
    for (const type of ['stockpile', 'ore-yard', 'guard-post', 'campfire', 'brewery', 'tavern', 'pleasure-house', 'blacksmith', 'farmhouse', 'foresters-lodge', 'mine', 'fishing-hut', 'market', 'trading-post', 'wood-wall', 'wood-gate']) {
      const button = this.element.querySelector<HTMLButtonElement>('[data-action="' + type + '"]')!
      button.setAttribute('aria-pressed', String(ui.buildType === type))
      const definition = BUILDINGS[type as BuildingId]
      const affordable = definition.buildCost.wood <= wood
      button.classList.toggle('is-unaffordable', !affordable)
      button.setAttribute('data-affordable', String(affordable))
    }
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

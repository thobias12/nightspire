import { BUILDINGS, type BuildingId } from '../data/buildings'
import { available, freeStorage, reserved, stockpiles } from '../simulation/Buildings'
import { phaseForTime, phaseLabel } from '../simulation/DayNight'
import { happinessOf, settlementNeeds } from '../simulation/Needs'
import { raidSizeForWave } from '../simulation/Raid'
import { assignedGuardPost } from '../simulation/Schedule'
import { serviceAssignment, serviceAvailable, serviceSummary } from '../simulation/Services'
import { enemyLabel, settlerLabel, type WorldState } from '../simulation/WorldState'

export interface Metrics { frame: number; simulation: number; render: number; calls: number; triangles: number; paths: number; requests: number; queue: number; failures: number; dropped: number }
export interface HudState { paused: boolean; selectedId: number | null; buildType: BuildingId | null; message: string; camera: string; metrics: Metrics }
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const needLabel = (value: string) => value[0].toUpperCase() + value.slice(1)

export class Hud {
  readonly element = document.createElement('div')
  private readonly abort = new AbortController()

  constructor(root: HTMLElement, action: (action: string, value?: string) => void) {
    this.element.className = 'hud'
    this.element.innerHTML = `
      <header class="topbar"><div><b>NIGHTSPIRE</b><span class="tag">M3.1 · TAVERN SERVICES</span></div><div id="resources"></div><div id="clock"></div></header>
      <section class="guide panel"><span class="eyebrow">SERVICES NEED SUPPLIES</span><h1>Give them somewhere better.</h1>
        <p>Campfires provide free basic recreation. Taverns provide stronger 12-slot recreation, but workers must keep their pantry supplied with food or visitors fall back to Campfires.</p>
        <div id="objective"></div>
        <p class="muted">Gold: workers · Rust: guards · Dark red: raiders · Cyan: you<br>Damaged structures show health bars; recent hits flash red.</p>
      </section>
      <section class="inspector panel"><span class="eyebrow">INSPECT</span><div id="inspection">Select something in the world.</div></section>
      <details class="qa panel" open><summary>QA & performance</summary><div class="qa-body">
        <div class="row"><button data-action="pause">Pause</button><label>Speed <select aria-label="Simulation speed" data-action="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>
        <label>Set hour <input aria-label="Set hour" type="range" min="0" max="23" value="8" data-action="time"></label>
        <div class="row phase-buttons"><button data-action="jump-day">Day</button><button data-action="jump-dusk">Dusk</button><button data-action="jump-night">Night</button><button data-action="jump-dawn">Dawn</button></div><button data-action="next-raid">Next raid</button>
        <h3>Stock targets</h3>
        <div class="row"><label>Wood <input class="number-input" aria-label="Wood stock target" type="number" min="0" max="10000" step="25" data-action="target-wood"></label><label>Food <input class="number-input" aria-label="Food stock target" type="number" min="0" max="10000" step="25" data-action="target-food"></label></div>
        <div class="row"><button data-action="resources">+50 wood / food</button><button data-action="spawn">Spawn settler</button></div>
        <div class="row"><button data-action="needs-low">Needs → 25%</button><button data-action="needs-reset">Needs → 100%</button></div>
        <div class="row"><button data-action="service-food">+5 selected service supply</button><button data-action="damage-selected">Damage selected -60 HP</button></div>
        <label><input type="checkbox" data-action="paths"> Show navigation paths</label>
        <button data-action="audit">Check state integrity</button>
        <h3>Save tools</h3>
        <div class="row"><button data-action="export-save">Export JSON</button><button data-action="load-backup">Load backup</button></div>
        <label>Import JSON <input aria-label="Import save file" type="file" accept=".json,application/json" data-action="import-save"></label>
        <div id="metrics"></div><div id="workers"></div>
      </div></details>
      <footer class="bottom"><div class="toolbar panel">
        <button data-action="house">House <small>20 wood · 4 beds</small></button>
        <button data-action="stockpile">Stockpile <small>10 wood · 400 storage</small></button>
        <button data-action="guard-post">Guard Post <small>25 wood · 2 guards</small></button>
        <button data-action="campfire">Campfire <small>10 wood · 6 free slots</small></button>
        <button data-action="tavern">Tavern <small>40 wood · 12 supplied slots</small></button>
        <button data-action="wood-wall">Wood Wall <small>5 wood · 120 HP</small></button>
        <button data-action="wood-gate">Wood Gate <small>15 wood · 220 HP</small></button>
        <button data-action="cancel">Inspect / Esc</button><button data-action="camera">Follow player</button>
        <button data-action="center">Center camp</button><button data-action="save">Save</button><button data-action="load">Load</button>
      </div><div class="status panel" role="status" id="message"></div>
      <div class="controls">WASD / arrows: pan or move · Q/E: rotate · Space: melee · Wheel: zoom · Click: place / inspect · Esc: cancel</div></footer>
    `
    root.append(this.element)
    const signal = this.abort.signal
    this.element.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
      if (button) action(button.dataset.action!)
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
    const food = stores.reduce((n, b) => n + b.inventory.food, 0)
    const held = stores.reduce((n, b) => n + reserved(s, b.id, 'wood'), 0)
    const housed = s.settlers.filter(a => a.homeId !== null).length
    const beds = s.buildings.filter(b => b.complete && !b.destroyed).reduce((n, b) => n + BUILDINGS[b.type].housing, 0)
    const guards = s.settlers.filter(a => a.role === 'guard').length
    const guardSlots = s.buildings.filter(b => b.complete && !b.destroyed).reduce((n, b) => n + BUILDINGS[b.type].guardSlots, 0)
    const phase = phaseForTime(s.timeOfDay)
    const damaged = s.buildings.filter(b => b.complete && b.health < b.maxHealth).length
    const walls = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'wood-wall').length
    const gates = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'wood-gate').length
    const services = serviceSummary(s, phase)
    const taverns = s.buildings.filter(b => b.complete && !b.destroyed && b.type === 'tavern')
    const suppliedTaverns = taverns.filter(serviceAvailable).length
    const needSummary = settlementNeeds(s)
    const fedToday = s.settlers.filter(settler => settler.lastMealDay === s.day).length

    this.set('resources', `<b>Wood ${wood}/${s.targets.wood}</b> <span>(${held} reserved)</span> <b>Food ${food}/${s.targets.food}</b> <b>Housing ${housed}/${s.settlers.length}</b> <b>Guards ${guards}/${guardSlots}</b> <b>Raiders ${s.enemies.length}</b> <b>Fed ${fedToday}/${s.settlers.length}</b> <b>Happy ${needSummary.happiness}%</b> <span>Worst ${needLabel(needSummary.worst)} ${Math.round(needSummary.averages[needSummary.worst])}%</span> <b>You ${s.player.health}/${s.player.maxHealth} HP</b>`)
    const minutes = Math.floor(s.timeOfDay * 1440)
    this.set('clock', `<span class="phase phase-${phase}">${phaseLabel(phase)}</span> · Day ${s.day} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${ui.paused ? '· PAUSED' : ''}<small>Services active at Dusk/Dawn · Tavern supply is physically hauled · raids still scale 20 → 40</small>`)

    const hasPost = s.buildings.some(b => b.complete && !b.destroyed && b.type === 'guard-post')
    const shelterReady = beds >= s.settlers.length
    this.set('objective', `<div class="objective-row">${shelterReady ? '✓' : '○'} Housing · ${housed}/${s.settlers.length} settlers</div><div class="objective-row">${fedToday === s.settlers.length ? '✓' : '○'} Feed today\'s settlement · ${fedToday}/${s.settlers.length}</div><div class="objective-row">${taverns.length > 0 ? '✓' : '○'} Build a Tavern · ${taverns.length}</div><div class="objective-row">${suppliedTaverns > 0 ? '✓' : '○'} Keep a Tavern supplied · ${suppliedTaverns}/${taverns.length}</div><div class="objective-row">${services.activeVisitors > 0 ? '✓' : '○'} Serve off-hours visitors · ${services.activeVisitors}</div><div class="objective-row">${needSummary.happiness >= 70 ? '✓' : '○'} Average happiness ≥ 70% · ${needSummary.happiness}%</div>`)

    const a = s.settlers.find(a => a.id === ui.selectedId)
    const b = s.buildings.find(b => b.id === ui.selectedId)
    const n = s.nodes.find(n => n.id === ui.selectedId)
    const e = s.enemies.find(e => e.id === ui.selectedId)

    if (a) {
      const guardAssignment = assignedGuardPost(s, a)
      const service = serviceAssignment(s, a, phase)
      const serviceText = service ? service.label + ' · +' + service.gainPerSecond + ' recreation/s' : (phase === 'dusk' || phase === 'dawn' ? 'No available service slot' : 'Off hours only')
      this.set('inspection', `<h2>${settlerLabel(s, a.id)}</h2><p><b>${a.role === 'guard' ? 'Guard' : 'Worker'}</b> · ${escape(a.status)}</p><p><b>Happiness ${happinessOf(a)}%</b><br>Food ${Math.round(a.needs.food)}% · Housing ${Math.round(a.needs.housing)}%<br>Safety ${Math.round(a.needs.safety)}% · Recreation ${Math.round(a.needs.recreation)}%</p><p>Recreation service: ${serviceText}<br>HP: ${a.health}/${a.maxHealth}<br>Cargo: ${a.cargo.wood} wood, ${a.cargo.food} food<br>Home: ${a.homeId === null ? 'Unhoused' : 'House ' + a.homeId}<br>Night post: ${a.role === 'guard' ? (guardAssignment ? 'Guard Post ' + guardAssignment.buildingId : 'No slot available') : 'Civilian shelter'}<br>Last meal: Day ${a.lastMealDay}<br>Position: ${a.x.toFixed(1)}, ${a.z.toFixed(1)}</p><button data-action="toggle-role">${a.role === 'guard' ? 'Return to worker duty' : 'Assign as guard'}</button>`)
    } else if (e) {
      const target = s.buildings.find(b => b.id === e.targetId)
      this.set('inspection', `<h2>${enemyLabel(s, e.id)}</h2><p><b>Raider</b> · ${escape(e.status)}</p><p>HP: ${e.health}/${e.maxHealth}<br>Wave: ${s.raid.wave}<br>Target: ${target ? BUILDINGS[target.type].label + ' ' + target.id : 'Settlement'}<br>Position: ${e.x.toFixed(1)}, ${e.z.toFixed(1)}</p><p class="muted">Move the player within melee range and press Space, or let guards intercept.</p>`)
    } else if (b) {
      const def = BUILDINGS[b.type]
      const cancel = b.complete ? '' : '<button data-action="cancel-blueprint">Cancel blueprint</button>'
      let details = ''
      if (b.complete) {
        const repairJob = s.jobs.find(j => j.kind === 'repair' && j.targetId === b.id)
        const supplyJob = s.jobs.filter(j => j.kind === 'supply' && j.targetId === b.id).reduce((sum, j) => sum + j.amount, 0)
        const service = def.service
        const serviceText = service
          ? service.slots + ' ' + service.need + ' slots · +' + service.gainPerSecond + '/s'
            + (service.supplyResource ? '<br>Pantry: ' + b.inventory[service.supplyResource] + '/' + service.supplyCapacity + ' ' + service.supplyResource + ' · inbound ' + supplyJob : '<br>No operating supplies required')
          : ''
        const functionText = def.housing ? def.housing + ' beds'
          : def.guardSlots ? def.guardSlots + ' guard slots'
          : def.storage ? `Wood ${b.inventory.wood} (${available(s, b, 'wood')} available)<br>Food ${b.inventory.food}<br>Unreserved capacity: ${Math.max(0, freeStorage(s, b))}`
          : service ? serviceText
          : def.friendlyPassable ? 'Friendlies pass through; raiders treat it as closed.'
          : def.fortification ? 'Blocks friendly and hostile movement until destroyed.'
          : ''
        details = `<b>${b.destroyed ? 'DESTROYED RUIN' : 'HP ' + b.health + '/' + b.maxHealth}</b><br><progress value="${b.health}" max="${b.maxHealth}"></progress><br>${functionText}${repairJob ? '<br>Repair job active · ' + repairJob.amount + ' wood' : ''}`
      } else {
        details = `Delivered: ${b.delivered.wood}/${def.buildCost.wood} wood<br>Assigned deliveries: ${s.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id).reduce((sum, j) => sum + j.amount, 0)} wood<br>Work: ${Math.round(b.work / def.constructionWork * 100)}%<br><progress value="${b.work}" max="${def.constructionWork}"></progress>${cancel}`
      }
      this.set('inspection', `<h2>${def.label} ${b.id}</h2><p>${b.complete ? (b.destroyed ? 'Ruined — non-blocking until repaired' : 'Complete') : 'Under construction'}</p><p>${details}</p>`)
    } else if (n) {
      this.set('inspection', `<h2>${n.resource === 'wood' ? 'Tree' : 'Food bush'} ${n.id}</h2><p>${n.remaining} ${n.resource} remaining<br>${s.jobs.some(j => j.sourceId === n.id) ? 'Claimed by a settler' : 'Available for gathering'}</p>`)
    } else {
      this.set('inspection', `<p>${ui.buildType ? 'Placing ' + BUILDINGS[ui.buildType].label + '. Green means valid; red means blocked.' : 'Select a settler to assign guard duty, or inspect a resource/building.'}</p>`)
    }

    this.set('message', escape(ui.message))
    const m = ui.metrics
    this.set('metrics', `<dl><dt>Phase</dt><dd>${phaseLabel(phase)}</dd><dt>Frame / FPS</dt><dd>${m.frame.toFixed(1)} ms / ${(1000 / Math.max(m.frame, 1)).toFixed(0)}</dd><dt>Simulation CPU</dt><dd>${m.simulation.toFixed(2)} ms</dd><dt>Render submission CPU</dt><dd>${m.render.toFixed(2)} ms</dd><dt>Draws / triangles</dt><dd>${m.calls} / ${m.triangles}</dd><dt>Active jobs / settlers</dt><dd>${s.jobs.length} / ${s.settlers.length}</dd><dt>Guards / post slots</dt><dd>${guards} / ${guardSlots}</dd><dt>Path requests / solves</dt><dd>${m.requests} / ${m.paths}</dd><dt>Queued paths</dt><dd>${m.queue}</dd><dt>Path failures</dt><dd>${m.failures}</dd><dt>Catch-up dropped</dt><dd>${m.dropped.toFixed(2)} s</dd><dt>Enemies</dt><dd>${s.enemies.length}</dd><dt>Raid wave / spawned</dt><dd>${s.raid.wave} / ${s.raid.totalSpawned}</dd><dt>Next wave size</dt><dd>${raidSizeForWave(s.raid.wave + 1)}</dd><dt>Happiness / worst</dt><dd>${needSummary.happiness}% / ${needLabel(needSummary.worst)} ${Math.round(needSummary.averages[needSummary.worst])}%</dd><dt>Need averages</dt><dd>F ${Math.round(needSummary.averages.food)} · H ${Math.round(needSummary.averages.housing)} · S ${Math.round(needSummary.averages.safety)} · R ${Math.round(needSummary.averages.recreation)}</dd><dt>Fed today</dt><dd>${fedToday}/${s.settlers.length}</dd><dt>Food consumed</dt><dd>${s.totals.foodConsumed}</dd><dt>Service providers</dt><dd>${services.suppliedProviders}/${services.providers} supplied</dd><dt>Service slots / visitors</dt><dd>${services.slots} / ${services.activeVisitors}</dd><dt>Tavern food used</dt><dd>${s.totals.serviceFoodConsumed}</dd><dt>Raiders defeated</dt><dd>${s.raid.totalDefeated}</dd><dt>Last cleared wave</dt><dd>${s.raid.lastClearedWave || '—'}</dd><dt>Player HP</dt><dd>${s.player.health}/${s.player.maxHealth}</dd><dt>Structure damage</dt><dd>${s.totals.structureDamage} HP</dd><dt>Repaired</dt><dd>${s.totals.repairedHealth} HP / ${s.totals.repairWoodUsed} wood</dd><dt>Damaged structures</dt><dd>${damaged}</dd><dt>Completed / sites</dt><dd>${s.totals.constructed} / ${s.buildings.filter(b => !b.complete).length}</dd><dt>Simulation tick</dt><dd>${s.tick}</dd></dl>`)
    this.set('workers', '<h3>Settlers</h3>' + s.settlers.map(a => `<div class="worker">${settlerLabel(s, a.id)} · ${a.role === 'guard' ? 'Guard' : 'Worker'} · Happy ${happinessOf(a)}% · ${escape(a.status)}</div>`).join('') + (s.enemies.length ? '<h3>Raiders</h3>' + s.enemies.map(e => `<div class="worker enemy-row">${enemyLabel(s, e.id)} · ${e.health}/${e.maxHealth} HP · ${escape(e.status)}</div>`).join('') : '') + '<h3>Recent activity</h3>' + s.events.map(e => `<div class="worker">${escape(e)}</div>`).join(''))

    this.element.querySelector('[data-action="pause"]')!.textContent = ui.paused ? 'Resume' : 'Pause'
    this.element.querySelector('[data-action="camera"]')!.textContent = ui.camera === 'settlement' ? 'Follow player' : 'Settlement camera'
    ;(this.element.querySelector('[data-action="spawn"]') as HTMLButtonElement).disabled = s.settlers.length >= 10
    for (const type of ['house', 'stockpile', 'guard-post', 'campfire', 'tavern', 'wood-wall', 'wood-gate']) this.element.querySelector('[data-action="' + type + '"]')!.setAttribute('aria-pressed', String(ui.buildType === type))

    const hour = this.element.querySelector<HTMLInputElement>('[data-action="time"]')!
    if (document.activeElement !== hour) hour.value = String(Math.floor(s.timeOfDay * 24))
    const woodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-wood"]')!
    const foodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-food"]')!
    if (document.activeElement !== woodTarget) woodTarget.value = String(s.targets.wood)
    if (document.activeElement !== foodTarget) foodTarget.value = String(s.targets.food)
  }

  dispose(): void { this.abort.abort(); this.element.remove() }
}

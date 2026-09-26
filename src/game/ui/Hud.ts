import { BUILDINGS, type BuildingId } from '../data/buildings'
import { available, freeStorage, reserved, stockpiles } from '../simulation/Buildings'
import { phaseForTime, phaseLabel } from '../simulation/DayNight'
import { assignedGuardPost } from '../simulation/Schedule'
import { enemyLabel, settlerLabel, type WorldState } from '../simulation/WorldState'

export interface Metrics { frame: number; simulation: number; render: number; calls: number; triangles: number; paths: number; requests: number; queue: number; failures: number; dropped: number }
export interface HudState { paused: boolean; selectedId: number | null; buildType: BuildingId | null; message: string; camera: string; metrics: Metrics }
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export class Hud {
  readonly element = document.createElement('div')
  private readonly abort = new AbortController()

  constructor(root: HTMLElement, action: (action: string, value?: string) => void) {
    this.element.className = 'hud'
    this.element.innerHTML = `
      <header class="topbar"><div><b>NIGHTSPIRE</b><span class="tag">M2.1 · FIRST RAID</span></div><div id="resources"></div><div id="clock"></div></header>
      <section class="guide panel"><span class="eyebrow">THE FIRST RAID</span><h1>Watch them approach.</h1>
        <p>Prepare shelter and guards, then jump to Night. Twelve raiders enter from outside the map and path toward the camp.</p>
        <div id="objective"></div>
        <p class="muted">Gold: workers · Rust: guards · Dark red: raiders · Cyan: you<br>Raiders do not attack yet in M2.1.</p>
      </section>
      <section class="inspector panel"><span class="eyebrow">INSPECT</span><div id="inspection">Select something in the world.</div></section>
      <details class="qa panel" open><summary>QA & performance</summary><div class="qa-body">
        <div class="row"><button data-action="pause">Pause</button><label>Speed <select aria-label="Simulation speed" data-action="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>
        <label>Set hour <input aria-label="Set hour" type="range" min="0" max="23" value="8" data-action="time"></label>
        <div class="row phase-buttons"><button data-action="jump-day">Day</button><button data-action="jump-dusk">Dusk</button><button data-action="jump-night">Night</button><button data-action="jump-dawn">Dawn</button></div><button data-action="next-raid">Next raid</button>
        <h3>Stock targets</h3>
        <div class="row"><label>Wood <input class="number-input" aria-label="Wood stock target" type="number" min="0" max="10000" step="25" data-action="target-wood"></label><label>Food <input class="number-input" aria-label="Food stock target" type="number" min="0" max="10000" step="25" data-action="target-food"></label></div>
        <div class="row"><button data-action="resources">+50 wood / food</button><button data-action="spawn">Spawn settler</button></div>
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
        <button data-action="cancel">Inspect / Esc</button><button data-action="camera">Follow player</button>
        <button data-action="center">Center camp</button><button data-action="save">Save</button><button data-action="load">Load</button>
      </div><div class="status panel" role="status" id="message"></div>
      <div class="controls">WASD / arrows: pan or move · Q/E: rotate · Wheel: zoom · Click: place / inspect · Esc: cancel</div></footer>
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
    const beds = s.buildings.filter(b => b.complete).reduce((n, b) => n + BUILDINGS[b.type].housing, 0)
    const guards = s.settlers.filter(a => a.role === 'guard').length
    const guardSlots = s.buildings.filter(b => b.complete).reduce((n, b) => n + BUILDINGS[b.type].guardSlots, 0)
    const phase = phaseForTime(s.timeOfDay)

    this.set('resources', `<b>Wood ${wood}/${s.targets.wood}</b> <span>(${held} reserved)</span> <b>Food ${food}/${s.targets.food}</b> <b>Housing ${housed}/${s.settlers.length}</b> <b>Guards ${guards}/${guardSlots}</b> <b>Raiders ${s.enemies.length}</b>`)
    const minutes = Math.floor(s.timeOfDay * 1440)
    this.set('clock', `<span class="phase phase-${phase}">${phaseLabel(phase)}</span> · Day ${s.day} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${ui.paused ? '· PAUSED' : ''}<small>Raid movement active · combat/damage not implemented yet</small>`)

    const hasPost = s.buildings.some(b => b.complete && b.type === 'guard-post')
    const shelterReady = beds >= s.settlers.length
    this.set('objective', `<div class="objective-row">${shelterReady ? '✓' : '○'} Shelter the population · ${beds} beds</div><div class="objective-row">${hasPost ? '✓' : '○'} Complete a Guard Post</div><div class="objective-row">${guards > 0 ? '✓' : '○'} Assign at least one guard</div><div class="objective-row">${s.raid.wave > 0 ? '✓' : '○'} Trigger the first night raid</div><div class="objective-row">${s.enemies.some(e => e.status.includes('settlement')) ? '✓' : '○'} Observe raiders reach the camp</div>`)

    const a = s.settlers.find(a => a.id === ui.selectedId)
    const b = s.buildings.find(b => b.id === ui.selectedId)
    const n = s.nodes.find(n => n.id === ui.selectedId)
    const e = s.enemies.find(e => e.id === ui.selectedId)

    if (a) {
      const guardAssignment = assignedGuardPost(s, a)
      this.set('inspection', `<h2>${settlerLabel(s, a.id)}</h2><p><b>${a.role === 'guard' ? 'Guard' : 'Worker'}</b> · ${escape(a.status)}</p><p>Cargo: ${a.cargo.wood} wood, ${a.cargo.food} food<br>Home: ${a.homeId === null ? 'Unhoused' : 'House ' + a.homeId}<br>Night post: ${a.role === 'guard' ? (guardAssignment ? 'Guard Post ' + guardAssignment.buildingId : 'No slot available') : 'Civilian shelter'}<br>Position: ${a.x.toFixed(1)}, ${a.z.toFixed(1)}</p><button data-action="toggle-role">${a.role === 'guard' ? 'Return to worker duty' : 'Assign as guard'}</button>`)
    } else if (e) {
      const target = s.buildings.find(b => b.id === e.targetId)
      this.set('inspection', `<h2>${enemyLabel(s, e.id)}</h2><p><b>Raider</b> · ${escape(e.status)}</p><p>Wave: ${s.raid.wave}<br>Target: ${target ? BUILDINGS[target.type].label + ' ' + target.id : 'Settlement'}<br>Position: ${e.x.toFixed(1)}, ${e.z.toFixed(1)}</p><p class="muted">M2.1 has movement only; combat arrives next.</p>`)
    } else if (b) {
      const def = BUILDINGS[b.type]
      const cancel = b.complete ? '' : '<button data-action="cancel-blueprint">Cancel blueprint</button>'
      let details = ''
      if (b.complete) {
        if (def.housing) details = `${def.housing} beds`
        else if (def.guardSlots) details = `${def.guardSlots} guard slots`
        else details = `Wood ${b.inventory.wood} (${available(s, b, 'wood')} available)<br>Food ${b.inventory.food}<br>Unreserved capacity: ${freeStorage(s, b)}`
      } else {
        details = `Delivered: ${b.delivered.wood}/${def.buildCost.wood} wood<br>Assigned deliveries: ${s.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id).reduce((sum, j) => sum + j.amount, 0)} wood<br>Work: ${Math.round(b.work / def.constructionWork * 100)}%<br><progress value="${b.work}" max="${def.constructionWork}"></progress>${cancel}`
      }
      this.set('inspection', `<h2>${def.label} ${b.id}</h2><p>${b.complete ? 'Complete' : 'Under construction'}</p><p>${details}</p>`)
    } else if (n) {
      this.set('inspection', `<h2>${n.resource === 'wood' ? 'Tree' : 'Food bush'} ${n.id}</h2><p>${n.remaining} ${n.resource} remaining<br>${s.jobs.some(j => j.sourceId === n.id) ? 'Claimed by a settler' : 'Available for gathering'}</p>`)
    } else {
      this.set('inspection', `<p>${ui.buildType ? 'Placing ' + BUILDINGS[ui.buildType].label + '. Green means valid; red means blocked.' : 'Select a settler to assign guard duty, or inspect a resource/building.'}</p>`)
    }

    this.set('message', escape(ui.message))
    const m = ui.metrics
    this.set('metrics', `<dl><dt>Phase</dt><dd>${phaseLabel(phase)}</dd><dt>Frame / FPS</dt><dd>${m.frame.toFixed(1)} ms / ${(1000 / Math.max(m.frame, 1)).toFixed(0)}</dd><dt>Simulation CPU</dt><dd>${m.simulation.toFixed(2)} ms</dd><dt>Render submission CPU</dt><dd>${m.render.toFixed(2)} ms</dd><dt>Draws / triangles</dt><dd>${m.calls} / ${m.triangles}</dd><dt>Active jobs / settlers</dt><dd>${s.jobs.length} / ${s.settlers.length}</dd><dt>Guards / post slots</dt><dd>${guards} / ${guardSlots}</dd><dt>Path requests / solves</dt><dd>${m.requests} / ${m.paths}</dd><dt>Queued paths</dt><dd>${m.queue}</dd><dt>Path failures</dt><dd>${m.failures}</dd><dt>Catch-up dropped</dt><dd>${m.dropped.toFixed(2)} s</dd><dt>Enemies</dt><dd>${s.enemies.length}</dd><dt>Raid wave / spawned</dt><dd>${s.raid.wave} / ${s.raid.totalSpawned}</dd><dt>Completed / sites</dt><dd>${s.totals.constructed} / ${s.buildings.filter(b => !b.complete).length}</dd><dt>Simulation tick</dt><dd>${s.tick}</dd></dl>`)
    this.set('workers', '<h3>Settlers</h3>' + s.settlers.map(a => `<div class="worker">${settlerLabel(s, a.id)} · ${a.role === 'guard' ? 'Guard' : 'Worker'} · ${escape(a.status)}</div>`).join('') + (s.enemies.length ? '<h3>Raiders</h3>' + s.enemies.map(e => `<div class="worker enemy-row">${enemyLabel(s, e.id)} · ${escape(e.status)}</div>`).join('') : '') + '<h3>Recent activity</h3>' + s.events.map(e => `<div class="worker">${escape(e)}</div>`).join(''))

    this.element.querySelector('[data-action="pause"]')!.textContent = ui.paused ? 'Resume' : 'Pause'
    this.element.querySelector('[data-action="camera"]')!.textContent = ui.camera === 'settlement' ? 'Follow player' : 'Settlement camera'
    ;(this.element.querySelector('[data-action="spawn"]') as HTMLButtonElement).disabled = s.settlers.length >= 10
    for (const type of ['house', 'stockpile', 'guard-post']) this.element.querySelector('[data-action="' + type + '"]')!.setAttribute('aria-pressed', String(ui.buildType === type))

    const hour = this.element.querySelector<HTMLInputElement>('[data-action="time"]')!
    if (document.activeElement !== hour) hour.value = String(Math.floor(s.timeOfDay * 24))
    const woodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-wood"]')!
    const foodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-food"]')!
    if (document.activeElement !== woodTarget) woodTarget.value = String(s.targets.wood)
    if (document.activeElement !== foodTarget) foodTarget.value = String(s.targets.food)
  }

  dispose(): void { this.abort.abort(); this.element.remove() }
}

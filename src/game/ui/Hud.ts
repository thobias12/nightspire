import { BUILDINGS, type BuildingId } from '../data/buildings'
import { available, freeStorage, reserved, stockpiles } from '../simulation/Buildings'
import { settlerLabel, type WorldState } from '../simulation/WorldState'
export interface Metrics { frame: number; simulation: number; render: number; calls: number; triangles: number; paths: number; requests: number; queue: number; failures: number; dropped: number }
export interface HudState { paused: boolean; selectedId: number | null; buildType: BuildingId | null; message: string; camera: string; metrics: Metrics }
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
export class Hud {
  readonly element = document.createElement('div')
  private readonly abort = new AbortController()
  constructor(root: HTMLElement, action: (action: string, value?: string) => void) {
    this.element.className = 'hud'
    this.element.innerHTML = `
      <header class="topbar"><div><b>NIGHTSPIRE</b><span class="tag">M1.1 · SETTLEMENT</span></div><div id="resources"></div><div id="clock"></div></header>
      <section class="guide panel"><span class="eyebrow">A CAMP WORTH BUILDING</span><h1>Give them a home.</h1>
        <p>Settlers gather wood and food toward your stock targets. Place three houses to shelter ten people. Add a stockpile to expand storage.</p>
        <div id="objective"></div>
        <p class="muted">Gold: settlers · Cyan: you<br>Click a worker, tree, bush or building to inspect.</p>
      </section>
      <section class="inspector panel"><span class="eyebrow">INSPECT</span><div id="inspection">Select something in the world.</div></section>
      <details class="qa panel"><summary>QA & performance</summary><div class="qa-body">
        <div class="row"><button data-action="pause">Pause</button><label>Speed <select aria-label="Simulation speed" data-action="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div>
        <label>Set hour <input aria-label="Set hour" type="range" min="0" max="23" value="8" data-action="time"></label>
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
    const stores = stockpiles(s), wood = stores.reduce((n, b) => n + b.inventory.wood, 0), food = stores.reduce((n, b) => n + b.inventory.food, 0)
    const held = stores.reduce((n, b) => n + reserved(s, b.id, 'wood'), 0)
    const housed = s.settlers.filter(a => a.homeId !== null).length
    const beds = s.buildings.filter(b => b.complete).reduce((n, b) => n + BUILDINGS[b.type].housing, 0)
    this.set('resources', `<b>Wood ${wood}/${s.targets.wood}</b> <span>(${held} reserved)</span> <b>Food ${food}/${s.targets.food}</b> <b>Housing ${housed}/${s.settlers.length}</b>`)
    const minutes = Math.floor(s.timeOfDay * 1440)
    this.set('clock', `Day ${s.day} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${ui.paused ? '· PAUSED' : ''}<small>Lighting only · No raids in M1</small>`)
    this.set('objective', `<div class="objective-row">${s.totals.deposited.wood > 0 ? '✓' : '○'} Gather and stockpile wood</div><div class="objective-row">${s.totals.deposited.food > 0 ? '✓' : '○'} Gather and stockpile food</div><div class="objective-row">${beds >= s.settlers.length ? '✓' : '○'} Shelter the camp · ${beds} beds</div>`)
    const a = s.settlers.find(a => a.id === ui.selectedId), b = s.buildings.find(b => b.id === ui.selectedId), n = s.nodes.find(n => n.id === ui.selectedId)
    if (a) this.set('inspection', `<h2>${settlerLabel(s, a.id)}</h2><p>${escape(a.status)}</p><p>Cargo: ${a.cargo.wood} wood, ${a.cargo.food} food<br>Home: ${a.homeId === null ? 'Unhoused' : 'House ' + a.homeId}<br>Position: ${a.x.toFixed(1)}, ${a.z.toFixed(1)}</p>`)
    else if (b) {
      const def = BUILDINGS[b.type]
      const cancel = b.complete ? '' : '<button data-action="cancel-blueprint">Cancel blueprint</button>'
      this.set('inspection', `<h2>${def.label} ${b.id}</h2><p>${b.complete ? 'Complete' : 'Under construction'}</p>${b.complete ? `<p>${def.housing ? def.housing + ' beds' : `Wood ${b.inventory.wood} (${available(s, b, 'wood')} available)<br>Food ${b.inventory.food}<br>Unreserved capacity: ${freeStorage(s, b)}`}</p>` : `<p>Delivered: ${b.delivered.wood}/${def.buildCost.wood} wood<br>Assigned deliveries: ${s.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id).reduce((n, j) => n + j.amount, 0)} wood<br>Work: ${Math.round(b.work / def.constructionWork * 100)}%</p><progress value="${b.work}" max="${def.constructionWork}"></progress>${cancel}`}`)
    } else if (n) this.set('inspection', `<h2>${n.resource === 'wood' ? 'Tree' : 'Food bush'} ${n.id}</h2><p>${n.remaining} ${n.resource} remaining<br>${s.jobs.some(j => j.sourceId === n.id) ? 'Claimed by a settler' : 'Available for gathering'}</p>`)
    else this.set('inspection', `<p>${ui.buildType ? 'Placing ' + BUILDINGS[ui.buildType].label + '. Green means valid; red means blocked. Materials may arrive later.' : 'Select something in the world.'}</p>`)
    this.set('message', escape(ui.message))
    const m = ui.metrics
    this.set('metrics', `<dl><dt>Frame / FPS</dt><dd>${m.frame.toFixed(1)} ms / ${(1000 / Math.max(m.frame, 1)).toFixed(0)}</dd><dt>Simulation CPU</dt><dd>${m.simulation.toFixed(2)} ms</dd><dt>Render submission CPU</dt><dd>${m.render.toFixed(2)} ms</dd><dt>Draws / triangles</dt><dd>${m.calls} / ${m.triangles}</dd><dt>Active AI / settlers</dt><dd>${s.jobs.length} / ${s.settlers.length}</dd><dt>Path requests / solves (frame)</dt><dd>${m.requests} / ${m.paths}</dd><dt>Queued paths</dt><dd>${m.queue}</dd><dt>Path failures</dt><dd>${m.failures}</dd><dt>Catch-up dropped</dt><dd>${m.dropped.toFixed(2)} s</dd><dt>Skeletal animations</dt><dd>0</dd><dt>Enemies</dt><dd>0</dd><dt>Deposited wood / food</dt><dd>${s.totals.deposited.wood} / ${s.totals.deposited.food}</dd><dt>Materials delivered</dt><dd>${s.totals.delivered.wood}</dd><dt>Completed / sites</dt><dd>${s.totals.constructed} / ${s.buildings.filter(b => !b.complete).length}</dd><dt>Player</dt><dd>${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)}</dd><dt>Simulation tick</dt><dd>${s.tick}</dd></dl>`)
    this.set('workers', '<h3>Workers</h3>' + s.settlers.map(a => `<div class="worker">${settlerLabel(s, a.id)} · ${escape(a.status)}</div>`).join('') + '<h3>Recent activity</h3>' + s.events.map(e => `<div class="worker">${escape(e)}</div>`).join(''))
    this.element.querySelector('[data-action="pause"]')!.textContent = ui.paused ? 'Resume' : 'Pause'
    this.element.querySelector('[data-action="camera"]')!.textContent = ui.camera === 'settlement' ? 'Follow player' : 'Settlement camera'
    ;(this.element.querySelector('[data-action="spawn"]') as HTMLButtonElement).disabled = s.settlers.length >= 10
    for (const type of ['house', 'stockpile']) this.element.querySelector('[data-action="' + type + '"]')!.setAttribute('aria-pressed', String(ui.buildType === type))
    const woodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-wood"]')!
    const foodTarget = this.element.querySelector<HTMLInputElement>('[data-action="target-food"]')!
    if (document.activeElement !== woodTarget) woodTarget.value = String(s.targets.wood)
    if (document.activeElement !== foodTarget) foodTarget.value = String(s.targets.food)
  }
  dispose(): void { this.abort.abort(); this.element.remove() }
}

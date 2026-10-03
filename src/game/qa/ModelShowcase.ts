import { BUILDINGS, type BuildingId } from '../data/buildings'
import { createBuilding, createInitialWorldState } from '../model/WorldState'
import { SceneRenderer } from '../render/SceneRenderer'
import { assemblyStage } from '../render/BuildingConstructionPresentation'

/** Isolated visual sandbox. No simulation, persistence or normal population changes. */
export class ModelShowcase {
  private readonly renderer = new SceneRenderer(10)
  private readonly state = createInitialWorldState()
  private readonly status = document.createElement('output')
  private ratio = 1
  private type: BuildingId = 'house'
  private frame = 0

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    const controls = document.createElement('div')
    controls.style.cssText = 'position:absolute;top:12px;left:12px;z-index:10;padding:14px;background:#25291fed;color:#e6dac1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px)'
    controls.innerHTML = '<strong>Model & construction review</strong>'
    const select = document.createElement('select')
    select.setAttribute('aria-label','Building model')
    for (const [id,def] of Object.entries(BUILDINGS)) {
      const option = document.createElement('option'); option.value = id; option.textContent = def.label; select.append(option)
    }
    select.onchange = () => { this.type = select.value as BuildingId; this.rebuild() }
    const slider = document.createElement('input')
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = '100'
    slider.setAttribute('aria-label','Construction progress')
    slider.oninput = () => { this.ratio = Number(slider.value)/100; this.rebuild() }
    const view = document.createElement('button'); view.textContent = 'Street View'
    view.onclick = () => { this.renderer.cinematic = !this.renderer.cinematic; view.textContent = this.renderer.cinematic ? 'Elevated view' : 'Street View' }
    const turn = document.createElement('button'); turn.textContent = 'Rotate view'
    turn.onclick = () => { this.renderer.angle += Math.PI/4 }
    const exit = document.createElement('a'); exit.href = './'; exit.textContent = 'Return to game'
    controls.append(select,slider,this.status,view,turn,exit)
    this.root.replaceChildren(this.renderer.canvas,controls)
    this.renderer.zoom = 18; this.renderer.focus.x = 0; this.renderer.focus.z = 0
    this.state.timeOfDay = 0.48
    this.state.nodes = this.state.nodes.filter((_,i) => i < 4).map((n,i) => ({...n,x:-7+i*4,z:-7}))
    this.state.settlers.forEach((a,i) => { a.x = -2.8+i*1.05; a.z = 4.5 })
    this.rebuild()
    const update = () => {
      this.renderer.resize(this.root.clientWidth,this.root.clientHeight)
      this.state.elapsedSeconds = performance.now()/1000
      this.renderer.sync(this.state,null)
      this.renderer.render()
      const stats = this.renderer.stats
      this.status.textContent = `${Math.round(this.ratio*100)}% · ${assemblyStage(this.ratio)} · ${stats.assetsReady ? 'assets ready' : 'loading assets'} · errors ${stats.modelErrors} · overflow ${this.renderer.overflowInstances}`
      this.frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('pagehide',() => { cancelAnimationFrame(this.frame); this.renderer.dispose() },{once:true})
  }

  private rebuild(): void {
    const b = createBuilding(1000,this.type,0,0,this.ratio === 1)
    b.work = BUILDINGS[b.type].constructionWork * this.ratio
    b.delivered = {...BUILDINGS[b.type].buildCost}
    if (b.complete) b.inventory = {wood:30,food:18,ore:12,tools:8,ale:12}
    this.state.buildings = [b]
  }
}
